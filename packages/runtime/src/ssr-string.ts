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
 *
 * `__aihu_schild` (below) is the exception to "consumed only by generated
 * code": @aihu/server's tree walker calls it too, deliberately, so that a
 * resolved child is serialized by ONE function no matter which renderer is
 * running. See its doc comment.
 */

import { SHADOW_ROOT_MODE, type ShadowMode } from './shadow-mode.ts'

// Re-exported so `@aihu/server` can open the same window around the TOP-LEVEL
// render without importing the client runtime's main entry.
export { _inSsrLifecycle, _withSsrLifecycle } from './ssr-lifecycle.ts'

import { _withSsrLifecycle } from './ssr-lifecycle.ts'

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

// ---------------------------------------------------------------------------
// Child component resolution — the SINGLE serialization point.
// ---------------------------------------------------------------------------

/**
 * A compiled `--target server` module, as far as child rendering cares. Every
 * field is optional because a module that is missing any of them is simply not
 * renderable as a child (see `__aihu_schild`'s fail-closed rule).
 */
export interface SsrChildModule {
  /** The compiled string renderer, `__ssrString(props, opts)`. */
  readonly __ssrString?: (props: unknown, opts?: SsrChildRenderOpts) => string
  /** `__aihu_light_scope__` — the compiler-assigned light-DOM scope id. */
  readonly __aihu_light_scope__?: string
  /**
   * `__aihu_shadow__` (#770). aihu's OWN vocabulary — `'light' | 'shadow'` —
   * never the DOM's `ShadowRootMode`.
   */
  readonly __aihu_shadow__?: ShadowMode
  /**
   * `__aihu_css__` — the component's own CSS as a plain string.
   *
   * Used ONLY on the shadow path, where it is inlined as `<style>` inside the
   * declarative template. A shadow root is style-isolated by construction, so
   * prerendered markup whose styles are not inside it paints unstyled until the
   * component's chunk loads — the #754 failure, where content rendering ahead
   * of its scoped CSS pushed the LCP element below the fold.
   *
   * Light-DOM children ignore it: their rules arrive through the app
   * stylesheet's `@scope([data-a=…])` blocks (#758).
   */
  readonly __aihu_css__?: string
}

/** The opts a compiled `__ssrString` accepts, plus the child registry. */
export interface SsrChildRenderOpts {
  readonly hydratable?: boolean
  readonly lightScopeId?: string
  /**
   * tag → compiled module, PRE-RESOLVED by the caller (SSG prerender or the
   * Workers handler). A Map and not a callback on purpose: module loading is
   * async while this path is synchronous, and hoisting resolution to the caller
   * is what lets the compiled fast path survive child rendering at all. It is
   * also where the cycle guard belongs — once, over the whole graph, at build
   * time, rather than at every render.
   */
  readonly children?: ReadonlyMap<string, SsrChildModule>
  /** @internal Recursion depth, incremented per nested child. */
  readonly __depth?: number
}

/**
 * Belt-and-braces bound on nesting. The registry builder rejects cyclic tag
 * graphs before any render happens, so reaching this cap means the guard was
 * bypassed or a registry was hand-built. Emitting the bare element (rather
 * than throwing) keeps a prerender from being taken down by one bad subtree —
 * the failure degrades to today's empty-shell behaviour.
 */
const MAX_CHILD_DEPTH = 32

/**
 * Make CSS safe as `<style>` RAW TEXT.
 *
 * `<style>` has no entity parsing — the only thing that ends it is the literal
 * `</style`, so authored CSS containing that sequence (in a comment, or in a
 * `content:` string) would close the element early and spill the rest of the
 * stylesheet into the document as markup.
 *
 * Escaping `</` as `<\/` is correct in both places it can legitimately appear:
 * inside a `/* … *\/` comment the CSS parser copies the text verbatim, so the
 * backslash is inert; inside a string literal `\/` is a valid CSS escape for
 * `/`, so `content: "<\/style>"` still renders `</style>`. Same shape as the
 * `</script>` escaping `@aihu/server`'s `ScriptTag` doc records for JSON-LD.
 */
const escapeStyleText = (css: string): string => css.replace(/<\//g, '<\\/')

/**
 * Render a referenced child component, or emit the empty element unchanged.
 *
 * This is the ONE place a resolved child is serialized. The compiled string
 * renderer calls it from every component-reference site, and `@aihu/server`'s
 * tree walker calls it from its branch arm, so the two paths cannot drift in
 * capability the way they previously could in bytes. Both DOM modes are handled
 * here, together, for the same reason.
 *
 * FAIL-CLOSED, three ways — each returns byte-identical output to the
 * pre-child-resolution renderer, so a site that supplies no registry, or an
 * incompletely compiled child, sees no change at all:
 *   1. no registry entry for `tag`;
 *   2. the module carries no `__ssrString` (the emitter's bail list, e.g. a
 *      template shape the string emitter declines);
 *   3. **the module declares no `__aihu_shadow__`.** This one is deliberate and
 *      not defensive padding: emitting a `<template shadowrootmode>` for a
 *      component that is actually light DOM (or host children for one that is
 *      actually shadow) produces markup the client can never adopt. There is no
 *      safe default to guess, so an unknown mode renders nothing.
 *
 * SCOPE (v1): the caller emits a `__aihu_schild` call only for a reference with
 * no attributes and no children. Attributes at a reference site are the child's
 * props, and forwarding them means rendering the child with real prop values —
 * a separate slice. Children at a reference site are slot content, and slot
 * projection is explicitly unimplemented. Both cases keep emitting the plain
 * element.
 */
export const __aihu_schild = (
  tag: string,
  attrsHtml: string,
  opts?: SsrChildRenderOpts,
): string => {
  const bare = `<${tag}${attrsHtml}></${tag}>`
  const mod = opts?.children?.get(tag)
  const render = mod?.__ssrString
  const shadow = mod?.__aihu_shadow__
  if (typeof render !== 'function' || (shadow !== 'light' && shadow !== 'shadow')) return bare

  const depth = opts?.__depth ?? 0
  if (depth >= MAX_CHILD_DEPTH) return bare

  // `data-a` belongs on the HOST — that is where the client stamps it
  // (`define-element.ts`'s connectedCallback) and where
  // `@scope([data-a=…]) to ([data-a])` has to start. Two stamps make the child's
  // template root a nested scope root and cut the child's own rules off at its
  // first child, the same hazard `renderToString`'s `wrapTag` block guards at
  // the top level.
  //
  // Passing the EMPTY STRING, not omitting the option, is what actually
  // suppresses the second stamp — and this was a real bug before it was a
  // comment. A compiled `__ssrString` resolves its opts as
  // `lightScopeId: opts.lightScopeId ?? __AIHU_LIGHT_SCOPE_ID__`, the module's
  // own injected id, so OMITTING the option lets that fallback stamp the
  // template root anyway; aihu.dev prerendered `<site-header>` with `data-a` in
  // both places. `''` survives `??` (it is not nullish) and is falsy at the
  // emitter's `__opts.lightScopeId ? … : ''` test, so the child renders
  // unstamped and the host carries the only `data-a`.
  const hydratable = opts?.hydratable ?? false
  let inner: string
  try {
    // The child's setup runs inside a server-render lifecycle window: it is
    // called directly, not through `defineComponent`, so `onMount` and friends
    // have no owner to register against. Without this, ANY child using a
    // lifecycle hook threw `SCR-R0010` and rendered empty — which is exactly
    // how `<search-box>` came out blank while its `onMount`-free sibling did
    // not. Synchronous by contract; see `_withSsrLifecycle`.
    inner = _withSsrLifecycle(() =>
      render(
        {},
        {
          hydratable,
          lightScopeId: '',
          ...(opts?.children ? { children: opts.children } : {}),
          __depth: depth + 1,
        },
      ),
    )
  } catch (err) {
    // A child that throws must not take the whole page down with it; the parent
    // still renders and the child fills in on the client, exactly as today.
    //
    // But it must not be SILENT either. Swallowing the reason turns a broken
    // component into an empty element that looks identical to one nobody
    // registered — and a prerender that quietly drops content is the failure
    // mode this whole plan exists to fix. Reported once, with the tag, so a
    // build log names what to look at.
    console.error(`[aihu] SSR child <${tag}> threw; rendering it empty:`, err)
    return bare
  }

  // `data-aihu-ssr` is the adoption marker AND arbor's hydration path boundary
  // (each wrapped render restarts `data-aihu-path` at ROOT_PATH). Hydratable
  // renders only — like the path markers it is a property of the DESTINATION,
  // so terminal output carries no adoption bytes.
  const adopt = hydratable ? ' data-aihu-ssr=""' : ''

  if (shadow === 'light') {
    const scope = mod?.__aihu_light_scope__
    const scopeAttr = scope !== undefined ? ` data-a="${__aihu_eattr(scope)}"` : ''
    return `<${tag}${attrsHtml}${scopeAttr}${adopt}>${inner}</${tag}>`
  }

  // Shadow: the tree goes inside a declarative shadow root, which the browser
  // attaches during parsing — before the element upgrades. `SHADOW_ROOT_MODE`
  // is imported, not spelled, so this and the runtime's `attachShadow` cannot
  // name different modes; a closed root would null out `this.shadowRoot` and
  // break the very adoption this markup exists for.
  //
  // Styles go INSIDE the template, first, and this is not optional polish: a
  // shadow root is style-isolated, so a declarative one whose CSS lives outside
  // it renders its content unstyled until the component's chunk loads. That is
  // exactly the #754 regression — content painting ahead of its scoped CSS,
  // stacking wrong and pushing LCP below the fold. Emitting the tree without
  // the styles would trade an empty header for a broken one.
  const css = mod?.__aihu_css__
  const style = css ? `<style>${escapeStyleText(css)}</style>` : ''
  return `<${tag}${attrsHtml}${adopt}><template shadowrootmode="${SHADOW_ROOT_MODE}">${style}${inner}</template></${tag}>`
}
