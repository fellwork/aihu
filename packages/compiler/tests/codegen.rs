use aihu_compiler::{compile_full, emit, sfc};

fn counter_source() -> &'static str {
    concat!(
        "@state {
",
        "import { signal } from '@aihu/signals'
",
        "
",
        "const [count, setCount] = signal(0)
",
        "const increment = () => setCount(c => c + 1)
",
        "}
",
        "
",
        "@template {
",
        "  <div class=\"counter\">
",
        "    <span>{{ count }}</span>
",
        // v1.0.8 — Amendment 04: `$on.click={fn}` canonical form. Legacy
        // `@click="fn"` is now C305.
        "    <button $on.click={increment}>+</button>
",
        "  </div>
",
        "}"
    )
}

#[test]
fn counter_full() {
    let parsed = sfc::parse(counter_source()).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "counter");
    insta::assert_snapshot!(output.js);
}

#[test]
fn no_signals_plain_leaf() {
    let src = concat!(
        "@state {
",
        "const message = 'hello'
",
        "}
",
        "@template { <p>{{ message }}</p> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-msg");
    insta::assert_snapshot!(output.js);
}

#[test]
fn event_attr_onclick() {
    let src = concat!(
        "@state {
",
        "const handler = () => {}
",
        "}
",
        // v1.0.8 — Amendment 04: canonical event handler form is `$on.click={fn}`.
        // Legacy `@click="fn"` is now C305.
        "@template { <button $on.click={handler}>click</button> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-btn");
    insta::assert_snapshot!(output.js);
}

#[test]
fn signal_leaf_cast() {
    let src = concat!(
        "@state {
",
        "const [val, setVal] = signal(0)
",
        "}
",
        "@template { <span>{{ val }}</span> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-val");
    insta::assert_snapshot!(output.js);
}

#[test]
fn plain_var_no_cast() {
    let src = concat!(
        "@state {
",
        "const title = 'hello'
",
        "}
",
        "@template { <h1>{{ title }}</h1> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-head");
    insta::assert_snapshot!(output.js);
}

#[test]
fn style_scoped_emits_css_in_function_form() {
    let src = concat!(
        "@state {
",
        "const [count, setCount] = signal(0)
",
        "}
",
        "@template { <span>{{ count }}</span> }
",
        "@style {
",
        "span { color: red; }
",
        "}"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-styled");
    insta::assert_snapshot!(output.js);
}

#[test]
fn ctx_param_present() {
    let src = concat!(
        "@state {
",
        "const [val, setVal] = signal(0)
",
        "}
",
        "@template { <span>{{ val }}</span> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-ctx");
    assert!(
        output.js.contains("defineComponent((_ctx)"),
        "output must contain defineComponent((_ctx)"
    );
    insta::assert_snapshot!(output.js);
}

#[test]
fn import_type_signal_present() {
    let src = concat!(
        "@state {
",
        "const [val, setVal] = signal(0)
",
        "}
",
        "@template { <span>{{ val }}</span> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-sig");
    assert!(
        output.js.contains("import type { Signal }"),
        "output must contain import type {{ Signal }}"
    );
    insta::assert_snapshot!(output.js);
}

#[test]
fn no_export_default() {
    let src = concat!(
        "@state {
",
        "const [val, setVal] = signal(0)
",
        "}
",
        "@template { <span>{{ val }}</span> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-noexp");
    assert!(
        !output.js.contains("export default"),
        "output must not contain export default"
    );
    insta::assert_snapshot!(output.js);
}

#[test]
fn static_attr_passthrough() {
    let src = "@template { <div class=\"counter\"></div> }";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-div");
    insta::assert_snapshot!(output.js);
}

// ─── Plan 1.4 / v0.5.1: slot codegen ────────────────────────────────────────
// Note: <slot> HTML form is DEPRECATED in v0.5. It emits `createSlotBoundary`
// just like <$slot> but also prints a DEPRECATED warning to stderr.

#[test]
fn slot_default_codegen() {
    // <slot></slot> → createSlotBoundary({ expose: [] }, ...) [DEPRECATED HTML form]
    let src = "@template { <div><slot></slot></div> }";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-slot");
    assert!(
        output.js.contains("createSlotBoundary"),
        "deprecated <slot> must emit createSlotBoundary: {}",
        output.js
    );
    assert!(
        !output.js.contains("branch('slot'"),
        "slot must not be emitted as branch"
    );
    insta::assert_snapshot!(output.js);
}

#[test]
fn slot_named_codegen() {
    // <slot name="header"></slot> → createSlotBoundary({ name: 'header', ... }) [DEPRECATED]
    let src = "@template { <div><slot name=\"header\"></slot></div> }";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-named-slot");
    assert!(
        output.js.contains("createSlotBoundary"),
        "deprecated named <slot> must emit createSlotBoundary: {}",
        output.js
    );
    assert!(
        output.js.contains("'header'"),
        "named slot must include slot name in output: {}",
        output.js
    );
    insta::assert_snapshot!(output.js);
}

// ─── A-4b: multiline import state machine ─────────────────────────────────

#[test]
fn multiline_import_lifted_to_module_scope() {
    // Multiline user imports inside @state / <script setup> are lifted to
    // module scope (alongside the auto-emitted framework imports), not stripped
    // and not leaked into the setup function body.
    let source = r#"@state {
import {
  computed
} from '@aihu/signals'

const fee = computed(() => 5)
}
@template {
  <div>{{ fee }}</div>
}"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-test");
    assert!(
        result.js.contains("const fee = computed"),
        "body should contain fee"
    );
    // The multiline user import must be lifted intact to module scope.
    // The lifted block lives BEFORE the defineElement call.
    let define_idx = result.js.find("defineElement(").expect("defineElement emitted");
    let module_scope = &result.js[..define_idx];
    assert!(
        module_scope.contains("import {")
            && module_scope.contains("computed")
            && module_scope.contains("from '@aihu/signals'"),
        "multiline user import should be lifted to module scope above defineElement"
    );
    // Setup body must not contain the raw `const fee = computed` followed by
    // a stray import continuation. Locate the setup function and confirm.
    let setup_idx = result.js.find("(_ctx) =>").expect("setup arrow emitted");
    let setup_body = &result.js[setup_idx..];
    assert!(
        !setup_body.contains("} from '@aihu/signals'"),
        "import continuation `}} from '@aihu/signals'` must not leak into setup body"
    );
}

#[test]
fn side_effect_import_does_not_eat_following_lines() {
    // Bare side-effect import (no `from`, no `;`) must not falsely open a
    // multiline import span — it has no `{`, so should be skipped as single-line.
    let source = r#"@state {
import '@aihu/polyfill'
const fee = 5
}
@template {
  <div>{{ fee }}</div>
}"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-test");
    assert!(
        result.js.contains("const fee = 5"),
        "line after side-effect import must be preserved"
    );
}

#[test]
fn export_keyword_stripped_from_script_body() {
    // When the user writes `export function ...` in <script setup>, the
    // emitter must strip `export ` because the body is injected inside
    // setup(ctx) where module-level exports are syntax errors.
    let source = r#"@agent {
action ping() -> { ok: boolean }
}
@state {
export function ping() {
  return { ok: true }
}
}
@template {
  <div></div>
}"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-export");
    assert!(
        result.js.contains("function ping()"),
        "function declaration preserved"
    );
    assert!(
        !result.js.contains("export function"),
        "export keyword stripped from script body"
    );
}

// ─── A-4c: options-form emission ──────────────────────────────────────────

fn airtime_quote_source() -> &'static str {
    r#"@agent {
input plan: enum(daily, weekly, monthly) = daily
input amount: number = 100
state total: number   # Final quoted total
action quote() -> { plan: string, amount: number, fee: number, total: number }
}
@state {
import { computed } from '@aihu/signals'
const fee = computed(() => plan() === 'daily' ? 5 : plan() === 'weekly' ? 10 : 20)
const total = computed(() => amount() + fee())
export function quote() {
  return { plan: plan(), amount: amount(), fee: fee(), total: total() }
}
}
@template {
  <div class="airtime-quote">
    <span>{{ total }}</span>
  </div>
}"#
}

#[test]
fn agent_airtime_quote() {
    let source = airtime_quote_source();
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "airtime-quote");
    insta::assert_snapshot!(result.js);
}

// ─── A-4d: manifest JSON emission ─────────────────────────────────────────

#[test]
fn agent_airtime_quote_manifest() {
    let source = airtime_quote_source();
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "airtime-quote");
    assert!(
        !result.manifest_json.is_empty(),
        "manifest should be non-empty"
    );
    assert!(
        result.manifest_json.contains("\"airtime_quote\""),
        "tool name"
    );
    assert!(result.manifest_json.contains("\"airtime-quote\""), "tag");
    assert!(result.manifest_json.contains("\"quote\""), "action");
    assert!(result.manifest_json.contains("\"plan\""), "input");
    assert!(result.manifest_json.contains("\"amount\""), "input");
}

#[test]
fn no_agent_block_manifest_empty() {
    let source = include_str!("../fixtures/vite-counter/counter.aihu");
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "aihu-counter");
    assert!(
        result.manifest_json.is_empty(),
        "no agent block = no manifest"
    );
}

// ─── Plan 4.3-B: lock signal interpolation cast as stable v1 emit form ────────

#[test]
fn leaf_signal_interpolation_cast() {
    // A minimal component with a signal interpolated in the template.
    // This test locks the `as unknown as Signal<string>` double-cast as the
    // stable v1 emit form, preventing accidental regression.
    // Signal<T> = readonly [Read<T>, Write<T>]; Read<number> does not overlap
    // with Read<string>, so `unknown` is the required bridge — a single `as`
    // would produce a TypeScript compile error.
    let src = concat!(
        "@state {\n",
        "const [score, setScore] = signal(0)\n",
        "}\n",
        "@template { <span>{{ score }}</span> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-score");

    // Lock: the stable double-cast must be present.
    assert!(
        output.js.contains("as unknown as Signal<string>"),
        "signal interpolation must emit `as unknown as Signal<string>` cast; got:\n{}",
        output.js
    );

    // Regression guard: a naive single cast must never appear.
    assert!(
        !output.js.contains("as Signal<number>"),
        "output must not contain invalid single cast `as Signal<number>`; got:\n{}",
        output.js
    );

    insta::assert_snapshot!(output.js);
}
