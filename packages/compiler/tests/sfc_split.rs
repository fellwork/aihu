use scribe_compiler::{compile, compile_full, emit, sfc};

/// Normalize emitted JS for byte-for-byte comparison modulo whitespace.
///
/// Per the v0.2.2 acceptance gate (plan §v0.2.2 line 114): both grammars must
/// lower to the same emitted JS shape. Whitespace differences between source
/// styles (extra blank lines, indent, trailing newline) are ignored — only
/// non-whitespace tokens matter.
fn normalize_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[test]
fn split_valid_full() {
    let src = "<script setup>\nimport { signal } from '@scribe/signals'\n\nconst [count, setCount] = signal(0)\n</script>\n\n<template>\n  <div>{{ count }}</div>\n</template>\n\n<style>\ndiv { color: red; }\n</style>\n";
    let result = compile(src).unwrap();
    insta::assert_debug_snapshot!(result);
}

#[test]
fn split_missing_template() {
    let src = "<script setup>\nconst x = 1\n</script>\n";
    let result = compile(src).unwrap();
    insta::assert_debug_snapshot!(result);
}

#[test]
fn split_missing_script() {
    let src = "<template>\n  <span>hello</span>\n</template>\n";
    let result = compile(src).unwrap();
    insta::assert_debug_snapshot!(result);
}

#[test]
fn split_extra_whitespace() {
    let src = "\n\n<script setup>\n\n  const y = 2\n\n</script>\n\n\n<template>\n\n  <p>text</p>\n\n</template>\n\n\n";
    let result = compile(src).unwrap();
    insta::assert_debug_snapshot!(result);
}

#[test]
fn split_style_only() {
    let src = "<style>\nbody { margin: 0; }\n</style>\n";
    let result = compile(src).unwrap();
    insta::assert_debug_snapshot!(result);
}

// ─── v0.2.2 dual-grammar fixtures ────────────────────────────────────────────
//
// Per plan §v0.2.2 (docs/superpowers/plans/2026-05-02-scribe-v1-framework.md)
// and Block Structure Spec §2 (Block Declaration Syntax), the parser accepts
// both `<tag>` and `@blockname { }` forms at v0.2. Both lower to the same
// emitted JS shape. No deprecation banner at v0.2 (plan §137).

const DUAL_GRAMMAR_HTML_FORM: &str = "<script setup>\nimport { signal } from '@scribe/signals'\n\nconst [count, setCount] = signal(0)\n</script>\n\n<template>\n  <div>{{ count }}</div>\n</template>\n\n<style>\ndiv { color: red; }\n</style>\n";

const DUAL_GRAMMAR_AT_FORM: &str = "@state {\nimport { signal } from '@scribe/signals'\n\nconst [count, setCount] = signal(0)\n}\n\n@template {\n  <div>{{ count }}</div>\n}\n\n@style {\ndiv { color: red; }\n}\n";

#[test]
fn dual_grammar_html_form() {
    // Existing `<script setup>` / `<template>` / `<style>` form parses cleanly.
    let parsed = sfc::parse(DUAL_GRAMMAR_HTML_FORM).unwrap();
    assert!(parsed.script.is_some());
    assert!(parsed.template.is_some());
    assert!(parsed.style.is_some());
}

#[test]
fn dual_grammar_at_form() {
    // New `@state { }` / `@template { }` / `@style { }` form parses cleanly.
    let parsed = sfc::parse(DUAL_GRAMMAR_AT_FORM).unwrap();
    assert!(parsed.script.is_some());
    assert!(parsed.template.is_some());
    assert!(parsed.style.is_some());
}

#[test]
fn dual_grammar_emits_byte_identical_js_modulo_whitespace() {
    // Acceptance gate (plan §v0.2.2 line 114): both grammars lower to the same
    // emitted JS shape (function form when no agent/route blocks present).
    let parsed_html = sfc::parse(DUAL_GRAMMAR_HTML_FORM).unwrap();
    let parsed_at = sfc::parse(DUAL_GRAMMAR_AT_FORM).unwrap();

    let unit_html = compile_full(&parsed_html).unwrap();
    let unit_at = compile_full(&parsed_at).unwrap();

    let js_html = emit(&unit_html, "dual-counter").js;
    let js_at = emit(&unit_at, "dual-counter").js;

    assert_eq!(
        normalize_ws(&js_html),
        normalize_ws(&js_at),
        "HTML form and @-form must lower to the same emitted JS modulo whitespace.\nHTML:\n{}\n\n@-form:\n{}",
        js_html,
        js_at,
    );
}

#[test]
fn dual_grammar_mixed_forms_errors() {
    // Mixed-grammar error per plan §v0.2.2: first form wins; subsequent opener
    // in the other form is rejected with both spans cited.
    let mixed = "<script setup>\nconst x = 1\n</script>\n\n@template {\n  <h1>Hi</h1>\n}\n";
    let err = sfc::parse(mixed).expect_err("mixed-grammar should error");
    let msg = err.message;
    // Both grammar labels must appear in the diagnostic.
    assert!(
        msg.contains("<tag>") && msg.contains("@blockname { }"),
        "diagnostic should cite both grammar labels, got: {}",
        msg
    );
    // Both line numbers should be cited.
    assert!(
        msg.contains("line 1") && msg.contains("line 5"),
        "diagnostic should cite both source spans, got: {}",
        msg
    );
}

#[test]
fn at_form_handles_interior_braces() {
    // Block Structure Spec §2.4: brace-depth tracking. Object literals,
    // template-string interpolations, and nested blocks inside the body MUST
    // NOT prematurely close the block.
    let src = "@state {\nconst config = { theme: 'dark', nested: { x: 1 } }\nconst tpl = `hello ${name}`\n}\n\n@template {\n  <div>{{ count }}</div>\n}\n";
    let parsed = sfc::parse(src).unwrap();
    let script = parsed.script.unwrap();
    assert!(script.contains("nested: { x: 1 }"));
    assert!(script.contains("`hello ${name}`"));
    assert_eq!(parsed.template, Some("<div>{{ count }}</div>"));
}

#[test]
fn at_form_unclosed_block_errors() {
    let src = "@state {\nconst x = 1\n";
    let err = sfc::parse(src).expect_err("unclosed @state should error");
    assert!(
        err.message.contains("unclosed @state"),
        "got: {}",
        err.message
    );
}

#[test]
fn compile_empty_source() {
    let result = compile("").unwrap();
    assert_eq!(
        result,
        scribe_compiler::ScribeSource {
            script: None,
            template: None,
            style: None,
            meta: scribe_compiler::ScriptMeta { name: None },
            agent: None,
            route: None,
        }
    );
}
