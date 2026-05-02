# Investigation — `@scribe/data` Externalization Bug

**Round:** 1 (Investigator, Mode 3, Iron Law)
**Branch:** `investigate/data-externalization`
**Base:** `origin/main` HEAD `f53afff`
**Author:** Investigator
**Date:** 2026-05-01
**Verdict:** **H2 — Rolldown config missing `external`** (single-named, falsifiable, reproducible)

---

## TL;DR

`packages/data/rolldown.config.ts` declares no `external` array. Rolldown does
NOT auto-externalize workspace `dependencies` or `peerDependencies`. Result:
every value-import from `@scribe/signals` (and `@scribe/context`) pulls the
whole transitive graph into `packages/data/dist/index.js`, inlining ~3.4 kB of
upstream source.

The picked hypothesis is the only one that survives falsification: adding
`external: ['@scribe/signals', '@scribe/context']` to data's rolldown config
changes the dist from `var e=class extends Error{}...SignalError...` (raw
inlined signals) to `import {batch, boolLatticeSignal, ..., untrack} from
"@scribe/signals"; import {createContext, inject} from "@scribe/context";`
and drops gzip from 2012 B → 764 B (= 747 B per `bun run size`, +3 B headroom).

The Director brief frames this as a moon-vs-package-script divergence. **It is
not.** Reproduction below shows all three build paths (`bunx moon run
data:build`, `bun run --filter @scribe/data build`, and `cd packages/data &&
bun run build`) produce a byte-identical inlined dist on `f53afff`. The bug is
build-config-local; the path is irrelevant.

The source of truth that's missing: an `external` declaration in
`packages/data/rolldown.config.ts` (line 7, between `checks:` and `output:`)
naming the two workspace deps. Once that's asserted, externalization succeeds
under every build path. The Builder picks the exact mechanism (rolldown
`external` vs. `external` callback vs. anything else that resolves the same
contract).

---

## 1. Symptom reproduction

All measurements taken on `investigate/data-externalization` branched from
`origin/main` `f53afff`. Working tree clean except for transient experiments
that are reverted before each measurement.

### 1a. Moon orchestrator path

```
$ rm -rf packages/data/dist
$ bunx moon run data:build
data:build | <DIR>/index.js  chunk │ size: 4.95 kB
$ ls -la packages/data/dist/index.js
-rw-r--r-- ... 4951 ... packages/data/dist/index.js
$ head -c 200 packages/data/dist/index.js
var e=class extends Error{},t=class extends e{};e.prototype.name=`SignalError`,t.prototype.name=`SignalCircularError`;let n=null;function r(e){let t=n;return n=e,t}let i=0;const a=[],o=[]
$ gzip -c packages/data/dist/index.js | wc -c
2012
$ bun run size 2>&1 | grep data
  ✗ @scribe/data      2.00 kB /   750 B  (1298 B OVER LIMIT)
```

Dist head shows two `class extends Error` definitions named `SignalError` and
`SignalCircularError` — these are private classes from `@scribe/signals/src/`,
plain inlined source (no `import` statement). 1298 B over limit per
`bun run size` (the size script gzips the file as-is; the `ignore` field can't
re-externalize what's already inlined as bare code).

### 1b. Bun-workspace filter path

```
$ rm -rf packages/data/dist
$ bun run --filter @scribe/data build
@scribe/data build: <DIR>/index.js  chunk │ size: 4.95 kB
$ ls -la packages/data/dist/index.js
-rw-r--r-- ... 4951 ... packages/data/dist/index.js
$ head -c 200 packages/data/dist/index.js
var e=class extends Error{},t=class extends e{};e.prototype.name=`SignalError`...
$ gzip -c packages/data/dist/index.js | wc -c
2012
```

**Byte-identical to the moon path.**

### 1c. Direct package-script path

```
$ rm -rf packages/data/dist
$ cd packages/data && bun run build
chunk │ size: 4.95 kB
$ head -c 200 packages/data/dist/index.js
var e=class extends Error{},t=class extends e{};e.prototype.name=`SignalError`...
$ gzip -c packages/data/dist/index.js | wc -c
2012
```

**Byte-identical to the other two paths.**

### 1d. Net

| Build path | Raw bytes | Gzip bytes | `bun run size` | Inlines `@scribe/signals`? |
|---|---|---|---|---|
| `bunx moon run data:build` | 4951 | 2012 | 2.00 kB / 750 B (1298 B OVER) | YES |
| `bun run --filter @scribe/data build` | 4951 | 2012 | 2.00 kB / 750 B (1298 B OVER) | YES |
| `cd packages/data && bun run build` | 4951 | 2012 | 2.00 kB / 750 B (1298 B OVER) | YES |

The bug reproduces on every build path. The Director brief's framing of
"moon-only" is incorrect on `f53afff`. Verifier C's report (
`.team/round-n3/verification-item-2-c.md` §7 ¶2) speculated that Builder C's
branch "coincidentally produced an externalized dist (1523 B raw → 747 B gz)"
under one path. That coincidence is not reproducible against the file state on
`f53afff` (which equals `c0b0406` for `packages/data/rolldown.config.ts` and
`packages/data/package.json` — confirmed via `git diff c0b0406..f53afff --
packages/data/`). I cannot reconstruct the conditions under which C's branch
externalized; I can only assert that against the canonical state on `f53afff`,
externalization fails under all three paths I tested.

### 1e. Dist-content head with the fix applied (preview, full evidence in §5)

```
$ # rolldown.config.ts modified to add: external: ['@scribe/signals', '@scribe/context']
$ rm -rf packages/data/dist && bunx moon run data:build
$ head -c 200 packages/data/dist/index.js
import{batch as e,boolLatticeSignal as t,effect as n,maxLatticeSignal as r,signal as i,untrack as a}from"@scribe/signals";import{createContext as o,inject as s}from"@scribe/context";function c()...
$ gzip -c packages/data/dist/index.js | wc -c
764
$ bun run size 2>&1 | grep data
  ✓ @scribe/data        747 B /   750 B  (+3 B headroom)
```

Externalization restored. 747 B / 750 B matches the floor Verifier C documented
on Builder C's branch.

---

## 2. Hypothesis enumeration

| # | Hypothesis | Falsifying test | Result |
|---|---|---|---|
| H1 | Moon task config issue (`bunx rolldown -c` differs from package script) | Run all three build paths and diff dist bytes | **FALSIFIED.** §1d shows byte-identical inlining across all three paths. Moon is not the variable. |
| H2 | Rolldown config missing `external` for `@scribe/data` | Add `external: ['@scribe/signals', '@scribe/context']` to `packages/data/rolldown.config.ts`; rebuild | **CONFIRMED.** §5 shows dist switches from inlined to `import{...}from"@scribe/signals"`; gzip 2012 → 764 B; size script PASS at 747 B. Reverting re-introduces inlining. |
| H3 | `package.json` peer-dep gap (`@scribe/signals` in `dependencies`, not `peerDependencies`) | Move both deps to `peerDependencies` WITHOUT adding rolldown `external`; rebuild | **FALSIFIED.** Dist still inlines (head: `var e=class extends Error{}...SignalError...`); gzip remains 2012 B. Rolldown does NOT auto-externalize peerDeps from package.json — they must be in the rolldown `external` config. |
| H4 | Bun workspace resolution divergence between paths | Run all three paths; compare bytes | **FALSIFIED.** §1d: byte-identical across paths. No path-dependent resolution divergence. |
| H5 | Sister-package config diff suggests something else | Check whether other packages that import `@scribe/signals` correctly externalize | **PARTIALLY INFORMATIVE; SUPPORTS H2.** §3 walk: `@scribe/runtime` declares `external: ['@scribe/arbor', '@scribe/signals']` and externalizes (no value-imports of those packages anyway, so external is defense-in-depth). `@scribe/arbor` declares NO `external` and INLINES `@scribe/signals` (just like data); only fits its 2200 B limit because its limit is loose. `@scribe/agent` has no workspace deps. Pattern: the only package that successfully externalizes a workspace dep it actually value-imports is the one with explicit `external` declared. |
| H6 (added) | Rolldown auto-externalizes some shapes (`type-only` imports, `import type`) but inlines value imports | Examine which symbols `@scribe/data/src/*` actually value-imports | Confirms H2 framing. data value-imports `signal`, `batch`, `boolLatticeSignal`, `maxLatticeSignal`, `untrack`, `effect`, `createContext`, `inject`. None type-only. With no `external`, rolldown follows every value import. |

**1 verdict-eligible (H2). 4 falsified (H1, H3, H4, H6 confirms framing). H5 is corroborating evidence.**

---

## 3. Sister-package walk

I examined four packages that share the data-package's build environment.

### 3a. `@scribe/runtime`

- **package.json:** `peerDependencies: { @scribe/arbor, @scribe/signals }`. No `dependencies`.
- **rolldown.config.ts:** `external: ['@scribe/arbor', '@scribe/signals']` declared explicitly.
- **src value imports of workspace deps:** none. `runtime/src/types.ts`, `define-component.ts` only `import type` from `@scribe/arbor` and `@scribe/signals` (verified via `grep "from ['\"]@scribe" packages/runtime/src`). `import type` is erased by tsc, so even WITHOUT `external` the dist would have nothing to inline.
- **dist:** 1822 B raw, no `import` statements, no `SignalError` substring. Self-contained DI shell (`_setMount`, `_setSignal` injected by consumer).
- **Why it externalizes:** technically it doesn't need to — its source has nothing to externalize. The `external` is defense-in-depth in case future runtime code adds a value import.

### 3b. `@scribe/arbor`

- **package.json:** `dependencies: { @scribe/signals: workspace:* }`.
- **rolldown.config.ts:** **NO `external` declaration.** Identical shape to data's config.
- **src value imports:** `arbor/src/mount.ts` line 1 imports `effect` (a value) from `@scribe/signals`. Five other arbor files `import type { Dispose, Signal }` (type-only).
- **dist:** 5163 B raw. `head -c 600` shows `class extends Error{name=ArborError}` ... and later `class extends Error{}` named `SignalError` — i.e. the same private signals class chain that's inlined into data's dist.
- **`bun run size` reports** `@scribe/arbor 2.10 kB / 2200 B (+47 B headroom)` — passes only because the limit is loose enough to fit inlined signals + its own code + (the size script's secondary pass which has nothing to externalize either, since arbor's `.size-limit.json` entry has no `ignore` field).
- **Externalize? NO.** Same root cause as data; just doesn't trip its own size gate because the gate is permissive.

### 3c. `@scribe/agent`

- **package.json:** no `dependencies` field at all.
- **rolldown.config.ts:** no `external`.
- **src:** registry-only (Map of agent metadata); no workspace imports.
- **dist:** 200 B-ish, fully self-contained. `bun run size`: `+83 B headroom`.
- **Externalize? N/A.** Nothing to externalize.

### 3d. `@scribe/context`

- **package.json:** no workspace deps.
- **rolldown.config.ts:** I did not separately read, but the dist is 249 B / 300 B and the source has no inter-workspace imports — so externalization is moot.

### 3e. Net

| Package | Has workspace value-import? | Has rolldown `external`? | Inlines workspace dep? | Trips its own size gate? |
|---|---|---|---|---|
| `@scribe/runtime` | NO (type-only) | YES | N/A (nothing to inline) | NO |
| `@scribe/arbor` | YES (`effect`) | NO | **YES** | NO (limit 2200 B accommodates) |
| `@scribe/data` | YES (8 symbols) | NO | **YES** | **YES** (limit 750 B does not accommodate) |
| `@scribe/agent` | NO | NO | N/A | NO |
| `@scribe/context` | NO | NO | N/A | NO |

**Bug status: NOT local to `@scribe/data`. It is a repo-wide pattern that
manifests as a size-gate failure only on `@scribe/data` because data is the
only package with both (a) a value-import of a workspace dep AND (b) a tight
enough limit to expose the inlining.** `@scribe/arbor` has the same defect
silently.

The fix scope decision belongs to the Builder + Director, not the Investigator.
Two reasonable scopes:

- **Narrow (Director-brief default):** add `external` to
  `packages/data/rolldown.config.ts` only. Closes the live size-gate
  failure. Leaves arbor with a dormant defect (~3 kB of inlined signals
  shipped to consumers under the `@scribe/arbor` package).
- **Wide:** add `external` to both data and arbor configs. Closes the dormant
  defect. May change `@scribe/arbor`'s gzip size measurably; would need to
  re-check its limit. **This expands scope per Decision 2 trigger #14
  (Builder edits files outside `@scribe/data` package + `.size-limit.json` +
  rolldown/moon config without explicit Director authorization)** — `external`
  in `arbor/rolldown.config.ts` is rolldown config, but it's a sister
  package's config, which the brief's Allowed scope narrows to
  `packages/data/rolldown.config.ts`. **Surface to Director if Builder wants
  to do the wide fix.**

I recommend **Narrow** for Round 2 and a separate Director note flagging the
arbor dormant defect for a later round. Builder should NOT silently extend.

---

## 4. Verdict + ROOT CAUSE

### Picked hypothesis: **H2 — Rolldown config missing `external` for workspace deps.**

### Root cause

`packages/data/rolldown.config.ts`, between line 7 (`checks: { circularDependency: true },`)
and line 8 (`output: {`):

```ts
// CURRENT (line 4-15, missing external)
export default defineConfig([
  {
    input: 'src/index.ts',
    checks: { circularDependency: true },
    output: { ... },
    plugins: [dts()],
  },
])
```

The source of truth that's missing: an `external` field naming the two
workspace deps that data value-imports (`@scribe/signals`, `@scribe/context`).
Once asserted, rolldown stops following value imports into those graphs and
emits `import { ... } from '@scribe/signals'` (and similarly for context) at
the top of the dist instead.

**Why this is the named verdict and not just "one of several plausible"**:

- It is the ONLY hypothesis that survives the falsifying test (§5, §2 H2).
- H3 (peerDependencies move) is independently falsified (§2 H3) — moving the
  deps does NOT change build behavior. Rolldown does not auto-externalize
  based on `package.json` shape.
- H1, H4 (path divergence) are independently falsified — bytes are identical
  across all three build paths.
- H5 (sister-package config) corroborates: `@scribe/runtime` is the only
  workspace-dep-importing package with `external` declared, and the only one
  whose dist is correctly externalized. `@scribe/arbor` has the same gap and
  the same inlining behavior.

### Citation

- **File to change:** `packages/data/rolldown.config.ts`
- **Line to change:** line 7 (insert `external: ['@scribe/signals', '@scribe/context'],` after the existing `checks:` line; or any other syntactic position that puts the property on the input config object).
- **Property to assert:** `external` array containing the two workspace package names.
- **Builder discretion:** array literal vs callback vs regex — any rolldown-
  recognized `external` shape that resolves to "do not follow imports of these
  two specifiers" satisfies the contract. The mechanism is the Builder's pick.

### Out-of-scope notes (for Builder + Director)

- **`@scribe/arbor` has the same defect.** Closing it changes scope; surface
  trigger #14 territory. I am not proposing a fix for arbor here. Recommend a
  follow-up Round-N+5 task: "audit all rolldown configs for missing `external`
  on workspace value-imports."
- **`package.json` `dependencies` shape is fine.** `@scribe/signals` and
  `@scribe/context` belong as `dependencies` (not `peerDependencies`) for
  consumer-install ergonomics; the externalization is a build-time concern,
  not a dep-shape concern. Director surface trigger #3 should NOT fire if
  Builder's fix stays in rolldown config alone.
- **`.size-limit.json` is correct.** The `ignore: ['@scribe/signals',
  '@scribe/context']` field is for the size script's own bundling pass over
  the dist (so when it re-bundles the already-built dist for measurement, it
  treats those specifiers as external). That pass is moot if the dist already
  has them externalized; but the `ignore` field is correct as-is and should
  not be removed.

---

## 5. Falsification evidence

All experiments below were run on `investigate/data-externalization` worktree.
No experiment is committed. After each, I reverted via `git checkout
packages/data/...` and verified clean state via `git status`. The investigation
branch will commit ONLY this `.team/data-fix/investigation.md` file.

### 5a. Confirming experiment for H2

**Edit (NOT committed):** `packages/data/rolldown.config.ts`, add `external: ['@scribe/signals', '@scribe/context'],` after `checks: { circularDependency: true },`.

**Build:**
```
$ rm -rf packages/data/dist && bunx moon run data:build
data:build | <DIR>/index.js  chunk │ size: 1.52 kB
```

**Dist content head (first ~250 chars):**
```
import{batch as e,boolLatticeSignal as t,effect as n,maxLatticeSignal as r,signal as i,untrack as a}from"@scribe/signals";import{createContext as o,inject as s}from"@scribe/context";function c(){let e=new Map,t=new Set;return{get:t=>e.get(t),set:(t,n)=>{...
```

Both upstream packages are now `import { ... } from "@scribe/<pkg>"`
specifiers — externalized correctly. No `class extends Error{}...SignalError`
substring anywhere in the dist.

**Sizes:**
```
$ wc -c packages/data/dist/index.js
1523
$ gzip -c packages/data/dist/index.js | wc -c
764
$ bun run size 2>&1 | grep data
  ✓ @scribe/data        747 B /   750 B  (+3 B headroom)
```

**Result:** dist size drops from 4951 B raw / 2012 B gz → 1523 B raw / 764 B
gz. `bun run size` PASSES at 747 B / 750 B (+3 B headroom). Matches Verifier C's
documented post-Builder-C floor.

### 5b. Reverting experiment

**Edit (NOT committed):** `git checkout packages/data/rolldown.config.ts`.

**Build:**
```
$ rm -rf packages/data/dist && cd packages/data && bun run build
chunk │ size: 4.95 kB
$ head -c 200 packages/data/dist/index.js
var e=class extends Error{},t=class extends e{};e.prototype.name=`SignalError`...
$ gzip -c packages/data/dist/index.js | wc -c
2012
$ bun run size 2>&1 | grep data
  ✗ @scribe/data      2.00 kB /   750 B  (1298 B OVER LIMIT)
```

**Result:** reverting the `external` change re-introduces the inlined signals
source. Bytes return exactly to 4951 / 2012. The fix is symmetric and
reproducible.

### 5c. Falsifying experiment for H3 (peerDependencies move alone)

**Edit (NOT committed):** `packages/data/package.json` — change
`"dependencies"` key to `"peerDependencies"` (no other changes; rolldown
config remains without `external`).

**Build:**
```
$ rm -rf packages/data/dist && cd packages/data && bun run build
chunk │ size: 4.95 kB
$ head -c 200 packages/data/dist/index.js
var e=class extends Error{},t=class extends e{};e.prototype.name=`SignalError`...
$ gzip -c packages/data/dist/index.js | wc -c
2012
```

**Result:** identical to baseline — moving deps to `peerDependencies` alone
does NOT externalize. Confirms rolldown does not auto-externalize based on
`package.json` shape; the rolldown `external` config is the load-bearing
assertion. **H3 falsified.**

Reverted via `git checkout packages/data/package.json`. Verified clean.

### 5d. Final clean state

```
$ git status --short
$ # (empty — only .team/data-fix/investigation.md is the deliverable)
```

---

## Appendix — files cited

- `packages/data/rolldown.config.ts` (lines 4-15)
- `packages/data/package.json` (lines 23-26: `dependencies` block)
- `packages/data/src/index.ts` (lines 18-22: re-export surface)
- `packages/runtime/rolldown.config.ts` (line 17: reference `external` declaration)
- `packages/runtime/package.json` (lines 18-21: `peerDependencies` reference)
- `packages/arbor/rolldown.config.ts` (no `external`; same defect dormant)
- `packages/arbor/src/mount.ts` line 1 (only value-import of `@scribe/signals` from arbor)
- `.size-limit.json` lines 32-38 (`@scribe/data` entry; `ignore` field; canonical 750 B limit confirmed on `f53afff`)
- `.team/round-n3/verification-item-2-c.md` §7 (Verifier C's earlier observation)
- `scripts/size.ts` lines 36-44, 50-65 (size script's externalization model — `peerDependencies` + `ignore`, NOT what rolldown reads at build time)

**End of investigation. Ready for Builder A (Round 2).**
