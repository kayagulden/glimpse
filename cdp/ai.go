package cdp

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/chromedp"
)

// AIService orchestrates AI-powered analysis via Gemini.
type AIService struct {
	console     *ConsoleService
	network     *NetworkService
	performance *PerformanceService
	appCtx      context.Context
}

// NewAIService creates a new AIService.
func NewAIService(cs *ConsoleService, ns *NetworkService, ps *PerformanceService) *AIService {
	return &AIService{
		console:     cs,
		network:     ns,
		performance: ps,
	}
}

// SetAppContext stores the Wails runtime context.
func (s *AIService) SetAppContext(ctx context.Context) {
	s.appCtx = ctx
}

// ── Debug Analysis ──

const debugSystemPrompt = `Sen deneyimli bir web geliştirme uzmanısın. Sana bir web sayfasından toplanan hata logları, başarısız ağ istekleri ve performans verilerini vereceğim.

Her sorun için şu yapıda analiz yap:

### 🔴 [Sorunun kısa başlığı]
**Hata:** Hatanın tam açıklaması
**Kök Neden:** Olası kök neden
**Çözüm:** Spesifik çözüm önerisi (varsa kod örneğiyle)

Eğer hiç sorun yoksa bunu belirt ve genel iyileştirme önerileri sun.
Yanıtını Türkçe ve Markdown formatında ver. Kısa ve öz ol.`

// DebugAnalysis collects errors and issues from console/network/performance and asks Gemini for diagnosis.
func (s *AIService) DebugAnalysis(targetID string, apiKey string, model string) (string, error) {
	if apiKey == "" {
		return "", fmt.Errorf("Gemini API key gerekli")
	}

	var parts []string

	// 1. Console errors/warnings
	logs := s.console.GetLogBuffer(targetID)
	var errorLogs []string
	for _, entry := range logs {
		if entry.Type == "error" || entry.Type == "warning" {
			errorLogs = append(errorLogs, fmt.Sprintf("[%s] %s", strings.ToUpper(entry.Type), entry.Message))
		}
	}
	if len(errorLogs) > 0 {
		parts = append(parts, "## Console Hataları/Uyarıları\n```\n"+strings.Join(errorLogs, "\n")+"\n```")
	} else {
		parts = append(parts, "## Console Hataları/Uyarıları\nHata yok.")
	}

	// 2. Failed network requests
	requests := s.network.GetRequestBuffer(targetID)
	var failedReqs []string
	for _, req := range requests {
		if req.Error != "" || req.Status >= 400 {
			line := fmt.Sprintf("%s %s → %d %s", req.Method, req.URL, req.Status, req.Error)
			failedReqs = append(failedReqs, line)
		}
	}
	if len(failedReqs) > 0 {
		parts = append(parts, "## Başarısız Ağ İstekleri\n```\n"+strings.Join(failedReqs, "\n")+"\n```")
	} else {
		parts = append(parts, "## Başarısız Ağ İstekleri\nBaşarısız istek yok.")
	}

	// 3. Performance metrics
	perfData := s.collectPerfSummary(targetID)
	if perfData != "" {
		parts = append(parts, "## Performans Verileri\n"+perfData)
	}

	prompt := strings.Join(parts, "\n\n")
	log.Printf("[AI] Debug analysis prompt: %d chars", len(prompt))

	client := NewGeminiClient(apiKey)
	return client.Generate(debugSystemPrompt, prompt, model)
}

// ── Site Audit ──

const auditSystemPrompt = `Sen kapsamlı bir web sitesi denetim uzmanısın. Sana bir web sayfasından toplanan verileri vereceğim.

Aşağıdaki başlıklarda analiz yap ve her biri için 0-100 arası puan ver:

## 📊 SEO (Puan: X/100)
Başlık, meta açıklama, heading yapısı, görseller, linkler analizi

## ⚡ Performans (Puan: X/100)
Web Vitals, kaynak boyutları, yükleme süreleri analizi

## ♿ Erişilebilirlik (Puan: X/100)
ARIA etiketleri, dil tanımı, form etiketleri, semantik HTML analizi

## 🎨 UX / Kullanılabilirlik (Puan: X/100)
Sayfa yapısı, navigasyon, mobil uyumluluk analizi

## 🔒 Güvenlik (Puan: X/100)
HTTPS, güvenlik başlıkları, cookie bayrakları analizi

## ✅ En İyi Uygulamalar (Puan: X/100)
Console hataları, kaynak optimizasyonu analizi

Her başlıkta bulunan sorunları ve iyileştirme önerilerini spesifik olarak listele.
Sonunda genel bir özet puan ver.
Yanıtını Türkçe ve Markdown formatında ver.`

// SiteAuditData is the structured SEO/accessibility data collected via JS injection.
type SiteAuditData struct {
	Title           string            `json:"title"`
	MetaDescription string            `json:"metaDescription"`
	MetaKeywords    string            `json:"metaKeywords"`
	CanonicalURL    string            `json:"canonicalUrl"`
	OGTags          map[string]string `json:"ogTags"`
	Headings        map[string][]string `json:"headings"`
	Images          []struct {
		Src    string `json:"src"`
		Alt    string `json:"alt"`
		HasAlt bool   `json:"hasAlt"`
	} `json:"images"`
	Links struct {
		Internal []struct {
			Href string `json:"href"`
			Text string `json:"text"`
		} `json:"internal"`
		External []struct {
			Href string `json:"href"`
			Text string `json:"text"`
		} `json:"external"`
	} `json:"links"`
	Accessibility struct {
		Lang          string `json:"lang"`
		AriaLandmarks int    `json:"ariaLandmarks"`
		FormsLabels   int    `json:"formsWithLabels"`
		Tabindex      int    `json:"tabindex"`
	} `json:"accessibility"`
	ViewportMeta string `json:"viewportMeta"`
	Charset      string `json:"charset"`
	RobotsMeta   string `json:"robotsMeta"`
}

// collectSiteData injects JS to gather SEO/accessibility data from the page.
func (s *AIService) collectSiteData(targetID string) (*SiteAuditData, error) {
	ctx, err := s.console.GetTabContext(targetID)
	if err != nil {
		return nil, err
	}

	script := `(function(){
		var r={title:document.title,metaDescription:'',metaKeywords:'',canonicalUrl:'',ogTags:{},
			headings:{h1:[],h2:[],h3:[],h4:[],h5:[],h6:[]},images:[],links:{internal:[],external:[]},
			accessibility:{},viewportMeta:'',charset:'',robotsMeta:''};
		document.querySelectorAll('meta').forEach(function(m){
			var n=m.getAttribute('name')||m.getAttribute('property')||'';
			var c=m.getAttribute('content')||'';
			if(n==='description')r.metaDescription=c;
			if(n==='keywords')r.metaKeywords=c;
			if(n==='viewport')r.viewportMeta=c;
			if(n==='robots')r.robotsMeta=c;
			if(n.startsWith('og:'))r.ogTags[n]=c;
			if(m.getAttribute('charset'))r.charset=m.getAttribute('charset');
		});
		var canon=document.querySelector('link[rel="canonical"]');
		if(canon)r.canonicalUrl=canon.getAttribute('href')||'';
		var charsetMeta=document.querySelector('meta[charset]');
		if(charsetMeta&&!r.charset)r.charset=charsetMeta.getAttribute('charset');
		['h1','h2','h3','h4','h5','h6'].forEach(function(t){
			document.querySelectorAll(t).forEach(function(el){
				r.headings[t].push(el.textContent.trim().substring(0,200));
			});
		});
		var imgs=document.querySelectorAll('img');
		for(var i=0;i<Math.min(imgs.length,30);i++){
			r.images.push({src:imgs[i].src.substring(0,200),alt:imgs[i].getAttribute('alt')||'',hasAlt:imgs[i].hasAttribute('alt')});
		}
		var origin=window.location.origin;
		var anchors=document.querySelectorAll('a[href]');
		for(var j=0;j<Math.min(anchors.length,50);j++){
			var h=anchors[j].href;var txt=anchors[j].textContent.trim().substring(0,100);
			var e={href:h.substring(0,200),text:txt};
			if(h.startsWith(origin)||h.startsWith('/'))r.links.internal.push(e);
			else if(h.startsWith('http'))r.links.external.push(e);
		}
		r.accessibility={lang:document.documentElement.lang||'',
			ariaLandmarks:document.querySelectorAll('[role]').length,
			formsWithLabels:document.querySelectorAll('label').length,
			tabindex:document.querySelectorAll('[tabindex]').length};
		return JSON.stringify(r);
	})()`

	var jsonStr string
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
		return nil, fmt.Errorf("JS injection: %w", err)
	}

	if err := json.Unmarshal(result.Value, &jsonStr); err != nil {
		return nil, fmt.Errorf("unmarshal outer: %w", err)
	}

	var data SiteAuditData
	if err := json.Unmarshal([]byte(jsonStr), &data); err != nil {
		return nil, fmt.Errorf("unmarshal data: %w", err)
	}

	return &data, nil
}

// SiteAudit performs a comprehensive site audit using collected data + Gemini.
func (s *AIService) SiteAudit(targetID string, apiKey string, model string) (string, error) {
	if apiKey == "" {
		return "", fmt.Errorf("Gemini API key gerekli")
	}

	var parts []string

	// 1. Page SEO/accessibility data
	siteData, err := s.collectSiteData(targetID)
	if err != nil {
		log.Printf("[AI] Site data collection failed: %v", err)
		parts = append(parts, "## Sayfa Verisi\nToplama başarısız: "+err.Error())
	} else {
		dataJSON, _ := json.MarshalIndent(siteData, "", "  ")
		parts = append(parts, "## Sayfa Verisi (SEO/Erişilebilirlik)\n```json\n"+string(dataJSON)+"\n```")
	}

	// 2. Performance
	perfData := s.collectPerfSummary(targetID)
	if perfData != "" {
		parts = append(parts, "## Performans Metrikleri\n"+perfData)
	}

	// 3. Console errors
	logs := s.console.GetLogBuffer(targetID)
	var errors []string
	for _, entry := range logs {
		if entry.Type == "error" {
			errors = append(errors, entry.Message)
		}
	}
	if len(errors) > 0 {
		parts = append(parts, "## Console Hataları\n```\n"+strings.Join(errors, "\n")+"\n```")
	} else {
		parts = append(parts, "## Console Hataları\nHata yok.")
	}

	// 4. Security headers from network responses
	requests := s.network.GetRequestBuffer(targetID)
	var secHeaders []string
	for _, req := range requests {
		if req.Type == "Document" && req.RespHeaders != nil {
			for k, v := range req.RespHeaders {
				kl := strings.ToLower(k)
				if kl == "strict-transport-security" || kl == "content-security-policy" ||
					kl == "x-content-type-options" || kl == "x-frame-options" ||
					kl == "x-xss-protection" || kl == "referrer-policy" ||
					kl == "permissions-policy" {
					secHeaders = append(secHeaders, fmt.Sprintf("%s: %s", k, v))
				}
			}
			break // only need the main document
		}
	}
	if len(secHeaders) > 0 {
		parts = append(parts, "## Güvenlik Başlıkları\n```\n"+strings.Join(secHeaders, "\n")+"\n```")
	} else {
		parts = append(parts, "## Güvenlik Başlıkları\nGüvenlik başlığı bulunamadı.")
	}

	prompt := strings.Join(parts, "\n\n")
	log.Printf("[AI] Site audit prompt: %d chars", len(prompt))

	client := NewGeminiClient(apiKey)
	return client.Generate(auditSystemPrompt, prompt, model)
}

// ── Helpers ──

// collectPerfSummary gathers performance metrics as a formatted string.
func (s *AIService) collectPerfSummary(targetID string) string {
	var lines []string

	// Web Vitals (one-shot)
	vitals, err := s.performance.CollectWebVitals(targetID)
	if err == nil && vitals != nil {
		lines = append(lines, fmt.Sprintf("FCP: %.0fms, LCP: %.0fms, CLS: %.3f, TTFB: %.0fms",
			vitals.FCP, vitals.LCP, vitals.CLS, vitals.TTFB))
		lines = append(lines, fmt.Sprintf("DOMContentLoaded: %.0fms, Load: %.0fms",
			vitals.DomContentLoaded, vitals.Load))
	}

	return strings.Join(lines, "\n")
}
