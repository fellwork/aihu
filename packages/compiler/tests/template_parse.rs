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
