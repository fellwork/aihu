//! v1.0.7 — HTML-tag block grammar rejection.
//!
//! The HTML-tag block form (`<script setup>`, `<template>`, `<style>`, `<agent>`)
//! was deprecated in v0.3 and removed in v1.0. The parser must hard-reject any
//! file that opens a top-level block in HTML-tag form with error code C107.
//!
//! These tests mirror the `sfc_conformance.rs::v036_*` rejection pattern:
//! inline `#[test]` functions that load `.aihu` fixtures from
//! `bench/compiler-conformance/v1-rejections/` and assert `sfc::parse(src)`
//! returns `Err` with code `C107` and a message that points the user at
//! `npx aihu migrate`.
//!
//! Routing: Builder R5.2a (Round 5 of aihu-v1-framework). Director r5-sup brief
//! `1e287199-24a8-48f0-a547-ee74b9a04dac`; Investigator R5.1 brief
//! `3025c0c2-19c9-4c63-a183-7613f83d4c21`.

use aihu_compiler::sfc;

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
