# CO1 — `$prop` write rewriting: architecture spec

**Slice:** CO1 · **Branch:** `fix/prop-write-rewrite` · **Layer:** implementation spec (downstream of `docs/architecture/thesis.md`)
**Status:** ratified design, not yet built. Founder decision (do not re-litigate): **rewrite to `.set()`**.

> Authored by the CO1 Architect (read-only agent); committed by the Team Lead on its behalf.

---

## 1. The defect, reproduced

`$prop` entries lower to a body-side binding emitted by `emit_prop_bindings` (`emit.rs:2559`):

```rust
lines.push(format!("{indent}const {name} = ctx.props.{name}"));
```

`ctx.props.<name>` is a **callable getter carrying a `.set` writer** (`packages/runtime/src/define-component.ts:422`):

```ts
const ps = (() => get()) as PropSignal
ps.set = (v: unknown): void => { set(v); /* + reflect */ }
```

`$action` bodies are spliced **verbatim** into the emitted function (`emit.rs:2207`), so an authored write emits an assignment to a `const`.

Actual emitted output:

```js
  const count = ctx.props.count

  function increment() { return batch(() => { count++ }) }
  function decrement() { return batch(() => { count-- }) }
  function reset() { return batch(() => { count = 0 }) }
```

All three throw `TypeError: Assignment to constant variable` on first click. Identical under `--target server`, so one fix covers both.

### 1.1 `check:emit-parses` already detects this class

Bun's transpiler rejects const assignment at parse time — verified:

```
constAssign  FAIL: Cannot assign to "c" because it is a constant
constIncr    FAIL: Cannot assign to "c" because it is a constant
setForm      OK      // const c = { set(v){} }; c.set(2)
shadowed     OK      // const c = 1; function f(){ let c = 1; c++ }
```

Note the last row: a wrongly-rewritten shadowed local produces `.set` on a number, **passes parse, and fails only at runtime**. Parse-check alone is insufficient; §8 requires the drive test.

### 1.2 Verified baseline (fresh `target/debug`)

| Signal | Value |
|---|---|
| `cargo test -p aihu-compiler` | **775 passed, 0 failed** |
| `bun scripts/check-emit-parses.ts` | 16/59 fail: **4 `(parse)`**, 12 `(compile)` |
| `(parse)` attributable to CO1 | `cookbook/aihu-counter`, `cookbook/aihu-modal`, `cookbook/ssr-hydration`, `examples/_shared/macro-test` |
| `(parse)` **not** attributable to CO1 | `examples/hacker-news/src/pages/item/[id].aihu` (§2.1) |

> **Binary hygiene.** `target/release` is dated Jul 17; `target/debug` Jul 19. `check-emit-parses.ts:37-52` picks the **newest** deliberately, but `headless-compiled-dispatch.test.ts:46` and the Vite plugin use **fixed precedence**. Rebuild before every verification pass.

---

## 2. Scope: the true affected set

Method: compiled every `.aihu` in the repo, extracted `const X = ctx.props.X` names from each emit, then scanned that emit for a write to `X` at a non-member position.

| # | File | Prop(s) | Macro | Authored form |
|---|---|---|---|---|
| 1 | `cookbook/aihu-counter.aihu` | `count` | `$action` | `count++`, `count--`, `count = 0` |
| 2 | `cookbook/aihu-modal.aihu` | `open` | `$action` | `open = true`, `open = false` |
| 3 | `cookbook/ssr-hydration.aihu` | `greeting`, `name` | **`$lifecycle.mount`** | `greeting = el.dataset.ssrGreeting` |
| 4 | `examples/_shared/macro-test.aihu` | `hue`, `saturation`, `lightness` | `$action` (**wrapped `handler:` form**, TS-typed params) | `hue = h` |
| 5 | `packages/compiler/tests/codemods/fixtures/todo-mvc.expected.aihu` | `todos`, `filter` | `$action` **and** `$lifecycle.mount` | `todos = [...todos, …]`, `filter = f` |

Not affected: `cookbook/agent-weather.aihu` (regex false positive on `?city=`), `apps/storybook/*` (CSS attribute selectors in `@style`).

### 2.1 ⚠️ Correction to the brief — hacker-news is a different defect

The brief listed `[id].aihu` as CO1-affected. **It writes no prop.** Its `(parse)` failure delta-debugs to line 92 of the emit:

```js
88:     // arch-5 M1: post-navigation analytics — runs after each successful nav.
89:       if (typeof window !== 'undefined' && (window as any).analytics?.pageview) {
90:         (window as any).analytics.pageview(to.pathname)
91:       }
92:     })          // ← dangling: `$afterNavigate((to) => {` head was stripped
```

`$afterNavigate(…)` loses its call head and arrow prefix. **File separately; do not attach to CO1.** Substituting it into CO1's acceptance set would make the slice unfalsifiable — you'd chase a router-macro bug under a prop-write brief.

### 2.2 What CO1 does *not* fix in todo-mvc

`todos = [...todos, {…}]` becomes `todos.set([...todos, {…}])` — **still broken**, because the RHS read `...todos` spreads the getter *function*. That is the separate bare-read defect in `docs/domain-hints/prop-read-form.md`. CO1 must not touch reads (§4.9). Assert `filter.set(f)` for this fixture; note the read defect as out of scope.

### 2.3 `prop-read-form.md` is stale — corrected

The hint records the `$prop` TDZ as "defect #3, unfixed". **It is fixed.** #279 hoisted prop bindings above `plain_body` (`emit.rs:3086`), verified in the ssr-hydration emit. The rest of the matrix still holds. Update as part of CO1.

---

## 3. Parser mode — `ExprParserMode` is the wrong axis

**The rewrite does not run under `ExprParserMode` at all, and must not be gated on it.**

`src/expr/mod.rs` governs **template expressions only** — `{expr}`, `$attr={…}`, `{#if}` heads, `{#each}` lists. `$action`/`$lifecycle`/`$effect` bodies never enter that pipeline; they are raw strings routed from `parse_state_macros` into `emit_state_macro_code`. So `--expr-parser ast` is orthogonal.

**oxc is an unconditional dependency**, already used unconditionally by `src/expr/harvest.rs` (*"Always-on … not flag-gated"*). CO1 uses oxc on the same footing.

- The rewrite **is** AST-based (oxc `=0.139.0`).
- Under `ExprParserMode::Legacy` (still default) the rewrite is **identical**. No fallback path, no divergence, **no silently-wrong mode**.
- **A string/token scanner is rejected.** `[id].aihu` contains `new URL(u).hostname.replace(/^www\./, '')` — a regex literal a scanner corrupts. `cookbook/*` contains template literals with `${…}` holes.

**Containment.** `src/expr/rewrite.rs` establishes the rule: all oxc types stay inside `src/expr/`. CO1 adds `src/expr/prop_write.rs` under that boundary. `emit.rs` sees only `String → String`.

---

## 4. The transform

### 4.1 Named interface

```rust
// packages/compiler/src/expr/prop_write.rs   (oxc contained here)

/// Names declared by `$prop:` in this component. NOT the SignalMap — §6.1.
pub struct PropWriteTargets<'a> {
    /// prop name -> true when the entry's `default:` is a numeric literal
    /// (drives the §4.5 inline fast path).
    pub props: &'a std::collections::HashMap<String, bool>,
}

/// Rewrite writes to `$prop` bindings inside one macro body.
///
/// `body`     — macro body text as authored (post-`arrow_body`, pre-`$announce`).
/// `params`   — the enclosing arrow's params from `arrow_args`; seeds the
///              outermost shadow frame (§4.6 — primary over-application guard).
/// `is_async` — from `arrow_is_async`; parses the wrapper as async so `await`
///              in the body is not a syntax error.
///
/// `Ok(None)` = no prop write found; caller splices `body` unchanged (byte-identical).
/// `Err`      = C560/C561 diagnostic (§4.7, §5).
pub fn rewrite_prop_writes(
    body: &str,
    params: &str,
    is_async: bool,
    targets: &PropWriteTargets<'_>,
) -> Result<Option<PropWriteResult>, crate::types::CompileError>;

pub struct PropWriteResult {
    /// Body with writes rewritten. Byte-identical outside edited spans.
    pub source: String,
    /// True when any emitted form calls `__aihu_prop_upd`; the emitter lazily
    /// declares the helper once per module (§4.5).
    pub needs_update_helper: bool,
}
```

### 4.2 Parse strategy — a synthetic function wrapper

A macro body is a **statement list**, not an expression, so `parse_expression` does not apply. Wrap and parse as a Program with `SourceType::ts()`:

```
{async }function __aihu_pw(<params>) {
<body>
}
```

Three things fall out free:

1. **Params become real bindings**, shadowed by oxc's scope model — no hand-rolled param collection, which is exactly where the legacy scanner over-collected.
2. `return` and `await` parse legally.
3. TS-typed params (`(h: number)`, `(f: 'all' | 'active' | 'completed')`) parse — required by macro-test and todo-mvc.

**Span mapping.** `prefix_len = len(wrapper head)`. Discard edits with `offset < prefix_len` or `offset >= prefix_len + body.len()`. Splice surviving edits into the **original** body by byte offset, as `expr/rewrite.rs:118-134` does. Nothing is reprinted from the AST; comments, strings, multibyte glyphs survive verbatim.

**Parse failure → `Ok(None)`, splice unchanged.** Emit must never panic on a body the parser can't model. Strictly non-regressive.

### 4.3 Which macros are rewritten

| Macro | Rewritten? | Rationale |
|---|---|---|
| `$action` | **Yes** | Fixtures 1, 2, 4, 5. Imperative position. |
| `$lifecycle` (all four callbacks) | **Yes** | Fixtures 3, 5. `attributeChange` passes its own `arrow_args`. |
| `$effect` | **Yes** | Imperative position; no fixture yet, but legitimate. |
| `$computed`, `$resource` | **No — hard error C561** | Declared-derivation position. A write there is a category error. |
| `$stream`, `$controller`, `$aria`, `$form`, `$event` | No | No spliced author statement body. |
| `@state` plain body | No | §6.3 |

The `$computed`/`$resource` carve-out would otherwise mean "the same authored line means different things in different macros" — the confusion the thesis forbids. **C561 converts that into a loud diagnostic**, moving today's runtime `TypeError` to compile time.

### 4.4 Per-case transform table

`count` is a `$prop`. **Statement position** = the write is the whole `ExpressionStatement`. **Expression position** = anywhere else.

| # | Authored | Position | Emitted | Return preserved |
|---|---|---|---|---|
| A1 | `count = 5` | stmt | `count.set(5)` | n/a |
| A2 | `count = 5` | expr | `(count.set(5), count())` | ✅ |
| B1 | `count += 1` | stmt | `count.set(count() + 1)` | n/a |
| B2 | `count -= 2` | stmt | `count.set(count() - 2)` | n/a |
| B3 | `*= /= %= **=` | stmt | `count.set(count() * rhs)` etc. | n/a |
| B4 | `&= \|= ^= <<= >>= >>>=` | stmt | `count.set(count() & rhs)` etc. | n/a |
| B5 | any compound | expr | `(count.set(count() OP rhs), count())` | ✅ |
| C1 | `count \|\|= rhs` | any | `(count() \|\| (count.set(rhs), count()))` | ✅ |
| C2 | `count &&= rhs` | any | `(count() && (count.set(rhs), count()))` | ✅ |
| C3 | `count ??= rhs` | any | `(count() ?? (count.set(rhs), count()))` | ✅ |
| D1 | `count++` | stmt, numeric `default:` | `count.set(count() + 1)` | n/a |
| D2 | `count--` | stmt, numeric `default:` | `count.set(count() - 1)` | n/a |
| D3 | `count++` | otherwise | `__aihu_prop_upd(count, 1, false)` | ✅ old value |
| D4 | `++count` | any | `__aihu_prop_upd(count, 1, true)` | ✅ new value |
| D5 | `count--` / `--count` | otherwise | `__aihu_prop_upd(count, -1, false/true)` | ✅ |
| E1 | `[count] = arr` | any | **C560 error** | — |
| E2 | `({ count } = obj)` | any | **C560 error** | — |
| E3 | `for (count of/in …)` | any | **C560 error** | — |
| F1 | `obj.count = x` | any | unchanged | — |
| F2 | `count.foo = x` | any | unchanged + **W-prop-member-write** | — |
| G1 | `count()`, bare `count` | any | unchanged | — |
| H1 | `count = 5`, `count` shadowed | any | unchanged | — |

**C1–C3 preserve short-circuiting.** Naive `count.set(count() || rhs)` evaluates `rhs` unconditionally *and* writes on every call, firing reactivity where the language specifies no assignment. `count()` is a pure getter, so calling it twice is free.

**B1–B5 are exact.** `a OP= b` is defined as `a = a OP b` with no coercion step, so string concatenation is covered.

### 4.5 `++`/`--` — the ToNumeric problem

`x++` is **not** `x = x + 1`. It is `x = ToNumeric(x) + 1`, returning the *old numeric* value. A `$prop` can genuinely hold a string: `type:` is **discarded** by the emitter —

```
$prop: { a: { type: Number }, b: { type: Number, default: 0 } }
→  props: { a: {}, b: { value: 0 } }
```

— and `_convert` (`define-component.ts:608`) dispatches on `typeof fallback`. With no `default:`, `fallback` is `undefined`, so an attribute falls through to `JSON.parse`; anything non-JSON (`"05"`, `"3px"`) yields a string. On such a prop, `count++` must store `6` but the naive rewrite stores `"51"`.

Hence the lazily-emitted module-level helper (following `__aihu_conv` / `createSlotBoundary` precedent):

```js
const __aihu_prop_upd = (s, d, n) => {
  const o = s();
  const c = typeof o === 'bigint' ? o : Number(o);
  const v = c + (typeof c === 'bigint' ? BigInt(d) : d);
  s.set(v);
  return n ? v : c;
};
```

One call form covers prefix/postfix and both positions — no position analysis for D3–D5.

**The D1/D2 inline fast path** fires only when **both** hold: (a) `ExpressionStatement` position, so the return value is provably discarded; and (b) the `$prop` declares a numeric-literal `default:`, so `ToNumeric` is provably identity. `aihu-counter` satisfies both, so the headline fixture emits the clean form with no helper:

```js
function increment() { return batch(() => { count.set(count() + 1) }) }
function decrement() { return batch(() => { count.set(count() - 1) }) }
function reset()     { return batch(() => { count.set(0) }) }
```

### 4.6 Shadowing — the primary over-application guard

Three shadow sources, all handled by oxc's scope stack (`enter_scope`/`leave_scope`/`visit_binding_identifier`, per `expr/rewrite.rs:158-179`):

1. **The action's own parameters.** Verified: `param: (count) => { count = 5 }` lowers to `function param(count) { return batch(() => { count = 5 }) }` — already correct. **The shadow lives outside the body text, in `arrow_args`.** This is why §4.2's wrapper must include `<params>`; a transform parsing the body alone silently corrupts this case.
2. **Block-scoped locals.** `{ let count = 1; count++ }` — no rewrite.
3. **Nested function/arrow params.** `const f = (count) => { count = 0 }; count = 2` — first untouched, second rewritten.

**Non-shadow, must rewrite:** `[1,2].forEach(n => { count += n })` — closure param is `n`; `count` resolves outward.

**Two known scope-model limits** (document, don't paper over):

- `count = 5; let count = 1;` — write precedes the binding, so the visitor rewrites it. **This is a TDZ `ReferenceError` in real JS regardless**, so no working program changes behavior.
- `var`/function-declaration hoisting: `count = 5; var count;` — same reasoning, but `var` makes it legal. **Mitigation:** pre-pass the wrapper's function scope for `var`/function-decl bindings and seed the frame before walking. Cheap; do it. Covered by `hoisted_var_shadow_is_not_rewritten`.

### 4.7 Destructuring targets — the one genuinely unsound rewrite

`[count] = arr` and `({ count } = obj)` are **C560**, not a rewrite. Surfacing rather than silently narrowing:

- A sound desugar needs a temporary: `{ const [__t0] = arr; count.set(__t0) }`. `arr` may be any iterable, so `arr[0]` is **not** equivalent.
- A block statement cannot be spliced into expression position, and this emitter has no statement-splitting facility.
- Zero fixtures use the form.
- Doing nothing emits the exact defect under repair.

C560 is loud, correct, and carries a fix hint. A statement-position-only desugar is a clean Phase 2 follow-on if demand appears.

### 4.8 Member and computed access

- `obj.count = x` — target is a `MemberExpression`, never a candidate. Falls out of `visit_simple_assignment_target` by construction; no heuristic. (A string scanner needs a bracket stack and still gets it wrong.)
- `count.foo = x` where `count` **is** a prop — **unchanged**, plus `W-prop-member-write`. It is not an assignment to the prop binding but a member assignment; today it sets a property on the getter *function object* — almost certainly unintended, but rewriting to `count().foo = x` is a **read** rewrite, excluded by the founder's decision. Warning, not error: legal JS that doesn't throw, and erroring would break a form no fixture uses.
- `count[k] = x` — same treatment.

### 4.9 Reads are untouched — hard invariant

`count()` and bare `count` both pass through **byte-identical**. The visitor inspects only `AssignmentExpression.left` and `UpdateExpression.argument`. Rows B/C/D introduce `count()` **only inside the value expression they synthesize** — never at an author read site. Enforced by `reads_are_byte_identical`.

This is also why `todo-mvc.expected.aihu` remains broken after CO1 (§2.2) — correct and intended.

### 4.10 Async bodies and `batch()`

Async lowering (`emit.rs:2225`) emits `async function name(args) { … }` with **no** batch wrapper. CO1 changes nothing here; the rewrite operates on the body **before** either wrapper:

- **Sync:** `.set()` calls land inside `batch(() => { … })` — all writes in one action coalesce into a single flush. Strictly better than today.
- **Async:** unwrapped; each `.set()` flushes individually — pre-existing semantics.
- **Nested closures:** `setTimeout(() => { count++ })` runs after the batch drains; `.set()` outside a batch works normally.

**Read-after-write inside a batch is safe.** `packages/signals/src/batch.ts`: *"every signal write defers subscriber **notification** … instead of firing synchronously."* The value is stored immediately, so two `count.set(count() + 1)` in one batch increment twice. Load-bearing for rows B and D — cover with `double_increment_in_one_batch_increments_twice`.

### 4.11 Ordering against the `$announce` rewrite

`emit.rs:2213` does `body.replace("$announce(", "__a11y_announce(")` — a raw string replace that invalidates byte offsets. **Run the prop-write rewrite first** (on author text, spans valid), then the `$announce` replace. `$announce` is a legal JS identifier, so oxc parses it without special handling. Lock with `announce_and_prop_write_compose`.

---

## 5. Diagnostics

| Code | When | Message / fix |
|---|---|---|
| **C560** | Destructuring or `for-in`/`for-of` target is a `$prop` | `` cannot destructure into `$prop` `count` — props are written through `count.set(…)`. Write: `count.set(arr[0])` `` |
| **C561** | Assignment/update to a `$prop` inside `$computed`/`$resource` | `` `$computed` bodies are derivations and must not write `$prop` `count`. Move the write to an `$action`, or read with `count()`. `` |
| **W-prop-member-write** | `count.foo = x` where `count` is a `$prop` | `` writes a property on the `count` getter function, not the prop value. Did you mean `count.set({ ...count(), foo: x })`? `` |

Next free codes are C56x (highest in use: C554). Follow the existing rich-diagnostic shape with `hint:` / `fix:` / `replace:` / `with:` lines.

---

## 6. Over-application guards

### 6.1 Use `$prop` names — never `SignalMap`

`process_state_body` (`emit.rs:1638`) registers prop names into `signal_map` alongside real `$computed` entries and lifted `signal()` bindings. **`SignalMap` is the wrong key set.** Use `collect_prop_entries(&macros)` (`emit.rs:2494`).

Verified counterexample — plain `@state` declarations stay writable `let`:

```
@state { let n = 0
         m: number = 5
         $action: { bump: () => { n++; m = 2 } } }
→  let n = 0
   let m: number = 5
   function bump() { return batch(() => { n++; m = 2 }) }
```

Rewriting `n++` would break working code. Guarded by `plain_let_state_is_not_rewritten`.

### 6.2 Named guards, one test each

| Guard | Mechanism |
|---|---|
| Action/lifecycle params | `arrow_args` seeds the outermost frame (§4.2) |
| Block-scoped `let`/`const` | oxc `enter_scope` + `visit_binding_identifier` |
| Nested closure params | same, per nested scope |
| `var` / function-decl hoisting | function-scope pre-pass (§4.6) |
| Member bases (`obj.count`) | `AssignmentTargetIdentifier` discrimination |
| Non-prop signals & plain `let` | key set = `$prop` names only (§6.1) |
| Reads | only `.left` / `.argument` inspected |
| Strings, template literals, regex, comments | span-based splice into original source |
| TS type positions | `visit_ts_type*` suppressions, per `expr/rewrite.rs:246-250` |

### 6.3 `plain_body` is out of scope

Statements written directly in `@state` run at setup time, before any interaction; a prop write there is initialization, which belongs in the prop's `default:`. Rewriting expands blast radius for no fixture.

---

## 7. Implementation sequence

1. `src/expr/prop_write.rs` — visitor + span splice + unit tests. No `emit.rs` change; the whole per-case table is testable in isolation. **Land green here first.**
2. `emit.rs`: collect `$prop` names + numeric-`default:` flags once at the top of `emit_state_macro_code`; thread `PropWriteTargets` in.
3. Wire `CollectionKind::Action` (`emit.rs:2207`) — rewrite before the `$announce` replace, before the batch/async branch.
4. Wire `CollectionKind::Lifecycle` (`emit.rs:2271`) — pass `arrow_args` for `attributeChange`.
5. Wire `CollectionKind::Effect` (`emit.rs:2243`).
6. Lazy `__aihu_prop_upd` emission, threaded like `helpers_needed`.
7. C560 / C561 / W-prop-member-write.
8. Update `docs/domain-hints/prop-read-form.md` (§2.3) — correct the stale TDZ row, add a write-form row.
9. Full verification (§8).

Steps 1–3 alone fix fixtures 1, 2, 4. Step 4 adds 3 and 5. A partial land is safe.

---

## 8. Test plan — named samples, both directions

### 8.1 Unit — `src/expr/prop_write.rs` `#[cfg(test)]`

**Must fire:** `simple_assignment_statement` · `simple_assignment_expression_position` · `compound_arithmetic_all_operators` · `compound_bitwise_and_shift_all_operators` · `logical_assignment_short_circuits` · `postfix_increment_statement_numeric_default_inlines` · `postfix_increment_expression_position_uses_helper` · `prefix_increment_returns_new_value` · `postfix_increment_returns_old_value` · `decrement_forms` · `nested_closure_write_is_rewritten` · `write_inside_if_and_try_is_rewritten` · `async_body_with_await_is_rewritten`

**Must NOT fire:** `shadowed_by_action_param_is_not_rewritten` · `shadowed_by_block_let_is_not_rewritten` · `shadowed_by_nested_arrow_param_is_not_rewritten` · `shadowed_by_catch_param_is_not_rewritten` · `hoisted_var_shadow_is_not_rewritten` · `member_base_obj_dot_prop_is_not_rewritten` · `prop_member_write_is_not_rewritten_but_warns` · `plain_let_state_is_not_rewritten` · `computed_signal_is_not_rewritten` · `reads_are_byte_identical` · `regex_literal_is_not_corrupted` · `template_literal_and_string_contents_untouched` · `ts_type_named_like_prop_is_not_rewritten`

**Errors:** `array_destructuring_target_is_C560` · `object_destructuring_target_is_C560` · `for_of_target_is_C560` · `write_in_computed_is_C561`

### 8.2 Integration — `packages/compiler/tests/prop_write_rewrite.rs`

| Test | File | Assertion |
|---|---|---|
| `cookbook_counter_lowers_to_set` | `cookbook/aihu-counter.aihu` | contains `count.set(count() + 1)`, `count.set(count() - 1)`, `count.set(0)`; contains **no** `count++`, `count--`, `count = 0` |
| `cookbook_modal_lowers_to_set` | `cookbook/aihu-modal.aihu` | `open.set(true)`, `open.set(false)` |
| `ssr_hydration_lifecycle_lowers_to_set` | `cookbook/ssr-hydration.aihu` | `greeting.set(…)`, `name.set(…)`; `hydratedFrom = …` **unchanged** (plain `let`) |
| `macro_test_wrapped_handler_lowers_to_set` | `examples/_shared/macro-test.aihu` | `hue.set(h)`, `saturation.set(70)`, `lightness.set(55)` |
| `todo_mvc_action_lowers_to_set` | `tests/codemods/fixtures/todo-mvc.expected.aihu` | `filter.set(f)`, `todos.set(` |
| `hacker_news_item_is_unchanged_by_co1` | `examples/hacker-news/.../[id].aihu` | emit **byte-identical** to pre-CO1 — the negative control proving CO1 didn't absorb an unrelated defect |
| `server_target_lowers_identically` | `cookbook/aihu-counter.aihu` `--target server` | same three `.set` assertions |

### 8.3 Runtime drive — `packages/compiler/tests/prop-write-drive.test.ts`

**Required by the acceptance criteria: "Drive it — do not merely compile it."** Model: `packages/agent-server/tests/headless-compiled-dispatch.test.ts`. Root `vitest.config.ts` already sets `environment: 'jsdom'`.

1. Compile `cookbook/aihu-counter.aihu` with the freshly built binary.
2. Transpile and import; `defineElement` registers `<aihu-counter>`.
3. Mount into a jsdom host; read `<output class="count">` → `0`.
4. Click `+` → `1`. `+` → `2`. `−` → `1`. `Reset` → `0`.
5. Assert **no** `TypeError` at any step.
6. `double_increment_in_one_batch_increments_twice` — two `count++` in one action advances by 2 (locks the §4.10 invariant).
7. **Over-application drive test:** an SFC with `$prop count` and `$action: { probe: () => { let count = 1; count++; return count } }` returns `2` and leaves the prop at its default.

`describe.skipIf(!HAVE_COMPILER)` fallback, matching the existing harness.

### 8.4 Acceptance criteria — cited verbatim, with measurement

> - cookbook/aihu-counter.aihu compiles AND increment/decrement/reset mutate state without throwing. Drive it — do not merely compile it.
> - `bun run check:emit-parses` reports 0 parse failures across cookbook.
> - `cargo test -p aihu-compiler` >= 773 passing, 0 failures.
> - BIDIRECTIONAL, both directions get named-sample tests: the rewrite must fire on all 5 known-broken components (under-application) AND must NOT fire on a shadowed local sharing a prop's name (over-application).

| Criterion | How measured | Baseline → target |
|---|---|---|
| Counter drives | §8.3 steps 1–5 | throws → passes |
| 0 **parse** failures across cookbook | `bun scripts/check-emit-parses.ts`, count `cookbook/* (parse)` lines | 3 → **0** |
| `cargo test -p aihu-compiler` | summed `test result:` lines | 775/0 → **≥775 + new**, 0 failures |
| Bidirectional | §8.2 + §8.1 must-not-fire + §8.3 step 7 | — |

**⚠️ Read the second criterion precisely: "0 parse failures across cookbook."** CO1 removes all 3 `cookbook/* (parse)` failures and the 4th (`macro-test`). It does **not** make the script exit 0 — 12 `(compile)`-stage failures remain in `examples/`, all v2-migration errors (`C440`, `unknown keyword 'expose:'`, `C107`). Those are **CO3**; the plan sequences `CO1, CO3 ──> CO4`. Do not let a Verifier read this as "the script exits 0" and report BLOCKED, and do not let a Builder chase migration errors under a prop-write brief.

Fixture 5 (`todo-mvc.expected.aihu`) is under `packages/compiler/tests/`, outside the script's glob; §8.2 covers it.

---

## 9. Alternatives considered and rejected

| Alternative | Rejected because |
|---|---|
| **Compile error steering to `$computed`/`signal()`** | Founder-ratified against. Also incoherent: `$prop` already has a writer, and the `expose: { write: true }` path emits `hue.set(v)` two lines below. Erroring on the natural form while emitting `.set()` nearby is contradictory. |
| **Emit `let count = ctx.props.count`** | Silently wrong — the worst outcome. Rebinds a local; the signal is never written; nothing re-renders; nothing throws. |
| **Proxy/accessor object for props** | Requires per-prop accessors on a module-scope object; changes the read form (`count` → `count.value`), breaking every template and the entire `prop-read-form.md` matrix. |
| **String/regex scanner** | Corrupts `/^www\./`, template-literal holes, strings, comments. Cannot see shadowing at all — fails the primary guard by construction. The class of bug `expr/rewrite.rs` was written to retire. |
| **Gate on `ExprParserMode::Ast`** | `ExprParserMode` governs template expressions; macro bodies never enter that pipeline. Gating leaves the shipped default broken. oxc is already unconditional, with `harvest.rs` as precedent. |
| **Naive `count.set(count() + 1)` for all `++`/`--`** | Wrong stored value on non-numeric props and wrong return value in expression position. Kept as the §4.5 fast path only where both are provably safe. |
| **Desugar destructuring with temporaries** | Sound only in statement position; needs statement-splitting the emitter lacks; zero fixture usage. C560 instead. |
| **Rewrite `$computed`/`$resource` too (uniformity)** | Would make a derivation silently mutate state. C561 is loud and moves a runtime `TypeError` to compile time. |
| **Rewrite reads in the same pass** (fixing todo-mvc's `[...todos]`) | Out of scope by founder decision; independently large; changes the documented read-form matrix. Separate slice. |

---

## 10. Open questions for the Director

1. **Scope correction (§2.1).** The brief substituted `hacker-news/.../[id].aihu` (a `$afterNavigate` bug, no prop write) for `todo-mvc.expected.aihu`. Confirm the corrected set; file `$afterNavigate` separately.
2. **`check:emit-parses` criterion (§8.4).** Confirm "0 parse failures across cookbook" means the 3 `cookbook/* (parse)` entries, not script exit 0 — the latter requires CO3.
3. **`$lifecycle` in scope (§4.3).** The brief says action bodies; the evidence says `$lifecycle` too. Confirm, else `ssr-hydration` stays broken.
4. **C561 severity.** Error (spec's choice) or warning? Error is a behavior change for any component doing this today, though none in-repo does.
5. **`count.foo = x` (§4.8).** Spec: warn, don't rewrite. Confirm — the alternative is a read rewrite, outside the ratified decision.
6. **`__aihu_prop_upd` helper.** Accept the lazily-emitted helper for non-fast-path `++`/`--`? One module-level line, only when needed; `aihu-counter` never triggers it.
7. **DE5 coupling.** The plan records `CO1 ──> DE5 (shared handler parsing)`. `prop_write.rs`'s synthetic-wrapper parse is the natural shared primitive — factor for DE5 now, or after CO1 lands green?
