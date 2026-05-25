/**
 * Runtime markdown-rendering core for `@aihu-plugin/kindly-note`.
 *
 * Wraps the published v0.1.0 `@kindly-note/render-markdown` package — the
 * one-call markdown → safe HTML entry point that composes
 * `@kindly-note/lang-markdown` (CommonMark tokeniser) +
 * `@kindly-note/emitters-markdown` (semantic-HTML emitter with security-first
 * defaults) + a sensible `Highlighter`. The emitter owns the security contract:
 * raw HTML is escaped, dangerous URL schemes (`javascript:` / unsafe `data:`)
 * are neutralised, `on*` handlers can never be emitted, and Unicode bidi
 * controls are normalised. So `renderMarkdown()`'s return value is SAFE to drop
 * straight into `innerHTML` / `nodeValue` under the defaults.
 *
 * This is the RENDERING half (Shape A, round 2), the sibling of the
 * HIGHLIGHTING half in ./highlight.ts. Both follow the identical dep-free,
 * lazy-import, SSR-safe, signal-aware pattern: the `@kindly-note/*` packages are
 * OPTIONAL peerDependencies, imported with `await import()` inside the function
 * below (never at module top level), so merely importing
 * `@aihu-plugin/kindly-note` (and defining `<aihu-markdown>`) requires none of
 * them — they are resolved only when `renderMarkdown()` actually runs.
 */

// Type-only import — erased at compile time, so it adds NO runtime import of
// `@kindly-note/render-markdown` to the built dist. The VALUE import is loaded
// LAZILY via dynamic `import()` inside renderMarkdown() below (mirrors the lazy
// peer loading in ./highlight.ts). This keeps merely importing
// `@aihu-plugin/kindly-note` (and defining `<aihu-markdown>`) free of any hard
// dependency on the `@kindly-note/render-markdown` peer.
import type { RenderMarkdownOptions } from '@kindly-note/render-markdown'

// Re-export the option type so consumers can type their opts without taking a
// (type-only, erased) dependency on `@kindly-note/render-markdown` directly.
export type { RenderMarkdownOptions } from '@kindly-note/render-markdown'

// ---------------------------------------------------------------------------
// Lazy peer loading
// ---------------------------------------------------------------------------

// `@kindly-note/render-markdown` is imported with `await import()` here, NOT at
// module top level. This is what makes importing the package (and defining
// <aihu-markdown>) safe without the peer installed — it is resolved only on the
// first renderMarkdown() call. Mirrors the lazy strategy in ./highlight.ts.

type RenderMarkdownFn = typeof import('@kindly-note/render-markdown')['renderMarkdown']

// The render function, resolved once and shared across all renderMarkdown()
// calls and every <aihu-markdown> element on the page.
let _render: RenderMarkdownFn | undefined
async function renderFn(): Promise<RenderMarkdownFn> {
  if (_render) return _render
  const { renderMarkdown } = await import('@kindly-note/render-markdown')
  return (_render ??= renderMarkdown)
}

/**
 * Render a CommonMark markdown string to a SAFE semantic-HTML string.
 *
 * Async only because the underlying `@kindly-note/render-markdown` engine is
 * lazy-loaded on first use (the engine call itself is synchronous). The
 * returned HTML is safe to drop into `innerHTML` / `nodeValue` under the
 * default options — raw HTML is escaped, `javascript:`/unsafe `data:` URLs are
 * neutralised, and `on*` handlers can never be emitted. Pass
 * {@link RenderMarkdownOptions} (e.g. `allowHtml`, `urlPolicy`, `languages`,
 * `classPrefix`) to relax these for trusted content or to enable code-fence
 * highlighting.
 *
 * Like {@link highlight}, this resolves the optional peer lazily; it only
 * requires `@kindly-note/render-markdown` to be installed when actually called,
 * not at import time. When the peer cannot be resolved the underlying
 * `import()` rejects and this Promise rejects in turn — callers that want a
 * non-throwing path (e.g. `<aihu-markdown>`) should handle the rejection.
 *
 * @example
 *   const html = await renderMarkdown('# Hi\n\n**bold**')
 *   // html === '<h1>Hi</h1>\n<p><strong>bold</strong></p>'
 */
export async function renderMarkdown(src: string, opts?: RenderMarkdownOptions): Promise<string> {
  const render = await renderFn()
  return opts === undefined ? render(src) : render(src, opts)
}

/**
 * Test/SSR-isolation hook: drop the module-singleton render function so each
 * test starts from a clean lazy-load slate. Not part of the public consumer API
 * (re-exported only under `__resetForTests`).
 */
export function __resetMarkdownState(): void {
  _render = undefined
}
