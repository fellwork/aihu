use aihu_compiler::{compile, sfc};

// v1.0.7: HTML-tag block grammar removed. Only `@blockname { … }` form is
// accepted. The "dual-grammar" / equivalence tests from v0.2.2 / v0.3.1-v0.3.4
// were removed in this PR because the HTML-tag form no longer exists.
// Rejection tests for HTML-tag form live in `packages/compiler/tests/v1_rejections.rs`.

#[test]
fn split_valid_full() {
    let src = "@state {\nimport { signal } from '@aihu/signals'\n\nconst [count, setCount] = signal(0)\n}\n\n@template {\n  <div>{{ count }}</div>\n}\n\n@style {\ndiv { color: red; }\n}\n";
    let result = compile(src).unwrap();
    insta::assert_debug_snapshot!(result);
}

#[test]
fn split_missing_template() {
    let src = "@state {\nconst x = 1\n}\n";
    let result = compile(src).unwrap();
    insta::assert_debug_snapshot!(result);
}

#[test]
fn split_missing_script() {
    let src = "@template {\n  <span>hello</span>\n}\n";
    let result = compile(src).unwrap();
    insta::assert_debug_snapshot!(result);
}

#[test]
fn split_extra_whitespace() {
    let src = "\n\n@state {\n\n  const y = 2\n\n}\n\n\n@template {\n\n  <p>text</p>\n\n}\n\n\n";
    let result = compile(src).unwrap();
    insta::assert_debug_snapshot!(result);
}

#[test]
fn split_style_only() {
    let src = "@style {\nbody { margin: 0; }\n}\n";
    let result = compile(src).unwrap();
    insta::assert_debug_snapshot!(result);
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
        aihu_compiler::AihuSource {
            script: None,
            script_line: 0,
            template: None,
            template_line: 0,
            style: None,
            meta: aihu_compiler::ScriptMeta { name: None },
            agent: None,
            route: None,
            stream: None,
            sfc_meta: None,
        }
    );
}
