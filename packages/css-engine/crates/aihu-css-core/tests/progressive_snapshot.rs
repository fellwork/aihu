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
