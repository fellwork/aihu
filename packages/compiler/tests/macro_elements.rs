/// v0.5 — macro element (`<$element>`) parsing + emit integration tests.
/// Covers: <slot>, <suspense>, <shield>, <guard>, <warp>,
/// deprecation of <slot> HTML form, C400 mutual-exclusion, C401 inline-JSX.

use aihu_compiler::{compile_full, emit, sfc, TemplateNode};
use aihu_compiler::parser::template::parse_template;

// ─── Parser: MacroElement nodes ───────────────────────────────────────────────

#[test]
fn dollar_slot_parses_as_macro_element() {
    let nodes = parse_template("<slot></slot>").unwrap();
    assert_eq!(nodes.len(), 1);
    match &nodes[0] {
        TemplateNode::MacroElement { name, .. } => {
            assert_eq!(name, "slot");
        }
        other => panic!("expected MacroElement, got {:?}", other),
    }
}

#[test]
fn dollar_suspense_parses_as_macro_element() {
    let nodes = parse_template(
        r#"<suspense source="dataPromise"></suspense>"#,
    )
    .unwrap();
    assert_eq!(nodes.len(), 1);
    match &nodes[0] {
        TemplateNode::MacroElement { name, .. } => {
            assert_eq!(name, "suspense");
        }
        other => panic!("expected MacroElement, got {:?}", other),
    }
}

#[test]
fn dollar_shield_parses_as_macro_element() {
    let nodes = parse_template("<shield></shield>").unwrap();
    assert_eq!(nodes.len(), 1);
    match &nodes[0] {
        TemplateNode::MacroElement { name, .. } => {
            assert_eq!(name, "shield");
        }
        other => panic!("expected MacroElement, got {:?}", other),
    }
}

#[test]
fn dollar_guard_parses_as_macro_element() {
    let nodes = parse_template(r#"<guard check="isAuthed"></guard>"#).unwrap();
    assert_eq!(nodes.len(), 1);
    match &nodes[0] {
        TemplateNode::MacroElement { name, attrs, .. } => {
            assert_eq!(name, "guard");
            assert!(attrs.iter().any(|a| match a {
                aihu_compiler::Attr::Static { name, value } => {
                    name == "check" && value == "isAuthed"
                }
                _ => false,
            }));
        }
        other => panic!("expected MacroElement, got {:?}", other),
    }
}

#[test]
fn dollar_warp_parses_as_macro_element() {
    let nodes = parse_template(r##"<warp target="#portal"></warp>"##).unwrap();
    assert_eq!(nodes.len(), 1);
    match &nodes[0] {
        TemplateNode::MacroElement { name, .. } => {
            assert_eq!(name, "warp");
        }
        other => panic!("expected MacroElement, got {:?}", other),
    }
}

#[test]
fn deprecated_slot_html_form_parses_as_macro_element() {
    // <slot> is DEPRECATED but should parse identically to <slot>
    let nodes = parse_template("<slot></slot>").unwrap();
    assert_eq!(nodes.len(), 1);
    match &nodes[0] {
        TemplateNode::MacroElement { name, .. } => {
            assert_eq!(name, "slot", "<slot> HTML form should parse as MacroElement 'slot'");
        }
        other => panic!("expected MacroElement (deprecated slot), got {:?}", other),
    }
}

#[test]
fn dollar_slot_with_expose_attr_parses() {
    let nodes = parse_template(r#"<slot expose="user, index"></slot>"#).unwrap();
    assert_eq!(nodes.len(), 1);
    match &nodes[0] {
        TemplateNode::MacroElement { name, attrs, .. } => {
            assert_eq!(name, "slot");
            assert!(attrs.iter().any(|a| match a {
                aihu_compiler::Attr::Static { name, value } => {
                    name == "expose" && value == "user, index"
                }
                _ => false,
            }));
        }
        other => panic!("expected MacroElement, got {:?}", other),
    }
}

#[test]
fn dollar_slot_with_named_slot_child() {
    let nodes = parse_template(
        r#"<suspense source="p"><slot name="fallback"><span></span></slot></suspense>"#,
    )
    .unwrap();
    assert_eq!(nodes.len(), 1);
    match &nodes[0] {
        TemplateNode::MacroElement { name, children, .. } => {
            assert_eq!(name, "suspense");
            assert_eq!(children.len(), 1);
            match &children[0] {
                TemplateNode::MacroElement { name, .. } => assert_eq!(name, "slot"),
                other => panic!("expected nested MacroElement slot, got {:?}", other),
            }
        }
        other => panic!("expected MacroElement, got {:?}", other),
    }
}

// ─── C400: fallback mutual-exclusion ─────────────────────────────────────────

#[test]
fn c400_suspense_both_fallback_attr_and_slot_child_is_error() {
    let result = parse_template(
        r#"<suspense source="p" fallback="loading"><slot name="fallback"><span></span></slot></suspense>"#,
    );
    let err = result.expect_err("C400 should be a compile error");
    assert_eq!(
        err.code.as_deref(),
        Some("C400"),
        "expected C400, got: {}",
        err.message
    );
    assert!(
        err.message.contains("conflicting fallback"),
        "C400 message should mention conflicting fallback: {}",
        err.message
    );
}

#[test]
fn c400_shield_both_fallback_attr_and_slot_child_is_error() {
    let result = parse_template(
        r#"<shield fallback="error"><slot name="fallback"><span></span></slot></shield>"#,
    );
    let err = result.expect_err("C400 should be a compile error for <shield>");
    assert_eq!(err.code.as_deref(), Some("C400"));
}

#[test]
fn c400_fallback_attr_only_is_ok() {
    let result =
        parse_template(r#"<suspense source="p" fallback="loading"></suspense>"#);
    assert!(result.is_ok(), "fallback attr only should be fine");
}

#[test]
fn c400_fallback_slot_child_only_is_ok() {
    let result = parse_template(
        r#"<suspense source="p"><slot name="fallback"><span></span></slot></suspense>"#,
    );
    assert!(result.is_ok(), "fallback slot child only should be fine");
}

// ─── C401: inline JSX in attributes ─────────────────────────────────────────

#[test]
fn c401_inline_jsx_in_curly_attr_is_error() {
    let result = parse_template(r#"<div show={<Skeleton />}></div>"#);
    let err = result.expect_err("C401 should fire on inline JSX in attribute");
    assert_eq!(
        err.code.as_deref(),
        Some("C401"),
        "expected C401, got: {}",
        err.message
    );
    assert!(
        err.message.contains("inline JSX"),
        "C401 message should mention inline JSX: {}",
        err.message
    );
}

#[test]
fn c401_inline_jsx_with_space_in_curly_attr_is_error() {
    let result = parse_template(r#"<div show={ <Spinner>}></div>"#);
    let err = result.expect_err("C401 should fire on inline JSX (space form)");
    assert_eq!(err.code.as_deref(), Some("C401"));
}

#[test]
fn c401_normal_curly_attr_is_ok() {
    let result = parse_template(r#"<div show={count > 0}></div>"#);
    assert!(result.is_ok(), "non-JSX curly attr should be fine");
}

// ─── Emit: createSlotBoundary ─────────────────────────────────────────────────

#[test]
fn slot_emit_default_slot() {
    let src = "@template { <slot></slot> }";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-slot-test");
    assert!(
        output.js.contains("createSlotBoundary"),
        "expected createSlotBoundary: {}",
        output.js
    );
    assert!(
        output.js.contains("expose: []"),
        "expected expose: []: {}",
        output.js
    );
}

#[test]
fn slot_emit_expose_list() {
    let src = r#"@template { <slot expose="user, index"></slot> }"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-slot-expose");
    assert!(
        output.js.contains("createSlotBoundary"),
        "expected createSlotBoundary: {}",
        output.js
    );
    assert!(
        output.js.contains("'user'"),
        "expected expose item 'user': {}",
        output.js
    );
    assert!(
        output.js.contains("'index'"),
        "expected expose item 'index': {}",
        output.js
    );
}

#[test]
fn slot_emit_named_slot() {
    let src = r#"@template { <slot name="header"></slot> }"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-named-slot-v2");
    assert!(
        output.js.contains("createSlotBoundary"),
        "expected createSlotBoundary: {}",
        output.js
    );
    assert!(
        output.js.contains("name: 'header'"),
        "expected name: 'header': {}",
        output.js
    );
}

// ─── Emit: createSuspenseBoundary ─────────────────────────────────────────────

#[test]
fn suspense_emit_basic() {
    let src = r#"@template { <suspense source="dataPromise"><slot name="fallback"><span></span></slot><p></p></suspense> }"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-suspense-test");
    assert!(
        output.js.contains("createSuspenseBoundary"),
        "expected createSuspenseBoundary: {}",
        output.js
    );
    assert!(
        output.js.contains("dataPromise"),
        "expected dataPromise source: {}",
        output.js
    );
}

// ─── Emit: createShieldBoundary ──────────────────────────────────────────────

#[test]
fn shield_emit_basic() {
    let src = r#"@template { <shield><p></p><slot name="fallback"><span></span></slot></shield> }"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-shield-test");
    assert!(
        output.js.contains("createShieldBoundary"),
        "expected createShieldBoundary: {}",
        output.js
    );
    assert!(
        output.js.contains("(shield) =>"),
        "expected shield context parameter: {}",
        output.js
    );
}

// ─── Emit: createGuardBoundary ────────────────────────────────────────────────

#[test]
fn guard_emit_basic() {
    let src = r#"@template { <guard check="isAuthed"><p></p><slot name="fallback"><span></span></slot></guard> }"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-guard-test");
    assert!(
        output.js.contains("createGuardBoundary"),
        "expected createGuardBoundary: {}",
        output.js
    );
    assert!(
        output.js.contains("isAuthed"),
        "expected check expression: {}",
        output.js
    );
    assert!(
        output.js.contains("(guard) =>"),
        "expected guard context parameter: {}",
        output.js
    );
}

// ─── Emit: createWarpBoundary ─────────────────────────────────────────────────

#[test]
fn warp_emit_basic() {
    let src = r##"@template { <warp target="#portal"><p></p></warp> }"##;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-warp-test");
    assert!(
        output.js.contains("createWarpBoundary"),
        "expected createWarpBoundary: {}",
        output.js
    );
    assert!(
        output.js.contains("#portal"),
        "expected target selector: {}",
        output.js
    );
    assert!(
        output.js.contains("NOTE(v0.5-stub)"),
        "warp must include stub comment: {}",
        output.js
    );
}

// ─── Deprecated <slot> HTML form emits same lowering as <slot> ───────────────

#[test]
fn deprecated_slot_html_form_emits_create_slot_boundary() {
    let src = "@template { <slot></slot> }";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-deprecated-slot");
    assert!(
        output.js.contains("createSlotBoundary"),
        "deprecated <slot> must emit createSlotBoundary (same as <slot>): {}",
        output.js
    );
}

// ─── Grammar v2 §2.6 — enhanced <a> behavior fixtures (40-spec §8.1/§8.6) ────
//
// The element the author writes and the element the runtime renders are the
// same element: an internal <a href> lowers to the same createLinkBoundary
// call the retired <$link> compiled to; the auto-opt-outs and the explicit
// `reload` render a plain branch('a', …) instead.

#[cfg(test)]
mod enhanced_anchor {
    use aihu_compiler::{compile_full, emit, sfc};

    fn compile(src: &str) -> String {
        let parsed = sfc::parse(src).unwrap();
        let unit = compile_full(&parsed).unwrap();
        emit(&unit, "x-anchor").js
    }

    #[test]
    fn internal_href_is_spa_enhanced() {
        let js = compile("@template {\n  <a href=\"/about\" prefetch=\"hover\">About</a>\n}");
        assert!(
            js.contains("createLinkBoundary('/about', 'hover', false,"),
            "internal <a> must lower to createLinkBoundary with prefetch parity: {}",
            js
        );
        // The helper carries the runtime origin/scheme auto-opt-out.
        assert!(
            js.contains("_u.origin !== location.origin"),
            "runtime origin check must be part of the link helper: {}",
            js
        );
    }

    #[test]
    fn dynamic_href_is_enhanced_with_thunk() {
        let js = compile("@template {\n  <a href={`/city/${slug}`}>Forecast</a>\n}");
        assert!(
            js.contains("createLinkBoundary(() => ("),
            "dynamic href must pass a reactive thunk: {}",
            js
        );
    }

    #[test]
    fn replace_carries_over() {
        let js = compile("@template {\n  <a href=\"/x\" replace>go</a>\n}");
        assert!(
            js.contains("createLinkBoundary('/x', 'none', true,"),
            "bare `replace` must lower to true: {}",
            js
        );
    }

    #[test]
    fn target_blank_opts_out() {
        let js = compile("@template {\n  <a href=\"/x\" target=\"_blank\">ext</a>\n}");
        assert!(!js.contains("createLinkBoundary"), "target=_blank must opt out: {}", js);
        assert!(js.contains("branch('a',"), "plain anchor expected: {}", js);
    }

    #[test]
    fn download_opts_out() {
        let js = compile("@template {\n  <a href=\"/file.pdf\" download>dl</a>\n}");
        assert!(!js.contains("createLinkBoundary"), "download must opt out: {}", js);
    }

    #[test]
    fn external_origin_opts_out() {
        let js = compile("@template {\n  <a href=\"https://example.com/x\">ext</a>\n}");
        assert!(!js.contains("createLinkBoundary"), "external origin must opt out: {}", js);
    }

    #[test]
    fn non_http_scheme_opts_out() {
        let js = compile("@template {\n  <a href=\"mailto:hi@example.com\">mail</a>\n}");
        assert!(!js.contains("createLinkBoundary"), "mailto: must opt out: {}", js);
    }

    #[test]
    fn explicit_reload_opts_out_and_is_not_rendered() {
        let js = compile("@template {\n  <a href=\"/legacy\" reload>full load</a>\n}");
        assert!(!js.contains("createLinkBoundary"), "`reload` must opt out: {}", js);
        assert!(
            !js.contains("reload"),
            "`reload` is framework vocabulary — never a DOM attribute: {}",
            js
        );
    }

    #[test]
    fn fragment_href_stays_plain() {
        let js = compile("@template {\n  <a href=\"#section\">jump</a>\n}");
        assert!(!js.contains("createLinkBoundary"), "fragment link must stay plain: {}", js);
    }
}
