package cdp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

const geminiBaseURL = "https://generativelanguage.googleapis.com/v1beta/models/"

// Models to try in order (fallback chain).
var geminiModels = []string{
	"gemini-2.0-flash-lite",
	"gemini-1.5-flash",
	"gemini-2.0-flash",
}

// ── Gemini API types ──

type geminiPart struct {
	Text string `json:"text"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
	Role  string      `json:"role,omitempty"`
}

type geminiGenConfig struct {
	Temperature     float64 `json:"temperature,omitempty"`
	MaxOutputTokens int     `json:"maxOutputTokens,omitempty"`
}

type geminiRequest struct {
	SystemInstruction *geminiContent   `json:"systemInstruction,omitempty"`
	Contents          []geminiContent  `json:"contents"`
	GenerationConfig  *geminiGenConfig `json:"generationConfig,omitempty"`
}

type geminiCandidate struct {
	Content      geminiContent `json:"content"`
	FinishReason string        `json:"finishReason"`
}

type geminiResponse struct {
	Candidates []geminiCandidate `json:"candidates"`
}

// ── Client ──

// GeminiClient calls the Gemini REST API.
type GeminiClient struct {
	apiKey string
	client *http.Client
}

// NewGeminiClient creates a Gemini client.
func NewGeminiClient(apiKey string) *GeminiClient {
	return &GeminiClient{
		apiKey: apiKey,
		client: &http.Client{Timeout: 90 * time.Second},
	}
}

// Generate sends a prompt to Gemini and returns the text response.
// It tries the preferred model first, then falls back to others on quota errors.
func (g *GeminiClient) Generate(systemPrompt, userPrompt, preferredModel string) (string, error) {
	req := geminiRequest{
		Contents: []geminiContent{
			{Parts: []geminiPart{{Text: userPrompt}}},
		},
		GenerationConfig: &geminiGenConfig{
			Temperature:     0.4,
			MaxOutputTokens: 8192,
		},
	}

	if systemPrompt != "" {
		req.SystemInstruction = &geminiContent{
			Parts: []geminiPart{{Text: systemPrompt}},
		}
	}

	body, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("marshal: %w", err)
	}

	// Build model list: preferred first, then fallbacks.
	models := make([]string, 0, len(geminiModels)+1)
	if preferredModel != "" {
		models = append(models, preferredModel)
	}
	for _, m := range geminiModels {
		if m != preferredModel {
			models = append(models, m)
		}
	}

	var lastErr error
	for _, model := range models {
		endpoint := geminiBaseURL + model + ":generateContent?key=" + g.apiKey

		// Try up to 2 times per model (with retry on 429)
		for attempt := 0; attempt < 2; attempt++ {
			result, retryable, err := g.doRequest(endpoint, body)
			if err == nil {
				log.Printf("[Gemini] Success with model: %s", model)
				return result, nil
			}
			lastErr = err
			if !retryable {
				break // non-retryable error, try next model
			}
			// Wait before retry
			log.Printf("[Gemini] Model %s rate limited (attempt %d), retrying in 4s...", model, attempt+1)
			time.Sleep(4 * time.Second)
		}
	}

	return "", fmt.Errorf("tüm modeller başarısız: %v", lastErr)
}

// doRequest makes a single HTTP request and returns (result, retryable, error).
func (g *GeminiClient) doRequest(endpoint string, body []byte) (string, bool, error) {
	httpReq, err := http.NewRequest("POST", endpoint, bytes.NewReader(body))
	if err != nil {
		return "", false, fmt.Errorf("request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := g.client.Do(httpReq)
	if err != nil {
		return "", false, fmt.Errorf("HTTP: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", false, fmt.Errorf("read body: %w", err)
	}

	if resp.StatusCode == 429 {
		return "", true, fmt.Errorf("rate limited (429)")
	}

	if resp.StatusCode != 200 {
		return "", false, fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
	}

	var gemResp geminiResponse
	if err := json.Unmarshal(respBody, &gemResp); err != nil {
		return "", false, fmt.Errorf("unmarshal: %w", err)
	}

	if len(gemResp.Candidates) == 0 || len(gemResp.Candidates[0].Content.Parts) == 0 {
		return "", false, fmt.Errorf("empty response from Gemini")
	}

	return gemResp.Candidates[0].Content.Parts[0].Text, false, nil
}
