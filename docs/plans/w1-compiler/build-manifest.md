# w1-compiler build manifest

Branch: `fix/c205-and-afternavigate` (based on `main` @ 37f202f0)
Two disjoint compiler fixes: Fix A in `lib.rs`, Fix B in `emit.rs`.

## Fix A — #424: retire the stale C205 hard error

C205 rejected a plain `@state` `const`/`let` that reads a `$prop`, on the premise
that the prop shadow (`const <name> = ctx.props.<name>`) is emitted AFTER the plain
body. Issue #279 hoisted prop bindings ABOVE the plain body (`emit.rs`,
`emit_prop_bindings` at ~L3195 precedes `plain_body` at ~L3224), so that construct
now compiles correctly — C205 was rejecting valid code.

Files changed:
- `packages/compiler/src/lib.rs` — deleted the C205 emission block (the
  `find_plain_const_prop_read` gate + the `CompileError` it returned). Replaced with
  a comment documenting the retirement and why the hoist makes the construct safe.
- `packages/compiler/tests/cross_block_decls.rs` — removed the rejection-locking test
  `bug8_plain_const_reading_prop_is_c205`; added two bidirectional tests:
  - `issue424_plain_const_reading_prop_now_compiles` — the exact construct C205
    rejected (`const cls = active() ?? ''` over `$prop active`) now compiles clean.
  - `issue424_prop_binding_is_emitted_before_plain_body` — emits the JS and asserts
    `const active = ctx.props.active` appears BEFORE `const cls =`, proving the #279
    hoist is what makes it safe (not merely that the diagnostic was deleted).
  - Retained does-not-over-reach guards: `bug8_computed_form_compiles_clean`,
    `bug8_const_reading_prop_inside_action_is_not_c205`,
    `bug8_plain_const_not_reading_prop_compiles`.
- Four docs pages updated (stale "throws at runtime / C205" claim → "compiles; the
  getter is hoisted; prefer `$computed` for *reactivity*, not for compilation"):
  `docs/site/authoring-components.md`, `docs/site/migration.md`, and their
  `apps/docs/src/content/docs/` mirrors. Removed the C205 row from the migration
  diagnostic quick-reference tables.
- `TODOS.md` — marked the C205 entry DONE.

What I verified is still safe (does-not-over-reach):
- Props read inside a `$action`/`$computed`/effect thunk were ALWAYS lazy (read after
  the shadow is bound) and were never C205 — still compile, still safe. The
  `bug8_const_reading_prop_inside_action_is_not_c205` test continues to pass.
- The only construct C205 diagnosed was "plain `@state` const/let whose initializer
  reads a `$prop`." The #279 hoist emits every prop getter above the entire plain
  body, so there is no residual TDZ-unsafe case the guard was protecting — nothing
  genuinely unsafe was made diagnosable by C205, so deleting it removes no real
  protection. The Defect-A ordering invariant (plain_body precedes macro_code so
  effect/onMount closures don't TDZ on state vars) is a SEPARATE guard in emit.rs and
  is untouched.
- The `find_plain_const_prop_read` helper in `codegen/signals.rs` is left in place: it
  is a `pub fn` (no dead-code warning), its own unit tests still pass, and it is simply
  no longer wired into the pipeline. `signals.rs` was not edited (kept out of scope).

## Fix B — #426: `$afterNavigate` / `$beforeNavigate` fragment leaked into plain_body

Symptom: `examples/hacker-news/src/pages/item/[id].aihu` emitted invalid JS — a
`$afterNavigate((to) => { … })` whose call head was gone, leaving a dangling `})`;
the last `parse`-stage failure in `check:emit-parses`.

Root cause: the *lowering* branch (`StateMacro::AfterNavigate` at emit.rs ~L2554) is
correct and emits `__aihuRouter.__router_registerAfterGuard(<expr>)` fine. The bug was
in the plain-body extraction loop (emit.rs ~L1815, `if line.starts_with('$')`), which
strips recognized `@state` macros out of the raw script. It recognizes collection
macros (incl. `$lifecycle`) and `$effect.on`/`$watch`, skipping their FULL body span —
but the router *call* macros (`$afterNavigate(...)` / `$beforeNavigate(...)`) matched
none of those arms, so only their first line was skipped (`i = nl + 1`) and the rest of
the multi-line callback body + its closing `})` leaked into `plain_body` as dangling
JS. (Meanwhile the correct lowering also emitted from `macro_code`, so the callback
appeared twice — once broken, once correct.)

Files changed:
- `packages/compiler/src/codegen/emit.rs` — in the plain-body macro-skip loop only,
  added `is_router_call_macro` (detects `beforeNavigate(` / `afterNavigate(`) and a
  handling branch that skips past the matching `)` (via `find_paren_close`, spanning any
  multi-line callback) plus an optional trailing `;`/newline. This mirrors how the
  collection/preserved forms already skip their full span, so no callback fragment
  reaches plain_body. The `StateMacro::AfterNavigate`/`BeforeNavigate` lowering branch
  was NOT modified.

Verified does-not-over-reach:
- `$lifecycle.mount` callbacks and normal `$action` bodies emit byte-identical to
  pre-fix — they were already recognized/skipped by the existing collection-macro arm;
  the new branch only fires for the `$beforeNavigate(`/`$afterNavigate(` call form.
  Confirmed by the full compiler suite + `check:emit-parses` compile count staying at 11.

## Measured verification (fresh debug build, `cargo build --bin aihu-compile` clean)

- `cargo test -p aihu-compiler`: **837 passed, 0 failed** (0 ignored). The brief cited
  835 on main; net test delta from this branch is +1 (removed 1 C205-lock test, added 2
  issue424 tests), so the measured absolute is 837.
- `bun run check:emit-parses`: **12 → 11 failures**. Parse stage **1 → 0** (Fix B fixed
  the item/[id].aihu parse failure). Compile stage **unchanged at 11** (those are #425's
  stale-syntax fixtures, not in scope here).
- 5 invariants — all **0 findings / exit 0**: `check:derived`, `check:governed`,
  `check:attributed`, `check:dual-audience`, `check:hydration-adoption`.
  (These need `node_modules`; the fresh worktree had none, so I ran
  `bun install --frozen-lockfile` — `git status` confirms `bun.lock` is UNCHANGED.)

## Deviations / notes

- No release mechanics performed: no platform-binary version bumps, no `bun.lock` edits,
  no README regen, no `.size-limit.json` changes. Only code + tests + docs + manifest.
- `bun install --frozen-lockfile` was required to run the TS-based invariants (deps were
  never installed in the fresh worktree). It populates `node_modules` (gitignored)
  without modifying the committed lockfile — verified.
- Pre-existing warning `unused_assignments` at emit.rs:1773 (`stripped_export_line`) is on
  `main`, not introduced here; left untouched.
