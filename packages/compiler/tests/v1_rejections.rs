//! v1.0.7 + v1.0.8 — parser rejections for removed legacy surface forms.
//!
//! v1.0.7 (PR #168, R5.2a) — HTML-tag block grammar rejection (C107).
//! The HTML-tag block form (`<script setup>`, `<template>`, `<style>`, `<agent>`)
//! was deprecated in v0.3 and removed in v1.0.
//!
//! v1.0.8 (R5.2b, Amendment 04 — PR #169) — attribute-binding form rejections.
//! - C304: `:attr="expr"` Vue-shape one-way binding alias is removed.
//! - C305: `@event="fn"` Vue-shape event alias is removed.
//! - C306: plain `attr={expr}` on standard HTML attributes is removed
//!         (`$attr={expr}` is now required — always `$`-prefix).
//!
//! These tests load `.aihu` fixtures from `bench/compiler-conformance/v1-rejections/`
//! and assert `sfc::parse(src)` (or `compile_full`) returns `Err` with the
//! expected code and a message that points the user at `npx aihu migrate`.
//! Inline `#[test]` cases without fixture I/O provide additional coverage.
//!
//! Routing: Builder R5.2a (v1.0.7) + R5.2b-2 (v1.0.8). Brief refs:
//!   - Director r5-sup brief `1e287199-24a8-48f0-a547-ee74b9a04dac`
//!   - Director r5-sup-2 brief `a4cc0505-88fb-40ac-9410-5835cc922e52`
//!   - Architect R5.2b-1 (Amendment 04) `78da6af2-67ad-41d9-844c-e0c95336b164`
//!   - Investigator R5.1 brief `3025c0c2-19c9-4c63-a183-7613f83d4c21`

use aihu_compiler::{compile_full, sfc};

fn read_v1_rejection_fixture(name: &str) -> String {
    let fixture_path = format!(
        "{}/../../bench/compiler-conformance/v1-rejections/{}",
        env!("CARGO_MANIFEST_DIR"),
        name
    );
    std::fs::read_to_string(&fixture_path)
        .unwrap_or_else(|e| panic!("Failed to read v1-rejection fixture {}: {}", name, e))
}

fn assert_c107(src: &str, form_label: &str) {
    let err = sfc::parse(src)
        .expect_err(&format!("HTML-tag form `{}` must be a C107 parse error", form_label));
    assert_eq!(
        err.code,
        Some("C107".to_string()),
        "expected error code C107 for `{}`, got: {:?} (message: {})",
        form_label,
        err.code,
        err.message
    );
    assert!(
        err.message.contains("npx aihu migrate"),
        "C107 error message must include the `npx aihu migrate` hint, got: {}",
        err.message
    );
    assert!(
        err.message.contains(form_label),
        "C107 error message must name the offending HTML-tag form `{}`, got: {}",
        form_label,
        err.message
    );
}

#[test]
fn rejects_html_script_setup_block() {
    let src = read_v1_rejection_fixture("01-html-script-setup.aihu");
    assert_c107(&src, "<script setup>");
}

#[test]
fn rejects_html_template_block() {
    let src = read_v1_rejection_fixture("02-html-template.aihu");
    assert_c107(&src, "<template>");
}

#[test]
fn rejects_html_style_block() {
    let src = read_v1_rejection_fixture("03-html-style.aihu");
    assert_c107(&src, "<style>");
}

#[test]
fn rejects_html_agent_block() {
    let src = read_v1_rejection_fixture("04-html-agent.aihu");
    assert_c107(&src, "<agent>");
}

// ─── Inline rejection cases (defensive duplicates without fixture I/O) ──────

#[test]
fn rejects_inline_script_setup_at_top_level() {
    let src = "<script setup>\nconst x = 1\n</script>\n@template {\n  <div>x</div>\n}\n";
    let err = sfc::parse(src).expect_err("inline <script setup> must error with C107");
    assert_eq!(err.code, Some("C107".to_string()));
    assert!(err.message.contains("npx aihu migrate"));
    assert!(err.message.contains("<script setup>"));
}

#[test]
fn rejects_inline_template_at_top_level() {
    let src = "<template>\n  <p>hi</p>\n</template>\n";
    let err = sfc::parse(src).expect_err("inline <template> must error with C107");
    assert_eq!(err.code, Some("C107".to_string()));
    assert!(err.message.contains("<template>"));
}

#[test]
fn rejects_inline_style_at_top_level() {
    let src = "<style>\ndiv { color: red; }\n</style>\n@template {\n  <div>x</div>\n}\n";
    let err = sfc::parse(src).expect_err("inline <style> must error with C107");
    assert_eq!(err.code, Some("C107".to_string()));
    assert!(err.message.contains("<style>"));
}

#[test]
fn rejects_inline_agent_at_top_level() {
    let src = "<agent>\ndescription: hi\n</agent>\n@template {\n  <div>x</div>\n}\n";
    let err = sfc::parse(src).expect_err("inline <agent> must error with C107");
    assert_eq!(err.code, Some("C107".to_string()));
    assert!(err.message.contains("<agent>"));
}

#[test]
fn at_form_block_with_html_inside_template_is_not_rejected() {
    // The HTML-tag detection must NOT fire on tags INSIDE an @template block —
    // template bodies legitimately contain HTML markup like `<div>` and even
    // `<style scoped>` attributes on inner elements would have been historically
    // accepted. v1.0.7 only rejects top-level HTML-form *block openers*.
    let src = "@template {\n  <div class=\"box\">\n    <p>nested content</p>\n  </div>\n}\n";
    let parsed = sfc::parse(src).expect("plain @template with inner HTML must parse cleanly");
    assert!(parsed.template.is_some());
}

#[test]
fn html_form_error_fires_on_first_offending_tag() {
    // When multiple HTML-tag blocks appear, the C107 error must surface at
    // the first one (no full-file parse required to detect the violation).
    let src = "<script setup>\nconst x = 1\n</script>\n<template>\n  <p>hi</p>\n</template>\n<style>\np { color: red; }\n</style>\n";
    let err = sfc::parse(src).expect_err("must error on the first HTML-tag form encountered");
    assert_eq!(err.code, Some("C107".to_string()));
    assert!(
        err.message.contains("<script setup>"),
        "first offending form should be <script setup>, got message: {}",
        err.message
    );
    // The error line should be 1 (the <script setup> opener is on line 1).
    assert_eq!(err.line, 1, "error must cite line 1 (first HTML-tag opener)");
}

// ─── v1.0.8 / Amendment 04 — C304 / C305 / C306 attribute-binding rejections ─

/// Helper: assert the given `.aihu` source rejects with the given error code
/// and that the error message points the user at `npx aihu migrate`.
fn assert_rejects_with(src: &str, expected_code: &str, label: &str) {
    let parsed = sfc::parse(src)
        .unwrap_or_else(|e| panic!("sfc::parse should succeed for {} (so we can reach compile_full): {:?}", label, e));
    let err = compile_full(&parsed)
        .expect_err(&format!("{} must reject with {}", label, expected_code));
    assert_eq!(
        err.code.as_deref(),
        Some(expected_code),
        "expected error code {} for {}, got: {:?} (message: {})",
        expected_code,
        label,
        err.code,
        err.message
    );
    assert!(
        err.message.contains("npx aihu migrate"),
        "{} error message must include `npx aihu migrate`, got: {}",
        expected_code,
        err.message
    );
}

#[test]
fn rejects_legacy_colon_binding_alias_c304() {
    let src = read_v1_rejection_fixture("05-colon-attr-binding.aihu");
    assert_rejects_with(&src, "C304", "fixture 05 (`:class=`)");
}

#[test]
fn rejects_legacy_event_binding_alias_c305() {
    let src = read_v1_rejection_fixture("06-at-event-binding.aihu");
    assert_rejects_with(&src, "C305", "fixture 06 (`@click=`)");
}

#[test]
fn rejects_plain_curly_html_binding_c306() {
    let src = read_v1_rejection_fixture("07-plain-curly-html-binding.aihu");
    assert_rejects_with(&src, "C306", "fixture 07 (`href={url}`)");
}

// ─── Inline rejection cases (defensive duplicates without fixture I/O) ──────

#[test]
fn rejects_inline_colon_binding_alias_c304() {
    let src = "@template {\n  <div :class=\"cls\"></div>\n}\n";
    assert_rejects_with(src, "C304", "inline `:class=\"cls\"`");
}

#[test]
fn rejects_inline_at_event_binding_alias_c305() {
    let src = "@template {\n  <button @click=\"handler\">click</button>\n}\n";
    assert_rejects_with(src, "C305", "inline `@click=\"handler\"`");
}

#[test]
fn rejects_inline_plain_curly_html_binding_c306() {
    let src = "@template {\n  <a href={url}>link</a>\n}\n";
    assert_rejects_with(src, "C306", "inline `href={url}`");
}

// ─── Unknown top-level block rejection (C204) ───────────────────────────────
//
// fix #1 for the 0.3.0 blank-page defect (investigation
// 17f5394b-6dd8-4504-a2db-88cb5c4050e1): an `@<name> { … }` header that matches
// none of the five recognized blocks was previously SILENTLY DROPPED, so any
// identifiers it "declared" (e.g. `@props { activeNav: string }`) leaked through
// as bare free variables -> ReferenceError -> blank page. It is now a hard error.

#[test]
fn rejects_unknown_props_block_with_prop_hint() {
    // The exact defect shape: a consumer-authored `@props { … }` top-level block.
    let src = "@props { foo: String }\n@template {\n  <div>{foo}</div>\n}\n";
    let err = sfc::parse(src).expect_err("`@props { … }` must be a C204 parse error");
    assert_eq!(
        err.code.as_deref(),
        Some("C204"),
        "expected C204 for `@props` block, got: {:?} (message: {})",
        err.code,
        err.message
    );
    // (a) names the unknown block …
    assert!(
        err.message.contains("@props"),
        "C204 message must name the unknown `@props` block, got: {}",
        err.message
    );
    // … and (b) points the author at the real mechanism (`$prop:` inside `@state`).
    assert!(
        err.message.contains("$prop") && err.message.contains("@state"),
        "C204 message for `@props` must point at `$prop:` inside `@state`, got: {}",
        err.message
    );
}

#[test]
fn rejects_unknown_generic_block() {
    // A non-`props` unknown block header still errors (generic guidance).
    let src = "@widget {\n  count: 1\n}\n@template {\n  <div>hi</div>\n}\n";
    let err = sfc::parse(src).expect_err("`@widget { … }` must be a C204 parse error");
    assert_eq!(err.code.as_deref(), Some("C204"), "expected C204, message: {}", err.message);
    assert!(
        err.message.contains("@widget"),
        "C204 message must name the unknown `@widget` block, got: {}",
        err.message
    );
    // Generic hint lists the recognized blocks.
    assert!(
        err.message.contains("@state") && err.message.contains("@template"),
        "generic C204 message must list the recognized blocks, got: {}",
        err.message
    );
}

#[test]
fn unknown_block_after_valid_blocks_still_errors() {
    // Trailing-region path: an unknown block after a valid `@template` must still
    // be caught (this region is the trailing inter-block scan, not region_before).
    let src = "@template {\n  <div>hi</div>\n}\n@props { foo: String }\n";
    let err = sfc::parse(src).expect_err("trailing `@props` must error");
    assert_eq!(err.code.as_deref(), Some("C204"), "expected C204, message: {}", err.message);
    assert!(err.message.contains("@props"));
}

#[test]
fn at_media_inside_style_is_not_an_unknown_block() {
    // `@media` / `@supports` live INSIDE the `@style` body — that body is never
    // scanned for top-level block headers, so CSS at-rules must NOT trip C204.
    let src = "@style {\n  @media (min-width: 600px) {\n    div { color: red; }\n  }\n}\n@template {\n  <div>hi</div>\n}\n";
    let parsed = sfc::parse(src).expect("`@media` inside `@style` must parse cleanly");
    assert!(parsed.style.is_some());
    assert!(parsed.template.is_some());
}

#[test]
fn all_five_recognized_blocks_still_parse() {
    // Regression guard: a `.aihu` exercising the five legitimate block forms must
    // still parse exactly as before (no regression from the C204 unknown-block fix).
    // `@route` requires a pages/ path (C500), so it is exercised via parse_with_path.
    let src = "@state {\n  const greeting = 'hi'\n}\n\
               @template {\n  <div>{greeting}</div>\n}\n\
               @style {\n  div { color: blue; }\n}\n\
               @agent {\n  input plan: string\n}\n\
               @route {\n  path: '/demo'\n}\n";
    let parsed = sfc::parse_with_path(src, Some("src/pages/demo.aihu"))
        .expect("all five recognized blocks must parse cleanly");
    assert!(parsed.script.is_some(), "@state must parse");
    assert!(parsed.template.is_some(), "@template must parse");
    assert!(parsed.style.is_some(), "@style must parse");
    assert!(parsed.agent.is_some(), "@agent must parse");
    assert!(parsed.route.is_some(), "@route must parse");
}

// ─── Positive sanity tests — canonical v1.0.8 forms must parse cleanly ──────

#[test]
fn dollar_attr_curly_parses_cleanly() {
    // `$class={cls}` (canonical reactive HTML attribute binding) must parse.
    let src = "@template {\n  <span $class={cls}></span>\n}\n";
    let parsed = sfc::parse(src).expect("parse should succeed");
    compile_full(&parsed).expect("compile_full should succeed for `$class={cls}`");
}

#[test]
fn dollar_on_dot_form_parses_cleanly() {
    // `$on.click={fn}` (canonical event handler binding) must parse.
    let src = "@template {\n  <button $on.click={handleClick}>click</button>\n}\n";
    let parsed = sfc::parse(src).expect("parse should succeed");
    compile_full(&parsed).expect("compile_full should succeed for `$on.click={fn}`");
}

#[test]
fn dollar_bind_dot_form_parses_cleanly() {
    // `$bind.value={x}` (canonical two-way binding) must parse.
    let src = "@state {\nconst [name, setName] = signal('')\n}\n@template {\n  <input $bind.value={name}>\n}\n";
    let parsed = sfc::parse(src).expect("parse should succeed");
    compile_full(&parsed).expect("compile_full should succeed for `$bind.value={x}`");
}
