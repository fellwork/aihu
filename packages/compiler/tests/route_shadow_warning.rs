//! DA4 phase 1 (#437) — W472: route component without `$shadow` warns ahead
//! of the light-DOM default flip (next major).
//!
//! The classifier precedence triple (thesis §DA4, founder-ratified):
//!   (a) `$shadow` present → NO warning, whatever else the file declares —
//!       the macro always wins, so the flip cannot change the author's output.
//!   (b) `@route` block, no `$shadow` → W472, with the machine rewrite.
//!   (c) no `@route`, no `$shadow` → leaf component → no warning.
//!
//! Assertions go through the pure decision fn `route_shadow_flip_warning`;
//! emission is stderr-only (`diagnostics::emit_warning`) and non-fatal by
//! construction, which `warning_is_not_a_compile_error` pins: the same source
//! that warns still compiles.

use aihu_compiler::{compile, compile_full, compile_with_path, route_shadow_flip_warning, AihuSource};

/// Parse a page fixture under a `src/pages/` path (an `@route` block anywhere
/// else is a C500 hard error, which is not what these tests measure).
fn parse_page(src: &str) -> AihuSource<'_> {
    compile_with_path(src, Some("src/pages/index.aihu")).unwrap()
}

const PAGE_NO_SHADOW: &str = r#"@state {
  $prop: {
    name: { default: 'world', type: "string" }
  }
}

@template {
  <div>Hello {name}</div>
}

@route {
  path: /
  name: home
}
"#;

const PAGE_SHADOW_OPEN: &str = r#"@state {
  $shadow: 'open'
}

@template {
  <div>Hello</div>
}

@route {
  path: /
  name: home
}
"#;

const PAGE_SHADOW_NONE: &str = r#"@state {
  $shadow: 'none'
}

@template {
  <div>Hello</div>
}

@route {
  path: /
  name: home
}
"#;

const LEAF_NO_SHADOW: &str = r#"@state {
  $prop: {
    label: { default: 'ok', type: "string" }
  }
}

@template {
  <button>{label}</button>
}
"#;

/// (a) `$shadow` always wins — both escape hatches suppress W472.
#[test]
fn route_with_shadow_macro_no_warning() {
    for (label, src) in [("open", PAGE_SHADOW_OPEN), ("none", PAGE_SHADOW_NONE)] {
        let source = parse_page(src);
        assert!(
            route_shadow_flip_warning(&source).is_none(),
            "`$shadow: '{label}'` must suppress W472 — the mode is pinned, the flip is a no-op"
        );
    }
}

/// (b) `@route` without `$shadow` → W472, warning-shaped (code + hint + fix +
/// machine rewrite), with the ratified message.
#[test]
fn route_without_shadow_warns_w472() {
    let source = parse_page(PAGE_NO_SHADOW);
    let w = route_shadow_flip_warning(&source)
        .expect("an @route unit with no $shadow must produce the W472 warning");
    assert_eq!(w.code.as_deref(), Some("W472"));
    assert!(
        w.message.contains("shadowMode 'none'") && w.message.contains("next major"),
        "message must name the flip and its semver weight; got: {}",
        w.message
    );
    assert!(
        w.message.contains("$shadow open") && w.message.contains("$shadow none"),
        "message must offer BOTH escape hatches; got: {}",
        w.message
    );
    // The uniform diagnostics tail (diagnostics.rs): hint + fix + a complete
    // machine rewrite (from AND to — a half rewrite is not machine-applicable).
    assert!(w.hint.is_some(), "W472 must carry a hint");
    assert!(w.fix.is_some(), "W472 must carry a fix");
    assert!(
        w.from.is_some() && w.to.is_some(),
        "W472 must carry the machine replace/with rewrite"
    );
}

/// (c) no `@route`, no `$shadow` → leaf → no warning.
#[test]
fn leaf_without_shadow_no_warning() {
    let source = compile(LEAF_NO_SHADOW).unwrap();
    assert!(
        route_shadow_flip_warning(&source).is_none(),
        "a leaf (no @route) keeps shadow DOM at the flip; it must not warn"
    );
}

/// W472 is a WARNING release, not the flip: the warning must not fail the
/// build, and it must not change the emitted output's shadow behavior (no
/// `// @aihu:shadow` marker appears that the author did not write).
#[test]
fn warning_is_not_a_compile_error_and_changes_no_output() {
    let source = parse_page(PAGE_NO_SHADOW);
    let unit = compile_full(&source).expect("a warning must never fail compile_full");
    let js = aihu_compiler::emit(&unit, "home-page").js;
    assert!(
        !js.contains("@aihu:shadow"),
        "phase 1 must not inject a shadow marker the author did not write"
    );
}

/// The escape hatch is end-to-end real: `$shadow: 'open'` and `$shadow: 'none'`
/// both emit the leading `// @aihu:shadow <mode>` marker the Vite plugin's
/// `_injectShadowMode` consumes (packages/compiler/js/index.ts reads
/// `^// @aihu:shadow (open|closed|none)`).
#[test]
fn shadow_macro_emits_marker_for_both_hatches() {
    for (mode, src) in [("open", PAGE_SHADOW_OPEN), ("none", PAGE_SHADOW_NONE)] {
        let source = parse_page(src);
        let unit = compile_full(&source).unwrap();
        let js = aihu_compiler::emit(&unit, "home-page").js;
        assert!(
            js.starts_with(&format!("// @aihu:shadow {mode}\n")),
            "`$shadow: '{mode}'` must emit its leading marker; got:\n{}",
            &js[..js.len().min(120)]
        );
    }
}
