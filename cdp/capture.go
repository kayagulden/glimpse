package cdp

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// CaptureService handles screenshot and PDF capture via CDP Page domain.
type CaptureService struct {
	console *ConsoleService
	appCtx  context.Context
}

// NewCaptureService creates a new CaptureService.
func NewCaptureService(cs *ConsoleService) *CaptureService {
	return &CaptureService{
		console: cs,
	}
}

// SetAppContext stores the Wails runtime context.
func (s *CaptureService) SetAppContext(ctx context.Context) {
	s.appCtx = ctx
}

// screenshotFormat converts a string format to the CDP enum.
func screenshotFormat(format string) page.CaptureScreenshotFormat {
	switch format {
	case "jpeg":
		return page.CaptureScreenshotFormatJpeg
	case "webp":
		return page.CaptureScreenshotFormatWebp
	default:
		return page.CaptureScreenshotFormatPng
	}
}

// fileExtension returns the file extension for a given format.
func fileExtension(format string) string {
	switch format {
	case "jpeg":
		return "jpg"
	case "webp":
		return "webp"
	default:
		return "png"
	}
}

// CaptureScreenshot captures a screenshot of the given tab.
func (s *CaptureService) CaptureScreenshot(targetID string, format string, quality int, fullPage bool) (string, error) {
	ctx, err := s.console.GetTabContext(targetID)
	if err != nil {
		return "", err
	}

	var buf []byte

	if fullPage {
		// FullScreenshot captures the entire scrollable page.
		q := quality
		if format == "png" {
			q = 100
		}
		if err := chromedp.Run(ctx, chromedp.FullScreenshot(&buf, q)); err != nil {
			return "", fmt.Errorf("FullScreenshot: %w", err)
		}
	} else {
		// Viewport-only screenshot with format/quality control.
		if err := chromedp.Run(ctx, chromedp.ActionFunc(func(c context.Context) error {
			params := page.CaptureScreenshot().WithFormat(screenshotFormat(format)).WithFromSurface(true)
			if format != "png" && quality > 0 {
				params = params.WithQuality(int64(quality))
			}
			var captureErr error
			buf, captureErr = params.Do(c)
			return captureErr
		})); err != nil {
			return "", fmt.Errorf("CaptureScreenshot: %w", err)
		}
	}

	if len(buf) == 0 {
		return "", fmt.Errorf("screenshot returned empty data")
	}

	// Show save dialog.
	ext := fileExtension(format)
	path, err := wailsRuntime.SaveFileDialog(s.appCtx, wailsRuntime.SaveDialogOptions{
		DefaultFilename: "screenshot." + ext,
		Title:           "Ekran Görüntüsünü Kaydet",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: fmt.Sprintf("%s Image (*.%s)", format, ext), Pattern: "*." + ext},
		},
	})
	if err != nil {
		return "", fmt.Errorf("save dialog: %w", err)
	}
	if path == "" {
		return "", fmt.Errorf("save cancelled")
	}

	if err := writeFile(path, buf); err != nil {
		return "", err
	}

	log.Printf("[Capture] Screenshot saved: %s (%d bytes)", path, len(buf))
	return path, nil
}

// PrintToPDF generates a PDF of the given tab.
func (s *CaptureService) PrintToPDF(targetID string, landscape bool, printBackground bool, scale float64) (string, error) {
	ctx, err := s.console.GetTabContext(targetID)
	if err != nil {
		return "", err
	}

	var buf []byte

	if err := chromedp.Run(ctx, chromedp.ActionFunc(func(c context.Context) error {
		params := page.PrintToPDF().
			WithLandscape(landscape).
			WithPrintBackground(printBackground).
			WithScale(scale).
			WithPaperWidth(8.5).
			WithPaperHeight(11).
			WithMarginTop(0.4).
			WithMarginBottom(0.4).
			WithMarginLeft(0.4).
			WithMarginRight(0.4)
		var printErr error
		buf, _, printErr = params.Do(c)
		return printErr
	})); err != nil {
		return "", fmt.Errorf("PrintToPDF: %w", err)
	}

	if len(buf) == 0 {
		return "", fmt.Errorf("PDF returned empty data")
	}

	// Show save dialog.
	path, err := wailsRuntime.SaveFileDialog(s.appCtx, wailsRuntime.SaveDialogOptions{
		DefaultFilename: "page.pdf",
		Title:           "PDF Olarak Kaydet",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "PDF Document (*.pdf)", Pattern: "*.pdf"},
		},
	})
	if err != nil {
		return "", fmt.Errorf("save dialog: %w", err)
	}
	if path == "" {
		return "", fmt.Errorf("save cancelled")
	}

	if err := writeFile(path, buf); err != nil {
		return "", err
	}

	log.Printf("[Capture] PDF saved: %s (%d bytes)", path, len(buf))
	return path, nil
}

// writeFile writes data to a file.
func writeFile(path string, data []byte) error {
	return os.WriteFile(path, data, 0644)
}
