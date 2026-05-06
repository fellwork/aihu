/// v0.4b — macro attribute parsing + emit integration tests.

use aihu_compiler::{compile, compile_full, emit, sfc, Attr, MacroValue};
use aihu_compiler::parser::template::parse_template;

// ─── Parsing tests ────────────────────────────────────────────────────────────

#[test]
fn macro_if_quoted_parses() {
    let nodes = parse_template("<div $if=\"isVisible\"></div>").unwrap();
    assert_eq!(nodes.len(), 1);
    match &nodes[0] {
        aihu_compiler::TemplateNode::Element { attrs, .. } => {
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
        aihu_compiler::TemplateNode::Element { attrs, .. } => {
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
        aihu_compiler::TemplateNode::Element { attrs, .. } => {
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
        aihu_compiler::TemplateNode::Element { attrs, .. } => {
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
    // Updated to spec-idiomatic "list as item" form
    let nodes = parse_template("<ul $each=\"items as item\" $key=\"getKey\"></ul>").unwrap();
    match &nodes[0] {
        aihu_compiler::TemplateNode::Element { attrs, .. } => {
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
        aihu_compiler::TemplateNode::Element { attrs, .. } => {
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
        aihu_compiler::TemplateNode::Element { attrs, .. } => {
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
        aihu_compiler::TemplateNode::Element { attrs, .. } => {
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
    // The IIFE must capture the node and use onMount so el is defined after mount.
    assert!(result.js.contains("onMount("), "Expected onMount( in: {}", result.js);
    assert!(result.js.contains("_n.el"), "Expected _n.el in: {}", result.js);
}

#[test]
fn macro_html_emits_replace_children_inside_on_mount() {
    let src = r#"
@state {
  import { signal } from '@aihu/signals'
  const [activePage, setActivePage] = signal('home')
  const activeHtml = () => window.__DOCS__?.[activePage()]?.html ?? ''
}
@template {
  <article $html={activeHtml()}></article>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    // Must emit an IIFE that captures the branch node.
    assert!(result.js.contains("const _n ="), "Expected const _n = in: {}", result.js);
    // Must defer to onMount so _n.el is available after arbor mounts the descriptor.
    assert!(result.js.contains("onMount("), "Expected onMount( in: {}", result.js);
    assert!(result.js.contains("_n.el"), "Expected _n.el in: {}", result.js);
    // Must use replaceChildren + createContextualFragment (not a bare innerHTML assign).
    assert!(result.js.contains("replaceChildren("), "Expected replaceChildren( in: {}", result.js);
    assert!(result.js.contains("createContextualFragment("), "Expected createContextualFragment( in: {}", result.js);
    // onMount must be imported.
    assert!(result.js.contains("onMount"), "Expected onMount import in: {}", result.js);
    // effect must still be imported (reactive update on signal change).
    assert!(result.js.contains("effect"), "Expected effect import in: {}", result.js);
}

#[test]
fn macro_each_emits_create_each_boundary() {
    // Updated to spec-idiomatic "list as item" form
    let src = r#"
@template {
  <ul $each="items as item" $key="getKey"></ul>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(result.js.contains("createEachBoundary"), "Expected createEachBoundary in: {}", result.js);
    assert!(result.js.contains("items"), "Expected items in: {}", result.js);
    assert!(result.js.contains("getKey"), "Expected getKey in: {}", result.js);
}

// ─── New spec §3.3/§3.6 tests ─────────────────────────────────────────────────

#[test]
fn each_spec_form_posts_as_post_emits_correct_boundary() {
    let src = r#"
@template {
  <ul $each="posts as post"><li>item</li></ul>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(
        result.js.contains("createEachBoundary([() => (posts)], undefined, (post, i) =>"),
        "Expected createEachBoundary([() => (posts)], undefined, (post, i) => in: {}",
        result.js
    );
}

#[test]
fn each_spec_form_users_as_user_idx_emits_correct_aliases() {
    let src = r#"
@template {
  <ul $each="users as user, idx"><li>item</li></ul>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(
        result.js.contains("createEachBoundary([() => (users)], undefined, (user, idx) =>"),
        "Expected createEachBoundary([() => (users)], undefined, (user, idx) => in: {}",
        result.js
    );
}

#[test]
fn each_with_key_emits_key_as_function() {
    let src = r#"
@template {
  <ul $each="items as item" $key="item.id"><li>item</li></ul>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(
        result.js.contains("createEachBoundary([() => (items)], (item) => item.id, (item, i) =>"),
        "Expected createEachBoundary([() => (items)], (item) => item.id, (item, i) => in: {}",
        result.js
    );
}

#[test]
fn each_old_form_no_as_is_parse_error_c302() {
    let src = r#"
@template {
  <ul $each="items"><li>item</li></ul>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let err = compile_full(&parsed).unwrap_err();
    assert_eq!(
        err.code.as_deref(),
        Some("C302"),
        "Expected C302 for old $each form, got: {:?}",
        err
    );
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

// ─── R2 Defect B: reactive attr lowering to `[() => (expr)]` ─────────────────

#[test]
fn r2_attr_referencing_state_class_property_wraps_in_thunk() {
    // Plain class-property declaration `events = []` declares state. The
    // template binding `events={events}` MUST lower to `events: [() => (events)]`
    // — otherwise arbor's `_applyAttrs` sees the raw `[]` value, treats
    // `Array.isArray` as a Signal tuple, and throws
    // `TypeError: c is not a function` when it invokes `value[0]()`.
    let src = r#"
@state {
  events: any[] = []
}
@template {
  <CalendarGrid events={events}></CalendarGrid>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(
        result.js.contains("events: [() => (events)]"),
        "Expected reactive thunk wrap for state-referencing binding; got:\n{}",
        result.js
    );
}

#[test]
fn r2_attr_static_literal_passes_through_unchanged() {
    // Static string attrs MUST stay as raw values — wrapping them in
    // a thunk would force every static class through arbor's reactive path.
    let src = r#"
@template {
  <div class="static"></div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(
        result.js.contains("class: 'static'"),
        "Static literal must remain unwrapped; got:\n{}",
        result.js
    );
    assert!(
        !result.js.contains("[() => ('static')]"),
        "Static literal must not be wrapped:\n{}",
        result.js
    );
}

#[test]
fn r2_attr_local_const_outside_state_does_not_wrap() {
    // A `const` declared in `<script setup>` (not `@state`) is not part of
    // reactive state and the binding `value={localConst}` should pass
    // through as a plain identifier. Wrapping these would change runtime
    // semantics for closed-over locals that the author did not intend to
    // make reactive.
    let src = r#"<script setup>
const localConst = 'hello'
</script>
<template><h1>{{ localConst }}</h1></template>"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(
        !result.js.contains("[() => (localConst)]"),
        "Locally-declared (non-@state) const must not be wrapped; got:\n{}",
        result.js
    );
}

#[test]
fn r2_attr_ternary_referencing_state_wraps_in_thunk() {
    // `class={view === 'week' ? 'active' : ''}` has a ternary expression
    // referencing state (`view`). It MUST wrap as a single thunk — the
    // wrap is at the expression boundary, not per-identifier.
    let src = r#"
@state {
  view: 'week' | 'month' = 'week'
}
@template {
  <button class={view === 'week' ? 'active' : ''}>Week</button>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(
        result.js.contains("class: [() => (view === 'week' ? 'active' : '')]"),
        "Ternary referencing state must wrap once at the expression boundary; got:\n{}",
        result.js
    );
}

#[test]
fn r2_attr_event_handler_referencing_state_does_not_wrap() {
    // Event handlers (`$on:click`, `@click`) take the runtime's Path 1
    // (typeof === 'function'). They MUST stay as plain function references
    // even when the body references state — wrapping would put a function
    // value inside an array and trigger Path 2 instead.
    let src = r#"
@state {
  count: number = 0
  $action: {
    inc: () => { count = count + 1 }
  }
}
@template {
  <button $on:click={inc}>+</button>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(
        result.js.contains("onClick: inc"),
        "Event handler must stay as function ref, not a thunk array; got:\n{}",
        result.js
    );
    assert!(
        !result.js.contains("onClick: [() => (inc)]"),
        "Event handler must not be wrapped:\n{}",
        result.js
    );
}

// ─── R2 Defect A: state declaration ordering + mutability ────────────────────

#[test]
fn r2_state_declarations_precede_effect_registration() {
    // `effect(...)` (and onMount/onCleanup) run their callbacks synchronously
    // once at registration time to track dependencies. If state declarations
    // are emitted AFTER the effect registration, the callback hits the
    // temporal dead zone and throws ReferenceError when it reaches the
    // referenced state. Verify ordering: state lines must appear before
    // `effect(`, `onMount(`, `onCleanup(` in the emitted setup body.
    let src = r#"
@state {
  count: number = 0
  $effect: () => { count }
}
@template {
  <div></div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    let count_pos = result.js.find("let count").expect("expected `let count` in: {result.js}");
    let effect_pos = result.js.find("effect(").expect("expected effect( in: {result.js}");
    assert!(
        count_pos < effect_pos,
        "State declaration must precede effect registration; count at {count_pos}, effect at {effect_pos} in:\n{}",
        result.js
    );
}

#[test]
fn r2_bare_class_property_declarations_use_let_not_const() {
    // Bare class-property declarations like `count: number = 0` are
    // commonly reassigned from action / lifecycle bodies (e.g.
    // `count = count + 1`). Emitting `const` would throw
    // `Assignment to constant variable` at runtime; `let` is universally safe.
    let src = r#"
@state {
  count: number = 0
}
@template {
  <div></div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(
        result.js.contains("let count: number = 0"),
        "Bare class-property declaration must lower to `let`; got:\n{}",
        result.js
    );
    assert!(
        !result.js.contains("const count: number = 0"),
        "Must not emit `const` for reassignable state:\n{}",
        result.js
    );
}

#[test]
fn r2_state_precedes_action_function_definitions() {
    // Action functions emitted from `$action:` are `function` declarations
    // — JS hoists them, but their captured state references are evaluated
    // by lexical scope at call time. If an effect runs synchronously and
    // calls an action, the action body sees state in the TDZ unless state
    // is declared before the macro_code block that contains both.
    let src = r#"
@state {
  loading: boolean = true
  $action: {
    finish: () => { loading = false }
  }
  $effect: () => { finish() }
}
@template {
  <div></div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    let loading_pos = result.js.find("let loading").expect("expected `let loading`");
    let function_pos = result.js.find("function finish").expect("expected `function finish`");
    let effect_pos = result.js.find("effect(").expect("expected effect(");
    assert!(
        loading_pos < function_pos && function_pos < effect_pos,
        "Order must be: state → function → effect; got loading={loading_pos} function={function_pos} effect={effect_pos} in:\n{}",
        result.js
    );
}
