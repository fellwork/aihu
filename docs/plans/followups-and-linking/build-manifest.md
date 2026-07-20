# Follow-ups and workspace linking — build manifest

**Branch:** `fix/followups-and-linking` · **Base:** `ca3fd2b9` (merge: slice-0 invariants + CO1 prop-write rewriting)
**Date:** 2026-07-19

Five founder-authorized tasks. Task 5 was investigated before anything was changed
(Iron Law); that investigation is §5 and it **corrected the brief's premise**.

---

## Measured baseline on `ca3fd2b9`, before any change

| Signal | Value |
|---|---|
| `cargo test -p aihu-compiler` | **818 passed, 0 failed** (33 test binaries) |
| `check:derived` | 2 findings |
| `check:governed` | 2 findings |
| `check:attributed` | 2 findings |
| `check:dual-audience` | 3 findings |
| `check:emit-parses` | parse 1, compile 11 |
| `node_modules/@aihu` | **absent** |

---

## Task 1 — C561 severity: **CONFIRMED AS ERROR**

The spec chose error. The brief asked for confirmation with reasoning, weighing that
"no component in-repo does this, so error breaks nothing today; but it IS a behavior
change for any downstream user who does."

**I confirm error, and the justification is materially stronger than the spec's.**
The brief's framing understates the case, because it treats the downstream behavior
being changed as unknown. It is not unknown — it is measurable, and I measured it.

### Evidence

A `$prop` lowers to a **`const`** binding, and `$computed` bodies are spliced into
**that same scope**. Compiled with the release binary at `ca3fd2b9`:

```js
setup: (ctx) => {
  const count = ctx.props.count                    // ← const
  const doubled = computed(() => count() * 2);     // ← $computed body, same scope
```

So a `$computed` that writes `count` emits an assignment to a `const`. Executed
directly, that shape throws:

```
THROWS: TypeError: Assignment to constant variable.
```

And C561 currently fires on exactly that source, with the full rich diagnostic.

### Reasoning

1. **The behavior change is not "working code now fails to build."** It is
   *"guaranteed runtime `TypeError` now fails to build, with a fix hint."* No working
   downstream program can exist that writes a `$prop` inside `$computed`/`$resource`,
   because the emitted shape cannot execute. Error is strictly an improvement on every
   program that this can affect.
2. **Warning is not actually the alternative — silent breakage is.** CO1 deliberately
   does *not* rewrite in derivation positions (spec §4.3: a derivation must not silently
   mutate state). So downgrading to a warning would print a note and then emit the exact
   crash CO1 exists to repair. A warning is only coherent if paired with a rewrite, which
   the spec rejects on category grounds. The real choice is **error vs. shipping a
   guaranteed crash**, and that is not a close call.
3. **Residual risk, stated honestly:** a prop write in *unreachable* `$computed` code
   never crashed, and will now fail the build. This is narrow, and the diagnostic names
   the fix. Accepted.

**No change made.** C561 stays a hard error.

---

## Task 2 — `W-prop-member-write` → structured diagnostic

**Was:** a bare `eprintln!` in `prop_write.rs`, no code, no hint, no machine rewrite —
while C560/C561 a few functions away carried `hint:` / `fix:` / `replace:` / `with:`.

**The brief said to find the helper the C-codes use and reuse it. There was no such
helper** — that is precisely why the drift happened. The C-codes build a `CompileError`
and are rendered by `render_human_error` in `bin/main.rs`; warnings are non-fatal and do
not flow through the `Result` channel, so each warning site hand-rolled its own
`eprintln!` block. Two formatting paths, and they diverged.

So rather than hand-rolling a third, I created the missing shared writer and pointed
**both** channels at it:

- **New** `packages/compiler/src/diagnostics.rs` — `write_tail` (the shared
  `hint:`/`fix:`/`replace:`/`with:` block), `write_warning`, `emit_warning`.
- `bin/main.rs::render_human_error` now delegates its tail to `write_tail`. Only the
  header and codeframe remain error-specific (a parse-time warning has no line/col to
  anchor a codeframe to).
- `prop_write.rs` builds a real `CompileError` (**W562**) via `member_write_warning()`
  and emits it through `emit_warning`.
- **`W210` migrated too** (`parser/directives.rs`), so the hand-rolled copy that
  demonstrated the drift is gone rather than left as a template for the next one.

There is now exactly one formatter. A warning that gains a `fix:` gains it in both
places at once.

Tests added: 3 in `diagnostics.rs` (full tail, absent-field omission, `replace:`/`with:`
requiring both halves) + `member_write_warning_is_structured_like_the_c_codes` locking
the W562 shape against regression to a bare print.

---

## Task 3 — DE5 factoring: synthetic-wrapper parse extracted

**New** `packages/compiler/src/expr/handler_parse.rs`, consumed by `prop_write.rs`.

- `HandlerSource::wrap/parse` — the `{async }function __aihu_pw(<params>) { <body> }`
  wrapper, `SourceType::ts()`, plus the span arithmetic (`body_start`, `body_end`,
  `span_in_body`, `to_body_offset`) that was previously open-coded in two places in
  `prop_write.rs`.
- `handler_params()` — **the DE5 door.** Plain data in, plain data out, no oxc in the
  signature: `HandlerParam { name, type_text, optional, has_default, rest }`. DE5 needs
  handler *signature* extraction for typed MCP parameter schemas; deriving it from the
  same parse CO1 rewrites through means the agent-facing schema cannot drift from the
  code it describes. Two parsers over one signature would be exactly the "kept in sync"
  seam thesis §2 (Derived) forbids.
- `type_text` is the **verbatim** annotation slice, not a parsed type — so this module
  need not model TS's type grammar, and an unmappable annotation is visible to DE5 as
  text it can reject explicitly rather than silently mis-schema.
- Destructured params yield `name: None` rather than a guessed name, so DE5 can *see*
  that it cannot name the parameter.

**Containment held.** `handler_parse.rs` is inside `src/expr/`, per the boundary
`src/expr/rewrite.rs` establishes. `emit.rs` still sees only `String → String`.

### Byte-identical proof (required: "prop_write behavior must be byte-identical")

Not asserted — measured. The pre-change release binary was preserved before editing and
verified genuinely distinct from the post-change one (`W562` string count: 0 vs 1).

```
compiled 151 .aihu files × 2 targets (client, server) = 302 compilations
diff -r emitA emitB → exit 0, 0 lines of difference
```

**Every emit in the repo is byte-identical across the refactor.** The CO1 integration
tests were not touched.

---

## Task 4 — prerender is in scope: DA-c → DA-d, 3 → 4

`packages/app/src/prerender.ts:283` and `:382` call `renderToString(...)` with no
`hydratable` option — the same defect class as `packages/router/src/server.ts:41`.

**Added `runDaD`** to `scripts/check-dual-audience.ts`. It is **behavioral, not a grep**:
it drives the real `runPrerender` over a temp fixture and reads the HTML actually
written to disk, then asserts the primary text is reachable and `data-aihu-path` markers
are present. A source scan would pass the moment someone reformatted the call and would
never prove the written file lacks markers.

`loadModule` is injected (the same seam `packages/app/tests/prerender.test.ts` uses) so
the probe does not require the Rust SFC compiler. **This is not the DA-a class of mock:**
the injected module supplies the *route*, which is app-author input; the thing under
test — whether the renderer is asked for hydratable output — stays entirely production
code.

**DA-d is a separate finding from DA-c, deliberately.** Separate defects, separate files,
separate fixes: DA3 repairing the router does not repair the SSG writer. Grouping them
would let one fix silently decrement a baseline covering two live defects. `baselines.json`
records a new `DA3b` ratchet step for the prerender fix.

The self-test caught a real flaw in my first mutation: `runPrerender` overwrites the
template with the composed page, so patching `<div id="outlet"></div>` in the *output*
was a no-op and the should-not-flag case failed. Fixed by composing the mutation from the
original template. **The invariant caught the invariant's own bug** — left in as evidence
the two-directional self-test is doing work.

Updated: `baselines.json` (`expect` 3 → 4, with `expectChangedFrom` / `expectChangedOn` /
`expectChangedReason` recording that this is a **scope decision, not a fix** — nothing was
repaired, the check merely now sees a defect that was already shipping) and
`docs/plans/2026-07-19-thesis-conformance.md` (scorecard 0/3 → 0/4, new evidence row,
scope-amendment note).

**Verified after the change:** reports **4 findings**, self-test **8 cases both
directions**, and the property is still reported violated. Nothing was weakened to make
anything green.

---

## Task 5 — workspace linking: the brief's premise was wrong

Investigated before changing anything. **The root cause is not what the brief
hypothesized, and I did not implement the fix the brief described.**

### What the brief expected

> `node_modules/@aihu` DOES NOT EXIST despite `"workspaces": [...]` in package.json.
> Candidate causes: a `packages/_moved/*` or `packages/templates/*` entry breaking the
> glob; a package name/dir mismatch; a bun version behavior; a postinstall interaction.

### What I measured

**Finding 1 — workspace linking is not broken. It never was.**

Bun 1.3.8 uses the **isolated (pnpm-style) linker**. Under it, workspace dependencies
are linked into each *consuming package's own* `node_modules/@aihu/`, and are **not**
hoisted to the repo root. They are all present and correct:

```
packages/router/node_modules/@aihu/context -> ../../../context
packages/router/node_modules/@aihu/server  -> ../../../server
packages/router/node_modules/@aihu/signals -> ../../../signals
packages/app/node_modules/@aihu/{arbor,compiler,router,runtime,server,signals}
```

`bun install` exits **0** and reports 2571 packages. The absence of a root
`node_modules/@aihu` is **correct behavior for that linker**, not a failure.

The glob hypotheses were checked and are all false leads. Expanding every workspace glob
found 67 valid packages and 9 non-package matches — `packages/templates/moon.yml` (a
file), `examples/README.md` (a file), and 7 directories without a `package.json`. **Bun
silently skips every one of them; none breaks the workspace.** No name/dir mismatch, no
duplicate names.

**Finding 2 — the real blocker is unbuilt `dist/`, not absent links.**

Every `@aihu/*` package's `exports` map points at `./dist/*.js`. In a fresh checkout,
**0 of 35 packages have a `dist/`**. So a symlink resolves fine and the exports target
then does not exist → `Cannot find module`. Measured after a full `typecheck` (which
builds some packages), still only **9 of 35** have `dist`.

This reframes the three resolution maps. They are **not** papering over a linking
failure. They are a **source-resolution layer substituting `src/*.ts` for unbuilt
`dist/*.js`** — which is exactly what root `tsconfig.json` does
(`"@aihu/router": ["./packages/router/src/index.ts"]`). That function is real and still
required.

**Finding 3 — `--tsconfig-override` is actively harmful, not merely noisy.**

It forces the *root* paths map onto **every** file, including package sources, and the
root map is incomplete. `packages/app/src/prerender.ts` imports `@aihu/router/plugin`,
which the root map does not list, so the import fails — a resolution that would
otherwise have worked. It does not just emit the `Internal error: directory mismatch`
noise; **it narrows resolution and broke Task 4** until removed. (The `Internal error`
itself reproduces on a bare `bun --tsconfig-override ./tsconfig.json -e 'console.log(1)'`
— an unrelated Bun 1.3.8 bug, cosmetic.)

**Finding 4 — the per-package `paths` were already correct; only `baseUrl` was missing.**

`packages/app/tsconfig.json` already lists `@aihu/router/plugin` and every other
specifier it needs. Bun ignored the whole block because there was no `baseUrl`. This is
candidate (c) from the brief, confirmed as the actual mechanism.

**Finding 5 — the published-tarball danger is real, but narrower and differently shaped
than described.**

Tarballs *are* in the store: `@aihu/server@0.1.4`, `@aihu-plugin/agent-readiness@2.0.2`,
`@aihu-plugin/data@2.0.2`. The cause is **not** an unlinked `@aihu/arbor` — arbor is not
among them. It is that `packages/_moved/agent-readiness` and `packages/_moved/data`
declare **version-range** deps (`2.0.2`) on packages that exist in the workspace, so bun
fetches npm instead of linking:

```
packages/_moved/agent-readiness  [dependencies]  @aihu-plugin/agent-readiness : 2.0.2
packages/_moved/data             [dependencies]  @aihu-plugin/data            : 2.0.2
```

(`@aihu/server@0.1.4` is a transitive dep of the published agent-readiness tarball.)
The remaining non-`workspace:` `@aihu/*` deps are legitimate: published **platform
binaries** (`@aihu/compiler-darwin-arm64` etc.) and a `tests/legacy-snapshot.golden`
fixture.

**This is contained but not fixed.** All 16 root `@aihu` entries are now symlinks, so
root-level tooling cannot reach a tarball. The tarballs remain reachable only from inside
`packages/_moved/*`. **I did not change `_moved`** — those are archived packages and
altering their declared versions could change what the published artifacts mean.
Recommend a separate slice.

### What I changed

Three changes, each verified independently with the full suite re-run after.

1. **`baseUrl: "."` added to 24 per-package `tsconfig.json`s that declare `paths`.**
   Makes their already-correct maps take effect. (Brief item (c).)
2. **`--tsconfig-override ./tsconfig.json` removed from both check scripts.**
   Provably redundant *and* harmful once (1) landed — it was the direct cause of the
   `@aihu/router/plugin` failure. Kills the `Internal error: directory mismatch` noise.
   (Brief items (d) and the noise in (e).)
3. **18 `@aihu*` workspace packages added as root `devDependencies` at `workspace:*`.**
   These are the packages root-level tooling actually imports (enumerated from
   `scripts/`, `tests/`, `vitest.config.ts`) — the root genuinely depended on them
   without declaring it, which under a strict isolated linker is exactly the kind of
   undeclared dependency that does not resolve. `node_modules/@aihu/` now exists with
   16 symlinks into the workspace.

### What I deliberately did NOT change

**The ~30-entry `@aihu/*` alias block in `vitest.config.ts` stays.** The brief asked me
to shrink it "only where you can prove they are now redundant." **I can prove the
opposite.** With only 9 of 35 packages carrying a `dist/`, and every `exports` map
pointing at `dist/`, the aliases are what make `@aihu/*` resolve to `src/` in an unbuilt
checkout. Removing them would silently make the test suite depend on build order — green
locally after a build, red in a fresh CI checkout. The root `tsconfig.json` paths stay
for the same reason.

**These maps are not workarounds for broken linking. They are the build-order
independence layer.** The honest fix is to make packages resolve to source without a
build (a `publishConfig`/conditional-exports change), which is a separate, larger slice
and not something to fold into this one.

---

## Acceptance — measured

| Item | Required | Measured | |
|---|---|---|---|
| `cargo test -p aihu-compiler` | ≥ 818 passing, 0 failures | **836 passed, 0 failed** (818 + 18 new) | ✅ |
| `check:derived` | 2, unchanged | **2** | ✅ |
| `check:governed` | 2, unchanged | **2** | ✅ |
| `check:attributed` | 2, unchanged | **2** | ✅ |
| `check:dual-audience` | 4 (was 3) | **4**, self-test 8 cases both directions | ✅ |
| `check:emit-parses` | parse 1, compile 11, unchanged | **parse 1, compile 11** | ✅ |
| `bun run typecheck` | passes | **exit 0, 50 tasks** | ✅ |
| `ls node_modules/@aihu` | symlinks | **16 symlinks into `packages/`** | ✅ |
| check scripts stderr | no `directory mismatch` | **none** | ✅ |
| Full JS suite | run and report | **2142 passed, 1 failed, 13 skipped** (186 files) | ⚠️ see below |

### JS suite failure — pre-existing, not caused by this branch

```
FAIL packages/css-engine/tests/resolve-binary.test.ts
  > accepts the real dev target/ binary (the fallback the engine lands on)
  AssertionError: build it with: cargo build --release -p aihu-css-core
```

This is the third pre-existing failure the brief named ("1 needing an unbuilt
aihu-css-core binary"). Not fixed, per instruction.

The two cold-start timeouts the brief also predicted **did not occur** on this run —
the environment was warm. Reporting the observation, not claiming an improvement.

---

## Notes for the next agent

- The `packages/_moved/*` published-tarball shadowing (Finding 5) is unfixed and worth
  its own slice.
- The real removal of the three resolution maps is blocked on packages resolving to
  source without a build. Until then, treat all three as load-bearing.
- `handler_params()` in `expr/handler_parse.rs` is the DE5 entry point; it is tested but
  has no production consumer yet.
