/**
 * Render a self-contained code block to an HTML string in the "datasheet"
 * character: a header rail (the terracotta `● governed` status dot + mono
 * filename + a right-aligned byte-size / lang rail + optional "● Run" + a Copy
 * button) over a syntax-highlighted `<pre><code>`. Used both by hand-authored
 * pages (via `html={...}`) and by the markdown renderer's fenced-code path, so
 * every code surface across the site reads as one instrument. The Copy button is
 * wired by a single delegated listener in `main.ts` (works for prerendered +
 * injected markup alike — no per-block island).
 */
import { highlight } from './highlight.ts'

export interface CodeBlockOptions {
  /** Label shown in the header rail (filename or language). */
  readonly name?: string
  /** Playground preset id — renders a "● Run" link to /examples#<id>. */
  readonly playground?: string
  /** Language/kind shown in the right rail. Defaults to the name's extension. */
  readonly lang?: string
}

/** Human-readable byte size of a UTF-8 source string — datasheet metadata. */
function byteSize(source: string): string {
  const bytes = new TextEncoder().encode(source).length
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} kB`
}

export function codeBlock(source: string, opts: CodeBlockOptions = {}): string {
  const code = source.replace(/\n+$/, '')
  const name = opts.name ?? 'aihu'
  const ext = name.includes('.') ? (name.split('.').pop() ?? 'aihu') : name
  const lang = opts.lang ?? ext
  const run = opts.playground
    ? `<a class="cb-run" href="/examples#${opts.playground}"><span class="dn-dot"></span>Run</a>`
    : ''
  return (
    `<figure class="cb">` +
    `<figcaption class="cb-bar">` +
    `<span class="cb-status"><span class="dn-dot"></span>governed</span>` +
    `<span class="cb-name">${escAttr(name)}</span>` +
    `<span class="cb-meta"><span class="cb-lang">${escAttr(lang)}</span>` +
    `<span class="cb-size">${byteSize(code)}</span></span>` +
    `<span class="cb-actions">${run}` +
    `<button type="button" class="cb-copy" aria-label="Copy code">` +
    `<span class="cb-copy-idle">Copy</span><span class="cb-copy-done">Copied</span>` +
    `</button></span>` +
    `</figcaption>` +
    `<pre><code>${highlight(code)}</code></pre>` +
    `</figure>`
  )
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}
