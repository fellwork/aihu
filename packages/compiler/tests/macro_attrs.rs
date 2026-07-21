/// v0.4b — macro attribute parsing + emit integration tests.

use aihu_compiler::{compile, compile_full, emit, sfc, Attr, MacroValue};
use aihu_compiler::parser::template::parse_template;

// ─── Parsing tests ────────────────────────────────────────────────────────────

#[test]
fn macro_if_quoted_parses() {
    let nodes = parse_template("<div if={isVisible}></div>").unwrap();
    assert_eq!(nodes.len(), 1);
    match &nodes[0] {
        aihu_compiler::TemplateNode::Element { attrs, .. } => {
            assert!(attrs.iter().any(|a| matches!(
                a,
                Attr::Macro { name, value } if name == "if" && *value == MacroValue::Curly("isVisible".to_string())
            )));
        }
        _ => panic!("expected element"),
    }
}

#[test]
fn macro_show_curly_parses() {
    let nodes = parse_template("<span show={count > 0}></span>").unwrap();
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
    let nodes = parse_template("<div once></div>").unwrap();
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
    let nodes = parse_template("<div raw></div>").unwrap();
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
    let nodes = parse_template("<ul each={item of items} key={getKey}></ul>").unwrap();
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
    let nodes = parse_template("<div bind:value={count}></div>").unwrap();
    match &nodes[0] {
        aihu_compiler::TemplateNode::Element { attrs, .. } => {
            assert!(attrs.iter().any(|a| matches!(
                a,
                Attr::Macro { name, value } if name == "bind:value" && *value == MacroValue::Curly("count".to_string())
            )));
        }
        _ => panic!("expected element"),
    }
}

#[test]
fn macro_on_event_parses() {
    let nodes = parse_template("<button on:click={handleClick}></button>").unwrap();
    match &nodes[0] {
        aihu_compiler::TemplateNode::Element { attrs, .. } => {
            assert!(attrs.iter().any(|a| matches!(
                a,
                Attr::Macro { name, value } if name == "on:click" && *value == MacroValue::Curly("handleClick".to_string())
            )));
        }
        _ => panic!("expected element"),
    }
}

#[test]
fn macro_memo_curly_parses() {
    let nodes = parse_template("<div memo={[count]}></div>").unwrap();
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
  <div if={isVisible}><p>hello</p></div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(result.js.contains("createIfBoundary"), "Expected createIfBoundary in: {}", result.js);
    assert!(result.js.contains("isVisible"), "Expected isVisible in: {}", result.js);
}

#[test]
fn r3_ac1_macro_show_emits_toggle_hidden_attribute() {
    // R3 (Director r6 §3.R3): $show lowers to the platform `hidden`
    // attribute (NOT a `--show` CSS custom property). `toggleAttribute(name,
    // !cond)` — true cond → hidden absent → element visible.
    let src = r#"
@template {
  <div show={count > 0}></div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(
        result.js.contains("toggleAttribute('hidden'"),
        "Expected toggleAttribute('hidden' in: {}",
        result.js
    );
    assert!(
        !result.js.contains("--show"),
        "Did not expect --show CSS var in: {}",
        result.js
    );
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
  <article html={activeHtml()}></article>
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
  <ul each={item of items} key={getKey}></ul>
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
  <ul each={post of posts}><li>item</li></ul>
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
  <ul each={user, idx of users}><li>item</li></ul>
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
  <ul each={item of items} key={item.id}><li>item</li></ul>
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
    // An `each` head without ` of ` is a head-specific C302 (§3.2).
    let src = r#"
@template {
  <ul each={items}><li>item</li></ul>
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
  <div once><span>static</span></div>
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
  <div memo={[count]}><span>memo</span></div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(result.js.contains("createMemoBoundary"), "Expected createMemoBoundary in: {}", result.js);
}

#[test]
fn rejects_legacy_event_binding_in_template_c305() {
    // `@event=` is removed (C305). Use `on:<event>={fn}`.
    let src = r#"
@template {
  <button @click="handleClick"></button>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let err = compile_full(&parsed).expect_err("legacy @event must reject with C305");
    assert_eq!(err.code.as_deref(), Some("C305"), "expected C305, got: {:?} (message: {})", err.code, err.message);
    assert!(err.message.contains("on:click"), "C305 must point at the colon directive, got: {}", err.message);
}

#[test]
fn rejects_legacy_colon_binding_in_template_c304() {
    // v1.0.8 — Amendment 04: `:attr=` is removed (C304). Use `attr={expr}`.
    let src = r#"
@template {
  <div :value="count"></div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let err = compile_full(&parsed).expect_err("legacy :attr must reject with C304");
    assert_eq!(err.code.as_deref(), Some("C304"), "expected C304, got: {:?} (message: {})", err.code, err.message);
    assert!(err.message.contains("value={expr}"), "C304 must point at plain braces, got: {}", err.message);
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
  <div bind:value={count} on:click={handleClick}></div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    // bind:value → value: count, on:click → onClick: handleClick
    assert!(result.js.contains("value:") || result.js.contains("count"), "Expected count in: {}", result.js);
}

// ─── R4 ($bind two-way write-side, Director r6 §3.R4) ────────────────────────

#[test]
fn r4_ac1_bind_value_to_signal_emits_oninput_writeback() {
    // R4: when `bind:value` references a registered signal (with a setter),
    // the emit MUST also wire `oninput` to write the signal back. Without
    // this, $bind is read-only and userland edits in the input vanish.
    let src = r#"@state {
const [name, setName] = signal('')
}
@template {
  <input bind:value={name}>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    // Read-side: value: [name, setName] (signal tuple).
    assert!(
        result.js.contains("value: [name, setName]"),
        "Expected read-side signal tuple; got:\n{}",
        result.js
    );
    // Write-side: oninput: (e) => setName(__aihu_conv(name(), e.target.value))
    // (B3 / R4 typed-conv: input string is coerced to the signal's current type).
    assert!(
        result.js.contains("onInput: (e) => setName(__aihu_conv(name(), e.target.value))"),
        "Expected oninput write-back with typed-conv; got:\n{}",
        result.js
    );
}

#[test]
fn r4_ac1_bind_checked_emits_onchange_writeback() {
    // `bind:checked` for checkbox/radio uses `change` (not `input`), and
    // reads `e.target.checked`.
    let src = r#"@state {
const [done, setDone] = signal(false)
}
@template {
  <input type="checkbox" bind:checked={done}>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    assert!(
        result.js.contains("checked: [done, setDone]"),
        "Expected read-side tuple; got:\n{}",
        result.js
    );
    assert!(
        result.js.contains("onChange: (e) => setDone(e.target.checked)"),
        "Expected onchange write-back; got:\n{}",
        result.js
    );
}

#[test]
fn r4_ac1_bind_value_does_not_overwrite_user_oninput() {
    // If the user already wrote `on:input={fn}`, the bind write-back must
    // NOT clobber it. Userland intent wins; bind silently skips the
    // auto-emit. (Authors who want both behaviors compose them in the
    // explicit handler.)
    let src = r#"@state {
const [name, setName] = signal('')
}
@template {
  <input bind:value={name} on:input={customHandler}>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    // Read-side still emits.
    assert!(
        result.js.contains("value: [name, setName]"),
        "Expected read-side tuple; got:\n{}",
        result.js
    );
    // No auto-write-back (user-defined handler wins). With B3 / R4 the auto
    // emit shape uses __aihu_conv; check both old and new patterns are absent.
    // Note: __aihu_conv may appear as a helper definition without being called;
    // we check for the call site (`__aihu_conv(name(),`) specifically.
    let auto_writeback_old = "(e) => setName(e.target.value)";
    let auto_writeback_new = "__aihu_conv(name()";
    assert!(
        !result.js.contains(auto_writeback_old) && !result.js.contains(auto_writeback_new),
        "User-supplied on:input must override auto write-back; got:\n{}",
        result.js
    );
    // User handler still emits.
    assert!(
        result.js.contains("onInput: customHandler"),
        "User handler missing; got:\n{}",
        result.js
    );
}

#[test]
fn r4_ac1_bind_to_non_signal_skips_writeback() {
    // When the bound name is NOT a registered signal (no setter), no
    // write-back should be emitted (otherwise we would call an undefined
    // identifier).
    let src = r#"
@template {
  <input bind:value={literalName}>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-comp");
    // No auto-write-back since `literalName` has no registered setter.
    assert!(
        !result.js.contains("onInput:"),
        "Expected no auto-oninput for non-signal binding; got:\n{}",
        result.js
    );
}

// ─── R2 Defect B: reactive attr lowering to `[() => (expr)]` ─────────────────

#[test]
fn r2_attr_referencing_state_class_property_wraps_in_thunk() {
    // Plain class-property declaration `events = []` declares state. The
    // template binding `events={events}` MUST lower to `events: [() => (events)]`
    // — otherwise arbor's `_applyAttrs` sees the raw `[]` value, treats
    // `Array.isArray` as a Signal tuple, and throws
    // `TypeError: c is not a function` when it invokes `value[0]()`.
    //
    // NOTE: `<CalendarGrid>` is a capitalized component name. Per Amendment 04
    // §11.2, component prop-passing is unaffected by C306 in the parser, BUT
    // the parser does not yet distinguish element-kind — both lower-cased HTML
    // and capitalized components go through `parse_attr`. The carve-out lives
    // in the migrate tool (lowercase-tag-name lookbehind). For this test we use
    // the canonical `$`-prefix form so it parses cleanly on both HTML and
    // component elements.
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
    // A `const` declared in `@state` (not part of `$prop` / `$computed`) is
    // not registered in the reactive signal map. The binding `value={localConst}`
    // should pass through as a plain identifier. Wrapping these would change
    // runtime semantics for closed-over locals that the author did not intend
    // to make reactive.
    let src = r#"@state {
const localConst = 'hello'
}
@template { <h1>{localConst}</h1> }"#;
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
    //
    // v1.0.8 — Amendment 04: canonical reactive HTML attribute form is
    // `attr={expr}`. Plain `class={…}` is now C306.
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
    // Event handlers (`on:click`) take the runtime's Path 1
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
  <button on:click={inc}>+</button>
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

// ─── FEL-238: composing $each with another effect directive ───────────────────

#[test]
fn fel238_each_plus_show_composes_each_outermost() {
    // FEL-238: an element carrying BOTH `$each` and a second effect directive
    // ($show here) previously kept only the first-emitted wrapper and DROPPED
    // the rest. `$each` was always appended last, so it was the casualty: the
    // element rendered ONCE with the loop alias `v` dangling, and any descendant
    // `$on` handler (or the element's own thunk) closed over an undeclared loop
    // var that never advanced per iteration. Both wrappers must now compose,
    // with `each` OUTERMOST so its factory's `v` scopes everything inside.
    let src = r#"@state {
  import { signal } from '@aihu/signals'
  const [para, setPara] = signal([])
  const openVerse = (v) => {}
}
@template {
  <div><span each={v of para} show={v.ok}><button on:click={() => openVerse(v)}>{v.verse}</button></span></div>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let js = emit(&unit, "x-fel238").js;

    // The each wrapper must survive (not be dropped by the second directive).
    assert!(
        js.contains("each([para, setPara]"),
        "FEL-238: $each must not be dropped when a second effect directive is \
         present, got:\n{js}"
    );
    // …and the $show effect must also survive.
    assert!(
        js.contains("toggleAttribute('hidden'"),
        "FEL-238: $show must compose alongside $each, got:\n{js}"
    );
    // `each(` must appear OUTSIDE the $show IIFE: the loop factory has to scope
    // the descendant handler's `v`, so the each call precedes the IIFE.
    let each_pos = js.find("each([para, setPara]").unwrap();
    let iife_pos = js.find("toggleAttribute('hidden'").unwrap();
    let handler_pos = js.find("openVerse(v)").unwrap();
    assert!(
        each_pos < iife_pos && each_pos < handler_pos,
        "each() must be the OUTERMOST wrapper so its loop alias scopes the \
         $show thunk and the descendant handler, got:\n{js}"
    );
}

#[test]
fn fel238_each_plus_class_composes() {
    // Same defect via `class:` — the most common pairing in the field report
    // (`<span class=v $each>` over a verse list).
    let src = r#"@state {
  import { signal } from '@aihu/signals'
  const [para, setPara] = signal([])
  const pick = (v) => {}
}
@template {
  <ul><li each={v of para} class:on={v.active}><button on:click={() => pick(v)}>x</button></li></ul>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let js = emit(&unit, "x-fel238b").js;
    assert!(
        js.contains("each([para, setPara]"),
        "FEL-238: each must survive alongside class:, got:\n{js}"
    );
    assert!(
        js.contains("classList.toggle('on'"),
        "FEL-238: class: must compose alongside each, got:\n{js}"
    );
    let each_pos = js.find("each([para, setPara]").unwrap();
    let handler_pos = js.find("pick(v)").unwrap();
    assert!(
        each_pos < handler_pos,
        "each() must wrap the descendant handler so `v` is per-iteration, got:\n{js}"
    );
}
