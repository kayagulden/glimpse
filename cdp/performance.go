package cdp

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/chromedp/cdproto/performance"
	"github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/chromedp"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// PerfMetrics holds the runtime metrics snapshot from Performance.getMetrics.
type PerfMetrics struct {
	JSHeapUsedSize     float64 `json:"jsHeapUsedSize"`
	JSHeapTotalSize    float64 `json:"jsHeapTotalSize"`
	Nodes              float64 `json:"nodes"`
	Documents          float64 `json:"documents"`
	Frames             float64 `json:"frames"`
	JSEventListeners   float64 `json:"jsEventListeners"`
	LayoutCount        float64 `json:"layoutCount"`
	LayoutDuration     float64 `json:"layoutDuration"`
	RecalcStyleCount   float64 `json:"recalcStyleCount"`
	RecalcStyleDuration float64 `json:"recalcStyleDuration"`
	ScriptDuration     float64 `json:"scriptDuration"`
	TaskDuration       float64 `json:"taskDuration"`
	Timestamp          float64 `json:"timestamp"`
}

// WebVitals holds one-shot page load metrics collected via JS injection.
type WebVitals struct {
	FCP                float64 `json:"fcp"`
	LCP                float64 `json:"lcp"`
	CLS                float64 `json:"cls"`
	TTFB               float64 `json:"ttfb"`
	DomContentLoaded   float64 `json:"domContentLoaded"`
	Load               float64 `json:"load"`
}

// PerformanceService collects performance metrics via CDP.
type PerformanceService struct {
	console    *ConsoleService
	appCtx     context.Context
	mu         sync.Mutex
	enabledTabs map[string]bool
	stopChans   map[string]chan struct{}
}

// NewPerformanceService creates a new PerformanceService.
func NewPerformanceService(cs *ConsoleService) *PerformanceService {
	return &PerformanceService{
		console:     cs,
		enabledTabs: make(map[string]bool),
		stopChans:   make(map[string]chan struct{}),
	}
}

// SetAppContext stores the Wails runtime context.
func (s *PerformanceService) SetAppContext(ctx context.Context) {
	s.appCtx = ctx
}

// EnablePerformance enables the Performance domain and starts polling metrics.
func (s *PerformanceService) EnablePerformance(targetID string) error {
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

	// Enable the Performance domain.
	if err := chromedp.Run(ctx, chromedp.ActionFunc(func(c context.Context) error {
		return performance.Enable().Do(c)
	})); err != nil {
		return fmt.Errorf("Performance.enable: %w", err)
	}

	stop := make(chan struct{})
	s.mu.Lock()
	s.enabledTabs[targetID] = true
	s.stopChans[targetID] = stop
	s.mu.Unlock()

	// Start polling goroutine.
	go s.pollMetrics(ctx, targetID, stop)

	log.Printf("[Performance] Enabled for tab %s", targetID)
	return nil
}

// pollMetrics periodically fetches metrics and emits them to the frontend.
func (s *PerformanceService) pollMetrics(ctx context.Context, targetID string, stop chan struct{}) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-stop:
			return
		case <-ctx.Done():
			return
		case <-ticker.C:
			var metrics []*performance.Metric
			err := chromedp.Run(ctx, chromedp.ActionFunc(func(c context.Context) error {
				var fetchErr error
				metrics, fetchErr = performance.GetMetrics().Do(c)
				return fetchErr
			}))
			if err != nil {
				continue
			}

			pm := metricsToStruct(metrics)
			if s.appCtx != nil {
				wailsRuntime.EventsEmit(s.appCtx, "perf:metrics", targetID, pm)
			}
		}
	}
}

// metricsToStruct converts CDP metric list to our struct.
func metricsToStruct(metrics []*performance.Metric) PerfMetrics {
	pm := PerfMetrics{}
	for _, m := range metrics {
		switch m.Name {
		case "JSHeapUsedSize":
			pm.JSHeapUsedSize = m.Value
		case "JSHeapTotalSize":
			pm.JSHeapTotalSize = m.Value
		case "Nodes":
			pm.Nodes = m.Value
		case "Documents":
			pm.Documents = m.Value
		case "Frames":
			pm.Frames = m.Value
		case "JSEventListeners":
			pm.JSEventListeners = m.Value
		case "LayoutCount":
			pm.LayoutCount = m.Value
		case "LayoutDuration":
			pm.LayoutDuration = m.Value
		case "RecalcStyleCount":
			pm.RecalcStyleCount = m.Value
		case "RecalcStyleDuration":
			pm.RecalcStyleDuration = m.Value
		case "ScriptDuration":
			pm.ScriptDuration = m.Value
		case "TaskDuration":
			pm.TaskDuration = m.Value
		case "Timestamp":
			pm.Timestamp = m.Value
		}
	}
	return pm
}

// CollectWebVitals injects JS to collect Web Vitals and Navigation Timing.
func (s *PerformanceService) CollectWebVitals(targetID string) (*WebVitals, error) {
	ctx, err := s.console.GetTabContext(targetID)
	if err != nil {
		return nil, err
	}

	const script = `
(function() {
  var result = { fcp: 0, lcp: 0, cls: 0, ttfb: 0, domContentLoaded: 0, load: 0 };

  // Paint timing (FCP)
  var paints = performance.getEntriesByType('paint');
  for (var i = 0; i < paints.length; i++) {
    if (paints[i].name === 'first-contentful-paint') {
      result.fcp = paints[i].startTime;
    }
  }

  // LCP — use last entry from largest-contentful-paint
  try {
    var lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    if (lcpEntries.length > 0) {
      result.lcp = lcpEntries[lcpEntries.length - 1].startTime;
    }
  } catch(e) {}

  // CLS — sum layout-shift values without recent input
  try {
    var clsEntries = performance.getEntriesByType('layout-shift');
    var clsValue = 0;
    for (var j = 0; j < clsEntries.length; j++) {
      if (!clsEntries[j].hadRecentInput) clsValue += clsEntries[j].value;
    }
    result.cls = clsValue;
  } catch(e) {}

  // Navigation Timing
  var navEntries = performance.getEntriesByType('navigation');
  if (navEntries.length > 0) {
    var nav = navEntries[0];
    result.ttfb = nav.responseStart;
    result.domContentLoaded = nav.domContentLoadedEventEnd;
    result.load = nav.loadEventEnd;
  }

  return JSON.stringify(result);
})()
`

	var result *runtime.RemoteObject
	if err := chromedp.Run(ctx, chromedp.ActionFunc(func(c context.Context) error {
		var exception *runtime.ExceptionDetails
		var evalErr error
		result, exception, evalErr = runtime.Evaluate(script).Do(c)
		if evalErr != nil {
			return evalErr
		}
		if exception != nil {
			return fmt.Errorf("JS exception: %s", exception.Text)
		}
		return nil
	})); err != nil {
		return nil, fmt.Errorf("CollectWebVitals: %w", err)
	}

	// Parse JSON string from result.Value
	var jsonStr string
	if err := json.Unmarshal(result.Value, &jsonStr); err != nil {
		return nil, fmt.Errorf("unmarshal result string: %w", err)
	}

	var wv WebVitals
	if err := json.Unmarshal([]byte(jsonStr), &wv); err != nil {
		return nil, fmt.Errorf("unmarshal WebVitals: %w", err)
	}

	return &wv, nil
}
