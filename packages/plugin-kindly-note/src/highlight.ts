/**
 * Runtime syntax-highlighting core for `@aihu-plugin/kindly-note`.
 *
 * Wraps the published v0.1.0 `@kindly-note/*` packages:
 *   - `@kindly-note/core`            — `createHighlighter` engine + token stream
 *   - `@kindly-note/emitters-html`   — `htmlEmitter` (scoped `kn-` span output)
 *   - `@kindly-note/loader-dynamic-import` — `createDynamicImportLoader`
 *     resolves a language id (e.g. `'typescript'`) to its `@kindly-note/lang-*`
 *     package via native dynamic `import()`, so each language tokenizer is only
 *     fetched the first time it is actually used (~1.5 kB gz/language).
 *
 * SCOPE NOTE (Shape A, round 1): this module ships the HIGHLIGHTING half only.
 * Markdown *rendering* (`@kindly-note/emitters-markdown` / `renderMarkdown` /
 * `<aihu-markdown>`) is deliberately NOT built here — that emitter is unbuilt
 * and blocked on org access to `srmcguirt/kindly-note`. Highlighting markdown
 * *source* (the `lang-markdown` tokenizer) is in scope; rendering markdown to
 * HTML is not.
 */

import { createHighlighter, type Highlighter, type LanguageDefinition } from '@kindly-note/core'
import { htmlEmitter } from '@kindly-note/emitters-html'
import { createDynamicImportLoader } from '@kindly-note/loader-dynamic-import'

/** Result of a single highlight call. Mirrors the load-bearing fields of
 *  kindly-note's `HighlightResult`, narrowed to the HTML-emitter shape. */
export interface HighlightOutput {
  /** Scoped-span HTML string (`<span class="kn-...">…</span>`). */
  readonly html: string
  /** Canonical language name resolved by the engine (e.g. `'TypeScript'`),
   *  or `undefined` when the language could not be loaded/registered. */
  readonly language: string | undefined
  /** True when the language id could not be lazy-loaded; `html` is then the
   *  HTML-escaped raw source so the caller still renders safe, readable text. */
  readonly fallback: boolean
}

// ---------------------------------------------------------------------------
// Module-singleton highlighter + lazy language registry
// ---------------------------------------------------------------------------

// One highlighter instance, shared across all highlight() calls and every
// <aihu-code> element on the page. The htmlEmitter gives `kn-`-prefixed scoped
// spans matching @kindly-note/themes-default.
let _highlighter: Highlighter | undefined
function highlighter(): Highlighter {
  return (_highlighter ??= createHighlighter({ emitter: htmlEmitter }))
}

// The dynamic-import loader. Default resolution maps `'rust'` →
// `@kindly-note/lang-rust`, and passes through anything that already looks like
// a package path. We never statically import a `lang-*` package, so the bundler
// cannot eagerly pull them in — each is fetched on first use.
let _loader: ReturnType<typeof createDynamicImportLoader> | undefined
function loader(): ReturnType<typeof createDynamicImportLoader> {
  return (_loader ??= createDynamicImportLoader())
}

// Tracks the in-flight / settled load for each PACKAGE id so a language is
// fetched at most once even under concurrent highlight() calls. The Promise
// resolves to the registered canonical name, or null if the load failed.
const _registered = new Map<string, Promise<string | null>>()

// Common aliases → the `@kindly-note/lang-<id>` package slug the loader resolves.
// The dynamic-import loader resolves by package name derived from the id, so it
// cannot map an alias (`ts`) to a differently-named package (`lang-typescript`)
// on its own. This table covers the published v0.1.0 language set; an id that
// is not an alias passes through unchanged (so a future `@kindly-note/lang-rust`
// works via the bare id `'rust'` with no table edit).
const ALIAS_TO_PACKAGE: Readonly<Record<string, string>> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsonc: 'json',
  json5: 'json',
  md: 'markdown',
  markdown: 'markdown',
}

/** Resolve a user-facing language id/alias to the `lang-*` package slug. */
function packageSlug(id: string): string {
  return ALIAS_TO_PACKAGE[id] ?? id
}

/**
 * Ensure the tokenizer for `lang` is loaded and registered with the shared
 * highlighter. Idempotent and concurrency-safe: repeated calls for the same
 * language reuse the first load Promise (the lazy-load guarantee).
 *
 * @returns the canonical registered language name, or `null` on load failure.
 */
export async function ensureLanguage(lang: string): Promise<string | null> {
  const slug = packageSlug(lang.trim().toLowerCase())
  const existing = _registered.get(slug)
  if (existing) return existing

  const load = (async (): Promise<string | null> => {
    try {
      const def: LanguageDefinition<unknown> = await loader().load(slug)
      const handle = highlighter().registerLanguage(def)
      return handle.definition.name
    } catch {
      // Unknown / unresolvable language id. Swallow — highlight() falls back to
      // escaped plain text. We drop the cached rejection so a later call can
      // retry (e.g. after a network hiccup loading the lang package).
      _registered.delete(slug)
      return null
    }
  })()

  _registered.set(slug, load)
  return load
}

/**
 * Whether a language tokenizer has already been requested (fetch started or
 * completed). Exposed for tests asserting the lazy-load contract.
 */
export function isLanguageRequested(lang: string): boolean {
  return _registered.has(packageSlug(lang.trim().toLowerCase()))
}

/** Minimal HTML escape for the unknown-language fallback path. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Highlight `source` as `lang` at runtime, returning scoped-span HTML.
 *
 * Lazy-loads the language tokenizer on first use (subsequent calls for the same
 * language reuse the registered definition). When the language cannot be
 * resolved, returns the HTML-escaped source with `fallback: true` rather than
 * throwing — a highlighter should never blank out the user's code.
 *
 * @example
 *   const { html } = await highlight('const x = 1', 'typescript')
 *   // html === '<span class="kn-keyword">const</span> …'
 */
export async function highlight(source: string, lang: string): Promise<HighlightOutput> {
  const canonical = await ensureLanguage(lang)
  if (canonical == null) {
    return { html: escapeHtml(source), language: undefined, fallback: true }
  }
  const result = highlighter().highlight(source, { language: lang })
  return { html: result.value, language: result.language ?? canonical, fallback: false }
}

/**
 * Test/SSR-isolation hook: drop the module-singleton highlighter, loader, and
 * language registry so each test starts from a clean lazy-load slate. Not part
 * of the public consumer API (re-exported only under `__resetForTests`).
 */
export function __resetHighlighterState(): void {
  _highlighter = undefined
  _loader = undefined
  _registered.clear()
}
