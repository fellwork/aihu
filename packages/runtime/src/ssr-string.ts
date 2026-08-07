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

// ---------------------------------------------------------------------------
// Attribute NAME validation — the serialization-layer half of §13.
// ---------------------------------------------------------------------------

/**
 * Characters that cannot appear in a serialized attribute name.
 *
 * Deliberately NARROW, and the narrowness is the point. This is not an attempt
 * at the HTML custom-attribute name production, and it does not police unicode:
 * every character here is one that a real browser's tokenizer ALREADY resolves
 * into something other than the attribute the author wrote, so a template
 * containing one was already broken — silently — before this rejected it.
 *
 *   - `\t \n \f \r` and space END the attribute-name state, so `data-x/onload`
 *     … `data-x onload="alert(1)"` is two attributes, the second an event
 *     handler. This is the injection §13 reports.
 *   - `/` and `>` end the TAG (`before-attribute-name` / `tag-open` states), so
 *     everything after them is markup, not a name.
 *   - `=` ends the name and starts the value.
 *   - `"`, `'`, `<` and `` ` `` are the tokenizer's
 *     `unexpected-character-in-attribute-name` set — they parse, but into a
 *     name no author meant, and `` ` `` in particular is how IE-era value
 *     confusion was smuggled past naive escapers.
 *   - C0/DEL control characters: NUL is replaced with U+FFFD, the rest are
 *     parse errors, and none survive a round trip.
 *
 * NOT rejected: `:` (`xlink:href`, `xml:lang`), `.`, `@`, `#`, `$`, `[`, `]`,
 * `(`, `)`, `,` and everything non-ASCII. Those serialize and re-parse as the
 * same name, so rejecting them would fail real templates to no security end —
 * which is the failure mode the "narrow alphabet" ruling exists to prevent.
 *
 * A deliberate SUPERSET of the parser's `FORBIDDEN_ATTR_NAME_CHARS` (C310),
 * which omits space and `>` because its tokenizer already ends a name at
 * either, so a parsed name can never hold one. Nothing guarantees that here:
 * this layer exists precisely for keys the parser never saw — computed at
 * runtime, hand-built into an arbor tree, or compiled elsewhere — and a space
 * is the canonical injection. The two layers may never diverge the other way:
 * anything the parser rejects must also be rejected here, or a template the
 * compiler refused would serialize through a different route.
 *
 * A CHAR-CODE scan rather than a regex, for two reasons that agree: a character
 * class spanning C0 has to contain literal control bytes, which biome's
 * `noControlCharactersInRegex` rejects and which are invisible in a diff (one
 * draft of this file silently embedded a NUL and turned the whole module into
 * something `grep` treated as binary); and the ranges read as what they are.
 */
const isBadAttrNameChar = (c: number): boolean =>
  c <= 0x20 || // every C0 control, and space
  c === 0x7f || // DEL
  c === 0x22 || // "
  c === 0x27 || // '
  c === 0x2f || // /
  c === 0x3c || // <
  c === 0x3d || // =
  c === 0x3e || // >
  c === 0x60 // `

/** Does any character of `k` end the attribute-name state in a real parser? */
const hasBadAttrNameChar = (k: string): boolean => {
  for (let i = 0; i < k.length; i++) {
    if (isBadAttrNameChar(k.charCodeAt(i))) return true
  }
  return false
}

/**
 * Warn-once ledger for rejected attribute names.
 *
 * On `globalThis` for the reason `ssr-lifecycle.ts` documents at length:
 * `@aihu/server` INLINES this module into its own `dist`, so a module-scoped
 * `Set` exists twice and the walker's rejections would never dedupe against the
 * string renderer's. One cell, one warning per distinct name per process.
 */
const REPORTED_KEY = Symbol.for('aihu.ssr.invalidAttrNames')
interface ReportedHolder {
  [REPORTED_KEY]?: Set<string>
}

/**
 * Is `k` safe to serialize as an attribute name? Rejections are DROPPED, not
 * thrown, and reported once each.
 *
 * Drop-and-warn rather than throw, because that is what every other malformed
 * input on this path already does: `__aihu_sattr` returns `''` for a function
 * value, `serializeAttrs` skips it, `__aihu_schild` fails closed to the bare
 * element on a module it cannot render, `buildChildRegistry` warns on a
 * duplicate tag and keeps going, `_buildStateScript` swallows a throwing
 * serializer. A server render that throws takes down a whole page (or a whole
 * prerender) over one attribute; a render that drops the attribute produces
 * exactly the markup a browser would have produced for the SAFE half of that
 * name, minus the injection — degraded, finite, and reported.
 *
 * It is also the only choice compatible with byte-identity: the walker and the
 * compiled string renderer both call this, so both drop the same keys. A throw
 * would have to be thrown identically from two different call stacks.
 */
export const _isSerializableAttrName = (k: string): boolean => {
  if (k.length > 0 && !hasBadAttrNameChar(k)) return true
  const g = globalThis as ReportedHolder
  const seen = (g[REPORTED_KEY] ??= new Set<string>())
  if (!seen.has(k)) {
    seen.add(k)
    console.error(
      `[aihu] SSR dropped the attribute name ${JSON.stringify(k)}: ` +
        (k.length === 0
          ? 'an attribute with no name cannot be serialized at all.'
          : 'it contains a character a browser parses as ENDING the name — whitespace, ' +
            'or one of / > = " \' < ` — or a control character. Left in place it becomes a ' +
            'DIFFERENT attribute in the page: `data-x/onload="…"` parses as an onload ' +
            'handler, not a data attribute.') +
        ' Rename it to something a browser reads back unchanged.',
    )
  }
  return false
}

/**
 * One serialized attribute (` k="v"` / ` k` / nothing), mirroring the
 * walker's `serializeAttrs` value rules for a RESOLVED value: functions
 * (event handlers) never serialize, `true` renders the bare attribute,
 * `false`/`undefined` render nothing, everything else stringifies escaped.
 *
 * The NAME is validated here as well as in the parser, and the redundancy is
 * deliberate: the parser covers authored templates, this covers everything that
 * reaches serialization by another route — a runtime-computed key, a hand-built
 * arbor tree, a third-party component compiled elsewhere, and (new with child
 * SSR) any of those carried into a prerendered page by a module the app merely
 * references.
 */
export const __aihu_sattr = (k: string, v: unknown): string => {
  if (typeof v === 'function') return ''
  if (v === true) return _isSerializableAttrName(k) ? ` ${k}` : ''
  if (v === false || v === undefined) return ''
  if (!_isSerializableAttrName(k)) return ''
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
  /**
   * The module's default export — the host-less `__ssr` factory the server
   * target emits (`export default __ssr`), which builds an arbor tree from a
   * setup run with empty props.
   *
   * Declared here purely so `@aihu/server`'s walker can reach it under
   * `AIHU_SSR_STRING=0`, where the point is NOT to use the compiled string
   * renderer. Nothing in this module calls it — it is synchronous to build but
   * the walk over its result is async, and everything here is synchronous by
   * construction. `unknown` rather than a factory type because that is all this
   * module can honestly assert about it.
   */
  readonly default?: unknown
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
  /**
   * @internal Per-render memo of already-serialized children, keyed by tag +
   * hydration mode.
   *
   * Bounds FAN-OUT, which the depth cap alone does not. A depth cap limits how
   * DEEP the recursion goes, not how WIDE: with each of 14 components
   * referencing the next three times, a perfectly acyclic graph expands to
   * 3^13 renders — measured at 67 MB of output in 0.2 s, and tens of GB a few
   * components later. The cycle guard cannot see this either, because
   * `__aihu_child_tags__` is a SET while the emitter emits one call per
   * reference site.
   *
   * Safe because a child render is deterministic within one top-level render:
   * it always receives `{}` props, `lightScopeId: ''`, and the same registry,
   * and its tree restarts at ROOT_PATH behind its own `data-aihu-ssr` boundary,
   * so two reference sites legitimately produce identical inner markup. Scoped
   * PER RENDER, not module-global — component setup can read stores or context
   * that differ between requests.
   */
  readonly __memo?: Map<string, string>
  /**
   * @internal Remaining child expansions for this top-level render.
   *
   * The memo bounds the WORK of fan-out; it cannot bound the OUTPUT. Three
   * references repeated 13 deep is 3^13 reference sites, and each legitimately
   * emits the child's markup — memoized, that is 89 MB in 16 ms rather than
   * 67 MB in 217 ms. Faster, and still a build-killer.
   *
   * So the budget counts BYTES, not expansions. Counting expansions does not
   * work once the memo exists: only one render happens per tag, but each
   * RETURNS three times its child's string, so output grows exponentially
   * while the render count stays linear — measured at 89 MB from 14 renders.
   * Bytes are the thing that actually gets large, so bytes are what is bounded.
   *
   * Past the budget a reference renders as the empty element it rendered before
   * this feature existed: degraded, loudly reported, and finite.
   */
  readonly __budget?: { bytes: number; reported: boolean }
}

/**
 * Belt-and-braces bound on nesting. The registry builder rejects cyclic tag
 * graphs before any render happens, so reaching this cap means the guard was
 * bypassed or a registry was hand-built. Emitting the bare element (rather
 * than throwing) keeps a prerender from being taken down by one bad subtree —
 * the failure degrades to today's empty-shell behaviour.
 */
export const _MAX_CHILD_DEPTH = 32
const MAX_CHILD_DEPTH = _MAX_CHILD_DEPTH

const hydratableOf = (o?: { hydratable?: boolean }): boolean => o?.hydratable ?? false

/**
 * Total child markup allowed per top-level render. Generous for any real page
 * — aihu.dev's largest prerenders under 100 kB of child content — and small
 * enough that a pathological graph fails in milliseconds instead of exhausting
 * memory.
 */
export const _MAX_CHILD_BYTES = 8 * 1024 * 1024
const MAX_CHILD_BYTES = _MAX_CHILD_BYTES

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
 * ONE exception, and it is narrow by construction: under `AIHU_SSR_STRING=0`
 * the walker renders a child's INNER tree itself rather than calling
 * `mod.__ssrString`, because otherwise the escape hatch — the documented way to
 * ask "is the fast path lying to me?" — stopped working below the top level.
 * That path still produces the host SHELL through `_ssrChildWrap` below, the
 * same function this one ends with, and its eligibility is a strict subset of
 * the gate here, so the hatch changes the engine and never the bytes.
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
  // Only a custom-element name can name a component. A registry keyed on a
  // plain tag (`div`) would otherwise make the walker child-render an ordinary
  // element that the compiled emitter never lowers — a renderer divergence
  // handed to us by a malformed registry rather than by the template.
  if (!tag.includes('-')) return bare
  const mod = opts?.children?.get(tag)
  if (mod === undefined) return bare
  const render = mod.__ssrString
  const shadow = mod.__aihu_shadow__
  if (typeof render !== 'function' || (shadow !== 'light' && shadow !== 'shadow')) return bare

  const depth = opts?.__depth ?? 0
  if (depth >= MAX_CHILD_DEPTH) return bare

  // One memo and one budget per top-level render, created on first use and
  // threaded down together.
  const budget = opts?.__budget ?? { bytes: MAX_CHILD_BYTES, reported: false }
  if (budget.bytes <= 0) return bare
  const memo = opts?.__memo ?? new Map<string, string>()
  const memoKey = `${tag}\u0000${hydratableOf(opts)}`
  const cached = memo.get(memoKey)

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
  const hydratable = hydratableOf(opts)

  let inner: string
  if (cached !== undefined) {
    inner = cached
  } else {
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
            __memo: memo,
            __budget: budget,
          },
        ),
      )
    } catch (err) {
      // A child that throws must not take the whole page down with it; the
      // parent still renders and the child fills in on the client, exactly as
      // today.
      //
      // But it must not be SILENT either. Swallowing the reason turns a broken
      // component into an empty element that looks identical to one nobody
      // registered — and a prerender that quietly drops content is the failure
      // mode this whole plan exists to fix. Reported with the tag, so a build
      // log names what to look at.
      console.error(`[aihu] SSR child <${tag}> threw; rendering it empty:`, err)
      return bare
    }
    // A renderer that returns anything but a string is a broken module, not a
    // render to embed. An async `__ssrString` used to reach the page as the
    // literal text `[object Promise]` — worse than the empty element, because it
    // LOOKS like content and ships. Nothing here can await it: this whole path
    // is synchronous by construction.
    if (typeof inner !== 'string') {
      console.error(
        `[aihu] SSR child <${tag}> returned ${
          inner !== null && typeof inner === 'object' && 'then' in (inner as object)
            ? 'a promise — a server renderer must be synchronous'
            : `a ${typeof inner}`
        }; rendering it empty.`,
      )
      return bare
    }
    memo.set(memoKey, inner)
  }

  // Charge the budget for EVERY reference site, cached or not: the bytes reach
  // the page either way, and it is the emission that has to be bounded.
  budget.bytes -= inner.length
  if (budget.bytes <= 0) {
    if (!budget.reported) {
      budget.reported = true
      console.error(
        `[aihu] SSR child budget (${MAX_CHILD_BYTES} bytes) exhausted at <${tag}>; ` +
          `further children render empty. This usually means a component graph fans out ` +
          `exponentially — look for a component that references itself transitively.`,
      )
    }
    return bare
  }

  return _ssrChildWrap(tag, attrsHtml, mod, inner, hydratable)
}

/**
 * Wrap a child's rendered INNER markup in its host element.
 *
 * Split out of `__aihu_schild` so the escape-hatch path in `@aihu/server` can
 * reuse it. Under `AIHU_SSR_STRING=0` the walker renders a child's inner tree
 * ITSELF rather than calling the child's compiled `__ssrString`, but the shell
 * around that tree — the `data-a` stamp, the adoption marker, the declarative
 * shadow root and its inlined `<style>` — must be produced by the same code in
 * both cases or the hatch would change the markup instead of only the engine.
 *
 * Pure, and deliberately so: `@aihu/server` inlines this module into its own
 * `dist`, so this function exists twice at runtime. A pure function duplicated
 * is two copies of one behaviour; anything holding state would be two states
 * (see `ssr-lifecycle.ts`).
 *
 * @internal
 */
export const _ssrChildWrap = (
  tag: string,
  attrsHtml: string,
  mod: SsrChildModule,
  inner: string,
  hydratable: boolean,
): string => {
  // `data-aihu-ssr` is the adoption marker AND arbor's hydration path boundary
  // (each wrapped render restarts `data-aihu-path` at ROOT_PATH). Hydratable
  // renders only — like the path markers it is a property of the DESTINATION,
  // so terminal output carries no adoption bytes.
  const adopt = hydratable ? ' data-aihu-ssr=""' : ''

  if (mod.__aihu_shadow__ === 'light') {
    const scope = mod.__aihu_light_scope__
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
  // Type-guarded, not just truthy: a malformed module whose `__aihu_css__` is
  // not a string would throw `css.replace is not a function` — and, in
  // `__aihu_schild`, outside the try/catch that guards the child's own render,
  // taking the whole page down. Every other failure on this path degrades to
  // the bare element; this one escaped that contract.
  const css = typeof mod.__aihu_css__ === 'string' ? mod.__aihu_css__ : ''
  const style = css ? `<style>${escapeStyleText(css)}</style>` : ''
  return `<${tag}${attrsHtml}${adopt}><template shadowrootmode="${SHADOW_ROOT_MODE}">${style}${inner}</template></${tag}>`
}
