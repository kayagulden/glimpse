package cdp

import (
	"context"
	"fmt"
	"log"
	"sync"

	"github.com/chromedp/cdproto/cdp"
	"github.com/chromedp/cdproto/dom"
	"github.com/chromedp/cdproto/overlay"
	"github.com/chromedp/cdproto/page"
	runtimePkg "github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/chromedp"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// DOMNode is a simplified DOM node sent to the frontend.
type DOMNode struct {
	NodeID     int       `json:"nodeId"`
	NodeType   int       `json:"nodeType"`
	NodeName   string    `json:"nodeName"`
	LocalName  string    `json:"localName"`
	Attributes []string  `json:"attributes"`
	ChildCount int       `json:"childCount"`
	NodeValue  string    `json:"nodeValue"`
	Children   []DOMNode `json:"children"`
}

// ElementsService handles DOM inspection via CDP.
type ElementsService struct {
	console     *ConsoleService
	appCtx      context.Context
	mu          sync.Mutex
	enabledTabs map[string]bool // tabs where DOM+Overlay domains are enabled
}

// NewElementsService creates an ElementsService backed by the shared ConsoleService.
func NewElementsService(cs *ConsoleService) *ElementsService {
	return &ElementsService{
		console:     cs,
		enabledTabs: make(map[string]bool),
	}
}

// SetAppContext stores the Wails app context for emitting events.
func (s *ElementsService) SetAppContext(ctx context.Context) {
	s.appCtx = ctx
}

// ensureDomains enables DOM, Overlay, and Page domains on the tab if not already done,
// and sets up a listener for page navigation events.
func (s *ElementsService) ensureDomains(targetID string, ctx context.Context) error {
	s.mu.Lock()
	already := s.enabledTabs[targetID]
	s.mu.Unlock()

	if already {
		return nil
	}

	if err := chromedp.Run(ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		if err := dom.Enable().Do(ctx); err != nil {
			return fmt.Errorf("DOM.enable: %w", err)
		}
		if err := overlay.Enable().Do(ctx); err != nil {
			return fmt.Errorf("Overlay.enable: %w", err)
		}
		if err := page.Enable().Do(ctx); err != nil {
			return fmt.Errorf("Page.enable: %w", err)
		}
		return nil
	})); err != nil {
		return err
	}

	// Listen for navigation — notify frontend to re-fetch DOM.
	chromedp.ListenTarget(ctx, func(ev interface{}) {
		switch ev.(type) {
		case *page.EventFrameNavigated:
			log.Printf("[elements] page navigated on tab %s", targetID)
			if s.appCtx != nil {
				wailsRuntime.EventsEmit(s.appCtx, "dom:updated", targetID)
			}
		case *dom.EventDocumentUpdated:
			log.Printf("[elements] document updated on tab %s", targetID)
			if s.appCtx != nil {
				wailsRuntime.EventsEmit(s.appCtx, "dom:updated", targetID)
			}
		}
	})

	s.mu.Lock()
	s.enabledTabs[targetID] = true
	s.mu.Unlock()

	log.Printf("[elements] enabled DOM+Overlay+Page domains on tab %s", targetID)
	return nil
}

// GetDocumentRoot returns the DOM root with 3 levels of depth for the given tab.
func (s *ElementsService) GetDocumentRoot(targetID string) (*DOMNode, error) {
	ctx, err := s.console.GetTabContext(targetID)
	if err != nil {
		return nil, err
	}

	if err := s.ensureDomains(targetID, ctx); err != nil {
		return nil, fmt.Errorf("failed to enable domains: %w", err)
	}

	var rootNode *cdp.Node
	if err := chromedp.Run(ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		node, err := dom.GetDocument().WithDepth(3).Do(ctx)
		if err != nil {
			return fmt.Errorf("DOM.getDocument: %w", err)
		}
		rootNode = node
		return nil
	})); err != nil {
		return nil, fmt.Errorf("failed to get document: %w", err)
	}

	result := convertNode(rootNode)
	return &result, nil
}

// GetChildNodes returns children for a specific node.
func (s *ElementsService) GetChildNodes(targetID string, nodeID int64) ([]DOMNode, error) {
	ctx, err := s.console.GetTabContext(targetID)
	if err != nil {
		return nil, err
	}

	var children []DOMNode
	if err := chromedp.Run(ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		if err := dom.RequestChildNodes(cdp.NodeID(nodeID)).WithDepth(2).Do(ctx); err != nil {
			return fmt.Errorf("DOM.requestChildNodes: %w", err)
		}

		node, err := dom.DescribeNode().WithNodeID(cdp.NodeID(nodeID)).WithDepth(2).Do(ctx)
		if err != nil {
			return fmt.Errorf("DOM.describeNode: %w", err)
		}

		for _, child := range node.Children {
			children = append(children, convertNode(child))
		}
		return nil
	})); err != nil {
		return nil, fmt.Errorf("failed to get child nodes: %w", err)
	}

	return children, nil
}

// HighlightNode highlights a node in the Chrome viewport.
func (s *ElementsService) HighlightNode(targetID string, nodeID int64) error {
	ctx, err := s.console.GetTabContext(targetID)
	if err != nil {
		return err
	}

	return chromedp.Run(ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		// Scroll into view so the element is visible.
		_ = dom.ScrollIntoViewIfNeeded().WithNodeID(cdp.NodeID(nodeID)).Do(ctx)

		cfg := &overlay.HighlightConfig{
			ContentColor: &cdp.RGBA{R: 111, G: 168, B: 220, A: 0.66},
			PaddingColor: &cdp.RGBA{R: 147, G: 196, B: 125, A: 0.55},
			BorderColor:  &cdp.RGBA{R: 255, G: 229, B: 153, A: 0.75},
			MarginColor:  &cdp.RGBA{R: 246, G: 178, B: 107, A: 0.66},
			ShowInfo:     true,
		}
		return overlay.HighlightNode(cfg).
			WithNodeID(cdp.NodeID(nodeID)).
			Do(ctx)
	}))
}

// ClearHighlight removes the node highlight overlay.
func (s *ElementsService) ClearHighlight(targetID string) error {
	ctx, err := s.console.GetTabContext(targetID)
	if err != nil {
		return err
	}

	return chromedp.Run(ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		return overlay.HideHighlight().Do(ctx)
	}))
}

// SearchResult represents a single DOM search match.
type SearchResult struct {
	NodeID          int    `json:"nodeId"`
	HighlightNodeID int    `json:"highlightNodeId"` // element to highlight (parent for text nodes)
	NodeName        string `json:"nodeName"`
	LocalName       string `json:"localName"`
	NodeValue       string `json:"nodeValue"` // text content snippet for text/comment nodes
	Selector        string `json:"selector"`
}

// SearchDOM searches the DOM tree using a query string.
// Supports plain text, CSS selectors, and XPath expressions.
func (s *ElementsService) SearchDOM(targetID string, query string) ([]SearchResult, error) {
	ctx, err := s.console.GetTabContext(targetID)
	if err != nil {
		return nil, err
	}

	if err := s.ensureDomains(targetID, ctx); err != nil {
		return nil, err
	}

	var results []SearchResult

	if err := chromedp.Run(ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		searchID, count, err := dom.PerformSearch(query).Do(ctx)
		if err != nil {
			return fmt.Errorf("DOM.performSearch: %w", err)
		}
		defer dom.DiscardSearchResults(searchID).Do(ctx) //nolint:errcheck

		if count == 0 {
			return nil
		}

		// Cap results.
		limit := int64(count)
		if limit > 50 {
			limit = 50
		}

		nodeIDs, err := dom.GetSearchResults(searchID, 0, limit).Do(ctx)
		if err != nil {
			return fmt.Errorf("DOM.getSearchResults: %w", err)
		}

		for _, nid := range nodeIDs {
			node, err := dom.DescribeNode().WithNodeID(nid).WithDepth(0).Do(ctx)
			if err != nil {
				continue
			}

			sr := SearchResult{
				NodeID:          int(nid),
				HighlightNodeID: int(nid), // default: highlight the node itself
				NodeName:        node.NodeName,
				LocalName:       node.LocalName,
				Selector:        buildSelector(node),
			}

			// For text/comment nodes: get content snippet and resolve parent.
			if node.NodeType == cdp.NodeTypeText || node.NodeType == cdp.NodeTypeComment {
				val := node.NodeValue
				if len(val) > 80 {
					val = val[:80] + "…"
				}
				sr.NodeValue = val

				// Resolve parent element for highlighting.
				parentID := resolveParentElement(ctx, nid)
				if parentID > 0 {
					sr.HighlightNodeID = int(parentID)
					// Also get parent info for better display.
					parent, err := dom.DescribeNode().WithNodeID(parentID).WithDepth(0).Do(ctx)
					if err == nil {
						sr.Selector = buildSelector(parent)
					}
				}
			}

			results = append(results, sr)
		}
		return nil
	})); err != nil {
		return nil, fmt.Errorf("search failed: %w", err)
	}

	return results, nil
}

// resolveParentElement finds the parent element's node ID for a given node.
// Uses JavaScript via Runtime to traverse to parentElement.
func resolveParentElement(ctx context.Context, nodeID cdp.NodeID) cdp.NodeID {
	// Resolve node to a RemoteObject.
	remoteObj, err := dom.ResolveNode().WithNodeID(nodeID).Do(ctx)
	if err != nil || remoteObj == nil || remoteObj.ObjectID == "" {
		return 0
	}

	// Call parentElement on the remote object.
	parentObj, _, err := runtimePkg.CallFunctionOn(`function() { return this.parentElement; }`).
		WithObjectID(remoteObj.ObjectID).
		Do(ctx)
	if err != nil || parentObj == nil || parentObj.ObjectID == "" {
		return 0
	}

	// Convert back to a nodeID.
	parentNodeID, err := dom.RequestNode(parentObj.ObjectID).Do(ctx)
	if err != nil {
		return 0
	}

	return parentNodeID
}

// resolveParentNode finds the parent node's ID (includes non-element parents like document).
func resolveParentNode(ctx context.Context, nodeID cdp.NodeID) cdp.NodeID {
	remoteObj, err := dom.ResolveNode().WithNodeID(nodeID).Do(ctx)
	if err != nil || remoteObj == nil || remoteObj.ObjectID == "" {
		return 0
	}

	parentObj, _, err := runtimePkg.CallFunctionOn(`function() { return this.parentNode; }`).
		WithObjectID(remoteObj.ObjectID).
		Do(ctx)
	if err != nil || parentObj == nil || parentObj.ObjectID == "" {
		return 0
	}

	parentNodeID, err := dom.RequestNode(parentObj.ObjectID).Do(ctx)
	if err != nil {
		return 0
	}
	return parentNodeID
}

// GetNodePath returns the ancestor chain from root to the target node (as nodeIDs).
func (s *ElementsService) GetNodePath(targetID string, nodeID int64) ([]int, error) {
	ctx, err := s.console.GetTabContext(targetID)
	if err != nil {
		return nil, err
	}

	var path []int
	if err := chromedp.Run(ctx, chromedp.ActionFunc(func(ctx context.Context) error {
		currentID := cdp.NodeID(nodeID)

		for i := 0; i < 50; i++ { // safety limit
			path = append([]int{int(currentID)}, path...)

			parentID := resolveParentNode(ctx, currentID)
			if parentID == 0 {
				break
			}
			currentID = parentID
		}
		return nil
	})); err != nil {
		return nil, err
	}

	return path, nil
}

// buildSelector creates a short readable selector from a node (e.g. "div.container#main").
func buildSelector(n *cdp.Node) string {
	tag := n.LocalName
	if tag == "" {
		tag = n.NodeName
	}
	sel := tag

	// Parse attributes for id and class.
	for i := 0; i+1 < len(n.Attributes); i += 2 {
		key, val := n.Attributes[i], n.Attributes[i+1]
		if key == "id" && val != "" {
			sel += "#" + val
		}
		if key == "class" && val != "" {
			// Show first 2 classes max.
			classes := splitClasses(val, 2)
			for _, c := range classes {
				sel += "." + c
			}
		}
	}
	return sel
}

// splitClasses splits a space-separated class string and returns up to max classes.
func splitClasses(val string, max int) []string {
	var classes []string
	start := 0
	for i := 0; i <= len(val) && len(classes) < max; i++ {
		if i == len(val) || val[i] == ' ' {
			if i > start {
				classes = append(classes, val[start:i])
			}
			start = i + 1
		}
	}
	return classes
}

// ResetTab clears the enabled state for a tab (e.g. after navigation).
func (s *ElementsService) ResetTab(targetID string) {
	s.mu.Lock()
	delete(s.enabledTabs, targetID)
	s.mu.Unlock()
}

func convertNode(n *cdp.Node) DOMNode {
	node := DOMNode{
		NodeID:     int(n.NodeID),
		NodeType:   int(n.NodeType),
		NodeName:   n.NodeName,
		LocalName:  n.LocalName,
		NodeValue:  n.NodeValue,
		ChildCount: int(n.ChildNodeCount),
	}

	if len(n.Attributes) > 0 {
		node.Attributes = n.Attributes
	}

	for _, child := range n.Children {
		node.Children = append(node.Children, convertNode(child))
	}

	return node
}
