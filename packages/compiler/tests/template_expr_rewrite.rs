//! FEL-172 / FEL-173 — bare reads of reactive getters (props, signals,
//! computeds) inside template EXPRESSIONS must be rewritten to getter CALLS.
//!
//! Props compile to signal getters (`const section = ctx.props.section`), and
//! plain dotted interpolations were already rewritten (`{section.label}` →
//! `(section() as any).label`). But `if` / `each` / `on:*` / attr-binding /
//! complex-interpolation expressions were emitted VERBATIM into thunks, so
//! `if={section.kind === 'prose'}` read `.kind` off the signal FUNCTION —
//! always undefined — and the branch silently never rendered (fellwork-web
//! exegesis-section). FEL-173 is the interpolation face of the same gap:
//! `{count + 1}` stringified the getter function instead of tracking it.

use aihu_compiler::{compile_full, compile_full_with_options, emit, sfc, BuildTarget, ExprParserMode};

fn compile_to_js(source: &str, tag: &str) -> String {
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    emit(&unit, tag).js
}

/// W3 — compile under `--expr-parser ast` (scope-aware AST signal rewrite).
fn compile_to_js_ast(source: &str, tag: &str) -> String {
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full_with_options(&parsed, BuildTarget::Universal, ExprParserMode::Ast)
        .unwrap_or_else(|e| panic!("ast mode rejected fixture: {}", e.message));
    emit(&unit, tag).js
}

/// Compile under `--expr-parser legacy` — the opt-in escape hatch since #485
/// flipped the default to `ast`. The truth-table rows below pin BOTH mode
/// behaviors explicitly.
fn compile_to_js_legacy(source: &str, tag: &str) -> String {
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full_with_options(&parsed, BuildTarget::Universal, ExprParserMode::Legacy)
        .unwrap_or_else(|e| panic!("legacy mode rejected fixture: {}", e.message));
    emit(&unit, tag).js
}

const PROP_STATE: &str = r#"@state {
  $prop: {
    section: { default: null, type: object },
  }
}
"#;

// ─── FEL-172: the exegesis-section repros ─────────────────────────────────────

#[test]
fn fel172_prop_read_in_if_cond_is_rewritten() {
    let src = format!(
        "{PROP_STATE}@template {{\n  <p if={{section.kind === 'prose'}}>prose</p>\n}}"
    );
    let js = compile_to_js(&src, "x-fel172-if");
    assert!(
        js.contains("section().kind === 'prose'"),
        "FEL-172: $if cond must read the prop VALUE (section().kind), got:\n{js}"
    );
    assert!(
        !js.contains("(section.kind"),
        "FEL-172: must not read .kind off the signal function, got:\n{js}"
    );
}

#[test]
fn fel172_prop_read_in_each_list_is_rewritten() {
    let src = format!(
        "{PROP_STATE}@template {{\n  <li each={{it of section.data}}>{{it}}</li>\n}}"
    );
    let js = compile_to_js(&src, "x-fel172-each");
    assert!(
        js.contains("section().data"),
        "FEL-172: $each list must read the prop VALUE (section().data), got:\n{js}"
    );
}

#[test]
fn fel172_explicit_call_workaround_is_not_double_called() {
    // The shipped fellwork-web workaround (`each={it of section().data}`)
    // must keep compiling — the rewrite skips idents already followed by `(`.
    let src = format!(
        "{PROP_STATE}@template {{\n  <li each={{it of section().data}}>{{it}}</li>\n}}"
    );
    let js = compile_to_js(&src, "x-fel172-workaround");
    assert!(
        js.contains("section().data"),
        "explicit-call workaround must survive, got:\n{js}"
    );
    assert!(
        !js.contains("section()()"),
        "FEL-172: must not double-call an explicit getter call, got:\n{js}"
    );
}

#[test]
fn fel172_prop_read_in_handler_body_is_rewritten() {
    let src = format!(
        "{PROP_STATE}@template {{\n  <button on:click={{() => console.log(section)}}>go</button>\n}}"
    );
    let js = compile_to_js(&src, "x-fel172-handler");
    assert!(
        js.contains("console.log(section())"),
        "FEL-172: handler bodies must read prop VALUES, got:\n{js}"
    );
}

#[test]
fn fel172_bare_ident_handler_stays_verbatim() {
    // `on:click={increment}` passes the function itself — not a read.
    let src = r#"@state {
import { signal } from '@aihu/signals'
const [count, setCount] = signal(0)
const increment = () => setCount(count() + 1)
}
@template { <button on:click={increment}>+</button> }"#;
    let js = compile_to_js(src, "x-fel172-bare");
    assert!(
        js.contains("onClick: increment") || js.contains("onclick: increment"),
        "bare-ident handler must stay verbatim, got:\n{js}"
    );
}

#[test]
fn fel172_arrow_param_shadow_is_not_rewritten() {
    // A handler param that shares a signal's name shadows it — the body's
    // reads refer to the param, not the getter.
    let src = r#"@state {
import { signal } from '@aihu/signals'
const [value, setValue] = signal('')
}
@template { <input on:input={(value) => setValue(value)} /> }"#;
    let js = compile_to_js(src, "x-fel172-shadow");
    assert!(
        js.contains("(value) => setValue(value)"),
        "FEL-172: arrow-param shadows must suppress the rewrite, got:\n{js}"
    );
}

#[test]
fn fel172_signal_read_in_setter_arg_is_rewritten() {
    // The classic counter: `on:click={() => setCount(count + 1)}`.
    // `setCount` is a setter (not a getter key) — untouched; `count` is a
    // bare getter read — rewritten.
    let src = r#"@state {
import { signal } from '@aihu/signals'
const [count, setCount] = signal(0)
}
@template { <button on:click={() => setCount(count + 1)}>+</button> }"#;
    let js = compile_to_js(src, "x-fel172-counter");
    assert!(
        js.contains("setCount(count() + 1)"),
        "FEL-172: bare signal read in handler must become a call, got:\n{js}"
    );
}

#[test]
fn fel172_block_if_cond_is_rewritten() {
    let src = format!(
        "{PROP_STATE}@template {{\n  <p if={{section.kind === 'prose'}}>prose</p>\n}}"
    );
    let js = compile_to_js(&src, "x-fel172-blockif");
    assert!(
        js.contains("section().kind === 'prose'"),
        "FEL-172: `if` cond must read the prop VALUE, got:\n{js}"
    );
}

// ─── FEL-173: complex interpolations become reactive ──────────────────────────

#[test]
fn fel173_signal_arithmetic_interpolation_is_reactive() {
    // `{count + 1}` previously emitted `leaf(count + 1)` — stringifying the
    // getter FUNCTION. The rewrite makes it `count() + 1`, which then carries
    // a call and takes the FEL-228 reactive thunk-leaf path.
    let src = r#"@state {
import { signal } from '@aihu/signals'
const [count, setCount] = signal(0)
}
@template { <span>{count + 1}</span> }"#;
    let js = compile_to_js(src, "x-fel173-arith");
    assert!(
        js.contains("leaf([() => (count() + 1)"),
        "FEL-173: complex signal interpolation must be a reactive thunk-leaf, got:\n{js}"
    );
}

#[test]
fn fel173_ternary_over_prop_interpolation_is_reactive() {
    let src = format!(
        "{PROP_STATE}@template {{\n  <span>{{section.kind === 'prose' ? 'P' : 'V'}}</span>\n}}"
    );
    let js = compile_to_js(&src, "x-fel173-ternary");
    // The dotted-prefix rewrite spells the read `(section() as any).kind`;
    // either spelling is a VALUE read — what matters is no bare `section.kind`
    // and a reactive thunk-leaf wrapper.
    assert!(
        js.contains("(section() as any).kind === 'prose' ? 'P' : 'V'")
            || js.contains("section().kind === 'prose' ? 'P' : 'V'"),
        "FEL-173: ternary over a prop must read the VALUE, got:\n{js}"
    );
    assert!(
        js.contains("leaf([() => (section()"),
        "FEL-173: and must be a reactive thunk-leaf, got:\n{js}"
    );
}

#[test]
fn fel173_loop_var_projection_still_eager() {
    // Guard: loop-var projections carry no getter and must STAY eager —
    // the rewrite must not invent calls on non-signal idents.
    let src = r#"@state { books: Array<{ name: string }> = [] }
@template { <ul><li each={b of books}>{b.name}</li></ul> }"#;
    let js = compile_to_js(src, "x-fel173-loop");
    assert!(
        js.contains("leaf(b.name)"),
        "loop-var projection must stay an eager leaf, got:\n{js}"
    );
}

#[test]
fn spread_of_signals_is_rewritten_and_reactive() {
    // `{ [...a, ...b].length }` — the `a`/`b` after `...` are VALUE reads, not
    // member access. Regression: the read-rewrite treated the `.` ending a
    // spread as a member-access dot and left the signals un-called, spreading
    // the getter FUNCTIONS. They must become `...a()` / `...b()`, and the
    // resulting call makes the interpolation a reactive thunk-leaf.
    let src = r#"@state {
import { signal } from '@aihu/signals'
const [a, setA] = signal([1, 2])
const [b, setB] = signal([3, 4])
}
@template { <p>{ [...a, ...b].length }</p> }"#;
    let js = compile_to_js(src, "x-spread");
    assert!(
        js.contains("[...a(), ...b()].length"),
        "spread must read signal VALUES (...a(), ...b()), got:\n{js}"
    );
    assert!(
        js.contains("leaf([() => ([...a(), ...b()].length)"),
        "spread-of-signals interpolation must be a reactive thunk-leaf, got:\n{js}"
    );
}

#[test]
fn fel172_string_literal_contents_untouched() {
    // Identifier-lookalikes inside string literals must not be rewritten.
    let src = r#"@state {
import { signal } from '@aihu/signals'
const [count, setCount] = signal(0)
}
@template { <span class={count > 0 ? 'count' : 'no-count'}>x</span> }"#;
    let js = compile_to_js(src, "x-fel172-strlit");
    assert!(
        js.contains("count() > 0 ? 'count' : 'no-count'"),
        "FEL-172: read rewritten but string contents untouched, got:\n{js}"
    );
}

#[test]
fn fel172_object_literal_key_and_shorthand_untouched() {
    // `{ count: 1 }` keys and `{ count }` shorthand are not reads.
    let src = r#"@state {
import { signal } from '@aihu/signals'
const [count, setCount] = signal(0)
const log = (o: object) => console.log(o)
}
@template { <button on:click={() => log({ count: 1 })}>x</button> }"#;
    let js = compile_to_js(src, "x-fel172-objkey");
    assert!(
        js.contains("log({ count: 1 })"),
        "FEL-172: object-literal keys must not be rewritten, got:\n{js}"
    );
}

// ─── W3 (advanced-js-template-expressions): every truth-table SILENT-WRONG row
// now emits correctly under `--expr-parser ast` and stays byte-identical to
// the old (wrong) output under legacy. Row ids reference the plan's empirical
// truth table (docs/plans/advanced-js-template-expressions.md).

const SIGNAL_STATE: &str = r#"@state {
import { signal } from '@aihu/signals'
const [count, setCount] = signal(0)
const [items, setItems] = signal(['a', 'b'])
const [nums, setNums] = signal([1, 2, 3])
const [obj, setObj] = signal({ a: 1 })
const extra = 'x'
}
"#;

fn both_modes(template_body: &str, tag: &str) -> (String, String) {
    let src = format!("{SIGNAL_STATE}@template {{\n  {template_body}\n}}");
    (compile_to_js_legacy(&src, tag), compile_to_js_ast(&src, tag))
}

#[test]
fn w3_a06_template_literal_hole_is_rewritten_and_reactive() {
    // a06: legacy neither rewrote `${count}` nor thunked the leaf (no `(`
    // visible outside strings) → rendered the getter's function source, never
    // updated.
    let (legacy, ast) = both_modes("<p>{`Count: ${count}`}</p>", "x-w3-a06");
    assert!(
        legacy.contains("leaf(`Count: ${count}`)"),
        "legacy stays byte-identical (eager, unrewritten), got:\n{legacy}"
    );
    assert!(
        ast.contains("leaf([() => (`Count: ${count()}`) as unknown as string"),
        "ast mode must rewrite inside the hole AND thunk the leaf, got:\n{ast}"
    );
}

#[test]
fn w3_a10_spread_call_argument_is_rewritten() {
    // a10: `...nums` once made the legacy scanner treat `nums` as a member
    // access → spread the getter FUNCTION → NaN. #391 closed that gap in the
    // legacy path, so legacy now rewrites the spread too (== ast here).
    let (legacy, ast) = both_modes("<p>{Math.max(...nums)}</p>", "x-w3-a10");
    assert!(
        legacy.contains("Math.max(...nums())"),
        "legacy also rewrites the spread since #391, got:\n{legacy}"
    );
    assert!(
        ast.contains("Math.max(...nums())"),
        "ast mode must rewrite the spread argument, got:\n{ast}"
    );
}

#[test]
fn w3_a11_spread_array_literal_is_rewritten_and_reactive() {
    // a11: once unrewritten AND eager → `TypeError: items is not iterable`.
    // #391 fixed the legacy spread rewrite here, so legacy now matches ast.
    let (legacy, ast) = both_modes("<p>{[...items, extra].length}</p>", "x-w3-a11");
    assert!(
        legacy.contains("[...items(), extra].length"),
        "legacy also rewrites the spread since #391, got:\n{legacy}"
    );
    assert!(
        ast.contains("leaf([() => ([...items(), extra].length) as unknown as string"),
        "ast mode must rewrite the spread and thunk the leaf, got:\n{ast}"
    );
}

#[test]
fn w3_a12_object_spread_is_rewritten() {
    let (_, ast) = both_modes("<p>{ {...obj, b: 2}.b }</p>", "x-w3-a12");
    assert!(
        ast.contains("{...obj(), b: 2}.b"),
        "ast mode must rewrite an object-literal spread, got:\n{ast}"
    );
}

#[test]
fn w3_b04_class_array_spread_is_rewritten() {
    // b04: `class={[...items, 'x']}` emitted `__aihu_cls([...items, 'x'])`
    // with the getter spread verbatim → runtime crash.
    let (legacy, ast) = both_modes("<div class={[...items, 'x']}>c</div>", "x-w3-b04");
    assert!(
        legacy.contains("[() => __aihu_cls([...items, 'x'])]"),
        "legacy unchanged, got:\n{legacy}"
    );
    assert!(
        ast.contains("[() => __aihu_cls([...items(), 'x'])]"),
        "ast mode must rewrite inside the class array, got:\n{ast}"
    );
}

#[test]
fn w3_b08_template_literal_attr_binding_is_rewritten() {
    // b08: thunked but unrewritten (a06 class in attribute position).
    let (legacy, ast) = both_modes("<p title={`c=${count}`}>t</p>", "x-w3-b08");
    assert!(legacy.contains("`c=${count}`"), "legacy unchanged, got:\n{legacy}");
    assert!(
        ast.contains("[() => (`c=${count()}`)]"),
        "ast mode must rewrite the hole inside the attr thunk, got:\n{ast}"
    );
}

#[test]
fn w3_b13_component_prop_spread_is_rewritten() {
    // b13: `<user-card items={[...items]} />` once spread the getter into the
    // prop; #391 fixed the legacy rewrite, so legacy now matches ast.
    let (legacy, ast) = both_modes("<user-card items={[...items]}></user-card>", "x-w3-b13");
    assert!(
        legacy.contains("[...items()]"),
        "legacy also rewrites the spread since #391, got:\n{legacy}"
    );
    assert!(
        ast.contains("[() => ([...items()])]"),
        "ast mode must rewrite the component-prop spread, got:\n{ast}"
    );
}

#[test]
fn w3_c12_each_list_spread_is_rewritten() {
    // c12: `each={it of [...items, extra]}` once crashed at runtime; #391
    // fixed the legacy spread rewrite, so legacy now matches ast.
    let (legacy, ast) = both_modes(
        "<p each={it of [...items, extra]}>{it}</p>",
        "x-w3-c12",
    );
    assert!(
        legacy.contains("[...items(), extra]"),
        "legacy also rewrites the spread since #391, got:\n{legacy}"
    );
    assert!(
        ast.contains("[() => ([...items(), extra])]"),
        "ast mode must rewrite the each-list spread, got:\n{ast}"
    );
}

#[test]
fn w3_d01_dotted_base_arrow_body_is_rewritten() {
    // d01: the dotted-base fast path copied `.filter(i => i > count).length`
    // VERBATIM after the base — `count` compared as a function, always false.
    let (legacy, ast) = both_modes(
        "<p>{items.filter(i => i > count).length}</p>",
        "x-w3-d01",
    );
    assert!(
        legacy.contains("(items() as any).filter(i => i > count).length"),
        "legacy unchanged (fast-path verbatim tail), got:\n{legacy}"
    );
    assert!(
        ast.contains("items().filter(i => i > count()).length"),
        "ast mode must rewrite inside the arrow body, got:\n{ast}"
    );
    // …while the PURE dotted path keeps the fast-path emission byte-for-byte.
    let (legacy_pure, ast_pure) = both_modes("<p>{obj.a}</p>", "x-w3-d01-pure");
    assert_eq!(legacy_pure, ast_pure, "pure dotted paths stay on the fast path");
}

#[test]
fn w3_d03_each_alias_shadowing_a_signal_is_not_rewritten() {
    // d03/d04: `each={count of items}` — the alias shadows the signal, but
    // legacy emitted `leaf([count, setCount])` (the signal tuple) INSIDE the
    // loop callback.
    let (legacy, ast) = both_modes(
        "<p each={count of items}>{count}</p>",
        "x-w3-d03",
    );
    assert!(
        legacy.contains("leaf([count, setCount]"),
        "legacy unchanged (signal tuple inside the loop), got:\n{legacy}"
    );
    assert!(
        ast.contains("leaf(count)"),
        "ast mode must treat the shadowed alias as the plain loop var, got:\n{ast}"
    );
    assert!(
        !ast.contains("leaf([count, setCount]"),
        "ast mode must not emit the signal tuple for a shadowed alias, got:\n{ast}"
    );
}

#[test]
fn w3_d06_template_literal_if_cond_is_rewritten() {
    // d06: `` if={`${count}` === '3'} `` — unrewritten → the branch never fired.
    let (legacy, ast) = both_modes(
        "<p if={`${count}` === '3'}>three</p>",
        "x-w3-d06",
    );
    assert!(legacy.contains("`${count}` === '3'"), "legacy unchanged, got:\n{legacy}");
    assert!(
        ast.contains("[() => (`${count()}` === '3')]"),
        "ast mode must rewrite the hole in the cond thunk, got:\n{ast}"
    );
}

#[test]
fn w3_object_shorthand_expands_to_a_read() {
    // A form the token rewriter could not express: `{ count }` shorthand is a
    // signal READ and expands to `{ count: count() }`.
    let (legacy, ast) = both_modes(
        "<p>{JSON.stringify({ count })}</p>",
        "x-w3-shorthand",
    );
    assert!(
        legacy.contains("JSON.stringify({ count })"),
        "legacy unchanged (shorthand untouched), got:\n{legacy}"
    );
    assert!(
        ast.contains("JSON.stringify({ count: count() })"),
        "ast mode must expand shorthand to a getter read, got:\n{ast}"
    );
}

#[test]
fn w3_object_keys_stay_untouched_in_both_modes() {
    let (legacy, ast) = both_modes(
        "<p>{JSON.stringify({ count: 1 })}</p>",
        "x-w3-objkey",
    );
    assert!(legacy.contains("{ count: 1 }"), "got:\n{legacy}");
    assert!(ast.contains("{ count: 1 }"), "got:\n{ast}");
}

#[test]
fn w3_shadowed_arrow_param_suppresses_rewrite_in_ast_mode() {
    // a22 under the fast-path retirement: the map body's `count` is the param.
    let (_, ast) = both_modes(
        "<p>{items.map(count => count + 1).join('')}</p>",
        "x-w3-a22",
    );
    assert!(
        ast.contains("items().map(count => count + 1).join('')"),
        "ast mode must rewrite the base but honor the param shadow, got:\n{ast}"
    );
}

#[test]
fn w3_default_is_ast_end_to_end() {
    // #485 (the W3-planned flip): the whole fixture family compiles
    // identically through `compile_full` (no flag) and
    // `compile_full_with_options(..., Ast)` — the default IS the AST rewrite,
    // so emission and typecheck share one expression semantics.
    let src = format!(
        "{SIGNAL_STATE}@template {{\n  <p>{{`c=${{count}}`}}</p>\n  <p>{{Math.max(...nums)}}</p>\n}}"
    );
    let parsed = sfc::parse(&src).unwrap();
    let implicit = emit(&compile_full(&parsed).unwrap(), "x-w3-default").js;
    let explicit = emit(
        &compile_full_with_options(&parsed, BuildTarget::Universal, ExprParserMode::Ast)
            .unwrap(),
        "x-w3-default",
    )
    .js;
    assert_eq!(implicit, explicit, "the flag-off path must be byte-identical to ast");
    assert!(
        implicit.contains("`c=${count()}`"),
        "the default emission rewrites template-literal holes:\n{implicit}"
    );
}
