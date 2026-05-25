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
//! Bug 8: a plain `@state` const/let whose initializer reads a `$prop` name is a
//! C205 compile error (TDZ avoidance, diagnostic-only — no codegen reorder); the
//! `$computed` form compiles clean.

use aihu_compiler::{compile_full, sfc};

fn try_compile(src: &str) -> Result<(), aihu_compiler::CompileError> {
    let parsed = sfc::parse(src)?;
    compile_full(&parsed)?;
    Ok(())
}

// ─── Bug 7 — the report's correctly-migrated repro compiles cleanly ──────────

#[test]
fn bug7_migrated_prop_plus_computed_compiles() {
    let src = r#"@state {
  $prop: { active: { default: '', type: "string" } }
  $computed: { cls: () => active() === 'home' ? 'on' : '' }
}
@template { <a $class={cls}>Home</a> }
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
@template { <a $class={nope}>Home</a> }
"#;
    assert!(
        try_compile(src).is_ok(),
        "undeclared single-curly ref must remain a warning (not an error) in v0.3.x"
    );
}

// ─── Bug 8 — plain const reading a prop → C205; $computed form → clean ───────

#[test]
fn bug8_plain_const_reading_prop_is_c205() {
    let src = r#"@state {
  $prop: { active: { default: '', type: "string" } }
  const cls = active() ?? ''
}
@template { <a $class={cls}>Home</a> }
"#;
    let err = try_compile(src).expect_err("plain const reading a prop must be a C205 error");
    assert_eq!(err.code.as_deref(), Some("C205"), "expected C205, got {err:?}");
    assert!(
        err.message.contains("active") && err.message.contains("$computed"),
        "C205 message must name the prop and point to $computed: {}",
        err.message
    );
}

#[test]
fn bug8_computed_form_compiles_clean() {
    let src = r#"@state {
  $prop: { active: { default: '', type: "string" } }
  $computed: { cls: () => active() ?? '' }
}
@template { <a $class={cls}>Home</a> }
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
