//! B4 — $aria collection acceptance tests (R5).
//!
//! Covers:
//! - `$aria: { role, label, pressed, ... }` — declarative ARIA via ElementInternals
//! - Static values written once at connect (no effect wrapper)
//! - Reactive thunk values wrapped in `effect(() => { ... })`
//! - Auto-keyboard-promotion: keydown listener on Enter/Space when role is
//!   button/link/menuitem/tab AND $on.click is declared AND root is not native interactive
//! - Default tabindex="0" injection for focusable roles unless already declared
//! - Lazy-attach: `attachInternals()` only emitted when `$aria` is declared
//! - Empty `$aria: {}` warns (produces no codegen)
//!
//! Per spec §3.2 (R5) and Builder B4 assignment.

use aihu_compiler::{compile_full, emit, sfc};

fn compile_fixture(source: &str, tag: &str) -> String {
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).expect("fixture must compile");
    emit(&unit, tag).js
}

// ─── AC #1 — Basic role + static label ────────────────────────────────────────

#[test]
fn b4_aria_basic_role_emit() {
    let src = r#"@state {
  $aria: { role: 'button', label: 'Close' }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-b4-basic");

    // Static role must be written directly (no effect wrapper).
    assert!(
        js.contains("this._internals.role = 'button'"),
        "expected static role assignment: {js}"
    );

    // Static label must be written directly too.
    assert!(
        js.contains("this._internals.ariaLabel = 'Close'"),
        "expected static ariaLabel assignment: {js}"
    );

    // attachInternals guard must be emitted.
    assert!(
        js.contains("this._internals = this.attachInternals()"),
        "expected attachInternals call: {js}"
    );
}

// ─── AC #2 — Reactive label wrapped in effect ─────────────────────────────────

#[test]
fn b4_aria_reactive_label() {
    let src = r#"@state {
  $aria: { label: () => mySignal() }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-b4-reactive");

    // Reactive label must be wrapped in an effect.
    assert!(
        js.contains("effect("),
        "expected effect() wrapping for reactive label: {js}"
    );
    assert!(
        js.contains("this._internals.ariaLabel"),
        "expected ariaLabel write inside effect: {js}"
    );

    // Must NOT be a static write.
    assert!(
        !js.contains("this._internals.ariaLabel = mySignal()"),
        "reactive label must not be a static write: {js}"
    );
}

// ─── AC #3 — Auto-keyboard-promotion on <div> root with $on.click ─────────────

#[test]
fn b4_aria_keyboard_promotion() {
    let src = r#"@state {
  $aria: { role: 'button' }
}
@template {
  <div on:click={handleClick}></div>
}"#;
    let js = compile_fixture(src, "x-b4-keyboard");

    // Keydown listener must be emitted for div with button role.
    assert!(
        js.contains("addEventListener('keydown'"),
        "expected keydown listener for role=button on div: {js}"
    );
    assert!(
        js.contains("e.preventDefault()"),
        "expected e.preventDefault() in keydown handler: {js}"
    );
    assert!(
        js.contains("this.click()"),
        "expected this.click() call in keydown handler: {js}"
    );
}

// ─── AC #4 — No keyboard promotion on <button> (native tag handles it) ────────

#[test]
fn b4_aria_no_keyboard_on_button_tag() {
    let src = r#"@state {
  $aria: { role: 'button' }
}
@template {
  <button on:click={handleClick}></button>
}"#;
    let js = compile_fixture(src, "x-b4-native-btn");

    // Native <button> already handles keyboard — no duplicate keydown listener.
    assert!(
        !js.contains("addEventListener('keydown'"),
        "native button root must NOT get auto-keydown listener: {js}"
    );
}

// ─── AC #5 — Default tabindex="0" injected for focusable role ─────────────────

#[test]
fn b4_aria_default_tabindex() {
    let src = r#"@state {
  $aria: { role: 'button' }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-b4-tabindex");

    // tabindex="0" should appear in the emitted template attrs.
    assert!(
        js.contains("tabindex") && (js.contains("\"0\"") || js.contains("'0'")),
        "expected tabindex='0' injected on root element: {js}"
    );
}

// ─── AC #6 — No tabindex injected when already declared by author ─────────────

#[test]
fn b4_aria_no_tabindex_if_declared() {
    let src = r#"@state {
  $aria: { role: 'button' }
}
@template {
  <div tabindex="-1"></div>
}"#;
    // Use a tag name without "tabindex" to avoid false-positive substring counts.
    let js = compile_fixture(src, "x-close-btn");

    // Author's tabindex="-1" must be preserved in the emitted branch attrs.
    assert!(
        js.contains("tabindex: '-1'") || js.contains("tabindex: \"-1\""),
        "expected author's tabindex='-1' in branch attrs: {js}"
    );

    // Compiler must not also inject tabindex="0" when author has their own tabindex.
    // The injected tabindex would appear as `tabindex: '0'` in the attrs object.
    assert!(
        !js.contains("tabindex: '0'") && !js.contains("tabindex: \"0\""),
        "compiler must not inject tabindex='0' when author has tabindex=-1: {js}"
    );
}

// ─── AC #7 — Empty $aria: {} produces no codegen (parse-level warning) ────────

#[test]
fn b4_aria_empty_collection_warns() {
    let src = r#"@state {
  $aria: {}
}
@template {
  <div></div>
}"#;
    // Should compile successfully (empty collection is a warning, not an error).
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).expect("empty $aria must compile (warning, not error)");
    let js = emit(&unit, "x-b4-empty").js;

    // No ARIA wiring should be emitted for empty $aria: {}.
    assert!(
        !js.contains("attachInternals"),
        "empty $aria must not emit attachInternals: {js}"
    );
    assert!(
        !js.contains("_internals"),
        "empty $aria must not emit _internals: {js}"
    );
}

// ─── AC #8 — No attachInternals when no $aria collection ──────────────────────

#[test]
fn b4_aria_no_overhead_without_collection() {
    let src = r#"@state {
  $prop: { label: { default: 'hello' } }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-b4-no-aria");

    // SFCs without $aria must not emit any ARIA internals wiring.
    assert!(
        !js.contains("attachInternals"),
        "SFC without $aria must not emit attachInternals: {js}"
    );
    assert!(
        !js.contains("_internals"),
        "SFC without $aria must not emit _internals ref: {js}"
    );
}

// ─── Additional coverage tests ─────────────────────────────────────────────────

#[test]
fn b4_aria_reactive_pressed_string_cast() {
    // Reactive boolean properties must be String()-cast per spec.
    let src = r#"@state {
  $aria: { pressed: () => isActive() }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-b4-pressed");

    assert!(
        js.contains("ariaPressed"),
        "expected ariaPressed write: {js}"
    );
    assert!(
        js.contains("String("),
        "boolean ARIA property must be String()-cast: {js}"
    );
    assert!(
        js.contains("effect("),
        "reactive pressed must be wrapped in effect: {js}"
    );
}

#[test]
fn b4_aria_multiple_keys() {
    // Multiple $aria keys (role + reactive pressed + reactive label).
    let src = r#"@state {
  $aria: {
    role: 'switch',
    pressed: () => isOn(),
    label: () => isOn() ? 'On' : 'Off',
  }
}
@template {
  <div on:click={toggle}></div>
}"#;
    let js = compile_fixture(src, "x-b4-multi");

    assert!(
        js.contains("this._internals.role = 'switch'"),
        "expected static role: {js}"
    );
    assert!(
        js.contains("ariaPressed"),
        "expected ariaPressed: {js}"
    );
    assert!(
        js.contains("ariaLabel"),
        "expected ariaLabel: {js}"
    );
    // switch is a focusable role → tabindex should be injected.
    assert!(
        js.contains("tabindex"),
        "expected tabindex injection for role=switch: {js}"
    );
}
