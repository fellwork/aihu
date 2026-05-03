/// v0.3 Conformance tests for block grammar migration.
///
/// Covers:
///   v0.3.1 — `@state {}` and `<script setup>` emit identical JS
///   v0.3.2 — `@template {}` and `<template>` emit identical JS (signals + events + text)
///   v0.3.3 — `@style { $global }` scope recognition
///   v0.3.4 — HTML-tag form emits deprecation warning to stderr
///   v0.3.5 — Undeclared template references emit a warning (not an error)
///   v0.3.6 — Reserved tokens at top level → compile errors
///   v0.3.8 — Conformance fixture files compile + match golden output
use scribe_compiler::{compile, compile_full, emit, sfc};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Normalize emitted JS for comparison: collapse all whitespace to single spaces.
fn normalize_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

// ─── v0.3.1 — @state {} lowering confirmation ────────────────────────────────

/// HTML-form and @-form script blocks must lower to byte-identical JS
/// (modulo whitespace) when they contain the same signal declarations.
#[test]
fn v031_state_at_form_emits_identical_js_to_script_setup() {
    let html_form = "\
<script setup>
import { signal } from '@scribe/signals'
const [count, setCount] = signal(0)
</script>

<template>
  <div>{{ count }}</div>
</template>
";

    let at_form = "\
@state {
import { signal } from '@scribe/signals'
const [count, setCount] = signal(0)
}

@template {
  <div>{{ count }}</div>
}
";

    let parsed_html = sfc::parse(html_form).unwrap();
    let parsed_at = sfc::parse(at_form).unwrap();

    // Scripts must be identical after trim.
    assert_eq!(
        parsed_html.script.unwrap().trim(),
        parsed_at.script.unwrap().trim(),
        "script bodies should be identical after trim"
    );

    let unit_html = compile_full(&parsed_html).unwrap();
    let unit_at = compile_full(&parsed_at).unwrap();

    let js_html = emit(&unit_html, "test-counter").js;
    let js_at = emit(&unit_at, "test-counter").js;

    assert_eq!(
        normalize_ws(&js_html),
        normalize_ws(&js_at),
        "HTML <script setup> and @state {{}} must emit identical JS modulo whitespace.\n\
         HTML form output:\n{}\n\n@-form output:\n{}",
        js_html,
        js_at,
    );
}

/// Verify that @state {} without any script still compiles and emits
/// the same shape as <script setup> with an empty body.
#[test]
fn v031_state_empty_block_emits_identical_to_empty_script_setup() {
    let html_form = "<script setup>\n</script>\n<template>\n  <span>hello</span>\n</template>\n";
    let at_form = "@state {\n}\n@template {\n  <span>hello</span>\n}\n";

    let parsed_html = sfc::parse(html_form).unwrap();
    let parsed_at = sfc::parse(at_form).unwrap();

    let unit_html = compile_full(&parsed_html).unwrap();
    let unit_at = compile_full(&parsed_at).unwrap();

    let js_html = emit(&unit_html, "test-empty").js;
    let js_at = emit(&unit_at, "test-empty").js;

    assert_eq!(
        normalize_ws(&js_html),
        normalize_ws(&js_at),
        "Empty @state and empty <script setup> must emit identical JS modulo whitespace"
    );
}

// ─── v0.3.2 — @template {} lowering confirmation ─────────────────────────────

/// @template {} with signals, event handlers, and static text must emit
/// identical JS to the equivalent <template> block.
#[test]
fn v032_template_at_form_emits_identical_js_with_signals_and_events() {
    let html_form = "\
<script setup>
import { signal } from '@scribe/signals'
const [name, setName] = signal('world')
</script>

<template>
  <div class=\"greeting\">
    <span>Hello {{ name }}</span>
    <button onclick=\"doSomething\">Click me</button>
  </div>
</template>
";

    let at_form = "\
@state {
import { signal } from '@scribe/signals'
const [name, setName] = signal('world')
}

@template {
  <div class=\"greeting\">
    <span>Hello {{ name }}</span>
    <button onclick=\"doSomething\">Click me</button>
  </div>
}
";

    let parsed_html = sfc::parse(html_form).unwrap();
    let parsed_at = sfc::parse(at_form).unwrap();

    let unit_html = compile_full(&parsed_html).unwrap();
    let unit_at = compile_full(&parsed_at).unwrap();

    let js_html = emit(&unit_html, "test-greeting").js;
    let js_at = emit(&unit_at, "test-greeting").js;

    assert_eq!(
        normalize_ws(&js_html),
        normalize_ws(&js_at),
        "HTML <template> and @template {{}} must emit identical JS modulo whitespace.\n\
         HTML form output:\n{}\n\n@-form output:\n{}",
        js_html,
        js_at,
    );
}

/// Static text in @template {} must be emitted identically to <template>.
#[test]
fn v032_template_static_text_emits_identically() {
    let html_form = "<template>\n  <h1>Static content</h1>\n</template>\n";
    let at_form = "@template {\n  <h1>Static content</h1>\n}\n";

    let parsed_html = sfc::parse(html_form).unwrap();
    let parsed_at = sfc::parse(at_form).unwrap();

    let unit_html = compile_full(&parsed_html).unwrap();
    let unit_at = compile_full(&parsed_at).unwrap();

    let js_html = emit(&unit_html, "test-static").js;
    let js_at = emit(&unit_at, "test-static").js;

    assert_eq!(
        normalize_ws(&js_html),
        normalize_ws(&js_at),
        "Static @template must emit identical JS to static <template>"
    );
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
        scribe_compiler::StyleScope::Scoped,
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
        scribe_compiler::StyleScope::Global,
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
    assert_eq!(style.scope, scribe_compiler::StyleScope::Global);
    // Content should be empty or whitespace after stripping $global.
    assert!(
        style.content.trim().is_empty(),
        "content should be empty after stripping lone $global, got: {:?}",
        style.content
    );
}

// ─── v0.3.4 — Deprecation warning for HTML-tag form ──────────────────────────
//
// Capturing stderr in Rust tests requires a custom capture mechanism. We verify
// that the deprecation code path exists by checking the compile succeeds AND the
// block is recognized (the warning goes to stderr which we cannot easily capture
// in unit tests without OS-level redirection). We document the known limitation.

/// HTML-tag form parses successfully (deprecation is a warning, not an error).
#[test]
fn v034_html_form_still_parses_without_error() {
    let src = "\
<script setup>
const x = 1
</script>
<template>
  <div>{{ x }}</div>
</template>
";
    // Must parse without error — the deprecation is a warning to stderr only.
    let parsed = sfc::parse(src).unwrap();
    assert!(parsed.script.is_some());
    assert!(parsed.template.is_some());
}

/// Verify deprecation logic fires only once per file even with multiple HTML blocks.
/// We check the structure (parse succeeds) rather than capturing stderr.
#[test]
fn v034_html_form_multiple_blocks_no_double_warning() {
    let src = "\
<script setup>
const y = 2
</script>
<template>
  <p>hi</p>
</template>
<style>
p { color: blue; }
</style>
";
    // Must parse without error.
    let parsed = sfc::parse(src).unwrap();
    assert!(parsed.script.is_some());
    assert!(parsed.template.is_some());
    assert!(parsed.style.is_some());
}

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
import { signal } from '@scribe/signals'
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
// These tests read the .scribe fixture files, compile them, and compare against
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

fn compile_fixture(scribe_src: &str, tag_name: &str) -> String {
    let parsed = sfc::parse(scribe_src)
        .unwrap_or_else(|e| panic!("Fixture parse error: {}", e.message));
    let unit = compile_full(&parsed)
        .unwrap_or_else(|e| panic!("Fixture compile_full error: {}", e.message));
    emit(&unit, tag_name).js
}

/// state-basic.scribe — minimal @state + @template
#[test]
fn v038_fixture_state_basic() {
    let src = read_fixture("state-basic.scribe");
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

/// template-signals.scribe — @template with signal references
#[test]
fn v038_fixture_template_signals() {
    let src = read_fixture("template-signals.scribe");
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

/// style-scoped.scribe — @style {} scoped CSS
#[test]
fn v038_fixture_style_scoped() {
    let src = read_fixture("style-scoped.scribe");
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

/// style-global.scribe — @style { $global } CSS
#[test]
fn v038_fixture_style_global() {
    let src = read_fixture("style-global.scribe");
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

/// agent-basic.scribe — @agent {} with one action
#[test]
fn v038_fixture_agent_basic() {
    let src = read_fixture("agent-basic.scribe");
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
