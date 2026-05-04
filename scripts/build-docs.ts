#!/usr/bin/env bun
/**
 * scripts/build-docs.ts
 * Converts docs/site/*.md to HTML in docs/site/dist/.
 * Zero external deps — Bun builtins only.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

// On Windows, new URL().pathname has a leading slash before the drive letter.
// Use import.meta.dirname for a reliable path.
const root = join(import.meta.dirname, '..')
const srcDir = join(root, 'docs', 'site')
const outDir = join(root, 'docs', 'site', 'dist')

mkdirSync(outDir, { recursive: true })

// ── Markdown → HTML conversion ───────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inlineMarkdown(text: string): string {
  // Code spans first (before bold/italic so backtick content isn't processed)
  text = text.replace(/`([^`]+)`/g, (_m, code) => `<code>${escapeHtml(code)}</code>`)
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  // Markdown links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  return text
}

function convertMarkdown(md: string): string {
  const lines = md.split('\n')
  const htmlLines: string[] = []
  let inCodeBlock = false
  let codeLines: string[] = []
  let inTable = false
  let tableLines: string[] = []
  let inUl = false
  let inOl = false
  let _inParagraph = false
  let paraLines: string[] = []

  function flushParagraph(): void {
    if (paraLines.length > 0) {
      htmlLines.push(`<p>${inlineMarkdown(paraLines.join(' '))}</p>`)
      paraLines = []
      _inParagraph = false
    }
  }

  function flushList(): void {
    if (inUl) {
      htmlLines.push('</ul>')
      inUl = false
    }
    if (inOl) {
      htmlLines.push('</ol>')
      inOl = false
    }
  }

  function flushTable(): void {
    if (!inTable) return
    inTable = false
    if (tableLines.length === 0) return
    htmlLines.push('<table>')
    for (let i = 0; i < tableLines.length; i++) {
      const row = tableLines[i]
      const cells = row
        .split('|')
        .map((c) => c.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
      if (i === 0) {
        // header row
        htmlLines.push('<thead><tr>')
        for (const cell of cells) htmlLines.push(`<th>${inlineMarkdown(cell)}</th>`)
        htmlLines.push('</tr></thead>')
      } else if (i === 1 && /^[\s|:-]+$/.test(row)) {
        // separator row — skip
        htmlLines.push('<tbody>')
      } else {
        htmlLines.push('<tr>')
        for (const cell of cells) htmlLines.push(`<td>${inlineMarkdown(cell)}</td>`)
        htmlLines.push('</tr>')
      }
    }
    if (tableLines.length > 2) htmlLines.push('</tbody>')
    htmlLines.push('</table>')
    tableLines = []
  }

  for (const rawLine of lines) {
    // Code block fence
    if (rawLine.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        htmlLines.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
        codeLines = []
        inCodeBlock = false
      } else {
        flushParagraph()
        flushList()
        flushTable()
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(rawLine)
      continue
    }

    const line = rawLine

    // Headings
    if (/^#{1,6} /.test(line)) {
      flushParagraph()
      flushList()
      flushTable()
      const m = line.match(/^(#{1,6}) (.+)$/)!
      const level = m[1].length
      const text = inlineMarkdown(m[2])
      htmlLines.push(`<h${level}>${text}</h${level}>`)
      continue
    }

    // Table row
    if (line.startsWith('|')) {
      flushParagraph()
      flushList()
      if (!inTable) inTable = true
      tableLines.push(line)
      continue
    } else if (inTable) {
      flushTable()
    }

    // Unordered list
    if (/^- /.test(line)) {
      flushParagraph()
      flushTable()
      if (!inUl) {
        htmlLines.push('<ul>')
        inUl = true
      }
      if (inOl) {
        htmlLines.push('</ol>')
        inOl = false
      }
      htmlLines.push(`<li>${inlineMarkdown(line.slice(2))}</li>`)
      continue
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      flushParagraph()
      flushTable()
      if (!inOl) {
        htmlLines.push('<ol>')
        inOl = true
      }
      if (inUl) {
        htmlLines.push('</ul>')
        inUl = false
      }
      htmlLines.push(`<li>${inlineMarkdown(line.replace(/^\d+\. /, ''))}</li>`)
      continue
    }

    // Blank line
    if (line.trim() === '') {
      flushParagraph()
      flushList()
      flushTable()
      continue
    }

    // Otherwise: paragraph text
    flushList()
    flushTable()
    _inParagraph = true
    paraLines.push(line.trim())
  }

  flushParagraph()
  flushList()
  flushTable()
  if (inCodeBlock) {
    htmlLines.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
  }

  return htmlLines.join('\n')
}

function extractTitle(md: string): string {
  const m = md.match(/^# (.+)$/m)
  return m ? m[1] : 'scribe docs'
}

// ── HTML shell ────────────────────────────────────────────────────────────────

const CSS = `
body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
nav { margin-bottom: 2rem; border-bottom: 1px solid #eee; padding-bottom: 1rem; }
nav a { margin-right: 1rem; text-decoration: none; color: #0066cc; }
nav a:hover { text-decoration: underline; }
h1, h2, h3 { margin-top: 2rem; }
pre { background: #f4f4f4; padding: 1rem; overflow: auto; border-radius: 4px; }
code { background: #f4f4f4; padding: 0.1rem 0.3rem; border-radius: 2px; font-size: 0.9em; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
th { background: #f9f9f9; }
ul, ol { padding-left: 1.5rem; }
a { color: #0066cc; }
`.trim()

function buildHtml(title: string, nav: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — scribe</title>
<style>
${CSS}
</style>
</head>
<body>
<nav>${nav}</nav>
<main>${content}</main>
</body>
</html>`
}

// ── Discover files ────────────────────────────────────────────────────────────

const PAGE_ORDER = [
  'introduction',
  'installation',
  'getting-started',
  'authoring-components',
  'authoring-plugins',
  'authoring-agents',
  'routing-layouts',
  'data-fetching',
  'reactivity',
  'ssr-hydration',
  'deployment',
  'api-reference',
]

const mdFiles = readdirSync(srcDir)
  .filter((f) => f.endsWith('.md') && !f.startsWith('.'))
  .map((f) => ({ file: f, slug: basename(f, '.md') }))

// Sort by PAGE_ORDER, then alphabetically for anything not in the list
mdFiles.sort((a, b) => {
  const ai = PAGE_ORDER.indexOf(a.slug)
  const bi = PAGE_ORDER.indexOf(b.slug)
  if (ai !== -1 && bi !== -1) return ai - bi
  if (ai !== -1) return -1
  if (bi !== -1) return 1
  return a.slug.localeCompare(b.slug)
})

// ── Read all titles for nav ────────────────────────────────────────────────────

const pages: Array<{ slug: string; title: string; content: string }> = []

for (const { file, slug } of mdFiles) {
  const md = readFileSync(join(srcDir, file), 'utf-8')
  const title = extractTitle(md)
  const content = convertMarkdown(md)
  pages.push({ slug, title, content })
}

// ── Build nav ────────────────────────────────────────────────────────────────

const nav = pages.map((p) => `<a href="${p.slug}.html">${p.title}</a>`).join('\n')

// ── Write HTML files ──────────────────────────────────────────────────────────

let count = 0

for (const page of pages) {
  const html = buildHtml(page.title, nav, page.content)
  writeFileSync(join(outDir, `${page.slug}.html`), html, 'utf-8')
  count++
  console.log(`  wrote ${page.slug}.html`)
}

// ── Write index.html ──────────────────────────────────────────────────────────

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0; url=introduction.html">
<title>scribe docs</title>
</head>
<body>
<p>Redirecting to <a href="introduction.html">introduction</a>...</p>
</body>
</html>`

writeFileSync(join(outDir, 'index.html'), indexHtml, 'utf-8')
count++
console.log('  wrote index.html')

console.log(`\nbuild-docs: ${count} HTML files written to docs/site/dist/`)
