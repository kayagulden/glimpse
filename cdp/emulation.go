package cdp

import (
	"context"
	"fmt"
	"log"

	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/chromedp"
)

// EmulationService handles viewport / device simulation via CDP Emulation domain.
type EmulationService struct {
	console *ConsoleService
	appCtx  context.Context
}

// NewEmulationService creates a new EmulationService.
func NewEmulationService(cs *ConsoleService) *EmulationService {
	return &EmulationService{
		console: cs,
	}
}

// SetAppContext stores the Wails runtime context.
func (s *EmulationService) SetAppContext(ctx context.Context) {
	s.appCtx = ctx
}

// SetViewport overrides the device viewport for the given tab.
func (s *EmulationService) SetViewport(targetID string, width int, height int, dpr float64, mobile bool, landscape bool) error {
	ctx, err := s.console.GetTabContext(targetID)
	if err != nil {
		return err
	}

	params := emulation.SetDeviceMetricsOverride(int64(width), int64(height), dpr, mobile)

	if landscape {
		params = params.WithScreenOrientation(&emulation.ScreenOrientation{
			Type:  emulation.OrientationTypeLandscapePrimary,
			Angle: 90,
		})
	} else {
		params = params.WithScreenOrientation(&emulation.ScreenOrientation{
			Type:  emulation.OrientationTypePortraitPrimary,
			Angle: 0,
		})
	}

	if err := chromedp.Run(ctx, chromedp.ActionFunc(func(c context.Context) error {
		return params.Do(c)
	})); err != nil {
		return fmt.Errorf("SetDeviceMetricsOverride: %w", err)
	}

	// Enable/disable touch emulation based on mobile flag.
	if err := chromedp.Run(ctx, chromedp.ActionFunc(func(c context.Context) error {
		return emulation.SetTouchEmulationEnabled(mobile).Do(c)
	})); err != nil {
		log.Printf("[Emulation] Touch emulation toggle failed: %v", err)
	}

	log.Printf("[Emulation] Viewport set: %dx%d DPR=%.2f mobile=%v landscape=%v", width, height, dpr, mobile, landscape)
	return nil
}

// ResetViewport clears all device metric overrides for the given tab.
func (s *EmulationService) ResetViewport(targetID string) error {
	ctx, err := s.console.GetTabContext(targetID)
	if err != nil {
		return err
	}

	if err := chromedp.Run(ctx, chromedp.ActionFunc(func(c context.Context) error {
		return emulation.ClearDeviceMetricsOverride().Do(c)
	})); err != nil {
		return fmt.Errorf("ClearDeviceMetricsOverride: %w", err)
	}

	// Disable touch emulation.
	if err := chromedp.Run(ctx, chromedp.ActionFunc(func(c context.Context) error {
		return emulation.SetTouchEmulationEnabled(false).Do(c)
	})); err != nil {
		log.Printf("[Emulation] Touch emulation disable failed: %v", err)
	}

	log.Printf("[Emulation] Viewport reset")
	return nil
}
