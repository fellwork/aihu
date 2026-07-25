# BUILD-525 — `Deploy aihu-docs-next` ILLEGAL_REASSIGNMENT fix

Mode 3 defect fix off `inv-d-525-deploy.md`. Both remedies shipped, on two
separate branches, per the Investigator's "do both" recommendation (§6).

| | Branch | Head | PR | CI |
|---|---|---|---|---|
| Task 1 — compiler fix | `fix/state-emit-navigate-rewrite` | `28d1dd98` (rebased onto `main` `c4386693`) | **#557** (new) | `ci-ok` **pass**, `check` **pass**, `examples`/`governed-examples`/`storybook`/`chromatic` pass; MERGEABLE / CLEAN-but-BLOCKED-on-review |
| Task 2 — author workaround | `feat/docs-next-site` | `6859272a` (on `17abea67`) | #525 (existing) | **`Build & deploy` PASS** (2m6s) — the defect check. All checks green, MERGEABLE / CLEAN |

**#525's `Build & deploy` is green in real CI, including the Cloudflare Pages
project-create and deploy steps** the Investigator flagged as unverified (§6).

---

## Task 1 — compiler: `rewrite_wrapper_code` in the navigate-guard arms

**File:** `packages/compiler/src/codegen/state_emit.rs`.

Both `StateMacro::BeforeNavigate` and `StateMacro::AfterNavigate` now run the
spliced callback `expr` through `rewrite_wrapper_code(expr, &wrapper_targets,
&mut needs_state_upd_helper, &mut needs_prop_upd_helper)` before interpolating
it, mirroring the eleven existing call sites verbatim. No new helper, no
signature change. +23/-2 in the source file.

`rewrite_prop_writes_in` was deliberately **not** added: it takes a body +
params pair, and these arms splice a whole expression. Wrapper-form props are
already covered by `WrapperTargets` inside `rewrite_wrapper_code`.

**Compatibility.** With no wrapper-form declarations in a file,
`collect_wrapper_targets` yields an empty target set, `rewrite_state_body`
early-returns `Ok(None)`, and `rewrite_wrapper_code` splices the original
string — OLD-dialect `$beforeNavigate` / `$afterNavigate` files are
byte-identical. Pinned by a negative-control test.

**Tests** — 4 new, `packages/compiler/tests/state_wrappers.rs`, new §4.3
section (the file that already owns the state write-rewrite acceptance):

- `after_navigate_callback_write_takes_the_state_rewrite`
- `before_navigate_callback_write_takes_the_state_rewrite`
- `navigate_guard_reads_take_the_getter_splice` (the §4.2 read half)
- `old_dialect_navigate_guard_is_unchanged` (negative control)

Plain `assert!`-on-emitted-JS, matching the file's convention. No `insta`
snapshots are used in this suite, so none were added or accepted.

**Changeset:** `.changeset/compiler-navigate-guard-write-rewrite.md`
(`@aihu/compiler`: patch). Note: `.gitignore:98` has `state-*.md`, so a
changeset named `state-…` is silently ignored — hence the `compiler-` prefix.

### Second commit — platform binary bump (required by a CI gate)

`check:compiler-binary-bump` hard-fails any `packages/compiler/src/**.rs`
change that does not bump the `@aihu/compiler-<platform>` packages in the same
PR (release.yml skips versions already on npm, so otherwise the rebuilt binary
never publishes). The first push was red on exactly that; then red again on
`sync-readme --check`, because the version is embedded in autogen README and
inventory sections.

`28d1dd98` bumps all five `packages/compiler/npm/<platform>/package.json`,
`packages/compiler/package.json` `optionalDependencies`, and the mirrored
`bun.lock` workspace entry **0.1.32 → 0.1.33**, plus the regenerated
`packages/compiler/README.md`, the five platform READMEs, and
`scripts/__package-inventory.json`.

`sync-readme` in write mode also re-measures bundle sizes with rolldown, which
produced darwin-vs-committed drift in `README.md`, `packages/runtime/README.md`
and `scripts/__bundle-sizes.json` (e.g. `@aihu/runtime` 4319 → 4402 B) — all
unrelated to this change, so all three were reverted. `sync-readme --check`
(which reads the committed size cache) then passes clean.

### Rebase note

`#552` (`fix(compiler): splice state() declarations in place`) landed on main
mid-flight and bumped the platform packages to 0.1.32, conflicting with this
branch's bump. The branch was rebased onto `c4386693`: **the Rust hunk applied
with zero conflict** (#552 does not touch the navigate arms, as the
Investigator predicted in §4), and the bump commit was re-cut from 0.1.32.

### Acceptance

| Command | Exit |
|---|---|
| `cargo test --manifest-path packages/compiler/Cargo.toml` | **0** — 1079 tests, 39 suites, 0 failures (re-run post-rebase) |
| `cargo fmt --manifest-path packages/compiler/Cargo.toml -- --check` | **1** — see below |
| `BASE_REF=main bun scripts/check-compiler-binary-bump.ts` | **0** |
| `bun scripts/sync-readme.ts --check` | **0** |
| `bun install --frozen-lockfile` | **0** |
| GitHub `check` job (PR #557) | **pass** (5m23s) |
| GitHub `ci-ok` (PR #557) | **pass** |

**On `cargo fmt`:** it exits 1 on **pristine `origin/main`** too — 633 `Diff in`
hunks across the crate, no `rustfmt.toml`, and grepping `.github/workflows/`
finds **no cargo-fmt / rustfmt gate at all**. The brief's premise that a
cargo-fmt CI gate exists does not hold for this repo. Measured baseline vs.
branch:

```
origin/main        : exit 1, 633 hunks
+ this branch (raw): exit 1, 637 hunks   (all 4 in tests/state_wrappers.rs)
+ after cleanup    : exit 1, 633 hunks   (unchanged from baseline)
```

`state_emit.rs` added **zero** new hunks. The 4 test hunks were rustfmt's own
suggested `assert!` wrapping and have been applied, so this branch adds nothing
to the crate's existing fmt debt.

### Before / after demonstration

Fixture `nav.aihu`:

```
@state {
  let path = state('')
  afterNavigate(() => {
    if (typeof location !== 'undefined') path = location.pathname
  })
}
@template { <p>{path}</p> }
```

Same binary, fix stashed vs. applied:

```
 10:  const [path, __path_set] = signal('');
-12:    if (typeof location !== 'undefined') path = location.pathname
+12:    if (typeof location !== 'undefined') __path_set(location.pathname)
```

Emitted JS contains `__path_set(` and no bare `path =`.

### End-to-end: the compiler fix alone unblocks #525

`apps/docs-next` at its **unmodified** `17abea67` source, built with
`AIHU_COMPILE_BIN` pointed at the fixed binary:

```
apps/docs-next $ bun run build     → exit 0
  ILLEGAL_REASSIGNMENT occurrences: 0
  dist/index.html present, 69 prerendered pages
```

---

## Task 2 — `apps/docs-next/src/layouts/docs.aihu`

Investigator's Option A. The guard body is hoisted into a plain-body binding
(plain-body arrows DO take the rewrite) and passed by reference:

```js
const syncPath = () => {
  if (typeof location !== 'undefined') path = location.pathname
  if (typeof window !== 'undefined' && !location.hash) {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }
}

afterNavigate(syncPath)
```

+12/-2, one file. Behaviour unchanged — purely where the arrow is written. A
comment records why, and points at #557 for the eventual re-inline.

### Acceptance — local A/B on one binary

Both runs used the **unfixed** `target/release/aihu-compile` built from the
`feat/docs-next-site` checkout itself (byte-identical to `main` in the affected
region), i.e. exactly what CI resolves, after `bun install --frozen-lockfile`
(exit 0) and root `bun run build` (exit 0, 43 moon tasks).

| Run | Command | Exit |
|---|---|---|
| without the workaround | `cd apps/docs-next && bun run build` | **1** — `[ILLEGAL_REASSIGNMENT] … const variable \`path\`` at `src/layouts/docs.aihu:173:42`, the CI error verbatim |
| with the workaround | `cd apps/docs-next && bun run build` | **0** — 0 ILLEGAL_REASSIGNMENT, `dist/index.html` written, 69 prerendered pages |

### Acceptance — real CI

`Deploy aihu-docs-next` / `Build & deploy` on PR #525 @ `6859272a`:
**pass, 2m6s**. So the SSG prerender pass, `pages project create
aihu-docs-next`, and the Pages deploy — all unverified before because the build
died at step 10 — now all succeed. Every other check on #525 is green; the PR
is `MERGEABLE` / `CLEAN`.

---

## Scope discipline

Not touched, per the brief and `.size-limit.README.md`:

- `apps/docs/` — zero files
- `.github/workflows/deploy-docs.yml` — unchanged (that is #556's file)
- `.github/workflows/deploy-docs-next.yml` — unchanged
- `.size-limit.json` — **no row added**; `apps/*` are applications, not
  browser-eligible workspace packages (`apps/docs` has no row either), so a row
  would violate the policy
- Nothing merged

**Also checked (per "verify against main before claiming a fix"):** the merged
PR #439 `compiler: retire stale C205 + fix $afterNavigate lowering` is a
*different* defect (a stripped call head in `emit.rs`); it never touched
`state_emit.rs`. #557 is not a duplicate.

## Known-unrelated red check on #557

`Smoke tests` (a job of the `Deploy aihu-docs` workflow) fails on #557 —
`apps/docs/tests/playground.spec.ts:206 "every preset compiles AND renders in
the preview"`. **Identical failure on `main`** (verified against run
`30142855113` @ `c4386693`, and every recent `main` run is red on it).
Pre-existing, unrelated, and inside `apps/docs/` which this work does not
touch. `ci-ok` — the required gate — is green.

## Follow-ups (not done here)

1. Once #557 lands, inline the `docs.aihu` guard body again and drop the
   comment.
2. `packages/compiler/package.json`'s platform pin has been unpublishable for a
   while (0.1.30/0.1.32/0.1.33 vs npm `latest` 0.1.28). That broken pin is the
   only reason `target/release` wins the resolution race in CI. Repairing it
   will silently flip `deploy-docs-next.yml` onto the published compiler —
   apply #556's `env: AIHU_COMPILE_BIN` treatment to that workflow before then.
3. `apps/docs-next` ships no `moon.yml`, so it is outside `moon run :build` /
   `:typecheck`. That is why this class of defect could only surface in the
   deploy job.
4. The crate has ~633 pre-existing `cargo fmt` violations and no fmt gate. If
   the gate is wanted, it needs a one-shot `cargo fmt` commit first.
5. The `apps/docs` playground smoke test has been red on `main` for at least a
   day — worth its own ticket.

## Worktrees

`…/scratchpad/wt-compiler` (`fix/state-emit-navigate-rewrite`) and
`…/scratchpad/wt-docsnext` (detached at `origin/feat/docs-next-site`, pushed via
`HEAD:refs/heads/feat/docs-next-site` — the named branch was already checked out
in another session's worktree, so it was not hijacked). Both removed after
pushing. `/Users/smcguirt/conductor/repos/aihu` stayed on `main`, clean.
