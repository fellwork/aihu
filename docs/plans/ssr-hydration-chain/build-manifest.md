# SSR hydration chain — build manifest

Branch `fix/ssr-hydration-chain`, based at `aa1d2be4`.
Slices: **CO5**, **DA3 + DA3b**, **FEL-249 / #421**. All three landed.

Every number below was measured on this branch, after a rebuild, against a fresh
`bun install`. Nothing here is predicted.

---

## The chain, in one paragraph

`@aihu/server` seeded its `data-aihu-path` walk with `'0'`; `@aihu/arbor`'s
`hydrate()` hardcoded `'hydrate.0'`. The two roots could never match, so every
branch lookup in `_hydrateNode` missed. A missed lookup is not an error — it
reads as a legitimate DOM mismatch and falls back to `_materialize`, which
builds a second copy of the tree and appends it. Nothing throws. Meanwhile the
router and the SSG prerenderer called `renderToString(...)` with no options at
all, so in production there were no markers to match in the first place. The
result was a page rendered twice, with the reactive effects wired to the copy
the user cannot see — and a fully green test suite.

---

## Key-design decision

> *Open question from the brief: does the unified key become content-derived or
> compiler-assigned? `_rootIdCounter` cannot survive a server/client split
> either way.*

**Decision: the root is a fixed constant `'0'`; paths below it stay positional.
Neither content-derived nor compiler-assigned — yet.**

The counter is disqualified exactly as the brief says. `_rootIdCounter`
(`packages/arbor/src/mount.ts:181`) is mutable per-process module state: it
advances once per `mount()` on the client and resets on every page load, while
the server renders from a long-lived process shared across requests. No counter
value can be reproduced on both sides of the boundary.

Of the two candidates offered:

- **Content-derived** (hash the subtree) is reproducible, but it makes every key
  a function of the full content — any whitespace or copy edit invalidates the
  entire key space — and it costs a hash per node on both hot paths. It is also
  incompatible with streaming SSR: `renderNodeAsync` emits chunks as it walks
  and cannot know a subtree's hash before emitting the subtree's opening tag.
- **Compiler-assigned** is the correct long-term answer — stable across content
  edits, zero runtime cost. It is also a much larger change than CO5: it
  requires threading an identity through emit, and it would force the Rust
  emitter and every fixture to move in lockstep.

The decisive observation is that **only the root was ever wrong.** Every path
below it is already positional (`parent.childIndex`) in the renderer, in the
walker, and in the Rust emitter, and those already agreed. So the minimum
correct fix is to make the root a fixed constant, and `'0'` is the value to pick
because it is what the renderer already emitted and what
`packages/server/src-native/src/render.rs:408` already asserted.

**Consequences of choosing `'0'` over `'hydrate.0'`:**

- No serialized output changes. Already-served HTML does not become
  unhydratable — the fix is client-side only.
- **The Rust test did not have to move.** The brief anticipated migrating
  `render.rs`'s `data-aihu-path="0"` assertion; choosing the value the wire
  already carried made that unnecessary. `render::tests::hydratable_adds_path`
  passes untouched (21/21 in `aihu-server-native`).
- `mount()` keeps `_rootIdCounter`, which is correct: a client-only mount never
  crosses the boundary, and each scope owns its own `signalRegistry`, so the
  `<n>.0` and `0` namespaces cannot collide in a shared map.

**Why the constant is duplicated rather than imported.** `@aihu/server` does not
depend on `@aihu/arbor` and must not — arbor is the client runtime, and
importing it server-side is a bundle leak (`lint:node-leak`,
`check:runtime-purity`). More importantly, a shared TS constant could not cover
the **third** implementation at all: the Rust renderer. So agreement is enforced
behaviorally, by the integration test and by the new invariant, which is
strictly stronger than a shared import and is the only mechanism that spans all
three implementations. Both TS sites carry the rationale; neither carries a
"keep in sync" comment (that pattern is what `check:derived` exists to flag).

---

## Slice CO5 — unify the path-key root

Commit `ec6aee60` — *fix(arbor): unify the SSR and hydration path-key root*

| File | Change |
|---|---|
| `packages/arbor/src/hydrate.ts` | `'hydrate.0'` → exported `_ROOT_PATH = '0'` |
| `packages/server/src/ssr.ts` | root literal → named `ROOT_PATH` protocol constant |
| `packages/arbor/tests/hydrate.test.ts` | 9 hand-written literals → the constant |
| `packages/runtime/tests/hydrate-integration.test.ts` | 2 stale snapshot keys |
| `tests/integration/ssr-hydrate-path-parity.test.ts` | **new** — the acceptance test |
| `tests/vitest.config.ts` | added the `@aihu/server` alias |

**Scope was larger than briefed.** The brief listed 8+ sites in
`hydrate.test.ts`; the actual repo-wide count was **13 across 4 files**,
including two in `packages/runtime/tests/hydrate-integration.test.ts` that the
brief did not mention. Those two are `snapshot` keys (`'hydrate.0.text'`), and
they are **inert** — `hydrate()` does `void snapshot` at `hydrate.ts:244`; signal
pre-seeding is deferred. They were updated for consistency, not for behavior,
and `packages/runtime` was added to the measured set as a result.

**On the "do not fix by adjusting hand-written markup" instruction.** The
existing fixtures did have to change — after CO5 they assert a protocol that no
longer exists. What that instruction forbids is treating the edit as
*sufficient*, and it is not: the fixtures were repointed at `_ROOT_PATH` so they
can never re-drift, and the real gate is the new integration test, which never
hand-writes markup at all.

### Mutation proof — the acceptance test

Reverting only `_ROOT_PATH` to `'hydrate.0'`:

```
Tests  4 failed | 1 passed (5)
```

The load-bearing failure prints the bug itself:

```
AssertionError: expected '<main data-aihu-path="0">…' to be '<main data-aihu-path="0">…'

Expected: "<main data-aihu-path="0"><section data-aihu-path="0.0"><div data-aihu-path="0.0.0">
           <span data-aihu-path="0.0.0.0">deep</span></div></section></main>"
Received: "<main data-aihu-path="0"><section data-aihu-path="0.0"><div data-aihu-path="0.0.0">
           <span data-aihu-path="0.0.0.0">deep</span></div></section></main>
           <main><section><div><span>deep</span></div></section></main>"
```

— the server's marked-up tree, and a complete second unmarked copy appended
beside it. Also caught: `expected 2 to be 1` on the exactly-once assertion, and
the reactive write landing on the duplicate while the visible node stayed at its
SSR value.

One initial test did **not** discriminate (it compared the server against
itself) and was rewritten to compare the two implementations directly.

---

## Slice DA3 + DA3b — hydratable output on both production paths

Commit `fb5620fa` — *fix(app): emit hydratable SSR from the router and the SSG writer*

Three call sites, all rendering documents a live SPA hydrates into:

- `packages/router/src/server.ts:41` — the SSR request handler (**DA-c**)
- `packages/app/src/prerender.ts:283` — the layout shell (**DA-d**)
- `packages/app/src/prerender.ts:382` — the page render (**DA-d**)

`ssr.ts`'s comment justifying the gate — *"static SSR never hydrates, so the
extra bytes would be dead weight"* — was corrected rather than deleted. It is
true only of genuinely terminal output. `prerender.test.ts` asserts the client
bundle is preserved *"→ page hydrates into SPA"* on the line directly after the
content assertion, which is the repo's own evidence that SSG output is not
terminal. The corrected comment states the general rule: **`hydratable` is a
property of the DESTINATION, not of the renderer**, which is why it stays
explicit at every call site.

### Self-test re-basing (not in the brief; would have broken the build)

`check-dual-audience.ts`'s **should-flag arms for DA-c and DA-d drove the live
production path** and hard-expected 1 finding each. Fixing production would have
made `selfTest` exit 1 *before the real scan ever ran* — the check would have
read as broken rather than as passing.

Both positive controls are now **simulated regressions**: the same component,
through the same renderer, with `{ hydratable: false }` — precisely the edit
that would reintroduce the defect. The live path became the should-not-flag
control. This follows the GO1/GO2 precedent recorded in `baselines.json`
("re-based in the same commit from shim-simulated fixes to real-code
regressions"). The `hydratable` boolean became a `ProbeMode` enum, because a
flag named after the fix reads backwards once the polarity inverts.

Self-test after: **8 cases, both directions, passing.**

### One test assertion updated

`packages/app/tests/prerender.test.ts:157` pinned the exact blob
`<h1>Home Content</h1>`, which is now `<h1 data-aihu-path="0">Home Content</h1>`.
It was failing **on the fix**, not on a regression. Replaced with a property
assertion (`/<h1[^>]*>Home Content<\/h1>/` plus an explicit
`toContain('data-aihu-path')`), so it now tests reachability *and* the markers
the adjacent comment already assumed were there.

### Measured

```
check:dual-audience   4 → 2      (DA-c, DA-d cleared; DA-a, DA-b remain — not this scope)
```

`dual-audience.expect` decremented 4 → 2 **in the same commit**, with the prior
3 → 4 scope-change rationale preserved in a new `expectHistory` array rather
than overwritten.

---

## Slice FEL-249 / #421 — `check:hydration-adoption`, the fifth invariant

Commit: see below. New files: `scripts/check-hydration-adoption.ts`; new
`hydration-adoption` entry in `baselines.json`; wired into `package.json` as
`check:hydration-adoption` and appended to `check:thesis`.

**The gap it closes.** `check:dual-audience` asserts the server *emits*
`data-aihu-path` markers. It cannot assert the client can *use* them. Those came
apart in production — markers present, well-formed, addressing a key space the
client never queried — and every dual-audience assertion passed on that HTML.
This is the only check in the repo asserting the shipped pipeline produces HTML
the shipped client can adopt.

Reuses `scripts/lib/invariant.ts` (`expectCount`, `expectedFrom`,
`refuseVacuous`, `selfTest`) rather than reimplementing them. Uses jsdom, already
a devDependency, so `hydrate()` runs against the same DOM the test suite uses.

Two probes, four assertions each, reported as **one finding per probe** (four
symptoms of one defect):

| | Probe | Assertions |
|---|---|---|
| HA-a | `renderToString(…, {hydratable:true})` → `hydrate()` | `innerHTML` byte-identical; root node identity; primary text **exactly once**; reactive write reaches the server's own Text node |
| HA-b | **live `createServerRouter` request** → `hydrate()` | same four, over bytes taken off a real `Response` |

Adoption is asserted **behaviorally**, not by spying on `_materialize`:
`_materialize` cannot append without changing `innerHTML`, so byte-stability
plus node identity is a sound and implementation-independent proxy. Text
exactly-once is asserted directly because `toContain` passes on duplicated
content — which is the bug.

### Two design corrections made during the build

**1. The self-test must not use production as its control.** The first revision
made the live path the should-not-flag arm — the exact mistake that forced the
`check-dual-audience` re-base above. Under mutation it produced:

```
check:hydration-adoption — SELF-TEST FAILED. The check cannot discriminate…
  HA-a should-not-flag: live hydratable render: expected 0 finding(s), got 1
```

That blames the checker for a bug in the source and **suppresses the scan that
would have named it**. Controls are now keyed to `_ROOT_PATH` rather than to
literals, so they test the *checker* and never production. HA-b deliberately has
**no** should-not-flag arm, because any such control would have to be built from
the live router's own bytes; discrimination is proven bidirectionally by HA-a,
which exercises the same `assertAdoption` machinery.

**2. The vacuity guard was too aggressive.** It initially refused bodies with no
markers — but markerless output *is* the DA3 defect, and HA-b must be free to
report it. With DA3 reverted, that turned a precise finding into "refusing to
pass vacuously". The guard now tests for an **empty body only**.

Both corrections are recorded in-file, with the failing output that motivated
them.

### Mutation proof — bidirectional, against the final script

| Mutation | `check:hydration-adoption` | `check:dual-audience` |
|---|---|---|
| none (HEAD) | **PASS** — 0 findings, self-test ok (4 cases) | PASS at 2 |
| `_ROOT_PATH` → `'hydrate.0'` (revert CO5) | **FAIL — 2 findings** (HA-a, HA-b), self-test ok | **PASS at 2 (green!)** |
| router drops `hydratable: true` (revert DA3) | **FAIL — 1 finding** (HA-b), self-test ok | *(would flag DA-c)* |

The middle row **is the entire argument for the check's existence**: with the
pre-CO5 defect restored, `check:dual-audience` reports green while
`check:hydration-adoption` reports

> `the primary text appears 2 time(s), expected exactly 1 — this is the
> duplicated-content bug a human sees while every other check reports green`

In both failing rows the self-test still passes, so the failure is attributed to
the source and not to the harness.

**Baseline: `expect: 0`** — the documented exception to "every entry is
non-zero on purpose". The rule behind that policy is that a check which *cannot*
fail measures nothing; this one demonstrably can, and the demonstration is
committed in the baseline `reason` as a mutation result rather than asserted.
Zero-tolerance from day one, `blockedBy: []`.

---

## Acceptance — measured

### Thesis checks

| Check | Before | After | Required |
|---|---|---|---|
| `check:dual-audience` | 4 | **2** | 4 → 2 ✅ |
| `check:derived` | 2 | **2** | unchanged ✅ |
| `check:governed` | 0 | **0** | unchanged ✅ |
| `check:attributed` | 0 | **0** | unchanged ✅ |
| `check:hydration-adoption` | *did not exist* | **0, passing** | exists; fails pre-CO5 ✅ |

All five exit 0 at HEAD.

### Test suites — before → after

| Package | Before | After |
|---|---|---|
| `packages/arbor` | 128 | **128** |
| `packages/server` | 162 | **162** |
| `packages/router` | 105 | **105** |
| `packages/app` | 97 | **97** |
| `packages/runtime` | 122 (+2 skipped) | **122 (+2 skipped)** |
| `tests/integration/ssr-hydrate-path-parity` | — | **5 new** |

No drops. Full repo: **2180 passed, 13 skipped, 1 failed** (pre-existing, below).

### Rust

| Suite | Result | Required |
|---|---|---|
| `cargo test -p aihu-compiler` | **836 passed, 0 failed** | ≥ 835, 0 failures ✅ |
| `aihu-server-native` | **21 passed, 0 failed** | — |

`render::tests::hydratable_adds_path` (the `data-aihu-path="0"` assertion) passes
**unmodified** — a direct consequence of the key-design decision.

---

## Pre-existing failures — NOT fixed, reported as instructed

1. **`packages/css-engine/tests/resolve-binary.test.ts`** — environmental;
   needs `cargo build --release -p aihu-css-core`, which is not built in this
   checkout. The single failure in the full-suite run. Confirmed pre-existing.
2. **`packages/tsc/tests/language-plugin.test.ts` (#427)** — did not surface as
   a failure in `bun run test` on this branch.
3. **`tests/integration/define-element-integration.test.ts`** — *not in the
   brief.* Fails under `bun run test:integration` only: that config never
   aliased `@aihu/context`, and there is no built `dist`. **Verified
   pre-existing by stashing all my changes and re-running.** Not fixed — out of
   scope, and fixing it would mean editing a config seam another slice may own.
   Note this suite passes under the root `vitest.config.ts`, which aliases every
   package; only the narrower integration config is affected.

---

## Deviations from the brief

1. **`resolveNewest` was not used.** The brief asked to reuse it alongside
   `expectCount` / `refuseVacuous` / `selfTest` (all three of which *are* used).
   `resolveNewest` resolves a build artifact by newest mtime; this check
   compiles nothing and reads no artifact. It runs with `SCRIBE_NATIVE_SKIP=1`,
   selecting the pure-TS SSR path exactly as `check:dual-audience` does, so
   there is no binary to resolve. Calling it anyway would have been cargo-cult.
   Flagged rather than silently dropped.

2. **`check-dual-audience.ts` was modified** beyond the briefed files. Required,
   not optional: its self-test would have exited 1 before the real scan once
   production was fixed. Rationale above and in the commit body.

3. **`packages/app/tests/prerender.test.ts` and
   `packages/arbor/tests/hydrate.test.ts` were modified.** Both pinned markup
   invalidated by the fixes; both were failing *on the fix*. Neither was
   weakened — `prerender.test.ts` gained an assertion
   (`toContain('data-aihu-path')`), and `hydrate.test.ts` was repointed at the
   shared constant so it cannot re-drift.

4. **`packages/runtime` was touched** (2 inert snapshot keys) and added to the
   measured set. The brief's file list did not include it.

5. **`tests/vitest.config.ts` gained an `@aihu/server` alias** and
   `SCRIBE_NATIVE_SKIP=1`, so the new integration test runs under
   `test:integration` as well as under the root config.

No check was weakened to make anything green. No baseline was decremented
without a source change in the same commit.
