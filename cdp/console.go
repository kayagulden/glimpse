package cdp

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/cdproto/target"
	"github.com/chromedp/chromedp"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// ConsoleEntry is the structured log sent to the frontend.
type ConsoleEntry struct {
	Type      string `json:"type"`
	Message   string `json:"message"`
	Timestamp int64  `json:"timestamp"`
	TargetID  string `json:"targetId"` // stable target ID for filtering
}

// TabInfo holds basic information about a Chrome tab.
type TabInfo struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	URL   string `json:"url"`
}

// ConsoleService manages the CDP connection and console event stream.
type ConsoleService struct {
	mu         sync.Mutex
	appCtx     context.Context
	cancelCDP  context.CancelFunc
	browserCtx context.Context
	tabCtxs    map[string]context.Context    // targetID -> chromedp context
	tabCancels map[string]context.CancelFunc // targetID -> cancel func
	connected  bool
	stopPoll   chan struct{} // signal to stop the tab poller
	logBuffer  map[string][]ConsoleEntry     // targetID -> recent logs for AI
}

const maxLogBuffer = 200

func NewConsoleService() *ConsoleService {
	return &ConsoleService{
		logBuffer: make(map[string][]ConsoleEntry),
	}
}

func (s *ConsoleService) SetAppContext(ctx context.Context) {
	s.appCtx = ctx
}

// Connect attaches to a running Chrome instance.
// It attaches to all existing page tabs and starts polling for new ones.
func (s *ConsoleService) Connect(debugURL string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.connected {
		return fmt.Errorf("already connected")
	}

	wsURL, err := resolveWSURL(debugURL)
	if err != nil {
		return fmt.Errorf("cannot reach Chrome at %s: %w", debugURL, err)
	}

	allocCtx, allocCancel := chromedp.NewRemoteAllocator(context.Background(), wsURL)
	browserCtx, browserCancel := chromedp.NewContext(allocCtx)

	if err := chromedp.Run(browserCtx); err != nil {
		browserCancel()
		allocCancel()
		return fmt.Errorf("failed to connect to browser: %w", err)
	}

	s.browserCtx = browserCtx
	s.tabCtxs = make(map[string]context.Context)
	s.tabCancels = make(map[string]context.CancelFunc)
	s.stopPoll = make(chan struct{})

	s.cancelCDP = func() {
		close(s.stopPoll)
		for _, c := range s.tabCancels {
			c()
		}
		browserCancel()
		allocCancel()
	}

	// Attach to all current page targets.
	s.attachAllNewTargets()

	s.connected = true

	// Start background poller that discovers new tabs every 2 seconds.
	go s.pollForNewTabs()

	log.Printf("[cdp] connected — listening on %d tab(s)", len(s.tabCtxs))
	return nil
}

// attachAllNewTargets finds page targets we haven't attached to yet and attaches.
func (s *ConsoleService) attachAllNewTargets() {
	targets, err := chromedp.Targets(s.browserCtx)
	if err != nil {
		log.Printf("[cdp] failed to list targets: %v", err)
		return
	}

	for _, t := range targets {
		if t.Type != "page" {
			continue
		}
		// Skip devtools pages.
		if strings.HasPrefix(t.URL, "devtools://") {
			continue
		}
		id := string(t.TargetID)
		// Skip already-attached targets.
		if _, exists := s.tabCtxs[id]; exists {
			continue
		}
		s.attachToTarget(t)
	}
}

// pollForNewTabs periodically checks for new tabs and attaches to them.
func (s *ConsoleService) pollForNewTabs() {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopPoll:
			return
		case <-ticker.C:
			s.mu.Lock()
			if s.connected {
				s.attachAllNewTargets()
			}
			s.mu.Unlock()
		}
	}
}

// attachToTarget attaches to a single page target, enables Runtime, and listens.
func (s *ConsoleService) attachToTarget(t *target.Info) {
	id := string(t.TargetID)

	tabCtx, tabCancel := chromedp.NewContext(s.browserCtx, chromedp.WithTargetID(t.TargetID))

	// Enable Runtime domain on this tab.
	if err := chromedp.Run(tabCtx, chromedp.ActionFunc(func(ctx context.Context) error {
		return runtime.Enable().Do(ctx)
	})); err != nil {
		log.Printf("[cdp] failed to enable Runtime on %q (%s): %v", t.Title, t.URL, err)
		tabCancel()
		return
	}

	// Listen for console events on this tab.
	// Use the stable target ID for the entry so frontend filtering works
	// even when the page title changes due to navigation.
	chromedp.ListenTarget(tabCtx, func(ev interface{}) {
		switch e := ev.(type) {
		case *runtime.EventConsoleAPICalled:
			var ts int64
			if e.Timestamp != nil {
				ts = e.Timestamp.Time().UnixMilli()
			}
			entry := ConsoleEntry{
				Type:      apiTypeToString(e.Type),
				Message:   argsToString(e.Args),
				Timestamp: ts,
				TargetID:  id,
			}
			wailsRuntime.EventsEmit(s.appCtx, "console:log", entry)

			// Buffer for AI analysis.
			s.mu.Lock()
			buf := s.logBuffer[id]
			if len(buf) >= maxLogBuffer {
				buf = buf[1:]
			}
			s.logBuffer[id] = append(buf, entry)
			s.mu.Unlock()
		}
	})

	s.tabCtxs[id] = tabCtx
	s.tabCancels[id] = tabCancel
	log.Printf("[cdp] attached to tab: %q (%s) [%s]", t.Title, t.URL, id)
}

// GetLogBuffer returns a copy of buffered console entries for a tab.
func (s *ConsoleService) GetLogBuffer(targetID string) []ConsoleEntry {
	s.mu.Lock()
	defer s.mu.Unlock()
	buf := s.logBuffer[targetID]
	out := make([]ConsoleEntry, len(buf))
	copy(out, buf)
	return out
}

// RunJS evaluates a JavaScript expression in the first attached tab.
func (s *ConsoleService) RunJS(expr string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.connected || len(s.tabCtxs) == 0 {
		return fmt.Errorf("not connected")
	}

	// Pick any tab (the first one from the map).
	for _, ctx := range s.tabCtxs {
		return chromedp.Run(ctx, chromedp.Evaluate(expr, nil))
	}
	return fmt.Errorf("no tabs available")
}

// GetTabContext returns the chromedp context for the given target ID.
// Used by other services (e.g. ElementsService) that need to run CDP
// commands on a specific tab.
func (s *ConsoleService) GetTabContext(targetID string) (context.Context, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.connected {
		return nil, fmt.Errorf("not connected")
	}
	ctx, ok := s.tabCtxs[targetID]
	if !ok {
		return nil, fmt.Errorf("tab %s not found", targetID)
	}
	return ctx, nil
}

// GetTabs returns info about all page tabs currently in Chrome.
func (s *ConsoleService) GetTabs() []TabInfo {
	s.mu.Lock()
	ctx := s.browserCtx
	connected := s.connected
	s.mu.Unlock()

	if !connected || ctx == nil {
		return nil
	}

	targets, err := chromedp.Targets(ctx)
	if err != nil {
		log.Printf("[cdp] failed to list targets: %v", err)
		return nil
	}

	var tabs []TabInfo
	for _, t := range targets {
		if t.Type != "page" {
			continue
		}
		if strings.HasPrefix(t.URL, "devtools://") {
			continue
		}
		title := t.Title
		if title == "" {
			title = t.URL
		}
		tabs = append(tabs, TabInfo{
			ID:    string(t.TargetID),
			Title: title,
			URL:   t.URL,
		})
	}
	return tabs
}

// Disconnect tears down the CDP connection and stops the tab poller.
func (s *ConsoleService) Disconnect() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.cancelCDP != nil {
		s.cancelCDP()
		s.cancelCDP = nil
	}
	s.browserCtx = nil
	s.tabCtxs = nil
	s.tabCancels = nil
	s.connected = false
	log.Println("[cdp] disconnected")
}

func (s *ConsoleService) IsConnected() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.connected
}

// --- helpers ---

func resolveWSURL(rawURL string) (string, error) {
	if strings.HasPrefix(rawURL, "ws://") || strings.HasPrefix(rawURL, "wss://") {
		return rawURL, nil
	}

	endpoint := strings.TrimRight(rawURL, "/")
	if !strings.HasPrefix(endpoint, "http") {
		endpoint = "http://" + endpoint
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(endpoint + "/json/version")
	if err != nil {
		return "", fmt.Errorf("failed to query %s/json/version: %w", endpoint, err)
	}
	defer resp.Body.Close()

	var result struct {
		WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to parse /json/version response: %w", err)
	}

	if result.WebSocketDebuggerURL == "" {
		return "", fmt.Errorf("/json/version did not return a webSocketDebuggerUrl")
	}

	return result.WebSocketDebuggerURL, nil
}

func apiTypeToString(t runtime.APIType) string {
	switch t {
	case runtime.APITypeLog:
		return "log"
	case runtime.APITypeInfo:
		return "info"
	case runtime.APITypeWarning:
		return "warning"
	case runtime.APITypeError:
		return "error"
	case runtime.APITypeDebug:
		return "debug"
	default:
		return "log"
	}
}

func argsToString(args []*runtime.RemoteObject) string {
	parts := make([]string, 0, len(args))
	for _, arg := range args {
		switch {
		case arg.Value != nil:
			val := string(arg.Value)
			val = strings.TrimPrefix(val, "\"")
			val = strings.TrimSuffix(val, "\"")
			parts = append(parts, val)
		case arg.Description != "":
			parts = append(parts, arg.Description)
		case arg.UnserializableValue != "":
			parts = append(parts, string(arg.UnserializableValue))
		default:
			parts = append(parts, arg.Type.String())
		}
	}
	return strings.Join(parts, " ")
}
