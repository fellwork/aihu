/// v0.4b — macro attribute parsing + emit integration tests.

use scribe_compiler::{compile, compile_full, emit, sfc, Attr, MacroValue};
use scribe_compiler::parser::template::parse_template;

// ─── Parsing tests ────────────────────────────────────────────────────────────

#[test]
fn macro_if_quoted_parses() {
    let nodes = parse_template("<div $if=\"isVisible\"></div>").unwrap();
    assert_eq!(nodes.len(), 1);
    match &nodes[0] {
        scribe_compiler::TemplateNode::Element { attrs, .. } => {
            assert!(attrs.iter().any(|a| matches!(
                a,
                Attr::Macro { name, value } if name == "if" && *value == MacroValue::Quoted("isVisible".to_string())
            )));
        }
        _ => panic!("expected element"),
    }
}

#[test]
fn macro_show_curly_parses() {
    let nodes = parse_template("<span $show={count > 0}></span>").unwrap();
    match &nodes[0] {
        scribe_compiler::TemplateNode::Element { attrs, .. } => {
            assert!(attrs.iter().any(|a| matches!(
                a,
                Attr::Macro { name, value } if name == "show" && *value == MacroValue::Curly("count > 0".to_string())
            )));
        }
        _ => panic!("expected element"),
    }
}

#[test]
fn macro_once_boolean_parses() {
    let nodes = parse_template("<div $once></div>").unwrap();
    match &nodes[0] {
        scribe_compiler::TemplateNode::Element { attrs, .. } => {
            assert!(attrs.iter().any(|a| matches!(
                a,
                Attr::Macro { name, value } if name == "once" && *value == MacroValue::Boolean
            )));
        }
        _ => panic!("expected element"),
    }
}

#[test]
fn macro_raw_boolean_parses() {
    let nodes = parse_template("<div $raw></div>").unwrap();
    match &nodes[0] {
        scribe_compiler::TemplateNode::Element { attrs, .. } => {
            assert!(attrs.iter().any(|a| matches!(
                a,
                Attr::Macro { name, value } if name == "raw" && *value == MacroValue::Boolean
            )));
        }
        _ => panic!("expected element"),
    }
}

#[test]
fn macro_each_and_key_parse() {
    let nodes = parse_template("<ul $each=\"items\" $key=\"getKey\"></ul>").unwrap();
    match &nodes[0] {
        scribe_compiler::TemplateNode::Element { attrs, .. } => {
            assert!(attrs.iter().any(|a| matches!(a, Attr::Macro { name, .. } if name == "each")));
            assert!(attrs.iter().any(|a| matches!(a, Attr::Macro { name, .. } if name == "key")));
        }
        _ => panic!("expected element"),
    }
}

#[test]
fn macro_bind_prop_parses() {
    let nodes = parse_template("<div $bind:value=\"count\"></div>").unwrap();
    match &nodes[0] {
        scribe_compiler::TemplateNode::Element { attrs, .. } => {
            assert!(attrs.iter().any(|a| matches!(
                a,
                Attr::Macro { name, value } if name == "bind:value" && *value == MacroValue::Quoted("count".to_string())
            )));
        }
        _ => panic!("expected element"),
    }
}

#[test]
fn macro_on_event_parses() {
    let nodes = parse_template("<button $on:click=\"handleClick\"></button>").unwrap();
    match &nodes[0] {
        scribe_compiler::TemplateNode::Element { attrs, .. } => {
            assert!(attrs.iter().any(|a| matches!(
                a,
                Attr::Macro { name, value } if name == "on:click" && *value == MacroValue::Quoted("handleClick".to_string())
            )));
        }
        _ => panic!("expected element"),
    }
}

#[test]
fn macro_memo_curly_parses() {
    let nodes = parse_template("<div $memo={[count]}></div>").unwrap();
    match &nodes[0] {
        scribe_compiler::TemplateNode::Element { attrs, .. } => {
            assert!(attrs.iter().any(|a| matches!(
                a,
                Attr::Macro { name, value } if name == "memo" && *value == MacroValue::Curly("[count]".to_string())
            )));
        }
        _ => panic!("expected element"),
    }
}

// ─── Emit tests ───────────────────────────────────────────────────────────────

#[test]
fn macro_if_emits_create_if_boundary() {
    let src = r#"
@template {
  <div $if="isVisible"><p>hello</p></div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(result.js.contains("createIfBoundary"), "Expected createIfBoundary in: {}", result.js);
    assert!(result.js.contains("isVisible"), "Expected isVisible in: {}", result.js);
}

#[test]
fn macro_show_emits_effect_with_css_var() {
    let src = r#"
@template {
  <div $show={count > 0}></div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(result.js.contains("--show"), "Expected --show in: {}", result.js);
    assert!(result.js.contains("effect("), "Expected effect( in: {}", result.js);
}

#[test]
fn macro_each_emits_create_each_boundary() {
    let src = r#"
@template {
  <ul $each="items" $key="getKey"></ul>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(result.js.contains("createEachBoundary"), "Expected createEachBoundary in: {}", result.js);
    assert!(result.js.contains("items"), "Expected items in: {}", result.js);
    assert!(result.js.contains("getKey"), "Expected getKey in: {}", result.js);
}

#[test]
fn macro_once_emits_create_once_boundary() {
    let src = r#"
@template {
  <div $once><span>static</span></div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(result.js.contains("createOnceBoundary"), "Expected createOnceBoundary in: {}", result.js);
}

#[test]
fn macro_memo_emits_create_memo_boundary() {
    let src = r#"
@template {
  <div $memo={[count]}><span>memo</span></div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(result.js.contains("createMemoBoundary"), "Expected createMemoBoundary in: {}", result.js);
}

#[test]
fn deprecated_event_binding_emits_correct_js() {
    let src = r#"
@template {
  <button @click="handleClick"></button>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(result.js.contains("handleClick"), "Expected handleClick in: {}", result.js);
}

#[test]
fn deprecated_colon_binding_emits_correct_js() {
    let src = r#"
@template {
  <div :value="count"></div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(result.js.contains("count"), "Expected count in: {}", result.js);
}

#[test]
fn c300_bare_value_is_error() {
    let src = r#"
@template {
  <div class=myClass></div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let err = compile_full(&parsed).unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C300"), "Expected C300 error, got: {:?}", err);
}

#[test]
fn macro_bind_and_on_emit_in_attrs_object() {
    let src = r#"
@template {
  <div $bind:value="count" $on:click="handleClick"></div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    // $bind:value → value: count, $on:click → onClick: handleClick
    assert!(result.js.contains("value:") || result.js.contains("count"), "Expected count in: {}", result.js);
}
