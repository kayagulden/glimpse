package cdp

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"

	cdpNetwork "github.com/chromedp/cdproto/network"
	"github.com/chromedp/chromedp"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// NetworkRequest represents a captured HTTP request/response pair.
type NetworkRequest struct {
	RequestID    string            `json:"requestId"`
	URL          string            `json:"url"`
	Method       string            `json:"method"`
	Status       int               `json:"status"`
	StatusText   string            `json:"statusText"`
	Type         string            `json:"type"`
	MimeType     string            `json:"mimeType"`
	StartTime    int64             `json:"startTime"`
	Duration     float64           `json:"duration"`
	Size         int64             `json:"size"`
	Error        string            `json:"error"`
	ReqHeaders   map[string]string `json:"reqHeaders"`
	RespHeaders  map[string]string `json:"respHeaders"`
	BodySize     int64             `json:"bodySize"`
}

// NetworkService captures network traffic via CDP Network domain events.
type NetworkService struct {
	console    *ConsoleService
	appCtx     context.Context

	mu          sync.Mutex
	enabledTabs map[string]bool
	inflight    map[string]map[string]*NetworkRequest
	// Body cache: requestID -> full response body bytes.
	bodyCache   map[string][]byte
	// Request buffer for AI analysis: targetID -> recent completed requests.
	requestBuffer map[string][]NetworkRequest
}

const maxRequestBuffer = 100

const maxBodyPreview = 500 * 1024 // 500 KB preview limit

// NewNetworkService creates a NetworkService.
func NewNetworkService(cs *ConsoleService) *NetworkService {
	return &NetworkService{
		console:       cs,
		enabledTabs:   make(map[string]bool),
		inflight:      make(map[string]map[string]*NetworkRequest),
		bodyCache:     make(map[string][]byte),
		requestBuffer: make(map[string][]NetworkRequest),
	}
}

// SetAppContext stores the Wails runtime context for event emission.
func (s *NetworkService) SetAppContext(ctx context.Context) {
	s.appCtx = ctx
}

// EnableNetwork enables the Network domain on a tab and starts capturing.
func (s *NetworkService) EnableNetwork(targetID string) error {
	s.mu.Lock()
	already := s.enabledTabs[targetID]
	s.mu.Unlock()

	if already {
		return nil
	}

	ctx, err := s.console.GetTabContext(targetID)
	if err != nil {
		return err
	}

	s.mu.Lock()
	s.enabledTabs[targetID] = true
	s.inflight[targetID] = make(map[string]*NetworkRequest)
	s.mu.Unlock()

	// Register listener BEFORE enabling — events can arrive immediately after enable.
	s.listenEvents(ctx, targetID)

	// Enable the Network domain.
	if err := chromedp.Run(ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		return cdpNetwork.Enable().
			WithMaxTotalBufferSize(100 * 1024 * 1024).   // 100 MB total
			WithMaxResourceBufferSize(10 * 1024 * 1024). // 10 MB per resource
			Do(ctx)
	})); err != nil {
		return fmt.Errorf("Network.enable: %w", err)
	}

	log.Printf("[Network] Enabled for tab %s", targetID)
	return nil
}

// listenEvents listens for CDP Network events and emits them to the frontend.
func (s *NetworkService) listenEvents(ctx context.Context, targetID string) {
	chromedp.ListenTarget(ctx, func(ev interface{}) {
		switch e := ev.(type) {

		case *cdpNetwork.EventRequestWillBeSent:
			req := &NetworkRequest{
				RequestID:  string(e.RequestID),
				URL:        e.Request.URL,
				Method:     e.Request.Method,
				Type:       e.Type.String(),
				StartTime:  e.Timestamp.Time().UnixMilli(),
				ReqHeaders: flattenHeaders(e.Request.Headers),
			}

			s.mu.Lock()
			if m, ok := s.inflight[targetID]; ok {
				m[string(e.RequestID)] = req
			}
			s.mu.Unlock()

		case *cdpNetwork.EventResponseReceived:
			s.mu.Lock()
			if m, ok := s.inflight[targetID]; ok {
				if req, found := m[string(e.RequestID)]; found {
					req.Status = int(e.Response.Status)
					req.StatusText = e.Response.StatusText
					req.MimeType = e.Response.MimeType
					req.RespHeaders = flattenHeaders(e.Response.Headers)
					if e.Response.EncodedDataLength > 0 {
						req.Size = int64(e.Response.EncodedDataLength)
					}
				}
			}
			s.mu.Unlock()

		case *cdpNetwork.EventLoadingFinished:
			s.mu.Lock()
			var req *NetworkRequest
			var reqID string
			if m, ok := s.inflight[targetID]; ok {
				if r, found := m[string(e.RequestID)]; found {
					req = r
					reqID = string(e.RequestID)
					if e.EncodedDataLength > 0 {
						req.Size = int64(e.EncodedDataLength)
					}
					req.Duration = float64(e.Timestamp.Time().UnixMilli() - req.StartTime)
					delete(m, string(e.RequestID))
				}
			}
			s.mu.Unlock()

			if req != nil && s.appCtx != nil {
				// Fetch body in a goroutine — CDP calls block inside ListenTarget.
				go func(r *NetworkRequest, rid string) {
					var body []byte
					err := chromedp.Run(ctx, chromedp.ActionFunc(func(execCtx context.Context) error {
						var fetchErr error
						body, fetchErr = cdpNetwork.GetResponseBody(cdpNetwork.RequestID(rid)).Do(execCtx)
						return fetchErr
					}))
					if err == nil && len(body) > 0 {
						s.mu.Lock()
						s.bodyCache[rid] = body
						s.mu.Unlock()
						r.BodySize = int64(len(body))
					}
					wailsRuntime.EventsEmit(s.appCtx, "network:request", targetID, r)
					s.bufferRequest(targetID, *r)
				}(req, reqID)
			}

		case *cdpNetwork.EventLoadingFailed:
			s.mu.Lock()
			var req *NetworkRequest
			if m, ok := s.inflight[targetID]; ok {
				if r, found := m[string(e.RequestID)]; found {
					req = r
					req.Error = e.ErrorText
					req.Duration = float64(e.Timestamp.Time().UnixMilli() - req.StartTime)
					delete(m, string(e.RequestID))
				}
			}
			s.mu.Unlock()

			if req != nil && s.appCtx != nil {
				wailsRuntime.EventsEmit(s.appCtx, "network:request", targetID, req)
				s.bufferRequest(targetID, *req)
			}
		}
	})
}

// bufferRequest adds a request to the AI analysis buffer (FIFO, capped).
func (s *NetworkService) bufferRequest(targetID string, req NetworkRequest) {
	s.mu.Lock()
	defer s.mu.Unlock()
	buf := s.requestBuffer[targetID]
	if len(buf) >= maxRequestBuffer {
		buf = buf[1:]
	}
	s.requestBuffer[targetID] = append(buf, req)
}

// GetRequestBuffer returns a copy of buffered network requests for a tab.
func (s *NetworkService) GetRequestBuffer(targetID string) []NetworkRequest {
	s.mu.Lock()
	defer s.mu.Unlock()
	buf := s.requestBuffer[targetID]
	out := make([]NetworkRequest, len(buf))
	copy(out, buf)
	return out
}

// flattenHeaders converts CDP Headers (map[string]interface{}) to map[string]string.
func flattenHeaders(h cdpNetwork.Headers) map[string]string {
	if h == nil {
		return nil
	}
	result := make(map[string]string, len(h))
	for k, v := range h {
		result[k] = fmt.Sprintf("%v", v)
	}
	return result
}

// GetCachedResponseBody returns the cached response body preview (up to 500KB).
func (s *NetworkService) GetCachedResponseBody(requestID string) (string, error) {
	s.mu.Lock()
	data, ok := s.bodyCache[requestID]
	s.mu.Unlock()

	if !ok {
		return "", fmt.Errorf("body not cached for %s", requestID)
	}

	if len(data) > maxBodyPreview {
		return string(data[:maxBodyPreview]) + fmt.Sprintf("\n\n…(truncated — showing %d of %d bytes)", maxBodyPreview, len(data)), nil
	}
	return string(data), nil
}

// SaveResponseBody saves the full response body to a temp file and returns the path.
func (s *NetworkService) SaveResponseBody(requestID string, suggestedName string) (string, error) {
	s.mu.Lock()
	data, ok := s.bodyCache[requestID]
	s.mu.Unlock()

	if !ok {
		return "", fmt.Errorf("body not cached for %s", requestID)
	}

	if suggestedName == "" {
		suggestedName = "response.txt"
	}

	tmpDir := os.TempDir()
	path := filepath.Join(tmpDir, suggestedName)

	if err := os.WriteFile(path, data, 0644); err != nil {
		return "", fmt.Errorf("write file: %w", err)
	}

	log.Printf("[Network] Saved response body to %s (%d bytes)", path, len(data))
	return path, nil
}

// ClearBodyCache clears all cached response bodies.
func (s *NetworkService) ClearBodyCache() {
	s.mu.Lock()
	s.bodyCache = make(map[string][]byte)
	s.mu.Unlock()
}
