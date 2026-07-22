/**
 * SSR string fast-path helpers (wave-3 keystone).
 *
 * Consumed ONLY by compiler-generated `__ssrString` renderers (the
 * `--target server` string-template emit in `ssr_string_emit.rs`). The
 * escaping semantics are exact mirrors of `@aihu/server`'s tree walker
 * (`ssr.ts` `escapeText` / `escapeAttr` / the fixed `serializeAttrs` value
 * rules) — the byte-identity contract between the compiled string renderer
 * and the walker depends on these staying in lockstep, and the differential
 * suite (`packages/server/tests/ssr-string-differential.test.ts`) pins it.
 *
 * They live in @aihu/runtime (not @aihu/server) because compiled server
 * artifacts already import @aihu/runtime for `defineComponent`/`defineElement`
 * — a dependency on @aihu/server from generated component modules would be a
 * new, heavier edge. They ship as the SEPARATE `@aihu/runtime/ssr` subpath
 * entry (dist/ssr-string.js) so these server-only bytes never count against
 * the client bundle's size gate. All helpers are pure and DOM-free.
 */

const escText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Escaped text hole for a REACTIVE leaf — the walker reads
 * `String(get())`, so `null`/`undefined` stringify ("null"/"undefined"),
 * exactly like a client-side reactive text binding would render them.
 */
export const __aihu_stext = (v: unknown): string => escText(String(v))

/**
 * Escaped text hole for an EAGER leaf — the walker's `leafText` renders
 * nullish static values as the empty string.
 */
export const __aihu_stext0 = (v: unknown): string => (v == null ? '' : escText(String(v)))

/** Attribute-value escape (`&` and `"`), the walker's `escapeAttr`. */
export const __aihu_eattr = (v: unknown): string =>
  String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/**
 * One serialized attribute (` k="v"` / ` k` / nothing), mirroring the
 * walker's `serializeAttrs` value rules for a RESOLVED value: functions
 * (event handlers) never serialize, `true` renders the bare attribute,
 * `false`/`undefined` render nothing, everything else stringifies escaped.
 */
export const __aihu_sattr = (k: string, v: unknown): string => {
  if (typeof v === 'function') return ''
  if (v === true) return ` ${k}`
  if (v === false || v === undefined) return ''
  return ` ${k}="${__aihu_eattr(v)}"`
}

/**
 * List-item key normalization — the walker's
 * `String(key).replace(/\./g, '_')` (dots would splice into the path
 * grammar; see `_structuralSubtrees` in @aihu/server ssr.ts).
 */
export const __aihu_key = (v: unknown): string => String(v).replace(/\./g, '_')

/**
 * Comment-safe path for structural markers — the walker's `_commentPath`
 * (`-` → `_` so arbitrary list keys can't terminate the comment early).
 */
export const __aihu_cpath = (p: string): string => p.replace(/-/g, '_')
