//! Bug 7 + Bug 8 — cross-block declaration resolver & plain-const-reads-prop
//! diagnostic (campaign topic:aihu-0.3-upstream-bugs r1; director 06cb46b1,
//! investigation 17f5394b).
//!
//! Bug 7: the "undeclared cross-block reference" warning pass must recognize
//! `$prop:` keys, `$computed:` keys, and plain `@state` const/let bindings as
//! declared (no false-positive on correctly-migrated code), and must scan v1
//! single-curly `{ }` interpolations — while still warning on genuinely
//! undeclared refs. (Warnings go to stderr, so the precise name-level assertions
//! live in the `sfc.rs` unit tests; here we assert end-to-end that valid code
//! compiles and undeclared code still compiles-with-warning, per the v0.3.x
//! "warning not error" contract.)
//!
//! Bug 8 (issue #424): the former C205 hard error rejected a plain `@state`
//! const/let whose initializer reads a `$prop` name. Issue #279 hoisted prop
//! bindings ABOVE the plain body, so that construct now compiles correctly —
//! C205 was rejecting valid code and has been retired. The tests below verify
//! the previously-rejected form now COMPILES and that its prop binding is
//! emitted BEFORE the plain body (the hoist that makes it safe), while the
//! `$computed` form keeps compiling clean.

use aihu_compiler::{compile_full, sfc};

fn try_compile(src: &str) -> Result<(), aihu_compiler::CompileError> {
    let parsed = sfc::parse(src)?;
    compile_full(&parsed)?;
    Ok(())
}

fn emit_js(src: &str, tag: &str) -> String {
    let parsed = sfc::parse(src).expect("parse");
    let unit = compile_full(&parsed).expect("compile_full");
    aihu_compiler::emit(&unit, tag).js
}

// ─── Bug 7 — the report's correctly-migrated repro compiles cleanly ──────────

#[test]
fn bug7_migrated_prop_plus_computed_compiles() {
    let src = r#"@state {
  $prop: { active: { default: '', type: "string" } }
  $computed: { cls: () => active() === 'home' ? 'on' : '' }
}
@template { <a class={cls}>Home</a> }
"#;
    assert!(
        try_compile(src).is_ok(),
        "correctly-migrated $prop+$computed code must compile without error"
    );
}

#[test]
fn bug7_plain_const_derived_value_compiles() {
    // A plain @state const (not reading a prop) referenced in the template must
    // not error and must be recognized as declared (no false-positive).
    let src = r#"@state {
  const greeting = 'hello'
}
@template { <p>{greeting}</p> }
"#;
    assert!(try_compile(src).is_ok(), "plain const must compile clean");
}

#[test]
fn bug7_genuinely_undeclared_single_curly_is_warning_not_error() {
    // v0.3.x contract: undeclared refs WARN (stderr), they do not error.
    let src = r#"@state {
  $prop: { active: { default: '' } }
}
@template { <a class={nope}>Home</a> }
"#;
    assert!(
        try_compile(src).is_ok(),
        "undeclared single-curly ref must remain a warning (not an error) in v0.3.x"
    );
}

// ─── Bug 8 / issue #424 — the retired C205: previously-rejected form COMPILES ─

#[test]
fn issue424_plain_const_reading_prop_now_compiles() {
    // This is the exact construct the old C205 rejected. After #279 hoisted prop
    // bindings above the plain body, it compiles correctly — no diagnostic.
    let src = r#"@state {
  $prop: { active: { default: '', type: "string" } }
  const cls = active() ?? ''
}
@template { <a class={cls}>Home</a> }
"#;
    assert!(
        try_compile(src).is_ok(),
        "a plain @state const reading a prop must compile (C205 retired, #424)"
    );
}

#[test]
fn issue424_prop_binding_is_emitted_before_plain_body() {
    // Proves WHY the above is safe: the #279 hoist emits the prop getter
    // (`const active = ctx.props.active`) BEFORE the plain-body `const cls`,
    // so reading the prop in the const initializer never hits the TDZ.
    let src = r#"@state {
  $prop: { active: { default: '', type: "string" } }
  const cls = active() ?? ''
}
@template { <a class={cls}>Home</a> }
"#;
    let js = emit_js(src, "x-issue424");
    let prop_pos = js
        .find("const active = ctx.props.active")
        .expect("prop binding must be emitted");
    let const_pos = js
        .find("const cls =")
        .expect("plain-body const must be emitted");
    assert!(
        prop_pos < const_pos,
        "prop binding must precede the plain-body const that reads it (the #279 hoist that makes it safe)\n--- emitted JS ---\n{js}"
    );
}

#[test]
fn bug8_computed_form_compiles_clean() {
    let src = r#"@state {
  $prop: { active: { default: '', type: "string" } }
  $computed: { cls: () => active() ?? '' }
}
@template { <a class={cls}>Home</a> }
"#;
    assert!(
        try_compile(src).is_ok(),
        "the $computed form of a prop-derived value must compile clean (no C205)"
    );
}

#[test]
fn bug8_const_reading_prop_inside_action_is_not_c205() {
    // A const that reads a prop INSIDE a $action body runs lazily (after the
    // prop shadow is bound) — no TDZ, must not trip C205.
    let src = r#"@state {
  $prop: { location: { default: '' } }
  $action: { go: { handler: () => { const data = location() } } }
}
@template { <p>ok</p> }
"#;
    let res = try_compile(src);
    if let Err(ref e) = res {
        assert_ne!(e.code.as_deref(), Some("C205"), "const inside $action must not be C205");
    }
}

#[test]
fn bug8_plain_const_not_reading_prop_compiles() {
    let src = r#"@state {
  $prop: { active: { default: '' } }
  const unrelated = 1 + 2
}
@template { <p>{unrelated}</p> }
"#;
    assert!(try_compile(src).is_ok(), "a const not reading any prop must compile clean");
}
