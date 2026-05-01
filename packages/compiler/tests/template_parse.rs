use scribe_compiler::parser::template::parse_template;

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
    let result = parse_template(r#"<button @click="increment"></button>"#);
    insta::assert_debug_snapshot!(result);
}

#[test]
fn attr_binding() {
    let result = parse_template(r#"<span :class="cls"></span>"#);
    insta::assert_debug_snapshot!(result);
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
