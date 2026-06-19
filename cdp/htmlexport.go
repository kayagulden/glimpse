package cdp

import (
	"fmt"
	"regexp"
	"strings"
)

// MarkdownToStyledHTML converts markdown report content to a styled HTML page
// suitable for PDF printing.
func MarkdownToStyledHTML(md string) string {
	body := mdToHTML(md)

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Glimpse Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.7;
    color: #1a1a2e;
    padding: 40px;
    max-width: 800px;
    margin: 0 auto;
  }
  h1 { font-size: 22px; font-weight: 700; margin: 24px 0 12px; color: #0e0e0e; }
  h2 { font-size: 17px; font-weight: 700; margin: 20px 0 8px; color: #16213e; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; }
  h3 { font-size: 14px; font-weight: 600; margin: 16px 0 6px; color: #1a1a3e; }
  p { margin: 8px 0; }
  strong { font-weight: 600; }
  em { font-style: italic; }
  ul, ol { margin: 8px 0; padding-left: 24px; }
  li { margin: 4px 0; }
  code {
    background: #f4f4f8;
    padding: 1px 5px;
    border-radius: 3px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 12px;
  }
  pre {
    background: #f4f4f8;
    border: 1px solid #e0e0e8;
    border-radius: 6px;
    padding: 12px 16px;
    overflow-x: auto;
    margin: 12px 0;
    font-size: 12px;
    line-height: 1.5;
  }
  pre code { background: none; padding: 0; }
  hr { border: none; border-top: 1px solid #e0e0e0; margin: 20px 0; }
  .footer {
    margin-top: 40px;
    padding-top: 12px;
    border-top: 1px solid #e0e0e0;
    font-size: 10px;
    color: #999;
    text-align: center;
  }
</style>
</head>
<body>
%s
<div class="footer">Glimpse AI Report</div>
</body>
</html>`, body)
}

// mdToHTML is a simple markdown to HTML converter for reports.
func mdToHTML(md string) string {
	// Code blocks
	codeBlockRe := regexp.MustCompile("(?s)```\\w*\n(.*?)```")
	md = codeBlockRe.ReplaceAllStringFunc(md, func(m string) string {
		inner := codeBlockRe.FindStringSubmatch(m)
		if len(inner) > 1 {
			return "<pre><code>" + escapeHTMLStr(strings.TrimSpace(inner[1])) + "</code></pre>"
		}
		return m
	})

	// Inline code
	inlineCodeRe := regexp.MustCompile("`([^`]+)`")
	md = inlineCodeRe.ReplaceAllString(md, "<code>$1</code>")

	// Headers
	md = regexp.MustCompile("(?m)^### (.+)$").ReplaceAllString(md, "<h3>$1</h3>")
	md = regexp.MustCompile("(?m)^## (.+)$").ReplaceAllString(md, "<h2>$1</h2>")
	md = regexp.MustCompile("(?m)^# (.+)$").ReplaceAllString(md, "<h1>$1</h1>")

	// Bold & italic
	md = regexp.MustCompile(`\*\*(.+?)\*\*`).ReplaceAllString(md, "<strong>$1</strong>")
	md = regexp.MustCompile(`\*(.+?)\*`).ReplaceAllString(md, "<em>$1</em>")

	// Unordered list
	md = regexp.MustCompile("(?m)^[-*] (.+)$").ReplaceAllString(md, "<li>$1</li>")

	// Horizontal rule
	md = regexp.MustCompile("(?m)^---$").ReplaceAllString(md, "<hr/>")

	// Wrap consecutive <li> in <ul>
	md = regexp.MustCompile("(?s)(<li>.*?</li>\n?)+").ReplaceAllStringFunc(md, func(m string) string {
		return "<ul>" + m + "</ul>"
	})

	// Paragraphs
	md = strings.ReplaceAll(md, "\n\n", "</p><p>")
	md = "<p>" + md + "</p>"

	// Clean up empty paragraphs around block elements
	for _, tag := range []string{"h1", "h2", "h3", "pre", "ul", "hr/"} {
		md = strings.ReplaceAll(md, "<p><"+tag, "<"+tag)
		if tag != "hr/" {
			md = strings.ReplaceAll(md, "</"+tag+"></p>", "</"+tag+">")
		} else {
			md = strings.ReplaceAll(md, "hr/></p>", "hr/>")
		}
	}

	return md
}

func escapeHTMLStr(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}
