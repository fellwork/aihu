# CO1 — `$prop` write rewriting: build manifest

**Slice:** CO1 · **Branch:** `fix/prop-write-rewrite` · **Base:** `2bd00b04`
**Spec:** `docs/plans/co1-prop-write-rewrite/architecture-spec.md` (implemented, not redesigned)
**Status:** DONE — all 9 spec §7 steps landed green.

---

## 1. Baseline, reproduced

Rebuilt from a pristine worktree at `2bd00b04` before touching anything, per the
binary-hygiene trap (`target/release` was older than `target/debug`; this harness
uses fixed precedence where `check-emit-parses` uses newest-wins).

```
$ cargo build --bin aihu-compile
$ cargo run -q --bin aihu-compile -- --stdin --tag aihu-counter \
      --path cookbook/aihu-counter.aihu < cookbook/aihu-counter.aihu

  const count = ctx.props.count

  function increment() { return batch(() => { count++ }) }
  function decrement() { return batch(() => { count-- }) }
  function reset() { return batch(() => { count = 0 }) }
```

Three assignments to a `const` — `TypeError: Assignment to constant variable` on
first click. Matches spec §1 exactly.

**After CO1, same command:**

```
  const count = ctx.props.count

  function increment() { return batch(() => { count.set(count() + 1) }) }
  function decrement() { return batch(() => { count.set(count() - 1) }) }
  function reset() { return batch(() => { count.set(0) }) }
```

The §4.5 inline fast path: statement position + numeric-literal `default:` prove
`ToNumeric` is identity, so the headline fixture never loads `__aihu_prop_upd`.

---

## 2. Files changed

| File | Δ | What |
|---|---|---|
| `packages/compiler/src/expr/prop_write.rs` | **new**, 1131 | oxc visitor, scope stack, span splice, the §4.4 case table, 33 unit tests |
| `packages/compiler/src/expr/mod.rs` | +8 | re-export under the `src/expr/` oxc containment boundary |
| `packages/compiler/src/lib.rs` | +99 | `validate_prop_writes` — C560/C561 at the `compile_full` error boundary |
| `packages/compiler/src/codegen/emit.rs` | +119/−6 | `collect_prop_write_targets`; wire Action/Lifecycle/Effect; lazy helper emission |
| `packages/compiler/tests/prop_write_rewrite.rs` | **new**, 183 | §8.2 integration over the real fixtures + diagnostics |
| `packages/compiler/tests/prop-write-drive.test.ts` | **new**, 232 | §8.3 jsdom runtime drive |
| `docs/domain-hints/prop-read-form.md` | rewritten §§ | §2.3 stale-TDZ correction + new write-form matrix |
| `TODOS.md` | 2 entries | CO1 entry closed with corrected file set; `$afterNavigate` filed separately |

`emit.rs` sees only `String → String`; no oxc type crosses out of `src/expr/`.

---

## 3. Acceptance criteria — cited verbatim, measured

> **cookbook/aihu-counter.aihu compiles AND increment/decrement/reset mutate state
> without throwing. DRIVE IT — spec §8.3: compile, load, mount in jsdom, click. Do
> not merely compile.**

**PASS.** `packages/compiler/tests/prop-write-drive.test.ts`, modelled on
`packages/agent-server/tests/headless-compiled-dispatch.test.ts`. Compiles the real
cookbook file with the freshly built binary, loads the emitted module (registering
the custom element), mounts into jsdom, and clicks through the shadow root:

```
0 → [+] → 1 → [+] → 2 → [−] → 1 → [Reset] → 0     window 'error' listener: []
```

3 tests passed. **Proven falsifying:** re-run with `AIHU_COMPILE_BIN` pointed at
the pre-CO1 binary, 2 of 3 fail — the counter never leaves `0` because the click
throws. (The third is the over-application negative control, which correctly
passes in both directions: pre-CO1 nothing is ever rewritten.)

> **check:emit-parses parse-stage 4 → 0; compile-stage stays 12.**

**PASS on substance, with a corrected baseline — see §5.** Measured by parsing the
script's own `(parse)`/`(compile)` lines, both binaries built fresh:

| Stage | Baseline (`2bd00b04`) | After CO1 |
|---|---|---|
| `(parse)` | **5** | **1** |
| `(compile)` | **11** | **11** |
| total | 16 | 12 |

All 4 CO1-attributable parse failures cleared: `cookbook/aihu-counter`,
`cookbook/aihu-modal`, `cookbook/ssr-hydration`, `examples/_shared/macro-test`.
The 1 remaining parse failure is `examples/hacker-news/.../[id].aihu` — the
`$afterNavigate` bug, out of scope by founder decision, now filed in `TODOS.md`.
Compile stage untouched at 11; those are CO3's v2-migration errors.

> **cargo test -p aihu-compiler >= 775 passing, 0 failures.**

**PASS.** Baseline measured at **775 passed / 0 failed**; after CO1 **818 passed /
0 failed** (+43: 33 unit, 10 integration).

> **BIDIRECTIONAL with named samples: must fire on all 5 in-scope components, must
> NOT fire on a shadowed local sharing a prop's name. Spec §8.1 names 13 must-fire
> and 13 must-NOT-fire tests — implement them by those names.**

**PASS.** All 26 implemented under their spec names, plus the 4 named error tests.

- **Must fire (13):** `simple_assignment_statement`, `simple_assignment_expression_position`, `compound_arithmetic_all_operators`, `compound_bitwise_and_shift_all_operators`, `logical_assignment_short_circuits`, `postfix_increment_statement_numeric_default_inlines`, `postfix_increment_expression_position_uses_helper`, `prefix_increment_returns_new_value`, `postfix_increment_returns_old_value`, `decrement_forms`, `nested_closure_write_is_rewritten`, `write_inside_if_and_try_is_rewritten`, `async_body_with_await_is_rewritten`
- **Must NOT fire (13):** `shadowed_by_action_param_is_not_rewritten`, `shadowed_by_block_let_is_not_rewritten`, `shadowed_by_nested_arrow_param_is_not_rewritten`, `shadowed_by_catch_param_is_not_rewritten`, `hoisted_var_shadow_is_not_rewritten`, `member_base_obj_dot_prop_is_not_rewritten`, `prop_member_write_is_not_rewritten_but_warns`, `plain_let_state_is_not_rewritten`, `computed_signal_is_not_rewritten`, `reads_are_byte_identical`, `regex_literal_is_not_corrupted`, `template_literal_and_string_contents_untouched`, `ts_type_named_like_prop_is_not_rewritten`
- **Errors (4):** `array_destructuring_target_is_C560`, `object_destructuring_target_is_C560`, `for_of_target_is_C560`, `write_in_computed_is_C561`
- **Fires on the real components (§8.2):** all 5, by named test.

---

## 4. Over-application guard — negative-control sweep, re-derived

Compiled **every** `.aihu` in the repo with the pre-CO1 and post-CO1 binaries and
diffed the emits byte-for-byte (`find . -name '*.aihu'`, excluding `node_modules`
and `target`):

```
BYTE-IDENTICAL: 102
DIFFERENT:        6
BOTH-FAILED:     43   (pre-existing compile failures, unchanged either way)
```

I re-derived this rather than reusing the prior run's reported "78 out-of-scope
files byte-identical". The shape matches; the count differs because that sweep
used a narrower glob than a full-repo `find`. The load-bearing fact is the same:
**only files that actually write a `$prop` changed at all.**

Reads are byte-identical by construction — the visitor inspects only
`AssignmentExpression.left` and `UpdateExpression.argument` — and this is pinned
by `reads_are_byte_identical`.

---

## 5. Deviations from the spec / brief, with justification

**(a) The brief's parse/compile baseline numbers were wrong; the substance was not.**
The brief (inheriting spec §1.2's table) said "parse 4 → 0, compile stays 12". The
measured baseline is **5 parse / 11 compile**, not 4/12. §1.2 lists 4 parse failures
"attributable to CO1" and then names `hacker-news` as a 5th parse failure *not*
attributable — so its own total of 4 was a miscount, and the "12" was the total of
non-CO1 failures (1 parse + 11 compile), not the compile stage alone.

Nothing about the goal changes: all 4 CO1-attributable parse failures cleared, the
non-CO1 residue is exactly 12 and untouched. I did not adjust any code to chase the
literal numbers — I measured both stages from a pristine `2bd00b04` build and report
what they are. Flagging because a Verifier checking "compile == 12" against the
script's compile stage will read 11 and must not treat that as a regression.

**(b) A sixth affected file, outside the founder's scope list.**
`packages/templates/cf-team/template/apps/web/src/components/live-counter.aihu`
also changed. It is a genuine instance of the same defect — wrapped `handler:`
form, `count++`/`count--`/`count = 0` on a numeric-default prop — fixed correctly
via the same fast path. It was missed by the spec's §2 survey because it lives
under `packages/templates/` and is outside the `check:emit-parses` glob. This is
not a scope expansion: no rule was widened, the survey was just incomplete. The
CLI test that compiles the cf-team templates (`scaffold-compile-clean`) passes.

**(c) `AIHU_COMPILE_BIN` env override added to the drive test.**
Not in the spec. Added so the drive test can be pointed at a pre-CO1 binary to
demonstrate it actually fails there — a drive test that cannot be falsified proves
nothing. Defaults to the documented fixed-precedence search when unset.

**(d) jsdom `CSSStyleSheet` stub is unconditional.**
The spec's model test uses `jsdom.window.CSSStyleSheet ?? class {}`. That fallback
never fires: jsdom *defines* `CSSStyleSheet` but its constructor is unusable and it
has no `replaceSync`, which the emit calls whenever the SFC has an `@style` block.
Installed unconditionally.

**(e) `todo-mvc.expected.aihu` remains broken after CO1 — intended, per spec §2.2.**
`todos.set([...todos, …])` still spreads the getter function on the read side.
That is the separate bare-read defect; CO1 must not touch reads. Pinned by an
explicit assertion in `todo_mvc_action_lowers_to_set`.

---

## 6. Still open — implemented as the spec states, flagged provisional

These are **not resolved by this build**. The spec's stated choice is implemented;
the decision belongs to the Director (spec §10 items 4, 5, 7).

1. **C561 severity — currently a hard error.** A prop write inside
   `$computed`/`$resource` fails the build. No in-repo component does this, so
   nothing regressed, but it is a behavior change for any downstream component
   that does. Downgrading to a warning is a one-line change in
   `validate_prop_writes`.
2. **`count.foo = x` — currently warn-don't-rewrite** (`W-prop-member-write`,
   emitted to stderr). Rewriting it would mean rewriting a *read*
   (`count().foo = x`), which is outside the ratified decision. The warning has no
   structured diagnostic code path yet — it is a bare `eprintln!`, unlike C560/C561.
3. **DE5 factoring — not done.** The synthetic-wrapper parse
   (`{async }function __aihu_pw(<params>) { <body> }` + span splice) is the natural
   shared primitive for DE5's handler parsing, but it is still private to
   `prop_write.rs`. Left unfactored deliberately: factoring against an unwritten
   consumer would be speculative, and the extraction is mechanical once DE5 has a
   concrete shape.

---

## 7. Full verification log

| Check | Result |
|---|---|
| `cargo build --bin aihu-compile` | clean (1 pre-existing unrelated warning) |
| `cargo test -p aihu-compiler` | **818 passed, 0 failed** (baseline 775/0) |
| `bun scripts/check-emit-parses.ts` | parse **5 → 1**, compile **11 → 11** |
| `vitest run packages/compiler/tests/prop-write-drive.test.ts` | **3 passed** |
| `vitest run` (full JS suite) | 2140 passed, 13 skipped, 3 failed |
| Full-repo emit diff vs `2bd00b04` | 102 byte-identical, 6 changed (all genuine) |

**On the 3 full-suite failures — none are CO1's.** Two
(`scaffold-and-compile`, `scaffold-css-flags`) are 5-second cold-start timeouts
under full-suite parallelism; both pass on re-run with `--testTimeout=120000`
(9 passed). The third (`css-engine/tests/resolve-binary.test.ts`) asserts the
presence of a binary built by `cargo build --release -p aihu-css-core`, which was
never built in this worktree; its own failure message says so.
