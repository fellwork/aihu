# r1 investigation: Bug 4 -- @aihu/server require-shim breaks Rolldown re-bundle

Cites report cb666cc2-599e-4979-9e59-2aeac73a7cc8, director-note 06cb46b1-c160-401d-84e0-510e92f81ab6. Investigation only -- Iron Law observed, no tracked files modified. Re-bundle repro built in a temp dir against the gitignored packages/server/dist.

## TL;DR / Recommendation
Root cause is **config-only**: `packages/server/rolldown.config.ts` does NOT set `platform`, so Rolldown emits the fragile `typeof require` Proxy interop shim instead of a real `createRequire(import.meta.url)`. **Recommended fix = the (ii) intent, realized as config-only: add `platform: 'node'` to the server's rolldown.config.ts.** Verified by repro: a `platform:'node'` build survives a downstream re-bundle (even by a non-node Vite config loader) with a working `createRequire(import.meta.url)`; the current default-platform build does not. One-line config diff, source unchanged, **does NOT change the published export surface** (still single `.` entry, ESM dist/index.js). Needs a changeset / patch version bump because published bytes change. Fix (i) (separate `@aihu/server/native` subpath) is heavier, changes the export map, and is NOT necessary.

## 1. Native-load site in source (the napi facade)
`packages/server/src/loader.ts:159-187` -- `resolveState()`. The actual native require is:
- loader.ts:173-175: `const dynRequire = typeof require === 'function' ? require : (0, eval)('require')`
- loader.ts:176: `const mod = dynRequire('node:module')`
- loader.ts:181-182: `const requireFn = mod.createRequire(base); addon = requireFn(descriptor.packageName)` where `base = ${process.cwd()}/index.js` (loader.ts:180).

This runs as a **top-level module side-effect** via the eager block loader.ts:277-288 (`const _initial = resolveState(); if (...native-failed-loud) throw ...`). So merely importing @aihu/server (even for unrelated exports) triggers the native load. The barrel src/index.ts:18 re-exports renderToString from ./loader.ts; the eager side-effect block plus loader.ts being pulled through the barrel means it is NOT tree-shaken out even when a consumer only wants json/notFound.

The author already TRIED to be rolldown-safe (comments loader.ts:170-171 "reachable in ESM via createRequire(import.meta.url)... We use the eval trick to keep rolldown from rewriting the call"). The eval trick is the `(0, eval)('require')` fallback. **It does not help** -- see section 2.

## 2. Build-config cause -- WHY the shim, WHY a re-bundle strips the guard
`packages/server/rolldown.config.ts`: format:'esm', minify:true, external includes 'node:module' plus the 4 native pkgs, and crucially **no `platform` key** (verified: `platform` appears in NO rolldown.config across the repo). Rolldown rc/1.0.2's default (non-node) platform handling of an external require injects its interop runtime helper at the top of dist/index.js:

    var e=(e=>typeof require<`u`?require:typeof Proxy<`u`?new Proxy(...):e)(function(e){if(typeof require<`u`)return require.apply(this,arguments);throw Error('Calling require ... doesnt expose the require function. See rolldown.rs/in-depth/bundling-cjs#require-external-modules');});

Rolldown REWRITES the source bare-identifier `require` (loader.ts:175 `typeof require === 'function' ? require`) to point at THIS __require shim variable. So in the published dist/index.js the loader body reads `(typeof e == 'function' ? e : (0,eval)('require'))('node:module')` where e is the shim. The shim is ALWAYS truthy (it is either real require or a Proxy), so the `(0,eval)('require')` fallback the author added is **dead code -- never reached**, defeating the intended escape hatch.

Per rolldown docs (rolldown.rs/in-depth/bundling-cjs#require-external-modules, confirmed by WebFetch): for platform:'node' Rolldown emits a real createRequire-based require; for other platforms it leaves a runtime-require-availability shim. The published server was built on the latter path.

**Why a downstream re-bundle then throws** (reproduced -- see section 3): when Vite 8's config loader (Rolldown internal) re-bundles the transitive @aihu/server import, it re-processes that interop shim. Without platform:'node', the re-emitted __require resolves the `typeof require !== "undefined"` guard to FALSE in the ESM config-loader scope (no CJS require in that scope) so __require becomes the new Proxy(...) no-op; then __require('node:module') returns a Proxy whose .createRequire is junk so createRequire(base)(pkg) throws, caught at loader.ts:183-187, and the eager block loader.ts:279-286 throws AIHU_NATIVE_LOAD_FAILED at config-load. The guard is not literally "stripped" -- it **evaluates false after re-bundling into an ESM scope that has no require**, and the source eval-fallback cannot save it because Rolldown rewired the source require to the always-truthy shim.

## 3. REPRO (temp dir, against gitignored dist) -- DECISIVE
Re-bundled packages/server/dist/index.js via the rolldown JS API (v1.0.2) under 4 platform settings, then re-bundled the candidate outputs a 2nd time (simulating Vite's config loader). Markers: typeof-require-guard, createRequire(import.meta.url)-survives.
- 1st-pass build of the dist:
  - default / browser / neutral platform: typeof require Proxy guard present (the bug shim).
  - **platform:'node': emits `import { createRequire } from "node:module"; var __require = createRequire(import.meta.url);`** -- guard GONE, real require.
- 2nd-pass re-bundle (the downstream Vite case):
  - **node-built then default-downstream: guard=false, createRequire(import.meta.url) SURVIVES = true** (FIX WORKS)
  - node-built then node-downstream: survives = true
  - default-built then default-downstream: guard=true, createRequire survives=false (**reproduces the live bug**)

Confirmed the published @aihu/server@0.1.2 dist head = the Proxy-guard shim (NOT import{createRequire}from"node:module"), i.e. it was shipped WITHOUT platform:'node'.

## 4. Two-fix assessment
### (ii) createRequire(import.meta.url) -- RECOMMENDED, and it is CONFIG-ONLY
The cleanest realization is NOT a source rewrite -- it is `platform: 'node'` in packages/server/rolldown.config.ts. With it, Rolldown itself emits `import { createRequire } from "node:module"; var __require = createRequire(import.meta.url)` and rewires the source require to that. Repro proves this survives a downstream non-node Rolldown re-bundle (the import is a real static ESM external import that re-bundlers preserve, not a runtime-guarded shim).
- Source change: NONE strictly required. The existing loader.ts:173-176 ternary keeps working (it resolves to the now-real __require). OPTIONAL cleanup: the eval-trick plus comment (loader.ts:170-175) become unnecessary and could be simplified to a direct `import { createRequire } from 'node:module'`, but that is not needed to fix the bug and would enlarge the diff.
- Config change: add `platform: 'node'` (1 line). external: ['node:module', ...] already correct -- keep it so the createRequire import stays external.
- Export surface: UNCHANGED (single . ESM entry). Diff size: ~1 line config. Needs a changeset (patch bump, e.g. 0.1.3) because dist bytes change.
- Rolldown-safe per the referenced docs: YES (exactly the platform:'node' createRequire path the docs describe).
- Risk: LOW. platform:'node' also flips other rolldown defaults, but server's only externals are node:module plus workspace/native pkgs, all already external -- low blast radius. Verify `bun run build` for server plus server tests still green, and that a direct `import "@aihu/server"` still loads native on Node and Bun (the working path).

### (i) Separate @aihu/server/native subpath entry
Add a 2nd rolldown input (e.g. src/loader.ts or a thin src/native.ts) producing dist/native.js, add a "./native" key to package.json exports, and move the eager native side-effect out of the main barrel so importing @aihu/server for json/notFound/router types never triggers the native load.
- Does isolating behind a subpath stop the re-bundle strip? Only PARTIALLY and for the WRONG reason: it helps because consumers that do not import @aihu/server/native no longer drag in the require shim at all (the real current pain -- the barrel's eager side-effect). But if ANYONE re-bundles the /native entry itself under a non-node platform, the SAME guard-strip recurs unless that entry is ALSO built with platform:'node'. So (i) without (ii) does not actually make the require survive re-bundling; it just narrows who pulls it in.
- Consumer import paths WOULD change: renderToString (today exported from the barrel, index.ts:18) would move to @aihu/server/native, breaking the published surface -- minor/major bump plus downstream edits. Heavier diff (config plus package.json exports plus barrel split plus possibly consumer code); CHANGES THE EXPORT SURFACE.
- Risk: MEDIUM (surface change, more moving parts; the 0.1.x history shows publish-surface changes are exactly where this package has bled).

### Hybrid (optional, best long-term, NOT required for the fix)
platform:'node' (fixes the require survival -- mandatory) PLUS optionally split the eager native side-effect into a lazy/subpath load so a pure json/notFound import never evaluates the native loader. The hybrid's subpath part is a nice-to-have for tree-shaking / cold-import cleanliness, but the **smallest-diff bug fix is platform:'node' alone.**

## Recommendation (one)
**Fix (ii) realized config-only: add `platform: 'node'` to packages/server/rolldown.config.ts.** Smallest diff (1 line), source untouched, export surface unchanged, rolldown-safe per the docs, and PROVEN by repro to survive the downstream Vite-8 config-loader re-bundle. Needs a patch changeset (dist bytes change). Key risk: platform:'node' flips rolldown platform defaults -- gate on `bun run build` plus server tests plus a direct `import "@aihu/server"` native-load smoke on Node and Bun.

## Do-NOT-break consumer list
- aihu build path / aihu.config.ts (defineAihuConfig from @aihu/server) -- cli templates packages/cli/src/index.ts:173, commands/app.ts:52, templates/app.ts:31. Report says this path WORKS today; must stay working.
- adapter-cloudflare -- no value import of @aihu/server found in its src (edge / EDGE_SKIPPED path); must keep building. (adapter-vercel similar.)
- plugin-agent-readiness (@aihu/agent-readiness) -- src/vite-plugin.ts:2 does a VALUE import { json, notFound } from '@aihu/server'; this is the exact transitive path that breaks inside vite.config.ts today and must build clean post-fix.
- @aihu/router size row lists @aihu/server in its ignore array (.size-limit.json:46); no server size row exists; the fix adds no size-gate exposure.
- Direct `import "@aihu/server"` on Node and Bun (Windows/Linux/macOS) must still load the native .node (no regression to the working standalone path).
