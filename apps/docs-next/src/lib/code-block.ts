/**
 * Render a beautiful, self-contained code block to an HTML string: a header bar
 * (traffic-light dots + filename/lang + optional "Run in playground" + a Copy
 * button) over a syntax-highlighted `<pre><code>`. Used both by hand-authored
 * pages (via `html={...}`) and by the markdown renderer's fenced-code path, so
 * every code surface across the site is identical. The Copy button is wired by
 * a single delegated listener in `main.ts` (works for prerendered + injected
 * markup alike — no per-block island).
 */
import { highlight } from './highlight.ts'

export interface CodeBlockOptions {
  /** Label shown in the header bar (filename or language). */
  readonly name?: string
  /** Playground preset id — renders a "Run ↗" link to /examples#<id>. */
  readonly playground?: string
}

export function codeBlock(source: string, opts: CodeBlockOptions = {}): string {
  const code = source.replace(/\n+$/, '')
  const name = opts.name ?? 'aihu'
  const run = opts.playground
    ? `<a class="cb-run" href="/examples#${opts.playground}">Run ↗</a>`
    : ''
  return (
    `<figure class="cb">` +
    `<figcaption class="cb-bar">` +
    `<span class="cb-dots"><i></i><i></i><i></i></span>` +
    `<span class="cb-name">${escAttr(name)}</span>` +
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
