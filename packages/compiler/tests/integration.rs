use scribe_compiler::{compile_full, emit, sfc};

fn airtime_quote_source() -> &'static str {
    r#"<contract>
input plan: enum(daily, weekly, monthly) = daily
input amount: number = 100
state total: number   # Final quoted total
action quote() -> { plan: string, amount: number, fee: number, total: number }
</contract>
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
fn counter_no_contract_regression() {
    let source = include_str!("../fixtures/vite-counter/counter.scribe");
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "scribe-counter");
    // CRITICAL: must be function form
    assert!(
        result.js.contains("defineComponent((_ctx)"),
        "must use function form"
    );
    assert!(
        result.js.contains("defineElement('scribe-counter'"),
        "tag name correct"
    );
    assert!(!result.js.contains("attrs:"), "no attrs in function form");
    assert!(
        result.manifest_json.is_empty(),
        "no manifest for no-contract component"
    );
}

#[test]
fn contract_airtime_quote_js_shape() {
    let source = airtime_quote_source();
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "airtime-quote");
    assert!(result.js.contains("defineComponent({"), "options form");
    assert!(result.js.contains("attrs: ["), "attrs array");
    assert!(result.js.contains("_plan_V"), "enum Set validation");
    assert!(
        result.js.contains("computed(() => Number("),
        "number coercion"
    );
    assert!(
        result.js.contains("defineElement('airtime-quote'"),
        "tag name"
    );
    assert!(
        !result.js.contains("defineComponent((_ctx)"),
        "must NOT use function form"
    );
}

#[test]
fn contract_airtime_quote_manifest_keys() {
    let source = airtime_quote_source();
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "airtime-quote");
    assert!(!result.manifest_json.is_empty(), "manifest non-empty");
    assert!(
        result.manifest_json.contains("\"airtime_quote\""),
        "snake_case tool name"
    );
    assert!(
        result.manifest_json.contains("\"airtime-quote\""),
        "kebab tag"
    );
    assert!(result.manifest_json.contains("\"quote\""), "action");
    assert!(result.manifest_json.contains("\"plan\""), "plan input");
    assert!(result.manifest_json.contains("\"amount\""), "amount input");
}

#[test]
fn contract_parse_error_propagates() {
    let source = r#"<contract>
input x: uuid = 5
</contract>
<script setup lang="ts" name="x-err">
</script>
<template><div></div></template>"#;
    let parsed = sfc::parse(source);
    assert!(parsed.is_err(), "sfc::parse should fail on bad contract");
    let err = parsed.unwrap_err();
    assert_eq!(
        err.code.as_deref(),
        Some("C002"),
        "error code C002 for unknown type"
    );
}

#[test]
fn no_contract_manifest_empty_integration() {
    let source = include_str!("../fixtures/vite-counter/counter.scribe");
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "scribe-counter");
    assert!(result.manifest_json.is_empty());
}
