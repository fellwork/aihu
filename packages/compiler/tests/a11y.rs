/// arch-5 M1 — accessibility primitive integration tests.
/// Covers parser + emit for `<$liveRegion>`, `<$focusTrap>`, `<$skipLink>`,
/// `<$visuallyHidden>` and the `$announce(...)` action-body call site rewrite.
/// References RFC-A5-017..021 in `docs/roadmap/arch-5-sfc-primitives.md` §2.6.

use aihu_compiler::{compile_full, emit, sfc, TemplateNode};
use aihu_compiler::parser::template::parse_template;

// ─── Parser: MacroElement nodes ───────────────────────────────────────────────

#[test]
fn dollar_live_region_parses_as_macro_element() {
    let nodes = parse_template(r#"<$liveRegion politeness="polite"></$liveRegion>"#).unwrap();
    assert_eq!(nodes.len(), 1);
    match &nodes[0] {
        TemplateNode::MacroElement { name, attrs, .. } => {
            assert_eq!(name, "liveRegion");
            assert!(attrs.iter().any(|a| matches!(a,
                aihu_compiler::Attr::Static { name, value } if name == "politeness" && value == "polite"
            )));
        }
        other => panic!("expected MacroElement, got {:?}", other),
    }
}

#[test]
fn dollar_focus_trap_parses_as_macro_element() {
    let nodes = parse_template(r#"<$focusTrap active={isOpen} returnFocus="true"></$focusTrap>"#)
        .unwrap();
    assert_eq!(nodes.len(), 1);
    match &nodes[0] {
        TemplateNode::MacroElement { name, .. } => assert_eq!(name, "focusTrap"),
        other => panic!("expected MacroElement, got {:?}", other),
    }
}

#[test]
fn dollar_skip_link_parses_as_macro_element() {
    let nodes = parse_template(
        r##"<$skipLink target="#main-content">Skip</$skipLink>"##,
    )
    .unwrap();
    assert_eq!(nodes.len(), 1);
    match &nodes[0] {
        TemplateNode::MacroElement { name, attrs, .. } => {
            assert_eq!(name, "skipLink");
            assert!(attrs.iter().any(|a| matches!(a,
                aihu_compiler::Attr::Static { name, value } if name == "target" && value == "#main-content"
            )));
        }
        other => panic!("expected MacroElement, got {:?}", other),
    }
}

#[test]
fn dollar_visually_hidden_parses_as_macro_element() {
    let nodes = parse_template("<$visuallyHidden>Sort by date</$visuallyHidden>").unwrap();
    assert_eq!(nodes.len(), 1);
    match &nodes[0] {
        TemplateNode::MacroElement { name, .. } => assert_eq!(name, "visuallyHidden"),
        other => panic!("expected MacroElement, got {:?}", other),
    }
}

// ─── Emit: <$liveRegion> ──────────────────────────────────────────────────────

#[test]
fn live_region_emit_default_polite_atomic() {
    let src = "@template { <$liveRegion>{statusMessage}</$liveRegion> }";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-live-region-default");
    assert!(
        output.js.contains("'aria-live': 'polite'"),
        "expected aria-live polite default: {}",
        output.js
    );
    assert!(
        output.js.contains("'aria-atomic': 'true'"),
        "expected aria-atomic true default: {}",
        output.js
    );
    assert!(
        output.js.contains("role: 'status'"),
        "expected role=status: {}",
        output.js
    );
}

#[test]
fn live_region_emit_assertive() {
    let src = r#"@template { <$liveRegion politeness="assertive">!</$liveRegion> }"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-live-region-assertive");
    assert!(
        output.js.contains("'aria-live': 'assertive'"),
        "expected aria-live assertive: {}",
        output.js
    );
}

#[test]
fn live_region_emit_atomic_false() {
    let src = r#"@template { <$liveRegion atomic="false">x</$liveRegion> }"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-live-region-atomic-off");
    assert!(
        output.js.contains("'aria-atomic': 'false'"),
        "expected aria-atomic false: {}",
        output.js
    );
}

// ─── Emit: <$visuallyHidden> ──────────────────────────────────────────────────

#[test]
fn visually_hidden_emit_basic() {
    let src = "@template { <$visuallyHidden>Hidden label</$visuallyHidden> }";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-visually-hidden");
    assert!(
        output.js.contains("class: 'aihu-sr-only'"),
        "expected aihu-sr-only class: {}",
        output.js
    );
    assert!(
        output.js.contains("_ensureA11yStyles()"),
        "expected _ensureA11yStyles call: {}",
        output.js
    );
    assert!(
        output.js.contains("_ensureA11yStyles"),
        "expected _ensureA11yStyles import: {}",
        output.js
    );
}

// ─── Emit: <$skipLink> ────────────────────────────────────────────────────────

#[test]
fn skip_link_emit_basic() {
    let src = r##"@template { <$skipLink target="#main-content">Skip to main content</$skipLink> }"##;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-skip-link");
    assert!(
        output.js.contains("href: '#main-content'"),
        "expected href #main-content: {}",
        output.js
    );
    assert!(
        output.js.contains("class: 'aihu-skip-link'"),
        "expected aihu-skip-link class: {}",
        output.js
    );
    assert!(
        output.js.contains("_ensureA11yStyles"),
        "expected _ensureA11yStyles import: {}",
        output.js
    );
}

// ─── Emit: <$focusTrap> ───────────────────────────────────────────────────────

#[test]
fn focus_trap_emit_with_curly_active() {
    let src = "@template { <$focusTrap active={isOpen}><button>X</button></$focusTrap> }";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-focus-trap-curly");
    assert!(
        output.js.contains("createFocusTrap"),
        "expected createFocusTrap call: {}",
        output.js
    );
    assert!(
        output.js.contains("() => (isOpen)"),
        "expected active getter: {}",
        output.js
    );
    // Default returnFocus is true.
    assert!(
        output.js.contains("createFocusTrap(() => (isOpen), true,"),
        "expected default returnFocus=true: {}",
        output.js
    );
}

#[test]
fn focus_trap_emit_with_initial_focus() {
    let src = r##"@template { <$focusTrap active={isOpen} initialFocus=".close-btn"><span>x</span></$focusTrap> }"##;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-focus-trap-initial");
    assert!(
        output.js.contains("createFocusTrap"),
        "expected createFocusTrap call: {}",
        output.js
    );
    assert!(
        output.js.contains("'.close-btn'"),
        "expected initialFocus selector: {}",
        output.js
    );
}

#[test]
fn focus_trap_emit_with_return_focus_false() {
    let src = r##"@template { <$focusTrap active={isOpen} returnFocus="false"><span>x</span></$focusTrap> }"##;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-focus-trap-return-false");
    assert!(
        output.js.contains("createFocusTrap(() => (isOpen), false,"),
        "expected returnFocus=false: {}",
        output.js
    );
}

// ─── Emit: $announce(...) action-body rewrite ────────────────────────────────

#[test]
fn announce_call_site_rewritten_in_action_body() {
    let src = r#"
@state {
  $action: { save: () => { $announce('Changes saved') } }
}
@template {
  <button>Save</button>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-announce-test");
    assert!(
        output.js.contains("__a11y_announce('Changes saved')"),
        "expected $announce → __a11y_announce rewrite: {}",
        output.js
    );
    assert!(
        !output.js.contains("$announce("),
        "expected no surviving $announce( call site: {}",
        output.js
    );
    assert!(
        output.js.contains("announce as __a11y_announce"),
        "expected runtime import alias: {}",
        output.js
    );
}

#[test]
fn announce_not_imported_when_unused() {
    // Sanity: an SFC with no $announce call must NOT import announce.
    let src = r#"
@state {
  $action: { noop: () => { return 1 } }
}
@template {
  <button>x</button>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-no-announce");
    assert!(
        !output.js.contains("__a11y_announce"),
        "expected no announce import: {}",
        output.js
    );
    assert!(
        !output.js.contains(" announce "),
        "expected no announce import token: {}",
        output.js
    );
}

// ─── Combined SFC: liveRegion + focusTrap + announce ─────────────────────────

#[test]
fn a11y_kit_sfc_emits_all_imports() {
    let src = r##"
@state {
  $action: { save: () => { $announce('Saved') } }
}
@template {
  <$skipLink target="#main">Skip</$skipLink>
  <$focusTrap active={modalOpen}>
    <$liveRegion>{status}</$liveRegion>
    <$visuallyHidden>Modal label</$visuallyHidden>
  </$focusTrap>
}
"##;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-a11y-kit");
    for needle in [
        "createFocusTrap",
        "_ensureA11yStyles",
        "announce as __a11y_announce",
        "'aria-live': 'polite'",
        "class: 'aihu-sr-only'",
        "class: 'aihu-skip-link'",
        "href: '#main'",
    ] {
        assert!(
            output.js.contains(needle),
            "expected output to contain {:?}; got:\n{}",
            needle,
            output.js
        );
    }
}
