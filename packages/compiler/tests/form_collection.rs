//! D5 — `$form` collection acceptance tests.
//!
//! Covers:
//! - `$form: { value: expr }` — emits `setFormValue` + `static formAssociated = true`
//! - `$form: { validity: () => ({ ... }) }` — emits `setValidity` call
//! - Combined `$form: { value, validity }` — single `attachInternals()` guard
//! - `$form` + `$aria` — only one `attachInternals()` call emitted
//! - No `$form` → zero form-related overhead
//!
//! Per spec D5 and Builder form-wave-c assignment.

use aihu_compiler::{compile_full, emit, sfc};

fn compile_fixture(source: &str, tag: &str) -> String {
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).expect("fixture must compile");
    emit(&unit, tag).js
}

// ─── AC #1 — $form basic value: setFormValue + formAssociated ────────────────

#[test]
fn form_basic_value() {
    let src = r#"@state {
  $form: { value: name }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-form-basic");

    // static formAssociated = true must be set on the class.
    assert!(
        js.contains("formAssociated = true"),
        "expected formAssociated = true: {js}"
    );

    // setFormValue must be emitted.
    assert!(
        js.contains("setFormValue"),
        "expected setFormValue call: {js}"
    );

    // setFormValue for `name` must wrap in an effect.
    assert!(
        js.contains("effect("),
        "expected effect() wrapper for setFormValue: {js}"
    );

    // attachInternals guard must be emitted.
    assert!(
        js.contains("this._internals = this.attachInternals()"),
        "expected attachInternals call: {js}"
    );
}

// ─── AC #2 — $form validity: setValidity call emitted ────────────────────────

#[test]
fn form_validity() {
    let src = r#"@state {
  $form: { validity: () => ({ valueMissing: !name.trim() }) }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-form-validity");

    // formAssociated must be emitted.
    assert!(
        js.contains("formAssociated = true"),
        "expected formAssociated = true: {js}"
    );

    // setValidity must be emitted.
    assert!(
        js.contains("setValidity"),
        "expected setValidity call: {js}"
    );

    // setValidity must be inside an effect.
    assert!(
        js.contains("effect("),
        "expected effect() wrapper for setValidity: {js}"
    );

    // attachInternals guard must be emitted.
    assert!(
        js.contains("this._internals = this.attachInternals()"),
        "expected attachInternals call: {js}"
    );

    // The validity thunk expression must be present.
    assert!(
        js.contains("valueMissing"),
        "expected valueMissing in emitted validity: {js}"
    );
}

// ─── AC #3 — $form value + validity: combined; single attachInternals guard ──

#[test]
fn form_value_and_validity() {
    let src = r#"@state {
  $form: { value: name, validity: () => ({ valueMissing: !name.trim() }) }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-form-both");

    // formAssociated must be emitted.
    assert!(
        js.contains("formAssociated = true"),
        "expected formAssociated = true: {js}"
    );

    // Both setFormValue and setValidity must be emitted.
    assert!(
        js.contains("setFormValue"),
        "expected setFormValue call: {js}"
    );
    assert!(
        js.contains("setValidity"),
        "expected setValidity call: {js}"
    );

    // The attachInternals guard must appear exactly once.
    let guard_count = js.matches("this.attachInternals()").count();
    assert_eq!(
        guard_count, 1,
        "expected exactly one attachInternals() call but got {guard_count}: {js}"
    );
}

// ─── AC #4 — $form + $aria share internals: single attachInternals call ──────

#[test]
fn form_and_aria_share_internals() {
    let src = r#"@state {
  $aria: { role: 'textbox' }
  $form: { value: name }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-form-and-aria");

    // Both form and aria features must be present.
    assert!(
        js.contains("formAssociated = true"),
        "expected formAssociated = true: {js}"
    );
    assert!(
        js.contains("setFormValue"),
        "expected setFormValue: {js}"
    );
    assert!(
        js.contains("role"),
        "expected ARIA role: {js}"
    );

    // Only ONE attachInternals() call must be emitted (shared guard).
    let guard_count = js.matches("this.attachInternals()").count();
    assert_eq!(
        guard_count, 1,
        "expected exactly one attachInternals() call when $aria + $form present, got {guard_count}: {js}"
    );
}

// ─── AC #5 — No $form → zero form overhead ───────────────────────────────────

#[test]
fn form_no_overhead() {
    let src = r#"@state {
  $prop: { label: { default: 'hello' } }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-form-none");

    // Must emit NO form-associated code.
    assert!(
        !js.contains("formAssociated"),
        "SFC without $form must not emit formAssociated: {js}"
    );
    assert!(
        !js.contains("setFormValue"),
        "SFC without $form must not emit setFormValue: {js}"
    );
    assert!(
        !js.contains("setValidity"),
        "SFC without $form must not emit setValidity: {js}"
    );
    // Also no attachInternals (no $aria either).
    assert!(
        !js.contains("attachInternals"),
        "SFC without $form or $aria must not emit attachInternals: {js}"
    );
}
