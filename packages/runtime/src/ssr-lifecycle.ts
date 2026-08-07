/**
 * The server-render lifecycle sink — a LEAF module with zero imports.
 *
 * `onMount`/`onCommit`/`onAdopt`/`onAttributeChange` register against
 * `define-component.ts`'s `_cur` owner pointer, which is set only while
 * `defineComponent` runs a component's setup. A server render calls the
 * compiled `__aihu_setup__` DIRECTLY — there is no element, no
 * `defineComponent`, no `_cur` — so every one of those registrations threw
 * `SCR-R0010 'no owner'`, and any component using `onMount` could not be
 * prerendered at all. Child rendering surfaced it (`<search-box>` came out
 * empty while its `onMount`-free sibling rendered), but the gap predates it:
 * the emitted SSR entry's own comment asserts "lifecycle registration is not
 * reachable from here", and that assumption is what was false.
 *
 * The semantics were never in doubt. `onMount` means "when mounted in the
 * DOM"; a server render never mounts, so registering a mount callback there is
 * a no-op by definition, not an error. What this module supplies is the ability
 * to say so WITHOUT weakening the browser guarantee: outside a server render,
 * `_cur === null` is still a genuine authoring error and still throws.
 *
 * Why a leaf with no imports: `ssr-string.ts` (the `@aihu/runtime/ssr` subpath
 * that `@aihu/server` imports) needs to set this, and `define-component.ts`
 * needs to read it. If the shared state lived in either of those, the other
 * would drag a package's type graph behind it — the cascade that made
 * `shadow-mode.ts` a leaf too. Do not add imports here.
 *
 * Why a COUNTER and not a boolean: child components render nested inside their
 * parent's render, so the windows nest.
 */

/**
 * The counter lives on `globalThis`, deliberately, and this is the one place
 * in the runtime where that is the RIGHT answer rather than a shortcut.
 *
 * `@aihu/server` bundles `ssr-string.ts` into its own `dist` (rolldown's
 * external list is narrow, which is what keeps consumers from installing
 * `@aihu/runtime`), while a compiled component module imports `onMount` from
 * `@aihu/runtime`'s main entry. Those are two separate module instances, so a
 * module-scoped `let` would have the server incrementing one copy while
 * `define-component.ts` reads another that is always zero — which is exactly
 * what happened: the sink was wired correctly and `<toc-rail>` kept throwing.
 *
 * `@aihu/signals` solves the same problem the other way, by staying `external`
 * so there is one instance (see `rolldown.config.ts`: scope adoption rides a
 * module-global `_currentScope`). That is the better fix when the whole module
 * must be shared. Here only a counter must be, and paying an install-time
 * dependency edge for one integer would be the worse trade.
 *
 * `Symbol.for` keys it in the cross-realm registry, so every copy of this
 * module — however many bundlers produce — reads and writes the same cell.
 */
const KEY = Symbol.for('aihu.ssr.lifecycle.depth')

interface DepthHolder {
  [KEY]?: number
}

/** Is a server render currently running setup on this thread? */
export function _inSsrLifecycle(): boolean {
  return ((globalThis as DepthHolder)[KEY] ?? 0) > 0
}

/**
 * Run `fn` inside a server-render lifecycle window.
 *
 * `fn` MUST be synchronous. The flag is module-global, so an await inside the
 * window would let an unrelated render — or unrelated application code — fall
 * under it and have a genuine `onMount` misuse silently swallowed. Every call
 * site is a synchronous setup invocation for exactly that reason.
 */
export function _withSsrLifecycle<R>(fn: () => R): R {
  const g = globalThis as DepthHolder
  g[KEY] = (g[KEY] ?? 0) + 1
  try {
    return fn()
  } finally {
    g[KEY] = (g[KEY] ?? 1) - 1
  }
}
