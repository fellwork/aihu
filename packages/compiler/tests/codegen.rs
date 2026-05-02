use scribe_compiler::{compile_full, emit, sfc};

fn counter_source() -> &'static str {
    concat!(
        "<script setup>
",
        "import { signal } from '@scribe/signals'
",
        "
",
        "const [count, setCount] = signal(0)
",
        "const increment = () => setCount(c => c + 1)
",
        "</script>
",
        "
",
        "<template>
",
        "  <div class=\"counter\">
",
        "    <span>{{ count }}</span>
",
        "    <button @click=\"increment\">+</button>
",
        "  </div>
",
        "</template>"
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
        "<script setup>
",
        "const message = 'hello'
",
        "</script>
",
        "<template><p>{{ message }}</p></template>"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-msg");
    insta::assert_snapshot!(output.js);
}

#[test]
fn event_attr_onclick() {
    let src = concat!(
        "<script setup>
",
        "const handler = () => {}
",
        "</script>
",
        "<template><button @click=\"handler\">click</button></template>"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-btn");
    insta::assert_snapshot!(output.js);
}

#[test]
fn signal_leaf_cast() {
    let src = concat!(
        "<script setup>
",
        "const [val, setVal] = signal(0)
",
        "</script>
",
        "<template><span>{{ val }}</span></template>"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-val");
    insta::assert_snapshot!(output.js);
}

#[test]
fn plain_var_no_cast() {
    let src = concat!(
        "<script setup>
",
        "const title = 'hello'
",
        "</script>
",
        "<template><h1>{{ title }}</h1></template>"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-head");
    insta::assert_snapshot!(output.js);
}

#[test]
fn style_scoped_emits_css_in_function_form() {
    let src = concat!(
        "<script setup>
",
        "const [count, setCount] = signal(0)
",
        "</script>
",
        "<template><span>{{ count }}</span></template>
",
        "<style>
",
        "span { color: red; }
",
        "</style>"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-styled");
    insta::assert_snapshot!(output.js);
}

#[test]
fn ctx_param_present() {
    let src = concat!(
        "<script setup>
",
        "const [val, setVal] = signal(0)
",
        "</script>
",
        "<template><span>{{ val }}</span></template>"
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
        "<script setup>
",
        "const [val, setVal] = signal(0)
",
        "</script>
",
        "<template><span>{{ val }}</span></template>"
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
        "<script setup>
",
        "const [val, setVal] = signal(0)
",
        "</script>
",
        "<template><span>{{ val }}</span></template>"
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
    let src = "<template><div class=\"counter\"></div></template>";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-div");
    insta::assert_snapshot!(output.js);
}

// ─── A-4b: multiline import state machine ─────────────────────────────────

#[test]
fn multiline_import_stripped() {
    let source = r#"<script setup lang="ts" name="x-test">
import {
  computed
} from '@scribe/signals'

const fee = computed(() => 5)
</script>
<template>
  <div>{{ fee }}</div>
</template>"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-test");
    assert!(
        result.js.contains("const fee = computed"),
        "body should contain fee"
    );
    assert!(
        !result.js.contains("} from '@scribe/signals'"),
        "multiline import should be stripped from script body"
    );
}

#[test]
fn side_effect_import_does_not_eat_following_lines() {
    // Bare side-effect import (no `from`, no `;`) must not falsely open a
    // multiline import span — it has no `{`, so should be skipped as single-line.
    let source = r#"<script setup lang="ts" name="x-test">
import '@scribe/polyfill'
const fee = 5
</script>
<template>
  <div>{{ fee }}</div>
</template>"#;
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
    let source = r#"<agent>
action ping() -> { ok: boolean }
</agent>
<script setup lang="ts" name="x-export">
export function ping() {
  return { ok: true }
}
</script>
<template>
  <div></div>
</template>"#;
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
    r#"<agent>
input plan: enum(daily, weekly, monthly) = daily
input amount: number = 100
state total: number   # Final quoted total
action quote() -> { plan: string, amount: number, fee: number, total: number }
</agent>
<script setup lang="ts" name="airtime-quote">
import { computed } from '@scribe/signals'
const fee = computed(() => plan() === 'daily' ? 5 : plan() === 'weekly' ? 10 : 20)
const total = computed(() => amount() + fee())
export function quote() {
  return { plan: plan(), amount: amount(), fee: fee(), total: total() }
}
</script>
<template>
  <div class="airtime-quote">
    <span>{{ total }}</span>
  </div>
</template>"#
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
    let source = include_str!("../fixtures/vite-counter/counter.scribe");
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "scribe-counter");
    assert!(
        result.manifest_json.is_empty(),
        "no agent block = no manifest"
    );
}
