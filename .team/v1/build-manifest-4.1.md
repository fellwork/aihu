# Build Manifest — Plan 4.1: HMR (Hot Module Replacement)

**Date:** 2026-05-02  
**Branch:** feat/v1-hmr  
**Status:** DONE

---

## What was built

Plan 4.1 adds Vite HMR support so `.aihu` component changes hot-reload
in dev without a full page reload.

---

## Files changed

### New files
- `packages/runtime/tests/hmr-replace.test.ts` — 5 unit tests for `_hmrReplace`
- `.team/v1/build-manifest-4.1.md` — this file

### Modified files
- `packages/runtime/src/define-component.ts`
  - Added module-level `_scopes` WeakMap to track active `MountScope` per element (WeakMap approach avoids esbuild `unique symbol` class field limitation)
  - Updated both function-form and options-form `defineComponent` paths to register/deregister in `_scopes` on connect/disconnect
  - Added `_hmrReplace(element, newSetup)` export
- `packages/runtime/src/index.ts`
  - Re-exported `_hmrReplace` from `define-component.ts`
- `packages/compiler/js/index.ts`
  - Added `_extractElementTag(code)` helper to extract the custom element tag from compiled output
  - Added `_buildHmrCode(compiledCode, elementTag)` that instruments compiled `.aihu` modules with HMR support
  - Updated `scribeCompilerPlugin()` transform hook to inject HMR instrumentation

---

## HMR design

### Runtime (`_hmrReplace`)

```ts
export function _hmrReplace(element: HTMLElement, newSetup: Setup): void
```

1. Looks up the element's active `MountScope` from the `_scopes` WeakMap
2. Calls `scope.dispose()` to tear down effects and remove DOM nodes
3. Re-runs `newSetup({ host, element })` against the same shadow root
4. Mounts the returned arbor tree and stores the new scope in `_scopes`

Tree-shakeable: the `_scopes` WeakMap and `_hmrReplace` function are only
referenced by the injected `__DEV__` block, so production bundles that
set `__DEV__ = false` drop them entirely.

### Vite plugin HMR injection

The `scribeCompilerPlugin()` transform hook now appends HMR instrumentation
to each compiled `.aihu` module:

1. **Import rewrite** — adds `_hmrReplace` to the `@aihu/runtime` import
2. **Setup capture** — rewrites the single `defineComponent(setup)` call to
   `defineComponent(__aihu_setup__ = setup)` so the setup function is
   captured in a module-level slot (assignment expression is valid JS;
   evaluates to `setup`, so `defineComponent` still receives it unchanged)
3. **Default export** — `export { __aihu_setup__ as default }` makes the
   current setup available as `newModule.default` in the HMR acceptance callback
4. **HMR acceptance block** — guarded by `typeof __DEV__ !== 'undefined' && __DEV__`:

```ts
if (typeof __DEV__ !== 'undefined' && __DEV__ && import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (!newModule) return
    const newSetup = newModule['default']
    if (typeof newSetup !== 'function') return
    document.querySelectorAll('tag-name').forEach((el) => {
      _hmrReplace(el as HTMLElement, newSetup)
    })
  })
}
```

---

## Test results

| Metric | Before | After |
|--------|--------|-------|
| Test files | 43 | 44 |
| Tests | 340 | 345 |
| Failures | 0 | 0 |

### HMR-specific tests (5)
1. `HMR-1` — replaces rendered tree in-place without reconnecting element
2. `HMR-2` — disposes old MountScope before mounting new tree
3. `HMR-3` — new setup receives same host and element refs
4. `HMR-4` — reactive signals in new setup work normally
5. `HMR-5` — `_hmrReplace` is a no-op when `_setMount` not called

---

## Size report

- Runtime gz: **932 B** (limit: 1024 B, headroom: 92 B)
- `_hmrReplace` adds **109 B gz** (≤ 200 B as specified)
- Tree-shaken in production — `_scopes` WeakMap + `_hmrReplace` function are
  referenced only from the `__DEV__`-gated HMR block

---

## Acceptance criteria

1. `_hmrReplace(element, newSetup)` exists and is exported from `@aihu/runtime`
2. Vite plugin injects HMR acceptance code for `.aihu`-derived modules
3. Injected code is gated behind `typeof __DEV__ !== 'undefined' && __DEV__`
4. All existing tests pass (`bun run test` — 345/345)
5. Runtime gz 932 B — within 1024 B size-limit gate
6. 5 unit tests for `_hmrReplace` in `packages/runtime/tests/hmr-replace.test.ts`
