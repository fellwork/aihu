/**
 * @aihu-plugin/kindly-note — runtime syntax highlighting for aihu.
 *
 * Renders syntax-highlighted code IN THE BROWSER, at runtime, from the
 * published v0.1.0 `@kindly-note/*` packages (`@kindly-note/core` +
 * `@kindly-note/emitters-html` + on-demand `@kindly-note/lang-*` tokenizers via
 * `@kindly-note/loader-dynamic-import`). Pair with a theme stylesheet from
 * `@kindly-note/themes-default` (e.g. `@kindly-note/themes-default/dark.css`)
 * for the `kn-*` scoped-span classes.
 *
 * Primary API:
 *   highlight(source, lang) → Promise<HighlightOutput>   — signal-friendly helper
 *   <aihu-code>                                          — custom element
 *   defineCodeElement()                                  — register the element
 *
 * Plugin registration (Plugin Contract Spec §3, §7.1):
 *   kindlyNote() → Plugin — register in defineAihuConfig({ plugins: [kindlyNote()] })
 *
 * Lazy loading: NO `@kindly-note/lang-*` package is statically imported here, so
 * a bundler cannot pull every language in. Each tokenizer is fetched via dynamic
 * `import()` the first time its language is used (~1.5 kB gz/language).
 *
 * OUT OF SCOPE (round 1, Shape A): markdown *rendering* —
 * `<aihu-markdown>` / `renderMarkdown` / GFM. That path depends on the unbuilt
 * `@kindly-note/emitters-markdown` and is blocked on org access to
 * `srmcguirt/kindly-note`. This package ships the HIGHLIGHTING half only.
 * (Highlighting markdown *source* via the `lang-markdown` tokenizer IS
 * supported — that is highlighting, not rendering.)
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
