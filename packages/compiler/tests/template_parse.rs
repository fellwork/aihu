use aihu_compiler::parser::template::parse_template;

#[test]
fn element_static_attrs() {
    let result = parse_template(r#"<div class="foo" id="bar"></div>"#);
    insta::assert_debug_snapshot!(result);
}

#[test]
fn element_no_attrs() {
    let result = parse_template("<span></span>");
    insta::assert_debug_snapshot!(result);
}

#[test]
fn text_interpolation_simple() {
    let result = parse_template("<p>{{ count }}</p>");
    insta::assert_debug_snapshot!(result);
}

#[test]
fn text_interpolation_mixed() {
    let result = parse_template("<p>hello {{ name }}</p>");
    insta::assert_debug_snapshot!(result);
}

#[test]
fn event_binding() {
    // v1.0.8 — Amendment 04: canonical event handler form is `$on.event={fn}`.
    // Legacy `@event="fn"` is now C305.
    let result = parse_template(r#"<button $on.click={increment}></button>"#);
    insta::assert_debug_snapshot!(result);
}

#[test]
fn attr_binding() {
    // v1.0.8 — Amendment 04: canonical reactive HTML attribute form is `$attr={expr}`.
    // Legacy `:attr="expr"` is now C304; plain `attr={expr}` is now C306.
    let result = parse_template(r#"<span $class={cls}></span>"#);
    insta::assert_debug_snapshot!(result);
}

#[test]
fn rejects_legacy_event_binding_alias_c305() {
    // v1.0.8: `@click="fn"` is removed.
    let result = parse_template(r#"<button @click="increment"></button>"#);
    let err = result.expect_err("legacy @event must reject with C305");
    assert_eq!(err.code.as_deref(), Some("C305"));
}

#[test]
fn rejects_legacy_colon_binding_alias_c304() {
    // v1.0.8: `:class="cls"` is removed.
    let result = parse_template(r#"<span :class="cls"></span>"#);
    let err = result.expect_err("legacy :attr must reject with C304");
    assert_eq!(err.code.as_deref(), Some("C304"));
}

#[test]
fn rejects_plain_curly_html_binding_c306() {
    // v1.0.8: plain `class={cls}` is removed.
    let result = parse_template(r#"<span class={cls}></span>"#);
    let err = result.expect_err("plain curly HTML attr binding must reject with C306");
    assert_eq!(err.code.as_deref(), Some("C306"));
}

#[test]
fn nested_elements() {
    let result = parse_template("<div><span>hello</span></div>");
    insta::assert_debug_snapshot!(result);
}

#[test]
fn error_unknown_directive() {
    let result = parse_template(r#"<div v-show="x"></div>"#);
    insta::assert_debug_snapshot!(result);
}

#[test]
fn error_v_if_directive() {
    let result = parse_template(r#"<div v-if="x"></div>"#);
    insta::assert_debug_snapshot!(result);
}

#[test]
fn plain_text_node() {
    let result = parse_template("hello world");
    insta::assert_debug_snapshot!(result);
}

// ─── W1 — boundary-scanner hardening fixtures ─────────────────────────────────
// Fixture ids reference the truth table in
// docs/plans/advanced-js-template-expressions.md. These were the REJECT rows
// (a16/a17/a18/b15/c14) plus the diagnostics rows (a21) — now either accepted
// via the shared lexical scanner or rejected with an honest message.

#[test]
fn w1_a16_regex_in_text_position_accepted() {
    let result = parse_template("<p>{/^a/.test(user.name) ? 1 : 0}</p>");
    insta::assert_debug_snapshot!(result);
}

#[test]
fn w1_a17_string_close_brace_accepted() {
    let result = parse_template("<p>{'}'}</p>");
    insta::assert_debug_snapshot!(result);
}

#[test]
fn w1_b15_attr_string_close_brace_accepted() {
    let result = parse_template(r#"<span $title={'}'}></span>"#);
    insta::assert_debug_snapshot!(result);
}

#[test]
fn w1_c14_each_list_string_close_brace_accepted() {
    let result = parse_template("{#each ['}'] as it}<li>x</li>{/each}");
    insta::assert_debug_snapshot!(result);
}

#[test]
fn w1_a06_template_literal_interpolation_accepted() {
    let result = parse_template("<p>{`Count: ${count}`}</p>");
    insta::assert_debug_snapshot!(result);
}

#[test]
fn w1_a21_double_brace_expression_diagnostic() {
    // `{{count + 1}}` — the `{{` prefix hijacks expressions that start with
    // an object literal; W1 keeps the v0 routing but the message now explains
    // the form and how to escape it.
    let err = parse_template("<p>{{count + 1}}</p>").unwrap_err();
    assert!(
        err.message.contains("v0 single-identifier interpolation form"),
        "{}",
        err.message
    );
    assert!(
        err.message.contains("single braces `{…}`"),
        "{}",
        err.message
    );
    assert!(
        err.fix.as_deref().unwrap_or("").contains("$computed"),
        "fix should suggest hoisting to $computed: {:?}",
        err.fix
    );
}

#[test]
fn w1_a20_double_brace_identifier_still_accepted() {
    // The valid v0 form must keep parsing.
    let result = parse_template("<p>{{count}}</p>");
    insta::assert_debug_snapshot!(result);
}

// ─── W1 — SFC block extractor (a18 class: braces in strings at @template scan) ─

#[test]
fn w1_a18_open_brace_in_string_extracts_template_block() {
    let src = "@template {\n  <p>{'{'}</p>\n}";
    let parsed = aihu_compiler::sfc::parse(src).expect("template block must close");
    assert_eq!(parsed.template, Some("<p>{'{'}</p>"));
}

#[test]
fn w1_a17_close_brace_in_string_extracts_template_block() {
    let src = "@template {\n  <p>{'}'}</p>\n}\n@style {\n  p { color: red; }\n}";
    let parsed = aihu_compiler::sfc::parse(src).expect("template block must close");
    assert_eq!(parsed.template, Some("<p>{'}'}</p>"));
    assert!(parsed.style.is_some(), "trailing @style block must survive");
}

#[test]
fn w1_sfc_template_literal_hole_extracts_template_block() {
    let src = "@template {\n  <p>{`n=${obj['}']}`}</p>\n}";
    let parsed = aihu_compiler::sfc::parse(src).expect("template block must close");
    assert_eq!(parsed.template, Some("<p>{`n=${obj['}']}`}</p>"));
}

#[test]
fn w1_sfc_prose_apostrophes_still_inert() {
    // The @template extractor must NOT treat prose apostrophes as string
    // openers (the reason string-skipping was disabled for templates).
    let src = "@template {\n  <p>don't {count} isn't</p>\n}";
    let parsed = aihu_compiler::sfc::parse(src).expect("template block must close");
    assert_eq!(parsed.template, Some("<p>don't {count} isn't</p>"));
}

#[test]
fn w1_sfc_block_tags_still_extract() {
    let src = "@template {\n  {#if cond}\n    <span>yes</span>\n  {/if}\n}";
    let parsed = aihu_compiler::sfc::parse(src).expect("template block must close");
    assert!(parsed.template.unwrap().contains("{/if}"));
}

#[test]
fn w1_sfc_single_line_block_tags_extract() {
    // Regression guard (W2 report): a `{/if}` handed to the expression
    // scanner would read `/if}…` as a regex literal; the newline bail-out
    // masked it in multi-line fixtures, so ONLY single-line blocks broke.
    // `block_tail_close` must skip tails verbatim regardless of layout.
    let src = "@template { {#if cond}<span>x</span>{/if} }";
    let parsed = aihu_compiler::sfc::parse(src).expect("single-line block must close");
    assert_eq!(parsed.template, Some("{#if cond}<span>x</span>{/if}"));

    let src = "@template { {#each xs as x}<li>{x}</li>{/each} }";
    let parsed = aihu_compiler::sfc::parse(src).expect("single-line each must close");
    assert_eq!(parsed.template, Some("{#each xs as x}<li>{x}</li>{/each}"));

    let src = "@template { {#if a}A{:else}B{/if} }";
    let parsed = aihu_compiler::sfc::parse(src).expect("single-line else must close");
    assert_eq!(parsed.template, Some("{#if a}A{:else}B{/if}"));
}

#[test]
fn w1_sfc_single_line_block_compiles_end_to_end() {
    let src = "@template { {#if cond}<span>x</span>{/if} }";
    let parsed = aihu_compiler::sfc::parse(src).expect("parse");
    let unit = aihu_compiler::compile_full(&parsed).expect("compile");
    let js = aihu_compiler::emit(&unit, "x-w1-oneline").js;
    assert!(js.contains("createIfBoundary"), "{}", js);
}
