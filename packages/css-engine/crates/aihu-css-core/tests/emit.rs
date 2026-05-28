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

// ── Round 2: aria-* / data-* attribute variants ─────────────────────────────

#[test]
fn aria_keyword_variant_emits_true_attr_selector() {
    let css = compile_sfc_scoped(&sfc_with_classes("aria-checked:bg-accent"));
    assert!(
        css.contains(r#"[aria-checked="true"]"#),
        "aria-checked: → [aria-checked=\"true\"] selector: {css}"
    );
    assert!(css.contains("background-color: var(--color-accent)"));
}

#[test]
fn aria_expanded_variant() {
    let css = compile_sfc_scoped(&sfc_with_classes("aria-expanded:underline"));
    assert!(
        css.contains(r#"[aria-expanded="true"]"#),
        "aria-expanded: → [aria-expanded=\"true\"]: {css}"
    );
    assert!(css.contains("text-decoration-line: underline"));
}

#[test]
fn aria_disabled_selected_pressed_variants() {
    for (cls, attr) in [
        ("aria-disabled:opacity-50", r#"[aria-disabled="true"]"#),
        ("aria-selected:bg-primary", r#"[aria-selected="true"]"#),
        ("aria-pressed:bg-accent", r#"[aria-pressed="true"]"#),
    ] {
        let css = compile_sfc_scoped(&sfc_with_classes(cls));
        assert!(css.contains(attr), "{cls} → {attr}: {css}");
    }
}

#[test]
fn aria_arbitrary_value_variant() {
    let css = compile_sfc_scoped(&sfc_with_classes("aria-[expanded=false]:underline"));
    assert!(
        css.contains(r#"[aria-expanded="false"]"#),
        "aria-[expanded=false]: → [aria-expanded=\"false\"]: {css}"
    );
}

#[test]
fn data_state_variant_emits_attr_selector() {
    let css = compile_sfc_scoped(&sfc_with_classes("data-[state=open]:bg-accent"));
    assert!(
        css.contains(r#"[data-state="open"]"#),
        "data-[state=open]: → [data-state=\"open\"] selector: {css}"
    );
    assert!(css.contains("background-color: var(--color-accent)"));
}

#[test]
fn data_keyword_variant_is_presence_selector() {
    // Bare `data-active:` is a presence selector (no implicit ="true").
    let css = compile_sfc_scoped(&sfc_with_classes("data-active:underline"));
    assert!(
        css.contains("[data-active]"),
        "data-active: → [data-active] presence selector: {css}"
    );
    assert!(!css.contains(r#"[data-active="true"]"#));
}

// ── Round 2: container queries (@container) ──────────────────────────────────

#[test]
fn container_marker_sets_container_type() {
    let css = compile_sfc_scoped(&sfc_with_classes("@container"));
    assert!(
        css.contains("container-type: inline-size"),
        "@container marker → container-type: inline-size: {css}"
    );
}

#[test]
fn named_container_marker_sets_type_and_name() {
    let css = compile_sfc_scoped(&sfc_with_classes("@container/sidebar"));
    assert!(css.contains("container-type: inline-size"), "{css}");
    assert!(
        css.contains("container-name: sidebar"),
        "@container/sidebar → container-name: sidebar: {css}"
    );
}

#[test]
fn container_md_wraps_rule_in_container_at_rule() {
    let css = compile_sfc_scoped(&sfc_with_classes("@md:flex"));
    assert!(
        css.contains("@container (min-width:"),
        "@md: → @container (min-width: ...): {css}"
    );
    // Container scale differs from the viewport breakpoint scale (md = 28rem).
    assert!(css.contains("28rem"), "container @md = 28rem: {css}");
    assert!(css.contains("display: flex"));
    // Must NOT be an @media rule.
    assert!(!css.contains("@media"), "@md: is a container query, not @media: {css}");
}

#[test]
fn container_sm_lg_scale() {
    let sm = compile_sfc_scoped(&sfc_with_classes("@sm:block"));
    assert!(sm.contains("@container (min-width: 24rem)"), "@sm = 24rem: {sm}");
    let lg = compile_sfc_scoped(&sfc_with_classes("@lg:hidden"));
    assert!(lg.contains("@container (min-width: 32rem)"), "@lg = 32rem: {lg}");
}

#[test]
fn container_parent_and_child_pair() {
    // A @container parent + @md:flex child — the proven user-visible pattern.
    let json = r#"{"tag":"X","astVersion":1,"style":null,"meta":{"name":"X"},
      "template":[{"kind":"element","tag":"div","attrs":[
        {"kind":"static","name":"class","value":"@container"}],
        "children":[{"kind":"element","tag":"div","attrs":[
          {"kind":"static","name":"class","value":"@md:flex"}],"children":[]}]}]}"#;
    let css = compile_sfc_scoped(&ast(json));
    assert!(css.contains("container-type: inline-size"), "{css}");
    assert!(css.contains("@container (min-width: 28rem)"), "{css}");
}

// ── Over-implementation probe: no spurious rules for unknown base utilities ──

#[test]
fn aria_data_without_known_base_emits_nothing() {
    // Unknown base utility behind an aria/data variant must not emit a rule.
    let css = compile_sfc_scoped(&sfc_with_classes(
        "aria-checked:notathing data-[state=open]:alsonope @md:bogus",
    ));
    assert!(
        !css.contains("[aria-checked"),
        "no aria selector for unknown base: {css}"
    );
    assert!(
        !css.contains("[data-state"),
        "no data selector for unknown base: {css}"
    );
    assert!(
        !css.contains("@container"),
        "no container at-rule for unknown base: {css}"
    );
}
