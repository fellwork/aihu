//! B2 fixtures — R2 ($lifecycle 4-callback) + R3 ($show → hidden) + R4 ($bind two-way).
//!
//! Each fixture compiles end-to-end and the emitted JS is spot-checked for
//! the canonical lowered output. Mirrors the `r1_fixture_all_keys` pattern.

use aihu_compiler::{compile_full, emit, sfc};

fn compile_fixture(source: &str, tag: &str) -> String {
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).expect("fixture must compile");
    emit(&unit, tag).js
}

// R2 — fixture wiring all four $lifecycle callbacks.
#[test]
fn r2_fixture_lifecycle_four_callbacks() {
    let src = include_str!("fixtures/r2-r3-r4-q4-b2/lifecycle-four-callbacks.aihu");
    let js = compile_fixture(src, "x-r2-lifecycle");
    // Each platform-callback dispatcher must show up in the emit.
    assert!(js.contains("onMount("), "missing onMount: {}", js);
    assert!(js.contains("onCleanup("), "missing onCleanup: {}", js);
    assert!(js.contains("onAdopt("), "missing onAdopt: {}", js);
    assert!(
        js.contains("onAttributeChange("),
        "missing onAttributeChange: {}",
        js
    );
    // The user-supplied param list (attrName, oldValue, newValue) should be
    // preserved verbatim in the emitted arrow.
    assert!(
        js.contains("onAttributeChange((attrName, oldValue, newValue)"),
        "param names not preserved: {}",
        js
    );
}

// R3 — fixture confirming $show lowers to hidden attribute.
#[test]
fn r3_fixture_show_lowers_to_hidden() {
    let src = include_str!("fixtures/r2-r3-r4-q4-b2/show-hidden-attribute.aihu");
    let js = compile_fixture(src, "x-r3-show");
    assert!(
        js.contains("toggleAttribute('hidden'"),
        "missing toggleAttribute('hidden'): {}",
        js
    );
    // Negative: the old `--show` CSS-custom-property path must NOT appear.
    assert!(
        !js.contains("--show"),
        "old --show CSS var still present: {}",
        js
    );
}

// R4 — fixture confirming $bind:value emits both read and write paths.
#[test]
fn r4_fixture_bind_two_way() {
    let src = include_str!("fixtures/r2-r3-r4-q4-b2/bind-two-way.aihu");
    let js = compile_fixture(src, "x-r4-bind");
    // Read-side: signal tuple
    assert!(
        js.contains("value: [text, setText]"),
        "missing read-side tuple for value: {}",
        js
    );
    assert!(
        js.contains("checked: [done, setDone]"),
        "missing read-side tuple for checked: {}",
        js
    );
    // Write-side: oninput / onchange listeners
    assert!(
        js.contains("onInput: (e) => setText(e.target.value)"),
        "missing oninput write-back: {}",
        js
    );
    assert!(
        js.contains("onChange: (e) => setDone(e.target.checked)"),
        "missing onchange write-back: {}",
        js
    );
}
