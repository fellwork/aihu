//! FEL-172 / FEL-173 — bare reads of reactive getters (props, signals,
//! computeds) inside template EXPRESSIONS must be rewritten to getter CALLS.
//!
//! Props compile to signal getters (`const section = ctx.props.section`), and
//! plain dotted interpolations were already rewritten (`{section.label}` →
//! `(section() as any).label`). But `$if` / `$each` / `$on.*` / attr-binding /
//! complex-interpolation expressions were emitted VERBATIM into thunks, so
//! `$if={section.kind === 'prose'}` read `.kind` off the signal FUNCTION —
//! always undefined — and the branch silently never rendered (fellwork-web
//! exegesis-section). FEL-173 is the interpolation face of the same gap:
//! `{count + 1}` stringified the getter function instead of tracking it.

use aihu_compiler::{compile_full, emit, sfc};

fn compile_to_js(source: &str, tag: &str) -> String {
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
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
        "{PROP_STATE}@template {{\n  <p $if={{section.kind === 'prose'}}>prose</p>\n}}"
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
        "{PROP_STATE}@template {{\n  <li $each=\"section.data as it\">{{it}}</li>\n}}"
    );
    let js = compile_to_js(&src, "x-fel172-each");
    assert!(
        js.contains("section().data"),
        "FEL-172: $each list must read the prop VALUE (section().data), got:\n{js}"
    );
}

#[test]
fn fel172_explicit_call_workaround_is_not_double_called() {
    // The shipped fellwork-web workaround (`$each="section().data as it"`)
    // must keep compiling — the rewrite skips idents already followed by `(`.
    let src = format!(
        "{PROP_STATE}@template {{\n  <li $each=\"section().data as it\">{{it}}</li>\n}}"
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
        "{PROP_STATE}@template {{\n  <button $on.click={{() => console.log(section)}}>go</button>\n}}"
    );
    let js = compile_to_js(&src, "x-fel172-handler");
    assert!(
        js.contains("console.log(section())"),
        "FEL-172: handler bodies must read prop VALUES, got:\n{js}"
    );
}

#[test]
fn fel172_bare_ident_handler_stays_verbatim() {
    // `$on.click={increment}` passes the function itself — not a read.
    let src = r#"@state {
import { signal } from '@aihu/signals'
const [count, setCount] = signal(0)
const increment = () => setCount(count() + 1)
}
@template { <button $on.click={increment}>+</button> }"#;
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
@template { <input $on.input={(value) => setValue(value)} /> }"#;
    let js = compile_to_js(src, "x-fel172-shadow");
    assert!(
        js.contains("(value) => setValue(value)"),
        "FEL-172: arrow-param shadows must suppress the rewrite, got:\n{js}"
    );
}

#[test]
fn fel172_signal_read_in_setter_arg_is_rewritten() {
    // The classic counter: `$on.click={() => setCount(count + 1)}`.
    // `setCount` is a setter (not a getter key) — untouched; `count` is a
    // bare getter read — rewritten.
    let src = r#"@state {
import { signal } from '@aihu/signals'
const [count, setCount] = signal(0)
}
@template { <button $on.click={() => setCount(count + 1)}>+</button> }"#;
    let js = compile_to_js(src, "x-fel172-counter");
    assert!(
        js.contains("setCount(count() + 1)"),
        "FEL-172: bare signal read in handler must become a call, got:\n{js}"
    );
}

#[test]
fn fel172_block_if_cond_is_rewritten() {
    let src = format!(
        "{PROP_STATE}@template {{\n  {{#if section.kind === 'prose'}}<p>prose</p>{{/if}}\n}}"
    );
    let js = compile_to_js(&src, "x-fel172-blockif");
    assert!(
        js.contains("section().kind === 'prose'"),
        "FEL-172: {{#if}} cond must read the prop VALUE, got:\n{js}"
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
@template { <ul><li $each="books as b">{b.name}</li></ul> }"#;
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
@template { <span $class={count > 0 ? 'count' : 'no-count'}>x</span> }"#;
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
@template { <button $on.click={() => log({ count: 1 })}>x</button> }"#;
    let js = compile_to_js(src, "x-fel172-objkey");
    assert!(
        js.contains("log({ count: 1 })"),
        "FEL-172: object-literal keys must not be rewritten, got:\n{js}"
    );
}
