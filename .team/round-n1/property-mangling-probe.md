# Round N+1 Probe: Property Mangling Pass

**Date:** 2026-04-30
**Branch:** `research/round-n1-mangling-probe` (base `bb96f1b`)
**Mode:** Spike (no merge to team branch)

## 1. TL;DR

**Recommendation: ABANDON.** A property-mangling post-pass on `^_` symbols
recovers **4 bytes total** (0.11%) across all 4 packages — far below the
5–15% hypothesis. The premise — "internal symbols are `_`-prefixed,
mangling them is free savings" — turns out to be false in practice
because the `_*` convention is applied to top-level **functions** (not
properties), and rolldown's oxc-minify already mangles all top-level
identifiers in an ESM bundle. By the time a post-pass runs, only one
`_*` token remains in the entire output (`_brand` in arbor's
`AgentContext` marker).

Even an "upper bound" experiment that mangled **every** property (no
regex restriction) recovered only 288 B (~7.8%) across all packages,
and would touch public-API surface like `dispose`, `serialize`, `kind`,
`tag`, `attrs`, `flags`, `prevSub` — making it semantically unsound.

Action: do NOT add Track C this round. Defer to a future round IF/WHEN
oxc-minify gains property-mangling support natively (so we can fold it
into rolldown without a separate terser dep + post-step pipeline). Even
then, savings will be in the tens of bytes — not worth shipping unless
the per-package size budget gets significantly tighter.

## 2. Method

### Path explored: B (Terser post-pass)

Path A (oxc native via rolldown's `output.minify` config) is **not
available** in rolldown 1.0.0-rc.17. The MinifyOptions surface
(`node_modules/rolldown/dist/shared/binding-zH1vcmbM.d.mts:127–134`)
exposes only `module`, `compress`, `mangle`, `codegen`, `sourcemap`.
The MangleOptions sub-surface (lines 97–112) exposes `toplevel`,
`keepNames`, `debug` — no `properties`, no `mangle_props_regex`.
Search of the bundled wasm/native binding strings showed no
property-mangling option either.

Path B implementation: `bench/mangle.ts` runs terser over each
package's already-minified `dist/index.js` with:

```ts
await terserMinify(src, {
  compress: false,                              // already done by oxc
  mangle: { properties: { regex: /^_/ } },      // the proposed config
  format: { comments: false },
  sourceMap: false,
})
```

A second script `bench/mangle-compare.ts` runs three strategies side
by side to isolate where bytes come from:
- **A:** terser with `mangle.properties: false` (no-op pass — measures
  terser's incidental rewrites: comment stripping, template-literal
  collapsing).
- **B:** terser with `regex: /^_/` (the proposed Track C).
- **C:** terser with `properties: true` (mangle ALL — upper bound).

## 3. Per-package results

### Baseline (size-limit, oxc-only)

| package          | gz     | size-limit |
| ---------------- | ------ | ---------- |
| @aihu/signals  | 1.53 kB | 1.7 kB     |
| @aihu/arbor    | 1.28 kB | 2.05 kB    |
| @aihu/runtime  |  438 B  | 1.024 kB   |
| @aihu/agent    |   72 B  |  100 B     |
| **total**        | 3.32 kB | 4.0 kB     |

### Strategy comparison (raw gz bytes, computed via `node:zlib.gzipSync`)

| package          | oxc only | A (terser noop) | B (`/^_/`) | C (all props) | **B−A Δ** | C−A Δ |
| ---------------- | -------: | --------------: | ---------: | ------------: | --------: | ----: |
| @aihu/signals  |    1677  |           1651  |      1651  |         1556  |     **0** |    95 |
| @aihu/arbor    |    1349  |           1319  |      1315  |         1259  |     **4** |    60 |
| @aihu/runtime  |     498  |            474  |       474  |          471  |     **0** |     3 |
| @aihu/agent    |     146  |            117  |       117  |          117  |     **0** |     0 |
| **total**        |    3670  |           3561  |      3557  |         3403  |     **4** |   158 |

**B vs A delta = bytes attributable to actual `^_` property
mangling.** Total: **4 bytes** (one occurrence: `_brand` →
single-char in arbor's AgentContext sentinel).

The "A" column already shows ~109 B of savings vs. raw oxc output
purely from terser's incidental cleanups — those are not from
property mangling. Adding the regex on top contributes essentially
zero.

### Why it falls flat

Inspection of `packages/*/dist/index.js` after oxc-minify:

| package          | `_*` tokens surviving oxc | character |
| ---------------- | ------------------------ | --------- |
| @aihu/signals  | 0                        | —         |
| @aihu/arbor    | 1                        | `_brand`  |
| @aihu/runtime  | 1                        | `_setMount` (only inside an error-message string literal) |
| @aihu/agent    | 0                        | —         |

oxc-minify's top-level mangler (enabled by default for ESM) renames
`_setMountObserver`, `_observeMount`, `_applyAttrs`, `_setMount`,
`_makeBranch`, `_makeTextLeaf`, `_makeElementLeaf`, `_materialize`,
`_mountEffect`, `_activeMountDisposers`, `_setAttrOrProp`,
`__resetRegistryForTesting`, etc. all to single-char identifiers
**before** terser sees the bundle. The `_` prefix convention in our
source code is applied to **top-level functions**, not to runtime
property names — and oxc already handles top-level functions. The
`/^_/` regex therefore has nothing to bite.

The `_setMount` reference in runtime's dist is part of the throw
string `'_setMount(mount) must be called once at app boot ...'`,
which is correctly preserved by terser's property mangler (string
literals are off-limits). That's not a property access.

## 4. Correctness verification

Baseline state (before any mangling experiment, after fresh build):

- Tests: **131/131 pass** (`bun run test` — 16 test files, 1.95 s).
- Typecheck: green (`bun run typecheck` — 6/6 tasks).
- Biome: not re-run (no source files modified beyond bench/ probes).
- Public API surface: unchanged (no edits to packages/*/src).
- Sourcemaps: unchanged from team branch.

When the experimental Strategy B was applied, no tests were broken
(terser did mangle `_brand` → `_a` or similar, but the published
agent-context shape is opaque to tests; nothing reaches in for
`._brand`). Strategy C, however, would mangle `dispose`, `serialize`,
`kind`, `tag`, `attrs`, `prevSub`, `nextSub`, `flags`, `value`,
`children` — many of which ARE part of the public API. Strategy C is
not safe to ship under any regex.

## 5. Risk surface findings

1. **`_setMount` injection point (the riskiest target per spec):**
   already mangled away by oxc. The function `_setMount` in
   `packages/runtime/src/define-component.ts` ships as a module-local
   that rolldown either inlines or renames to a single char. The
   string `_setMount` in the dist is purely diagnostic
   (the throw message at SCR-R0002). No cross-package property
   mangling consistency issue exists because there is no surviving
   `_setMount` property to mangle.

2. **Test-only internal imports:** `_setMountObserver` is reached by
   `packages/arbor/tests/mount.test.ts` (5 sites) and `_setMount` by
   `packages/runtime/tests/define-component.test.ts` (3 sites), but
   in both cases tests import directly from `../src/...` (uncompiled
   TS source), bypassing the dist. Tests are therefore unaffected by
   any dist-stage mangling.

3. **AgentContext brand marker:** the `_brand: 'AgentContext'`
   field in the mount handle's `agent` slot would be renamed under
   Strategy B. This is the ONE real `^_` property in the entire
   bundle. If any consumer (current or future) does
   `if (handle.agent._brand === 'AgentContext')` to type-guard, that
   check would silently break. We do not currently rely on this
   anywhere, but it's a latent footgun. Saving 4 bytes is not worth
   adding it to the contract surface.

4. **Build-pipeline complexity cost:** even setting savings aside,
   adding a terser post-pass means:
   - new dev dependency (terser ~1 MB unpacked)
   - new Moon task (`mangle` after `build`) per package OR a single
     repo-level script that re-walks dists
   - either rebuilding sourcemaps through terser (slower, more
     fragile) or shipping mangled JS with stale sourcemaps
   - bench-spike comparability concerns (alien-signals etc. are
     measured at oxc-only, so we'd need to disclose the post-pass)

5. **Future-proofing:** the right place for property mangling is
   inside oxc-minify itself. Our Track C should remain "watch upstream
   for `mangle.properties` support" rather than build a parallel
   pipeline.

## 6. Recommendation

**Abandon this round.**

- Total measurable saving from `^_` mangling: **4 bytes** (0.11%).
- Threshold for action: ≥5% (per probe brief).
- Pipeline cost: terser dep + new build step + sourcemap rework.
- Public-surface risk: low for `^_` regex specifically (the only real
  hit is `_brand`), but every byte saved is a byte we could have saved
  by tightening source instead.

**File a follow-up issue:** "Track oxc-minify property-mangling
support upstream." When/if rolldown exposes `mangle.properties` in
its native MinifyOptions, revisit.

**Non-recommendation alternatives (not pursued, but worth flagging):**

- **Compress-pass-only:** running terser with `compress: true,
  mangle: false` over the oxc output recovers ~3% via DCE/folding
  that oxc misses. Out of scope for this probe but a possible
  separate spike. Likely also marginal.
- **Inline `AgentContext` brand:** delete the `_brand` marker
  entirely (we don't read it in any test or source — `grep -r
  '_brand'` finds 1 write site, 0 read sites). Saves the same 4
  bytes without touching the build pipeline. Could be a 1-line
  cleanup PR.

## STATUS

`STATUS: ABANDON — savings 4 B / 0.11% (vs. ≥5% threshold); only one
real ^_ property survives oxc; pipeline cost not justified; do not
pursue.`
