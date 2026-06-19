package cdp

import (
	"context"
	"fmt"
	"log"
	"sync"

	cdpNetwork "github.com/chromedp/cdproto/network"
	"github.com/chromedp/chromedp"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// NetworkRequest represents a captured HTTP request/response pair.
type NetworkRequest struct {
	RequestID  string            `json:"requestId"`
	URL        string            `json:"url"`
	Method     string            `json:"method"`
	Status     int               `json:"status"`
	StatusText string            `json:"statusText"`
	Type       string            `json:"type"`
	MimeType   string            `json:"mimeType"`
	StartTime  int64             `json:"startTime"`
	Duration   float64           `json:"duration"` // ms
	Size       int64             `json:"size"`
	Error      string            `json:"error"`
	ReqHeaders map[string]string `json:"reqHeaders"`
	RespHeaders map[string]string `json:"respHeaders"`
}

// NetworkService captures network traffic via CDP Network domain events.
type NetworkService struct {
	console    *ConsoleService
	appCtx     context.Context

	mu         sync.Mutex
	enabledTabs map[string]bool
	// In-flight requests indexed by requestID, per tab.
	inflight   map[string]map[string]*NetworkRequest
}

// NewNetworkService creates a NetworkService.
func NewNetworkService(cs *ConsoleService) *NetworkService {
	return &NetworkService{
		console:     cs,
		enabledTabs: make(map[string]bool),
		inflight:    make(map[string]map[string]*NetworkRequest),
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

	// Enable the Network domain.
	if err := chromedp.Run(ctx, cdpNetwork.Enable()); err != nil {
		return fmt.Errorf("Network.enable: %w", err)
	}

	s.mu.Lock()
	s.enabledTabs[targetID] = true
	s.inflight[targetID] = make(map[string]*NetworkRequest)
	s.mu.Unlock()

	// Listen for network events in a goroutine.
	go s.listenEvents(ctx, targetID)

	log.Printf("[Network] Enabled for tab %s", targetID)
	return nil
}

// GetResponseBody returns the response body for a given request.
func (s *NetworkService) GetResponseBody(targetID string, requestID string) (string, error) {
	ctx, err := s.console.GetTabContext(targetID)
	if err != nil {
		return "", err
	}

	var body string
	if err := chromedp.Run(ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		b, err := cdpNetwork.GetResponseBody(cdpNetwork.RequestID(requestID)).Do(ctx)
		if err != nil {
			return err
		}
		body = string(b)
		if len(body) > 100000 {
			body = body[:100000] + "\n\n…(truncated)"
		}
		return nil
	})); err != nil {
		return "", fmt.Errorf("getResponseBody: %w", err)
	}

	return body, nil
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
			if m, ok := s.inflight[targetID]; ok {
				if r, found := m[string(e.RequestID)]; found {
					req = r
					if e.EncodedDataLength > 0 {
						req.Size = int64(e.EncodedDataLength)
					}
					req.Duration = float64(e.Timestamp.Time().UnixMilli() - req.StartTime)
					delete(m, string(e.RequestID))
				}
			}
			s.mu.Unlock()

			if req != nil && s.appCtx != nil {
				wailsRuntime.EventsEmit(s.appCtx, "network:request", targetID, req)
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
			}
		}
	})
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
