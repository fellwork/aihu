/// v0.3 / v1.0.7 Conformance tests for the @-form block grammar.
///
/// Covers:
///   v0.3.3 — `@style { $global }` scope recognition
///   v0.3.5 — Undeclared template references emit a warning (not an error)
///   v0.3.6 — Reserved tokens at top level → compile errors
///   v0.3.8 — Conformance fixture files compile + match golden output
///
/// v1.0.7: the v0.3.1 (`@state` ↔ `<script setup>` equivalence), v0.3.2
/// (`@template` ↔ `<template>` equivalence), and v0.3.4 (HTML-tag deprecation
/// warning) test sections were deleted. The HTML-tag block grammar is removed
/// in v1.0; equivalence is no longer testable. Rejection tests for the removed
/// grammar live in `packages/compiler/tests/v1_rejections.rs`.
use aihu_compiler::{compile_full, emit, sfc};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Normalize emitted JS for comparison: collapse all whitespace to single spaces.
fn normalize_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

// ─── v0.3.3 — @style { $global } scope recognition ───────────────────────────

/// @style {} without $global → scoped (adoptedStyleSheets on shadow root ctx.host).
#[test]
fn v033_style_at_form_no_global_emits_scoped() {
    let src = "\
@template {
  <div>hello</div>
}

@style {
  div { color: red; }
}
";
    let parsed = sfc::parse(src).unwrap();
    let style = parsed.style.unwrap();
    assert_eq!(
        style.scope,
        aihu_compiler::StyleScope::Scoped,
        "@style without $global must be Scoped"
    );

    let unit = compile_full(&parsed).unwrap();
    let js = emit(&unit, "test-scoped").js;
    assert!(
        js.contains("ctx.host as ShadowRoot"),
        "@style without $global must emit shadow-root adoptedStyleSheets, got:\n{}",
        js
    );
    assert!(
        !js.contains("document.adoptedStyleSheets"),
        "@style without $global must NOT emit document.adoptedStyleSheets"
    );
}

/// @style { $global } → global scope (adoptedStyleSheets on document).
#[test]
fn v033_style_at_form_global_keyword_emits_document_style() {
    let src = "\
@template {
  <div>hello</div>
}

@style {
  $global
  body { margin: 0; }
}
";
    let parsed = sfc::parse(src).unwrap();
    let style = parsed.style.unwrap();
    assert_eq!(
        style.scope,
        aihu_compiler::StyleScope::Global,
        "@style {{ $global }} must set StyleScope::Global"
    );
    // The $global token must be stripped from the CSS content.
    assert!(
        !style.content.contains("$global"),
        "$global must be stripped from style content, got: {:?}",
        style.content
    );
    // The remaining content must contain the actual CSS.
    assert!(
        style.content.contains("body"),
        "style content must retain CSS rules after $global, got: {:?}",
        style.content
    );

    let unit = compile_full(&parsed).unwrap();
    let js = emit(&unit, "test-global").js;
    assert!(
        js.contains("document.adoptedStyleSheets"),
        "@style {{ $global }} must emit document.adoptedStyleSheets, got:\n{}",
        js
    );
    assert!(
        !js.contains("ctx.host as ShadowRoot"),
        "@style {{ $global }} must NOT emit shadow-root adoptedStyleSheets"
    );
}

/// @style { $global } alone (no other CSS) works with an empty body after stripping.
#[test]
fn v033_style_global_only_token_no_css() {
    let src = "@template {\n  <span>x</span>\n}\n@style {\n  $global\n}\n";
    let parsed = sfc::parse(src).unwrap();
    let style = parsed.style.unwrap();
    assert_eq!(style.scope, aihu_compiler::StyleScope::Global);
    // Content should be empty or whitespace after stripping $global.
    assert!(
        style.content.trim().is_empty(),
        "content should be empty after stripping lone $global, got: {:?}",
        style.content
    );
}

// ─── v0.3.4 — HTML-tag form deprecation removed in v1.0.7 ───────────────────
//
// The v0.3.4 deprecation-warning tests are gone. The HTML-tag block grammar is
// a hard error (C107) in v1.0. See `packages/compiler/tests/v1_rejections.rs`
// for the rejection coverage.

// ─── v0.3.5 — Undeclared template references ─────────────────────────────────
//
// v0.3.5 delivers warnings (stderr) not errors. We verify that files with
// undeclared references still compile successfully.

/// Template references to undeclared names compile without errors (warnings only).
#[test]
fn v035_undeclared_template_ref_is_warning_not_error() {
    let src = "\
@state {
const [count, setCount] = signal(0)
}
@template {
  <div>{{ count }} {{ undeclaredName }}</div>
}
";
    // Must not return an error — undeclared refs are v0.3.5 warnings.
    let result = sfc::parse(src);
    assert!(
        result.is_ok(),
        "Undeclared template reference must not cause a compile error in v0.3 (warning only)"
    );
}

/// Template with only declared names compiles cleanly (no warnings).
#[test]
fn v035_declared_template_ref_compiles_cleanly() {
    let src = "\
@state {
import { signal } from '@aihu/signals'
const [count, setCount] = signal(0)
}
@template {
  <div>{{ count }}</div>
}
";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "test-clean");
    assert!(!result.js.is_empty());
}

// ─── v0.3.6 — Reserved token rejection at top level ──────────────────────────

/// `---` at top level is a compile error.
#[test]
fn v036_frontmatter_delimiter_at_top_level_errors() {
    let src = "---\ntitle: My Page\n---\n@template {\n  <h1>hi</h1>\n}\n";
    let err = sfc::parse(src).expect_err("frontmatter --- must be a compile error");
    assert!(
        err.message.contains("frontmatter") && err.message.contains("reserved"),
        "error message must mention frontmatter and reserved, got: {}",
        err.message
    );
    assert_eq!(err.code, Some("C200".to_string()), "error code must be C200");
}

/// `import` statement at top level is a compile error.
#[test]
fn v036_top_level_import_errors() {
    let src = "import x from 'y'\n@template {\n  <h1>hi</h1>\n}\n";
    let err = sfc::parse(src).expect_err("top-level import must be a compile error");
    assert!(
        err.message.contains("import") && err.message.contains("reserved"),
        "error message must mention import and reserved, got: {}",
        err.message
    );
    assert_eq!(err.code, Some("C201".to_string()), "error code must be C201");
}

/// `export` statement at top level is a compile error.
#[test]
fn v036_top_level_export_errors() {
    let src = "export default {}\n@template {\n  <h1>hi</h1>\n}\n";
    let err = sfc::parse(src).expect_err("top-level export must be a compile error");
    assert!(
        err.message.contains("export") && err.message.contains("reserved"),
        "error message must mention export and reserved, got: {}",
        err.message
    );
    assert_eq!(err.code, Some("C202".to_string()), "error code must be C202");
}

/// `;` on its own line at top level is a compile error.
#[test]
fn v036_bare_semicolon_at_top_level_errors() {
    let src = "@template {\n  <h1>hi</h1>\n}\n;\n";
    let err = sfc::parse(src).expect_err("bare ; at top level must be a compile error");
    assert!(
        err.message.contains(';') && err.message.contains("reserved"),
        "error message must mention ; and reserved, got: {}",
        err.message
    );
    assert_eq!(err.code, Some("C203".to_string()), "error code must be C203");
}

/// Comments between blocks are NOT reserved-token errors.
#[test]
fn v036_comments_between_blocks_are_allowed() {
    let src = "// file-level comment\n\n@state {\nconst x = 1\n}\n\n/* another comment */\n\n@template {\n  <div>hi</div>\n}\n";
    let result = sfc::parse(src);
    assert!(
        result.is_ok(),
        "Comments between blocks must not trigger reserved-token errors"
    );
}

/// Frontmatter `---` appearing between blocks (not just at top) is also rejected.
#[test]
fn v036_frontmatter_between_blocks_errors() {
    let src = "@state {\nconst x = 1\n}\n---\n@template {\n  <div>hi</div>\n}\n";
    let err = sfc::parse(src).expect_err("frontmatter --- between blocks must be a compile error");
    assert!(
        err.message.contains("frontmatter"),
        "error must mention frontmatter, got: {}",
        err.message
    );
}

// ─── v0.3.8 — Conformance fixture tests ──────────────────────────────────────
//
// These tests read the .aihu fixture files, compile them, and compare against
// golden .golden.js files. The fixtures live in bench/compiler-conformance/blocks/.

fn read_fixture(name: &str) -> String {
    let path = format!(
        "{}/bench/compiler-conformance/blocks/{}",
        env!("CARGO_MANIFEST_DIR").trim_end_matches("packages/compiler"),
        name
    );
    // Normalize path separators.
    let path = path.replace('\\', "/");
    // Use env!("CARGO_MANIFEST_DIR") which points to packages/compiler.
    let fixture_path = format!(
        "{}/../../bench/compiler-conformance/blocks/{}",
        env!("CARGO_MANIFEST_DIR"),
        name
    );
    std::fs::read_to_string(&fixture_path)
        .unwrap_or_else(|e| panic!("Failed to read fixture {}: {}", name, e))
}

fn compile_fixture(aihu_src: &str, tag_name: &str) -> String {
    let parsed = sfc::parse(aihu_src)
        .unwrap_or_else(|e| panic!("Fixture parse error: {}", e.message));
    let unit = compile_full(&parsed)
        .unwrap_or_else(|e| panic!("Fixture compile_full error: {}", e.message));
    emit(&unit, tag_name).js
}

/// state-basic.aihu — minimal @state + @template
#[test]
fn v038_fixture_state_basic() {
    let src = read_fixture("state-basic.aihu");
    let golden = read_fixture("state-basic.golden.js");
    let actual = compile_fixture(&src, "state-basic");
    assert_eq!(
        normalize_ws(&actual),
        normalize_ws(&golden),
        "state-basic fixture output mismatch.\nActual:\n{}\n\nGolden:\n{}",
        actual,
        golden
    );
}

/// template-signals.aihu — @template with signal references
#[test]
fn v038_fixture_template_signals() {
    let src = read_fixture("template-signals.aihu");
    let golden = read_fixture("template-signals.golden.js");
    let actual = compile_fixture(&src, "template-signals");
    assert_eq!(
        normalize_ws(&actual),
        normalize_ws(&golden),
        "template-signals fixture output mismatch.\nActual:\n{}\n\nGolden:\n{}",
        actual,
        golden
    );
}

/// style-scoped.aihu — @style {} scoped CSS
#[test]
fn v038_fixture_style_scoped() {
    let src = read_fixture("style-scoped.aihu");
    let golden = read_fixture("style-scoped.golden.js");
    let actual = compile_fixture(&src, "style-scoped");
    assert_eq!(
        normalize_ws(&actual),
        normalize_ws(&golden),
        "style-scoped fixture output mismatch.\nActual:\n{}\n\nGolden:\n{}",
        actual,
        golden
    );
}

/// style-global.aihu — @style { $global } CSS
#[test]
fn v038_fixture_style_global() {
    let src = read_fixture("style-global.aihu");
    let golden = read_fixture("style-global.golden.js");
    let actual = compile_fixture(&src, "style-global");
    assert_eq!(
        normalize_ws(&actual),
        normalize_ws(&golden),
        "style-global fixture output mismatch.\nActual:\n{}\n\nGolden:\n{}",
        actual,
        golden
    );
}

/// agent-basic.aihu — @agent {} with one action
#[test]
fn v038_fixture_agent_basic() {
    let src = read_fixture("agent-basic.aihu");
    let golden = read_fixture("agent-basic.golden.js");
    let actual = compile_fixture(&src, "agent-basic");
    assert_eq!(
        normalize_ws(&actual),
        normalize_ws(&golden),
        "agent-basic fixture output mismatch.\nActual:\n{}\n\nGolden:\n{}",
        actual,
        golden
    );
}

// ─── Apostrophe in @template body ────────────────────────────────────────────

/// A bare apostrophe in @template prose (e.g. "Don't panic.") must not trigger
/// string-literal mode and swallow the closing `}`.
#[test]
fn apostrophe_in_template_body_does_not_trigger_string_literal_mode() {
    let src = "\
@state {
const [x, setX] = signal(0)
}
@template {
  <p>Don't panic.</p>
}
";
    let parsed = sfc::parse(src)
        .expect("@template with apostrophe in prose must parse without error");
    assert_eq!(
        parsed.template.unwrap().trim(),
        "<p>Don't panic.</p>",
        "template body must be captured correctly despite apostrophe"
    );
}

/// @state blocks must still skip JS string literals so braces inside strings
/// do not affect brace-depth tracking.
#[test]
fn state_block_string_literal_with_single_quotes_still_skipped() {
    let src = "\
@state {
const s = 'hello { world }'
}
@template {
  <span>hi</span>
}
";
    let parsed = sfc::parse(src)
        .expect("@state with single-quoted string containing braces must parse without error");
    assert!(
        parsed.script.unwrap().contains("'hello { world }'"),
        "@state body must include the full string literal with braces"
    );
}
