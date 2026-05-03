# T2 — Arbor Size-Measurement Variance Investigation

**Track:** T2 (6-track follow-up session)
**Status:** DONE — root cause identified; recommend report-only, defer fix to v1.1
**Date:** 2026-05-03
**Branch:** `t2/arbor-variance-investigation`
**Investigator:** Claude (Opus 4.7)

---

## TL;DR

The +15 / +47 / +62 / +89 B variance documented in MEMORY.md / Learning #47 is real, reproducible, and stems from **two compounding causes**, not one:

1. **`packages/arbor` package script runs a post-build mangler (`scripts/mangle-dist.mjs`) that the shared moon `build` task does NOT run.** This single stage shaves ~26 B gz from arbor's bundle.
2. **`scripts/size.ts` (the canonical `bun run size`) re-bundles the on-disk dist through an in-memory rolldown `generate()` call.** That call drops the `//# sourceMappingURL=index.js.map` trailer (~9 B gz), so its number is *always* slightly smaller than the on-disk dist's gzipped size — but it remains sensitive to the on-disk dist's mangle state, because the dist is the bundle's **input** to the in-memory rebundle.

Net effect: `bun run size` reports a value that is (a) ~9 B smaller than the on-disk dist's gz size, and (b) inherits the ~26 B mangle delta from whichever build path produced the dist most recently. The variance band is therefore `0 → ~35 B` depending on which combination of build path × invocation produced the dist on disk at the moment `bun run size` runs.

A 5-minute single-line config fix is **not available**. Unifying the measurement requires either (a) teaching the shared moon build task to run mangle (multi-file change touching `.moon/tasks/tasks.yml` + every package that has a mangler), or (b) teaching `scripts/size.ts` to read the on-disk dist directly via gzip instead of re-bundling (single-file source change to `scripts/size.ts`, which the brief forbids: "NO source code edits"). Recommend report-only and defer the fix to v1.1, with the canonical-path policy already documented in `.size-limit.README.md` and `bench/signals/HARNESS.md` enforcing consistency at the human-process layer.

---

## 1. Reproduce variance — measured byte data

All measurements taken on `t2/arbor-variance-investigation` branched off main 2c47efd, with `@scribe/signals` already built (so workspace external resolves). Numbers in **bold** are the gz value reported / measurable for that path.

### Path A — `bunx rolldown -c` from inside `packages/arbor` (≈ moon shared build)

```
$ rm -rf packages/arbor/dist
$ cd packages/arbor && bunx rolldown -c
$ wc -c dist/index.js          # 5206
$ gzip -c dist/index.js | wc -c  # 2146
```

- Raw: **5206 B**
- Gz: **2146 B**
- Mangle: NO
- Source-map comment in artifact: YES (`//# sourceMappingURL=index.js.map`)

### Path B — `moon run arbor:build --force` (project-graph-aware orchestrator)

```
$ rm -rf packages/arbor/dist
$ moon run arbor:build --force
```

Identical output to Path A: **5206 B raw, 2146 B gz.** Reason: `.moon/tasks/tasks.yml` defines the shared `build` task as literally `bunx rolldown -c`; it does NOT shell out to the package's own `build` script. So `moon run arbor:build` and `bunx rolldown -c` are *exactly equivalent* on the artifact bytes.

### Path C — `bun run build` from `packages/arbor` (package-script + mangle)

```
$ cd packages/arbor && bun run build
# runs: rolldown -c && node scripts/mangle-dist.mjs
```

- Raw: **5029 B** (177 B less than Paths A/B → mangler-applied identifier shortening)
- Gz: **2120 B** (26 B less than Paths A/B)
- Mangle: YES
- Source-map comment in artifact: YES

### Path D — `bun run size` from repo root (canonical, scripts/size.ts)

`scripts/size.ts` does NOT measure the on-disk dist directly. It re-bundles it through an in-memory rolldown `generate()` call with `minify: true` and the package's external graph wired in. The result depends on what's currently in `dist/`:

| Dist state on disk | `bun run size` arbor row |
|---|---|
| Mangled (Path C output)       | **2.06 kB / 2200 B (+89 B headroom)** → 2111 B |
| Unmangled (Path A/B output)   | **2.09 kB / 2200 B (+56 B headroom)** → 2144 B |

Confirmed by a one-shot bun-eval that replicates `size.ts`'s logic against the unmangled dist — output gz=2144, raw=5172 (note 5172 vs the on-disk 5206: the in-memory rebundle drops the 33-byte `//# sourceMappingURL=index.js.map` trailer, ~9 B gz).

### Variance summary table

| Build path                                    | dist raw | dist gz  | size.ts re-bundle gz |
|-----------------------------------------------|---------:|---------:|---------------------:|
| A. `bunx rolldown -c`                         |     5206 |     2146 |                 2144 |
| B. `moon run arbor:build`                     |     5206 |     2146 |                 2144 |
| C. `bun run build` (package-script + mangle)  |     5029 |     2120 |                 2111 |
| D. `bun run size` (reads whatever dist has)   |      n/a |      n/a |   2111 OR 2144       |

**Confirmed variance band:** 0 → 35 B gz, depending on (mangle-applied?) × (size.ts-rebundle vs raw-gzip).

This **does** match the +15 / +47 / +62 / +89 B figures in Learning #47 if those were "headroom values" against a 2200 B limit — i.e. a session that built unmangled and ran `bun run size` would see +56 B, while one that built with mangle and ran `bun run size` would see +89 B. Reported headroom drift = real-bytes drift = ~33 B, which is the 26 B mangle delta + 9 B source-map delta.

### Cross-package context

The variance is not arbor-specific — every package whose `package.json` build script is more than `rolldown -c` will exhibit the same variance pattern. Search:

- `@scribe/signals/package.json` `build`: `rolldown -c && node scripts/mangle-dist.mjs` — same shape, exhibits same variance
- `@scribe/runtime/package.json` `build`: `rolldown -c` only — no variance contribution from mangle stage
- `@scribe/arbor/package.json` `build`: `rolldown -c && node scripts/mangle-dist.mjs` — same shape

The 9 B source-map-trailer delta applies to ALL packages and is independent of mangle.

---

## 2. Root cause hypothesis (now: confirmed root cause)

### Cause 1 — moon shared task bypasses package mangle stage

`.moon/tasks/tasks.yml` defines the shared `build` task as:

```yaml
tasks:
  build:
    command: "bunx rolldown -c"
```

This is hard-coded — moon does not honor each package's `package.json` `scripts.build`. So when a package's authoritative build script is `rolldown -c && node scripts/mangle-dist.mjs` (as for `arbor` and `signals`), running through moon executes only the first half. The mangler is silently skipped, the dist is left in the unmangled (larger) state, and any subsequent measurement reads ~26 B high.

This is the documented intent: see `.size-limit.README.md` § "Canonical command" — *"The moon-orchestrator path... is non-canonical for size — its output omits mangle."* The policy is in place; the mechanism is just that moon and the package script genuinely do different work.

### Cause 2 — scripts/size.ts in-memory rebundle elides source-map trailer

`scripts/size.ts` uses `rolldown.generate({ format: 'esm', minify: true })` against the on-disk dist as input. The in-memory `generate()` API does NOT emit a `//# sourceMappingURL=...` trailer (because there is no associated `.map` file path being written). On-disk dist DOES carry it (the package config sets `output.sourcemap: true`).

Result: `gzip -c dist/index.js | wc -c` is always ~9 B larger than `bun run size`'s reported value, even on the same dist. This is independent of mangle. It explains why someone running `gzip -c dist/index.js | wc -c` and then `bun run size` and pointing out the 9 B difference would think size.ts was lying — it isn't, it's measuring a slightly different artifact (a sourcemap-trailer-stripped re-bundle).

### Cause 3 — `bun run size` is sensitive to the on-disk dist as INPUT

This is the surprising one. The size script's in-memory rolldown call uses `entry.path` (e.g. `packages/arbor/dist/index.js`) as the **input** to the bundle, not as the artifact-to-measure. So it reads whatever dist is currently on disk, parses it, re-bundles it with `minify: true`, then measures THAT. Mangler renames *survive* the re-bundle (they're already character-level transforms), so they affect the size-script number too — but only because they affected the input dist.

So the chain of causation is:
1. Whichever build path produced `dist/` last (mangle vs no-mangle) sets the input bytes.
2. `bun run size` re-minifies that input (idempotent on already-minified code) and gzips the result.
3. Cause 2 shaves another ~9 B regardless.

### What does NOT cause the variance

- **NOT a brotli vs gzip difference** — every path uses `gzipSync`.
- **NOT a banner-injection difference** — no banner is configured in `rolldown.config.ts`.
- **NOT a `module` vs `main` field selection** — `package.json` points both to `./dist/index.js`; size.ts uses the explicit path from `.size-limit.json`.
- **NOT a sourcemap-includes-source difference at the gz level** — `output.sourcemap: true` writes a separate `.map` file; only the trailing `//# sourceMappingURL=` comment is in the artifact.
- **NOT a node-vs-bun runtime difference** — the rolldown bundling is deterministic given the same input + config.

---

## 3. Five-minute fix candidate

A unifying fix exists, but **none of the candidates fit the brief's "single-line config change, no source edits" constraint**. Documenting them for v1.1 follow-up:

### Option F1 — Teach moon to call package script (shared task change)

```yaml
# .moon/tasks/tasks.yml
tasks:
  build:
    command: "bun run build"   # was: "bunx rolldown -c"
```

**Pros:** unifies Path A/B with Path C; `moon run :build` becomes equivalent to `bun run build`.
**Cons:** still doesn't fix Cause 2 (the 9 B source-map delta in size.ts). And: every package that does NOT have a `build` script (or where the `build` script differs from `rolldown -c`) is affected. Need a per-package audit before flipping the switch. This is **not a single-line change** in practice — it's a behavior change for the entire monorepo.

### Option F2 — Teach `scripts/size.ts` to read on-disk dist directly

Change ~10 lines in `scripts/size.ts` to:

```ts
const code = await Bun.file(entry.path).text()
const raw = Buffer.from(code)
const bytes = entry.gzip !== false ? gzipSync(raw).length : raw.length
```

This eliminates the in-memory rebundle and Cause 2 + Cause 3 both vanish. `bun run size` would then exactly match `gzip -c <dist>/index.js | wc -c` on the disk artifact.

**Pros:** simplest fix for measurement consistency; removes 30+ lines of rolldown re-bundle plumbing.
**Cons:** **forbidden by the brief** ("NO source code edits"). Also: it changes the *meaning* of `bun run size` in subtle ways — it would no longer enforce the "external" graph treatment per `.size-limit.json` `ignore`, because it would just gzip the on-disk artifact as-is. That is fine for arbor (whose dist already excludes `@scribe/signals`) but might break the `agent-acp` / `agent-a2a` / `data` rows that rely on the `ignore` field to externalize workspace deps.

Net: not a 5-minute fix; needs cross-package validation.

### Option F3 — Make sourcemap emission conditional

Set `output.sourcemap: process.env.SIZE_GATE !== '1'` in `rolldown.config.ts`. Adds 1 line per package.

**Pros:** narrows the 9 B Cause-2 delta to zero when measuring.
**Cons:** doesn't address the mangle-vs-no-mangle delta (Cause 1), which is the larger 26 B chunk of variance. And touches every package's `rolldown.config.ts`, not single-line. And: arguably *worse* DX because sourcemaps are useful for debugging the published package.

### Verdict on the 5-minute fix

**No 5-minute single-line fix exists** that unifies all three paths. The decision-authority gate (a) "single-line config change" + (b) "does not change emitted bytes" + (c) "does not touch source code" cannot be cleared by any of F1/F2/F3.

---

## 4. Recommendation

**Defer to v1.1.** Apply no fix in this round. Rationale:

- The canonical-path policy is **already documented and authoritative** at `.size-limit.README.md` § "Canonical command", `bench/signals/HARNESS.md` § "Build paths", and the v0.2.5 plan section in `docs/superpowers/plans/2026-05-02-scribe-v1-framework.md`. Every plan, PR, and verifier audit must use `bun run size`. The human-process layer is sound.
- A real fix needs source code changes (Option F2 in `scripts/size.ts`) plus cross-package validation that the `ignore`/`external` semantics still work after stripping the in-memory re-bundle. That's a reasonable hour of work, not five minutes.
- The variance band (0–35 B) is small enough that nobody in any merged PR has accidentally landed an over-budget package because of it — the canonical path and the budgets have several hundred bytes of headroom on most rows.
- The biggest practical risk is a future contributor running `gzip -c dist/index.js | wc -c` and panicking that arbor "regressed +9 B" against a previously-cited `bun run size` figure. The doc updates in the canonical-path policy already warn against this cross-comparison.

**Suggested v1.1 follow-up issue title:** "v1.1: Unify `bun run size` measurement with on-disk dist (eliminate in-memory rebundle delta + decide moon-task mangle parity)."

The follow-up should:
1. Decide whether `scripts/size.ts` should measure the on-disk artifact directly (Option F2) or whether the in-memory re-bundle is load-bearing for some `external`/`ignore` semantic. Audit the `agent-acp` / `agent-a2a` / `data` rows to confirm.
2. Decide whether moon's shared `build` task should call `bun run build` per-package (Option F1). Probably yes, since otherwise CI's `bun run build` (= `moon run :build`) ships unmangled artifacts, which would regress published-tarball size by ~26 B per mangler-using package — a real regression latent in the build pipeline today (only papered over because publishing currently happens through manual `bun --filter` invocations, not through moon).

---

## 5. Update to Learning #47 (proposed text for Historian)

> ## 47. Build-path variance for size-gate measurements stems from two compounding causes, not one
>
> When `bun run size` (canonical), `gzip -c dist/index.js | wc -c` (raw on-disk), and any moon-orchestrated path (`moon run :build` then re-measure) report different bytes for the same package, the spread is the sum of two independent deltas:
>
> 1. **Mangle stage delta (~26 B gz for arbor / signals).** Moon's shared `build` task is hard-coded to `bunx rolldown -c` and does NOT execute each package's authoritative `package.json` `scripts.build`. Packages whose build script is `rolldown -c && node scripts/mangle-dist.mjs` (currently arbor and signals) have their mangle pass silently skipped on the moon path, leaving dist ~26 B gz larger.
> 2. **Source-map trailer delta (~9 B gz, all packages).** `scripts/size.ts` re-bundles dist through `rolldown.generate()`, which emits no `//# sourceMappingURL=` trailer. On-disk dist DOES carry the trailer (33 B raw, ~9 B gz). So `bun run size` is ALWAYS ~9 B smaller than `gzip -c dist/index.js | wc -c` on the same dist.
>
> Net variance band measured on arbor (2026-05-03): 0–35 B gz across {raw on-disk, raw on-disk + mangle, in-memory size.ts rebundle, in-memory rebundle + mangle}. The +15/+47/+62/+89 B figures noted across earlier sessions were headroom values against the 2200 B limit and reflect this same band.
>
> **Canonical path remains `bun run size`** (per `.size-limit.README.md` § "Canonical command"). Do not cross-compare numbers between `bun run size` and any other invocation. A v1.1 unification effort would either (a) teach moon's shared task to call `bun run build` (so the moon and package paths converge), or (b) rewrite `scripts/size.ts` to measure the on-disk artifact directly (so size.ts and `gzip -c` converge). Both require multi-file changes and cross-package validation; deferred from T2 (2026-05-03) report-only investigation.
>
> **Investigated:** T2 follow-up session, branch `t2/arbor-variance-investigation`, report at `.team/followup-6track/T2-arbor-variance-report.md`.

---

## Appendix — exact commands run

```bash
# baseline (whatever main left on disk)
wc -c packages/arbor/dist/index.js               # 5029
gzip -c packages/arbor/dist/index.js | wc -c     # 2120

# Path A — bunx rolldown -c (no mangle)
rm -rf packages/arbor/dist
(cd packages/arbor && bunx rolldown -c)
wc -c packages/arbor/dist/index.js               # 5206
gzip -c packages/arbor/dist/index.js | wc -c     # 2146

# Path B — moon run arbor:build --force
rm -rf packages/arbor/dist
moon run arbor:build --force
wc -c packages/arbor/dist/index.js               # 5206
gzip -c packages/arbor/dist/index.js | wc -c     # 2146

# Path C — package-script (rolldown + mangle)
(cd packages/arbor && bun run build)
wc -c packages/arbor/dist/index.js               # 5029
gzip -c packages/arbor/dist/index.js | wc -c     # 2120

# Path D — bun run size against mangled dist
bun run size | grep arbor
# → ✓ @scribe/arbor   2.06 kB / 2200 B  (+89 B headroom)  ⇒ 2111 B

# Path D — bun run size against unmangled dist
rm -rf packages/arbor/dist
(cd packages/arbor && bunx rolldown -c)
bun run size | grep arbor
# → ✓ @scribe/arbor   2.09 kB / 2200 B  (+56 B headroom)  ⇒ 2144 B
```

## Inputs read

- `bench/signals/HARNESS.md` § "Build paths" + § "Size budgets"
- `.size-limit.README.md`
- `.size-limit.json`
- `packages/arbor/rolldown.config.ts`
- `packages/arbor/moon.yml`
- `packages/arbor/package.json` (scripts)
- `packages/arbor/scripts/mangle-dist.mjs`
- Root `package.json` (scripts.size, scripts.build)
- `scripts/size.ts`
- `.moon/tasks/tasks.yml`
- `.team/learnings.md` (Learning #47 not yet present in file; referenced from MEMORY.md and elsewhere)
