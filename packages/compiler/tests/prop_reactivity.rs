//! R1 — `$prop` reactivity fix + Lit-style optional keys.
//!
//! Builder B1 / Director r5 §5. Acceptance criteria from the build brief:
//!
//! - **AC1**: `$prop`-bearing SFC compiles to options-form
//!   `defineComponent({ props, setup })` (was: arrow `(ctx) => …`).
//! - **AC2**: each prop entry passes through to the runtime's `props: { name:
//!   { value, attribute, reflect, converter } }` shape.
//! - **AC3**: setup body re-binds each prop to a callable signal-getter:
//!   `const name = ctx.props.name`.
//! - **AC5**: template bindings on prop names lower through the reactive
//!   signal_map path (`signal_map.is_reactive(name)` is true → call-syntax
//!   `name()` in lowered output).
//! - **AC6**: `attribute: false` is forwarded verbatim so the runtime omits
//!   it from observedAttributes.
//! - **AC7**: `reflect: true` is forwarded verbatim.
//! - **AC8**: `converter` is forwarded verbatim.
//! - **AC9**: existing `.aihu` files in `examples/` still compile.
//! - **AC11**: `attribute: false + reflect: true` is a compile error (C445).
//!
//! Non-$prop SFCs are not touched (snapshot regression coverage in `codegen.rs`).

use aihu_compiler::{compile_full, emit, sfc};

fn compile_to_js(source: &str, tag: &str) -> String {
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    emit(&unit, tag).js
}

// AC1 — $prop SFC switches to options-form.
#[test]
fn r1_ac1_prop_sfc_emits_options_form() {
    let src = r#"@state {
  $prop: {
    name: { default: 'World', type: string },
  }
}
@template {
  <div>{name}</div>
}"#;
    let js = compile_to_js(src, "x-r1-ac1");
    assert!(
        js.contains("defineComponent({"),
        "should be options-form (got: {})",
        &js[..js.len().min(800)]
    );
    assert!(js.contains("props: {"), "should emit props config");
    assert!(js.contains("setup: (ctx) =>"), "should emit setup arrow");
}

// AC1 — non-$prop SFC stays in arrow function-form.
#[test]
fn r1_ac1_no_prop_sfc_stays_function_form() {
    let src = r#"@state {
import { signal } from '@aihu/signals'
const [count, setCount] = signal(0)
}
@template { <span>{{ count }}</span> }"#;
    let js = compile_to_js(src, "x-r1-noprop");
    assert!(
        js.contains("defineComponent((_ctx)") || js.contains("defineComponent((ctx)"),
        "non-prop SFC should stay function-form (got: {})",
        &js[..js.len().min(400)]
    );
    assert!(!js.contains("props: {"), "no props block expected");
}

// AC2 + AC3 — props config + body declaration shape.
#[test]
fn r1_ac2_ac3_prop_config_and_body() {
    let src = r#"@state {
  $prop: {
    title: { default: 'Hello' },
  }
}
@template { <h1>{title}</h1> }"#;
    let js = compile_to_js(src, "x-r1-ac2");
    assert!(
        js.contains("title: { value: 'Hello' }"),
        "props config should contain `title: {{ value: 'Hello' }}`: {}",
        js
    );
    assert!(
        js.contains("const title = ctx.props.title"),
        "setup body should rebind prop signal: {}",
        js
    );
}

// AC5 — template binding lowers through reactive signal path.
#[test]
fn r1_ac5_template_binding_reactive() {
    let src = r#"@state {
  $prop: {
    label: { default: '' },
  }
}
@template { <span>{label}</span> }"#;
    let js = compile_to_js(src, "x-r1-ac5");
    // `{label}` should lower as a callable-signal leaf, not a static string.
    // The exact emission shape uses the signal-tuple lowering — verify it
    // calls `label()` rather than treating `label` as a bare value.
    assert!(
        js.contains("label()") || js.contains("[label]"),
        "template binding should reactively call the prop signal: {}",
        js
    );
    assert!(
        !js.contains("leaf('label')"),
        "binding should NOT be a literal string"
    );
}

// AC6 — attribute: false flows through verbatim.
#[test]
fn r1_ac6_attribute_false_forwarded() {
    let src = r#"@state {
  $prop: {
    user: { default: null, attribute: false },
  }
}
@template { <div /> }"#;
    let js = compile_to_js(src, "x-r1-ac6");
    assert!(
        js.contains("attribute: false"),
        "attribute: false must be forwarded to runtime: {}",
        js
    );
}

// AC7 — reflect: true flows through verbatim.
#[test]
fn r1_ac7_reflect_true_forwarded() {
    let src = r#"@state {
  $prop: {
    count: { default: 0, reflect: true },
  }
}
@template { <span>{count}</span> }"#;
    let js = compile_to_js(src, "x-r1-ac7");
    assert!(
        js.contains("reflect: true"),
        "reflect: true must be forwarded: {}",
        js
    );
}

// AC8 — converter flows through verbatim (full closure preserved).
#[test]
fn r1_ac8_converter_forwarded() {
    let src = r#"@state {
  $prop: {
    when: {
      default: null,
      attribute: 'when',
      converter: (s) => s ? new Date(s) : null,
    },
  }
}
@template { <time>{when}</time> }"#;
    let js = compile_to_js(src, "x-r1-ac8");
    assert!(
        js.contains("converter: (s) => s ? new Date(s) : null"),
        "converter must be forwarded verbatim: {}",
        js
    );
}

// AC11 — `attribute: false + reflect: true` rejected at compile time (C445).
#[test]
fn r1_ac11_attribute_false_plus_reflect_true_rejected() {
    let src = r#"@state {
  $prop: {
    x: { default: 5, attribute: false, reflect: true },
  }
}
@template { <div /> }"#;
    let parsed = sfc::parse(src).unwrap();
    let res = compile_full(&parsed);
    let err = res.expect_err("compile should fail with C445");
    assert_eq!(err.code.as_deref(), Some("C445"));
    assert!(
        err.message.contains("attribute: false") && err.message.contains("reflect: true"),
        "C445 message should reference both keys: {}",
        err.message
    );
}

// AC9 — existing examples still compile (regression smoke). example-shell.aihu
// is the canonical existing $prop user in the repo.
#[test]
fn r1_ac9_existing_example_shell_still_compiles() {
    let src = include_str!("../../../examples/_shared/example-shell.aihu");
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).expect("example-shell.aihu must still compile");
    let js = emit(&unit, "example-shell").js;
    assert!(js.contains("defineComponent({"), "options-form expected");
    assert!(js.contains("ctx.props.title"), "title prop accessor present");
    assert!(js.contains("ctx.props.sourceUrl"), "sourceUrl prop accessor present");
    assert!(js.contains("ctx.props.liveUrl"), "liveUrl prop accessor present");
}

// AC9 — weather-card.aihu (multi-prop, no `default` on first prop) compiles.
#[test]
fn r1_ac9_existing_weather_card_compiles() {
    let src = include_str!("../../../examples/weather-card/weather-card.aihu");
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).expect("weather-card.aihu must still compile");
    let js = emit(&unit, "weather-card").js;
    assert!(
        js.contains("ctx.props.location") && js.contains("ctx.props.forecast"),
        "all weather-card props must rebind through ctx.props"
    );
}

// Negative — bare $prop entries still rejected (existing behavior preserved).
#[test]
fn r1_negative_bare_prop_still_c444() {
    let src = r#"@state {
  $prop: {
    name: () => 'wrong',
  }
}
@template { <div>{name}</div> }"#;
    let parsed = sfc::parse(src).unwrap();
    let err = compile_full(&parsed).expect_err("bare $prop entry must error");
    assert_eq!(err.code.as_deref(), Some("C444"));
}

// Fixture — exercises every optional key in one SFC.
#[test]
fn r1_fixture_all_keys() {
    let src = include_str!("fixtures/r1-prop-reactivity/all-keys.aihu");
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).expect("fixture must compile");
    let js = emit(&unit, "x-r1-fixture").js;
    // Spot-check every key landed in the emitted props config.
    assert!(js.contains("name: { value: 'World' }"));
    assert!(js.contains("attribute: false"));
    assert!(js.contains("reflect: true"));
    assert!(js.contains("attribute: 'theme'"));
    assert!(js.contains("converter: (s) => s ? new Date(s) : null"));
    // Body re-binds every prop name through ctx.props.
    for n in ["name", "user", "count", "themeMode", "when"] {
        assert!(
            js.contains(&format!("const {} = ctx.props.{}", n, n)),
            "missing rebind for `{}`",
            n
        );
    }
}

// Multiple prop entries — each gets a separate config row + body declaration.
#[test]
fn r1_multi_prop_each_emitted() {
    let src = r#"@state {
  $prop: {
    a: { default: 'a' },
    b: { default: 0 },
    c: { default: false, reflect: true },
  }
}
@template { <div>{a}{b}{c}</div> }"#;
    let js = compile_to_js(src, "x-r1-multi");
    for name in ["a", "b", "c"] {
        assert!(
            js.contains(&format!("const {} = ctx.props.{}", name, name)),
            "missing rebind for prop `{}`: {}",
            name,
            js
        );
        assert!(
            js.contains(&format!("{}: {{", name)),
            "missing config entry for prop `{}`: {}",
            name,
            js
        );
    }
    assert!(js.contains("reflect: true"), "reflect on `c` preserved");
}
