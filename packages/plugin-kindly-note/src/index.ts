/**
 * @aihu-plugin/kindly-note — runtime syntax highlighting + markdown rendering
 * for aihu.
 *
 * HIGHLIGHTING half — renders syntax-highlighted code IN THE BROWSER, at
 * runtime, from the published `@kindly-note/*` packages (`@kindly-note/core` +
 * `@kindly-note/emitters-html` + on-demand `@kindly-note/lang-*` tokenizers via
 * `@kindly-note/loader-dynamic-import`). Pair with a theme stylesheet from
 * `@kindly-note/themes-default` (e.g. `@kindly-note/themes-default/dark.css`)
 * for the `kn-*` scoped-span classes.
 *
 * RENDERING half — renders CommonMark markdown to SAFE semantic HTML via the
 * published `@kindly-note/render-markdown` package (one-call wrapper over
 * `@kindly-note/lang-markdown` + `@kindly-note/emitters-markdown`). The emitter
 * defaults are security-first (raw HTML escaped, `javascript:`/unsafe `data:`
 * URLs neutralised, `on*` handlers never emitted), so the output is safe for
 * `innerHTML` / `nodeValue`.
 *
 * Primary API:
 *   highlight(source, lang) → Promise<HighlightOutput>   — signal-friendly helper
 *   <aihu-code>                                          — custom element
 *   defineCodeElement()                                  — register the element
 *   renderMarkdown(src, opts?) → Promise<string>         — signal-friendly helper
 *   <aihu-markdown>                                      — custom element
 *   defineMarkdownElement()                              — register the element
 *
 * Plugin registration (Plugin Contract Spec §3, §7.1):
 *   kindlyNote() → Plugin — register in defineAihuConfig({ plugins: [kindlyNote()] })
 *
 * Lazy loading: NO `@kindly-note/lang-*` package is statically imported here, so
 * a bundler cannot pull every language in. Each tokenizer is fetched via dynamic
 * `import()` the first time its language is used (~1.5 kB gz/language). The
 * markdown renderer is loaded the same way — `@kindly-note/render-markdown` is
 * an optional peer, resolved only on the first renderMarkdown() call.
 *
 * GFM (tables / task-lists / strikethrough / autolinks) is intentionally NOT
 * supported by the markdown renderer — that is `@kindly-note/lang-markdown-gfm`.
 */

export {
  AIHU_CODE_TAG,
  type AihuCodeElement,
  type AihuCodeElementConstructor,
  defineCodeElement,
  getAihuCodeElement,
} from './element.ts'
export {
  ensureLanguage,
  type HighlightOutput,
  highlight,
  isLanguageRequested,
} from './highlight.ts'
export {
  AIHU_MARKDOWN_TAG,
  type AihuMarkdownElement,
  type AihuMarkdownElementConstructor,
  defineMarkdownElement,
  getAihuMarkdownElement,
} from './markdown-element.ts'
export { type RenderMarkdownOptions, renderMarkdown } from './render-markdown.ts'

// ---------------------------------------------------------------------------
// Plugin factory (Plugin Contract Spec §3) — mirrors @aihu-plugin/data
// ---------------------------------------------------------------------------

import type { Plugin } from '@aihu/plugin'
import { kindlyNotePlugin } from './plugin.ts'

/**
 * Plugin factory for `@aihu-plugin/kindly-note`. Accepts optional configuration
 * (reserved for v0.4+ when macro lowering is wired) and returns a configured
 * plugin instance for `defineAihuConfig({ plugins: [kindlyNote()] })`.
 *
 * @example
 * // aihu.config.ts
 * import { kindlyNote } from '@aihu-plugin/kindly-note'
 * import { defineAihuConfig } from '@aihu/server'
 *
 * export default defineAihuConfig({
 *   plugins: [kindlyNote()],
 * })
 */
export function kindlyNote(_config?: Record<string, never>): Plugin {
  return kindlyNotePlugin
}
