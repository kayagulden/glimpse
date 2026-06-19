package main

import (
	"context"
	"glimpse/cdp"
)

// App is the main application struct, bound to the Wails frontend.
type App struct {
	ctx      context.Context
	console  *cdp.ConsoleService
	elements *cdp.ElementsService
	storage  *cdp.StorageService
	network  *cdp.NetworkService
}

// NewApp creates a new App with its services.
func NewApp() *App {
	cs := cdp.NewConsoleService()
	return &App{
		console:  cs,
		elements: cdp.NewElementsService(cs),
		storage:  cdp.NewStorageService(cs),
		network:  cdp.NewNetworkService(cs),
	}
}

// startup is called by Wails when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.console.SetAppContext(ctx)
	a.elements.SetAppContext(ctx)
	a.network.SetAppContext(ctx)
}

// shutdown is called by Wails when the app is closing.
func (a *App) shutdown(ctx context.Context) {
	a.console.Disconnect()
}

// --- Console bindings ---

// ConnectToChrome attaches to a Chrome instance at the given WebSocket debugger URL.
func (a *App) ConnectToChrome(debugURL string) error {
	return a.console.Connect(debugURL)
}

// DisconnectFromChrome tears down the CDP connection.
func (a *App) DisconnectFromChrome() {
	a.console.Disconnect()
}

// IsConnected reports whether the CDP connection is active.
func (a *App) IsConnected() bool {
	return a.console.IsConnected()
}

// RunJS evaluates JavaScript in the attached Chrome tab.
func (a *App) RunJS(expr string) error {
	return a.console.RunJS(expr)
}

// GetTabs returns info about all attached Chrome page tabs.
func (a *App) GetTabs() []cdp.TabInfo {
	return a.console.GetTabs()
}

// --- Elements bindings ---

// GetDOMTree returns the DOM root of the given tab (depth=3).
func (a *App) GetDOMTree(targetID string) (*cdp.DOMNode, error) {
	return a.elements.GetDocumentRoot(targetID)
}

// GetChildNodes returns children for a specific DOM node.
func (a *App) GetChildNodes(targetID string, nodeID int64) ([]cdp.DOMNode, error) {
	return a.elements.GetChildNodes(targetID, nodeID)
}

// HighlightNode highlights a DOM node in the Chrome viewport.
func (a *App) HighlightNode(targetID string, nodeID int64) error {
	return a.elements.HighlightNode(targetID, nodeID)
}

// ClearHighlight removes the node highlight overlay.
func (a *App) ClearHighlight(targetID string) error {
	return a.elements.ClearHighlight(targetID)
}

// SearchDOM searches the DOM tree for nodes matching a query.
func (a *App) SearchDOM(targetID string, query string) ([]cdp.SearchResult, error) {
	return a.elements.SearchDOM(targetID, query)
}

// GetNodePath returns the ancestor chain (root→target) as node IDs.
func (a *App) GetNodePath(targetID string, nodeID int64) ([]int, error) {
	return a.elements.GetNodePath(targetID, nodeID)
}

// --- Storage bindings ---

// GetCookies returns all cookies for the given tab.
func (a *App) GetCookies(targetID string) ([]cdp.CookieEntry, error) {
	return a.storage.GetCookies(targetID)
}

// GetLocalStorage returns all localStorage entries for the given tab.
func (a *App) GetLocalStorage(targetID string) ([]cdp.StorageEntry, error) {
	return a.storage.GetLocalStorage(targetID)
}

// GetSessionStorage returns all sessionStorage entries for the given tab.
func (a *App) GetSessionStorage(targetID string) ([]cdp.StorageEntry, error) {
	return a.storage.GetSessionStorage(targetID)
}

// --- Network bindings ---

// EnableNetwork enables network capture for the given tab.
func (a *App) EnableNetwork(targetID string) error {
	return a.network.EnableNetwork(targetID)
}

// GetCachedResponseBody returns the cached body preview (up to 500KB).
func (a *App) GetCachedResponseBody(requestID string) (string, error) {
	return a.network.GetCachedResponseBody(requestID)
}

// SaveResponseBody saves the full response body to a file and returns the path.
func (a *App) SaveResponseBody(requestID string, suggestedName string) (string, error) {
	return a.network.SaveResponseBody(requestID, suggestedName)
}

// ClearNetworkCache clears all cached response bodies.
func (a *App) ClearNetworkCache() {
	a.network.ClearBodyCache()
}
