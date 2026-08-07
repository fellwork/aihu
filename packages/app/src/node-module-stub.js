// AUTO-BUNDLED into the Worker bundle by @aihu/app's `aihu-node-module-stub`
// plugin (see vite-plugin.ts, "D-1"). Plain `.js`, and a FILE rather than a
// string returned from a `load` hook, on purpose — see below.
//
// ## What this replaces
//
// `@aihu/server`'s `renderToString` reaches a lazy `await import('./native.js')`,
// and the built `native.js` statically imports the Node `module` builtin for
// its `createRequire`. Rolldown chases the dynamic import and emits the chunk
// even though it is UNREACHABLE at runtime under `output: 'ssr'` (the loader
// short-circuits to the TS walker whenever `children` is passed, which the SSR
// entry always passes). Unreachable but still uploaded — and workerd rejects
// the specifier at deploy time without `nodejs_compat`. The plugin resolves the
// builtin to this file so the Worker bundle carries these few bytes instead.
//
// ## Why a separate build artifact
//
// The export name below is load-bearing: the built `native.js` imports exactly
// that binding from the builtin, so the stub cannot rename it. Keeping the stub
// as source text inside a `load` hook would put that identifier into
// `@aihu/app`'s OWN bundle (`dist/index.js`) as inert string data, where
// `scripts/check-runtime-purity.ts`'s token scan cannot tell it from a real
// symbol — and the honest fix for that is not an exception for `dist/index.js`
// (which would blind the guard to a genuine future leak in the whole Vite
// plugin) but a declared boundary artifact, the same shape as
// `packages/server/dist/native.js`. This file IS that artifact: it is listed in
// the checker under the `builtin-stub` tier, which forbids every quoted `node:`
// specifier (it ships into a Worker) while permitting the one identifier it
// exists to declare.
//
// ## Why it throws
//
// If the unreachable path ever became reachable, a silently-broken no-op
// `require` would surface as a mystery render failure. This names itself.
//
// NOTE: this file must never contain the literal specifier the plugin
// intercepts — not in code, not in a comment. `workers-ssr-e2e.test.ts`
// assertion 4 greps the emitted SSR bundle for that text, and a stub that
// reintroduced it as a comment would make the gate fail on its own fix.

export function createRequire() {
  throw new Error('[@aihu/app] the node builtin is unavailable in the SSR (Worker) bundle')
}

export default { createRequire }
