//! Scoped-output, variant, and @theme emission tests (Plan 2 Tasks 4–7).

use aihu_css_core::{compile_sfc_scoped, parse_ast};

fn ast(json: &str) -> aihu_css_core::SfcAst {
    parse_ast(json).unwrap()
}

/// Build a single-element SFC AST with a static class list.
fn sfc_with_classes(classes: &str) -> aihu_css_core::SfcAst {
    let json = format!(
        r#"{{"tag":"X","astVersion":1,"style":null,"meta":{{"name":"X"}},
        "template":[{{"kind":"element","tag":"div","attrs":[
          {{"kind":"static","name":"class","value":"{classes}"}}
        ],"children":[]}}]}}"#
    );
    ast(&json)
}

// ── Task 4: scoped output, no global stylesheet ──────────────────────────────

#[test]
fn scoped_output_has_no_bare_global_utility_sheet() {
    let css = compile_sfc_scoped(&sfc_with_classes("bg-primary p-4"));
    // The utility rules are class selectors inside the shadow <style>; they are
    // scoped by living in the shadow root. There is no separate global sheet.
    assert!(css.contains(".bg-primary"));
    assert!(css.contains("padding: 1rem"));
    // Theme tokens emitted at :host so var(--color-*) resolves in the shadow.
    assert!(css.contains(":host {"));
    assert!(css.contains("--color-primary"));
}

#[test]
fn scoped_folds_authored_style_block() {
    let json = r#"{"tag":"X","astVersion":1,
      "style":{"content":".extra { color: red; }","scope":"scoped"},
      "meta":{"name":"X"},
      "template":[{"kind":"element","tag":"div","attrs":[
        {"kind":"static","name":"class","value":"p-4"}],"children":[]}]}"#;
    let css = compile_sfc_scoped(&ast(json));
    assert!(css.contains(".p-4"));
    assert!(css.contains(".extra { color: red; }"), "authored scoped @style folded in");
}

#[test]
fn global_style_block_passes_through_edge_e6() {
    let json = r#"{"tag":"X","astVersion":1,
      "style":{"content":"body { margin: 0; }","scope":"global"},
      "meta":{"name":"X"},"template":null}"#;
    let css = compile_sfc_scoped(&ast(json));
    assert!(css.contains("body { margin: 0; }"));
    assert!(css.contains("unscoped"), "global block annotated as unscoped");
}

// ── Task 5: WC-native variants ───────────────────────────────────────────────

#[test]
fn host_variant_emits_host_rule() {
    let css = compile_sfc_scoped(&sfc_with_classes("host:bg-primary"));
    assert!(css.contains(":host("), "host: → :host(...) selector: {css}");
    assert!(css.contains("background-color: var(--color-primary)"));
}

#[test]
fn slotted_variants() {
    let css = compile_sfc_scoped(&sfc_with_classes("slotted:p-4 slotted-img:rounded-lg"));
    assert!(css.contains("::slotted("));
    assert!(css.contains("::slotted(img"));
}

#[test]
fn part_variant_emits_part_selector() {
    let css = compile_sfc_scoped(&sfc_with_classes("part-thumb:bg-accent"));
    assert!(css.contains("::part(thumb)"));
}

#[test]
fn host_context_dark_uses_cascade_not_host_context() {
    let css = compile_sfc_scoped(&sfc_with_classes("host-context-dark:bg-surface"));
    assert!(
        !css.contains(":host-context("),
        "Firefox-safe: must NOT emit :host-context(): {css}"
    );
    assert!(css.contains("dark cascade"), "uses the documented cascade mechanism");
    assert!(css.contains(":root.dark"), "dark value gated on consumer .dark scope");
}

// ── Task 6: standard variants ────────────────────────────────────────────────

#[test]
fn hover_variant_appends_pseudo_class() {
    let css = compile_sfc_scoped(&sfc_with_classes("hover:bg-primary"));
    assert!(css.contains(":hover"), "hover: → :hover pseudo-class: {css}");
}

#[test]
fn dark_variant_no_host_context() {
    let css = compile_sfc_scoped(&sfc_with_classes("dark:bg-surface"));
    assert!(!css.contains(":host-context("), "dark: must NOT emit :host-context()");
    assert!(css.contains("dark cascade"));
}

#[test]
fn responsive_md_wraps_media_query() {
    let css = compile_sfc_scoped(&sfc_with_classes("md:p-8"));
    assert!(css.contains("@media (min-width:"), "md: → @media: {css}");
    assert!(css.contains("padding: 2rem"));
}

#[test]
fn arbitrary_selector_variant() {
    let css = compile_sfc_scoped(&sfc_with_classes("[&>div]:text-primary"));
    assert!(css.contains(">div"), "[&>div]: → child selector: {css}");
    assert!(css.contains("color: var(--color-primary)"));
}

#[test]
fn stacked_variants_md_hover() {
    let css = compile_sfc_scoped(&sfc_with_classes("md:hover:bg-primary"));
    assert!(css.contains("@media (min-width:"));
    assert!(css.contains(":hover"));
}

// ── Task 7: @theme directive ─────────────────────────────────────────────────

#[test]
fn theme_override_registers_token() {
    let json = r#"{"tag":"X","astVersion":1,
      "style":{"content":"@theme { --color-primary: oklch(0.7 0.2 30); }","scope":"scoped"},
      "meta":{"name":"X"},
      "template":[{"kind":"element","tag":"div","attrs":[
        {"kind":"static","name":"class","value":"bg-primary"}],"children":[]}]}"#;
    let css = compile_sfc_scoped(&ast(json));
    // The override value is registered as a :host token...
    assert!(css.contains("--color-primary: oklch(0.7 0.2 30)"), "@theme override registered: {css}");
    // ...and the utility references it.
    assert!(css.contains("background-color: var(--color-primary)"));
    // The @theme directive itself is NOT emitted as raw CSS.
    assert!(!css.contains("@theme"), "@theme directive stripped from raw output");
}

#[test]
fn default_aihu_brand_tokens_present() {
    let css = compile_sfc_scoped(&sfc_with_classes("bg-accent"));
    // Default accent is the aihu terracotta.
    assert!(css.contains("--color-accent: #c8543a"), "baked aihu brand default present: {css}");
}
