package cdp

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/chromedp/cdproto/network"
	"github.com/chromedp/chromedp"
)

// CookieEntry represents a single cookie.
type CookieEntry struct {
	Name     string  `json:"name"`
	Value    string  `json:"value"`
	Domain   string  `json:"domain"`
	Path     string  `json:"path"`
	Expires  float64 `json:"expires"`
	HTTPOnly bool    `json:"httpOnly"`
	Secure   bool    `json:"secure"`
	SameSite string  `json:"sameSite"`
	Size     int     `json:"size"`
}

// StorageEntry represents a single localStorage/sessionStorage item.
type StorageEntry struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// StorageService handles cookie and web storage inspection via CDP.
type StorageService struct {
	console *ConsoleService
}

// NewStorageService creates a StorageService backed by the shared ConsoleService.
func NewStorageService(cs *ConsoleService) *StorageService {
	return &StorageService{console: cs}
}

// GetCookies returns all cookies for the given tab.
func (s *StorageService) GetCookies(targetID string) ([]CookieEntry, error) {
	ctx, err := s.console.GetTabContext(targetID)
	if err != nil {
		return nil, err
	}

	var result []CookieEntry
	if err := chromedp.Run(ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		cookies, err := network.GetCookies().Do(ctx)
		if err != nil {
			return fmt.Errorf("Network.getCookies: %w", err)
		}

		for _, c := range cookies {
			result = append(result, CookieEntry{
				Name:     c.Name,
				Value:    c.Value,
				Domain:   c.Domain,
				Path:     c.Path,
				Expires:  c.Expires,
				HTTPOnly: c.HTTPOnly,
				Secure:   c.Secure,
				SameSite: c.SameSite.String(),
				Size:     int(c.Size),
			})
		}
		return nil
	})); err != nil {
		return nil, err
	}

	return result, nil
}

// GetLocalStorage returns all localStorage entries for the given tab.
func (s *StorageService) GetLocalStorage(targetID string) ([]StorageEntry, error) {
	return s.getWebStorage(targetID, "localStorage")
}

// GetSessionStorage returns all sessionStorage entries for the given tab.
func (s *StorageService) GetSessionStorage(targetID string) ([]StorageEntry, error) {
	return s.getWebStorage(targetID, "sessionStorage")
}

// getWebStorage evaluates JS to read all entries from the given storage type.
func (s *StorageService) getWebStorage(targetID string, storageName string) ([]StorageEntry, error) {
	ctx, err := s.console.GetTabContext(targetID)
	if err != nil {
		return nil, err
	}

	script := fmt.Sprintf(
		`JSON.stringify(Object.keys(%s).map(k => ({key: k, value: %s.getItem(k)})))`,
		storageName, storageName,
	)

	var raw string
	if err := chromedp.Run(ctx, chromedp.Evaluate(script, &raw)); err != nil {
		return nil, fmt.Errorf("%s read: %w", storageName, err)
	}

	if raw == "" || raw == "[]" {
		return nil, nil
	}

	var result []StorageEntry
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		return nil, fmt.Errorf("parse %s: %w", storageName, err)
	}

	return result, nil
}
