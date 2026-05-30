//! v1.0.10a — compiler AST-export hook snapshot tests.
//!
//! Covers the three class-forms (Static / Binding / Macro) the CSS-engine
//! scanner keys on, plus the edge cases enumerated in the design spec
//! `docs/superpowers/specs/compiler-ast-export-hook.md` §5: E1, E2, E5, E6,
//! E10, E11.
//!
//! Snapshots assert the serialized JSON wire shape (spec §4.3), so any
//! breaking change to the AST contract surfaces as a snapshot diff.

use aihu_compiler::{compile_to_ast, SfcAstOwned};

/// Serialize the owned AST to pretty JSON for snapshotting. Mirrors the wire
/// format `--ast-json` emits (compact in the CLI; pretty here for readable
/// diffs).
fn ast_json(source: &str, path: Option<&str>) -> String {
    let ast = compile_to_ast(source, path).expect("compile_to_ast should succeed");
    serde_json::to_string_pretty(&ast).expect("serialize")
}

// ─── The three class-forms (the load-bearing contract, spec §3) ──────────────

#[test]
fn class_form_a_static() {
    // Form A — static `class="btn primary"` → Attr::Static → kind:"static".
    let json = ast_json(
        r#"@template { <button class="btn primary">Go</button> }"#,
        Some("Button.aihu"),
    );
    insta::assert_snapshot!(json);
}

#[test]
fn class_form_b_binding() {
    // Form B — reactive `$class={expr}` → Attr::Binding → kind:"binding".
    let json = ast_json(
        r#"@template { <button $class={variant}>Go</button> }"#,
        Some("Button.aihu"),
    );
    insta::assert_snapshot!(json);
}

#[test]
fn class_form_c_macro() {
    // Form C — macro toggle `$class:active={cond}` → Attr::Macro →
    // kind:"macro", name "class:active", value form:"curly".
    let json = ast_json(
        r#"@template { <button $class:active={isActive}>Go</button> }"#,
        Some("Button.aihu"),
    );
    insta::assert_snapshot!(json);
}

#[test]
fn class_three_forms_combined() {
    // The spec §4.3 canonical sample: one binding, one static, one macro on a
    // single element. All three `kind` values must appear distinctly.
    let json = ast_json(
        r#"@template { <button $class={cn('btn', variant)} class="base" $class:loading={busy}>Go</button> }"#,
        Some("Button.aihu"),
    );
    insta::assert_snapshot!(json);
}

// ─── Edge cases from spec §5 ─────────────────────────────────────────────────

#[test]
fn e1_two_class_attrs_static_and_binding() {
    // E1 — `class="base" $class={x}` → two separate attrs entries: one static,
    // one binding. Scanner unions both.
    let json = ast_json(
        r#"@template { <div class="base" $class={x}></div> }"#,
        Some("Card.aihu"),
    );
    insta::assert_snapshot!(json);
}

#[test]
fn e2_array_class_binding() {
    // E2 — `$class={['a', cond && 'b']}` → binding { expr: "['a', cond && 'b']" }.
    let json = ast_json(
        r#"@template { <div $class={['a', cond && 'b']}></div> }"#,
        Some("Card.aihu"),
    );
    insta::assert_snapshot!(json);
}

#[test]
fn e5_no_template_block() {
    // E5 — `@state { ... }` only, no @template → template: null. No error.
    let json = ast_json(
        r#"@state {
  count: number = 0
}"#,
        Some("Counter.aihu"),
    );
    insta::assert_snapshot!(json);
}

#[test]
fn e6_global_style_block() {
    // E6 — `@style { $global ... }` → style: { content, scope: "global" }.
    // sfc.rs already strips the $global token + braces.
    let json = ast_json(
        r#"@style {
  $global {
    body { margin: 0; }
  }
}
@template { <div></div> }"#,
        Some("Layout.aihu"),
    );
    insta::assert_snapshot!(json);
}

#[test]
fn e6_scoped_style_block() {
    // E6 companion — default scoped @style block → scope: "scoped".
    let json = ast_json(
        r#"@style {
  :host { display: block; }
}
@template { <div></div> }"#,
        Some("Layout.aihu"),
    );
    insta::assert_snapshot!(json);
}

#[test]
fn e10_component_vs_html_element_class() {
    // E10 — `<UserCard class="x" />` — a static class on a component node.
    // The scanner should skip component nodes for scoped emission; the AST
    // must still expose the node so the scanner CAN make that decision.
    let json = ast_json(
        r#"@template { <UserCard class="x"></UserCard> }"#,
        Some("Page.aihu"),
    );
    insta::assert_snapshot!(json);
}

#[test]
fn e11_colon_form_is_parse_error_c500() {
    // E11 — colon-form (`$on:click`) is a C500 parse error BEFORE the AST is
    // produced. compile_to_ast must surface the error, never an AST.
    let err = compile_to_ast(
        r#"@template { <button $on:click={fn}></button> }"#,
        Some("Button.aihu"),
    )
    .expect_err("colon-form must reject with C500");
    assert_eq!(err.code.as_deref(), Some("C500"));
}

// ─── PR-2 T2.2 — @meta recipe-catalog fields in the emitted AST-JSON ──────────

#[test]
fn meta_fields_emitted_for_meta_sfc() {
    // An SFC with an `@meta { … }` block must carry the recipe-catalog fields
    // in the emitted AST-JSON `meta` object (R-SERDE-TOLERANT producer side).
    let json = ast_json(
        r#"@meta {
  variants: { variant: ['default', 'ghost'], size: ['sm', 'lg'] },
  slots: ['button'],
  dependencies: ['clsx'],
  registryDependencies: ['utils'],
}
@template { <button>{{ label }}</button> }"#,
        Some("Button.aihu"),
    );
    insta::assert_snapshot!(json);
}

#[test]
fn meta_fields_omitted_when_no_meta_block() {
    // Backward-compatible wire shape: an SFC with NO `@meta` block emits the
    // pre-PR-2 `meta` shape — `{ "name": ... }` only. The empty recipe fields
    // are `skip_serializing_if`-elided so older consumers see no change.
    let json = ast_json(
        r#"@template { <button>Go</button> }"#,
        Some("Button.aihu"),
    );
    assert!(json.contains("\"name\": \"Button\""), "got: {json}");
    assert!(!json.contains("variants"), "empty variants must be elided: {json}");
    assert!(!json.contains("slots"), "empty slots must be elided: {json}");
    assert!(
        !json.contains("dependencies"),
        "empty dependencies must be elided: {json}"
    );
    assert!(
        !json.contains("registryDependencies"),
        "empty registryDependencies must be elided: {json}"
    );
}

/// CROSS-CRATE AST-JSON CONTRACT (the key R-SERDE-TOLERANT deliverable).
///
/// During the staged PR rollout the compiler ships before/after the css-core
/// consumer, so the AST-JSON wire format spans a version-skew window. This
/// test pins both directions of skew:
///
/// (a) An OLD-shape AST-JSON (a `meta` object with ONLY `name`, the pre-PR-2
///     producer shape) must still deserialize into the NEW `SfcAstOwned` —
///     the recipe fields fall back to empty via `#[serde(default)]`.
/// (b) A NEW-shape AST-JSON carrying variants/slots/deps must round-trip
///     (deserialize → re-serialize → re-deserialize) byte-stably.
#[test]
fn cross_crate_ast_json_contract_old_and_new_shape() {
    // (a) OLD shape — no recipe fields on `meta`. Must parse; fields default.
    let old_shape = r#"{
        "tag": "Button",
        "astVersion": 1,
        "style": null,
        "template": null,
        "meta": { "name": "Button" }
    }"#;
    let parsed: SfcAstOwned =
        serde_json::from_str(old_shape).expect("old-shape AST-JSON must still deserialize");
    assert_eq!(parsed.meta.name, "Button");
    assert!(parsed.meta.variants.is_empty(), "variants default to empty");
    assert!(parsed.meta.slots.is_empty(), "slots default to empty");
    assert!(
        parsed.meta.dependencies.is_empty(),
        "dependencies default to empty"
    );
    assert!(
        parsed.meta.registry_dependencies.is_empty(),
        "registryDependencies default to empty"
    );

    // (b) NEW shape — recipe fields present (note the camelCase
    // `registryDependencies` wire key). Must round-trip stably.
    let new_shape = r#"{
        "tag": "Button",
        "astVersion": 1,
        "style": null,
        "template": null,
        "meta": {
            "name": "Button",
            "variants": { "variant": ["default", "ghost"] },
            "slots": ["button"],
            "dependencies": ["clsx"],
            "registryDependencies": ["utils"]
        }
    }"#;
    let parsed_new: SfcAstOwned =
        serde_json::from_str(new_shape).expect("new-shape AST-JSON must deserialize");
    assert_eq!(
        parsed_new.meta.variants.get("variant").map(Vec::as_slice),
        Some(["default".to_string(), "ghost".to_string()].as_slice())
    );
    assert_eq!(parsed_new.meta.slots, vec!["button".to_string()]);
    assert_eq!(parsed_new.meta.dependencies, vec!["clsx".to_string()]);
    assert_eq!(
        parsed_new.meta.registry_dependencies,
        vec!["utils".to_string()]
    );

    // Round-trip: re-serialize then re-deserialize must equal the first parse.
    let reserialized = serde_json::to_string(&parsed_new).expect("serialize");
    let reparsed: SfcAstOwned =
        serde_json::from_str(&reserialized).expect("round-trip deserialize");
    assert_eq!(parsed_new, reparsed, "new-shape AST-JSON must round-trip");

    // Cross-skew sanity: the OLD-shape parse must also re-serialize and parse
    // back identically (older producer → newer consumer → newer producer).
    let old_reserialized = serde_json::to_string(&parsed).expect("serialize old");
    let old_reparsed: SfcAstOwned =
        serde_json::from_str(&old_reserialized).expect("round-trip old");
    assert_eq!(parsed, old_reparsed);
}
