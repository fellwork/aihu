//! Snapshot + behavior coverage for the progressive features (Plan 3 Tasks 5–8).
//!
//! Asserts each feature's `@supports`/fallback contract via `compile_sfc_scoped`
//! (the production path that routes progressive prefixes through the registry).

use aihu_css_core::{compile_sfc_scoped, parse_ast};

fn ast(json: &str) -> aihu_css_core::SfcAst {
    parse_ast(json).unwrap()
}

fn sfc(classes: &str) -> aihu_css_core::SfcAst {
    ast(&format!(
        r#"{{"tag":"X","astVersion":1,"style":null,"meta":{{"name":"X"}},
        "template":[{{"kind":"element","tag":"div","attrs":[
          {{"kind":"static","name":"class","value":"{classes}"}}
        ],"children":[]}}]}}"#
    ))
}

// ── Task 5: view-transition: (CSS-only, no JS) ───────────────────────────────

#[test]
fn view_transition_is_supports_gated_css_only() {
    let css = compile_sfc_scoped(&sfc("view-transition:hero"));
    assert!(
        css.contains("@supports (view-transition-name: none)"),
        "view-transition gated behind @supports: {css}"
    );
    assert!(css.contains("view-transition-name: hero"));
    assert!(
        !css.contains("aihu:progressive-fallback"),
        "view-transition is CSS-only — NO JS fallback marker: {css}"
    );
}

#[test]
fn view_transition_snapshot() {
    insta::assert_snapshot!(compile_sfc_scoped(&sfc("view-transition:hero")));
}

// ── Task 6: anchor: (@supports gate + JS fallback marker) ────────────────────

#[test]
fn anchor_is_supports_gated_with_js_marker() {
    let css = compile_sfc_scoped(&sfc("anchor:tooltip"));
    assert!(
        css.contains("@supports (anchor-name: --a)"),
        "anchor gated behind @supports (anchor-name): {css}"
    );
    assert!(css.contains("anchor-name: --tooltip"));
    assert!(
        css.contains("aihu:progressive-fallback anchorFallback"),
        "anchor emits a runtime-fallback marker: {css}"
    );
}

#[test]
fn anchor_snapshot() {
    insta::assert_snapshot!(compile_sfc_scoped(&sfc("anchor:tooltip")));
}

// ── Task 7: popover: (@supports gate + portal JS fallback marker) ────────────

#[test]
fn popover_is_supports_gated_with_js_marker() {
    let css = compile_sfc_scoped(&sfc("popover:menu"));
    assert!(
        css.contains("@supports (selector(:popover-open))"),
        "popover gated behind @supports selector(:popover-open): {css}"
    );
    assert!(
        css.contains("aihu:progressive-fallback popoverFallback"),
        "popover emits a runtime-fallback marker: {css}"
    );
}

#[test]
fn popover_snapshot() {
    insta::assert_snapshot!(compile_sfc_scoped(&sfc("popover:menu")));
}

// ── Task 8: text-balance: (no gate, no JS) ───────────────────────────────────

#[test]
fn text_balance_no_gate_no_js() {
    let css = compile_sfc_scoped(&sfc("text-balance:"));
    assert!(css.contains("text-wrap: balance"), "emits text-wrap: balance: {css}");
    assert!(
        !css.contains("@supports"),
        "text-balance has NO @supports gate (silently ignored if unsupported): {css}"
    );
    assert!(
        !css.contains("aihu:progressive-fallback"),
        "text-balance is CSS-only — NO JS fallback marker: {css}"
    );
}

#[test]
fn text_balance_snapshot() {
    insta::assert_snapshot!(compile_sfc_scoped(&sfc("text-balance:")));
}
