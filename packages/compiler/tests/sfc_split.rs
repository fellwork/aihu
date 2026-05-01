use scribe_compiler::compile;

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
        }
    );
}
