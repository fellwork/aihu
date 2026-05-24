use aihu_compiler::{compile_full, emit, sfc};

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
fn counter_no_agent_block_regression() {
    let source = include_str!("../fixtures/vite-counter/counter.aihu");
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "aihu-counter");
    // CRITICAL: must be function form
    assert!(
        result.js.contains("defineComponent((_ctx)"),
        "must use function form"
    );
    assert!(
        result.js.contains("defineElement('aihu-counter'"),
        "tag name correct"
    );
    assert!(!result.js.contains("attrs:"), "no attrs in function form");
    assert!(
        result.manifest_json.is_empty(),
        "no manifest for no-agent-block component"
    );
}

#[test]
fn agent_airtime_quote_js_shape() {
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
fn agent_airtime_quote_manifest_keys() {
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
fn agent_block_parse_error_propagates() {
    let source = r#"@agent {
input x: uuid = 5
}
@state {
}
@template { <div></div> }"#;
    let parsed = sfc::parse(source);
    assert!(parsed.is_err(), "sfc::parse should fail on bad agent block");
    let err = parsed.unwrap_err();
    assert_eq!(
        err.code.as_deref(),
        Some("C002"),
        "error code C002 for unknown type"
    );
}

#[test]
fn no_agent_block_manifest_empty_integration() {
    let source = include_str!("../fixtures/vite-counter/counter.aihu");
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "aihu-counter");
    assert!(result.manifest_json.is_empty());
}

#[test]
fn style_scoped_emits_css_stylesheet() {
    let source = r#"@state {
export default function() { return []; }
}
@template { <div></div> }
@style {
.card { color: red; }
}"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "styled-counter");
    assert!(result.js.contains("new CSSStyleSheet()"), "should emit CSSStyleSheet");
    assert!(result.js.contains("replaceSync("), "should call replaceSync");
    assert!(result.js.contains("adoptedStyleSheets = [__style__]"), "should wire shadow adoptedStyleSheets");
    assert!(!result.js.contains("document.adoptedStyleSheets"), "scoped should not touch document");
}

#[test]
fn style_global_emits_document_adopted() {
    let source = r#"@state {
export default function() { return []; }
}
@template { <div></div> }
@style {
$global
body { margin: 0; }
}"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "global-styled");
    assert!(result.js.contains("new CSSStyleSheet()"), "should emit CSSStyleSheet");
    assert!(result.js.contains("document.adoptedStyleSheets"), "global should use document");
    assert!(!result.js.contains("ShadowRoot"), "global should not reference ShadowRoot");
}

// ─── Amendment 02: $reactive inside $global ───────────────────────────────────

/// Test 1: `$reactive(expr)` inside a `$global { }` block emits a JS effect targeting
/// `document.documentElement`, not the component root element.
#[test]
fn global_reactive_targets_document_element() {
    let source = r#"@state {
const theme = { primary: '#ff0000' }
}
@style {
  $global {
    color: $reactive(theme.primary)
  }
}
@template {
  <div></div>
}"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "theme-root");
    assert!(
        result.js.contains("document.documentElement.style.setProperty"),
        "global $reactive must target document.documentElement, got:\n{}",
        result.js
    );
    assert!(
        !result.js.contains("el.style.setProperty"),
        "global $reactive must NOT target component el, got:\n{}",
        result.js
    );
    assert!(
        result.js.contains("theme.primary"),
        "expression must appear in JS output"
    );
}

/// Test 2: The CSS emitted for `$reactive` inside `$global { }` is unscoped
/// (no component prefix) and contains a `:root` custom property declaration.
#[test]
fn global_reactive_css_is_unscoped() {
    let source = r#"@state {
const theme = { primary: '#ff0000' }
}
@style {
  $global {
    color: $reactive(theme.primary)
  }
}
@template {
  <div></div>
}"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "theme-root");
    // The stylesheet content must contain a :root unscoped custom property
    assert!(
        result.js.contains(":root"),
        "global $reactive CSS must have :root rule (unscoped), got:\n{}",
        result.js
    );
    assert!(
        result.js.contains("--reactive-global-0"),
        "global $reactive CSS must declare --reactive-global-0, got:\n{}",
        result.js
    );
    // Sanity: the style goes to the global document stylesheet
    assert!(
        result.js.contains("document.adoptedStyleSheets"),
        "global $reactive must use document.adoptedStyleSheets"
    );
}

// ─── v0.3.0 AC1 — __agentBinding emission ────────────────────────────────────

/// AC1a: Server artifact contains __agentBinding export with correct shape.
/// SFC with @agent block containing $scope and $rate-limit.
#[test]
fn agent_binding_export_server_artifact() {
    let source = r#"@agent {
input location: string
$scope authenticated
$rate-limit 100
}
@state {
  $prop: {
    location: { default: 'NYC', expose: { read: true, write: true } },
  }
  $computed: {
    forecast: { expose: { read: true }, value: () => 'sunny' },
  }
  $action: {
    fetchForecast: { expose: { read: true }, handler: () => fetch('/api/weather') },
  }
}
@template { <div>{{ location }}</div> }"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "weather-card");

    // Must contain __agentBinding export
    assert!(
        result.js.contains("export const __agentBinding"),
        "server artifact must contain __agentBinding export, got:\n{}",
        result.js
    );
    assert!(
        result.js.contains("tag: 'weather-card'"),
        "tag must be 'weather-card'"
    );
    assert!(
        result.js.contains("scope: 'authenticated'"),
        "scope must be 'authenticated'"
    );
    assert!(
        result.js.contains("rateLimit: '100/min'"),
        "rateLimit must be '100/min'"
    );
}

/// AC1b: Client artifact has ZERO __agentBinding references.
#[test]
fn agent_binding_absent_from_client_artifact() {
    use aihu_compiler::types::BuildTarget;
    let source = r#"@agent {
input location: string
$scope authenticated
$rate-limit 100
}
@state {
}
@template { <div>client</div> }"#;
    let parsed = sfc::parse(source).unwrap();
    let mut unit = compile_full(&parsed).unwrap();
    unit.target = BuildTarget::Client;
    let result = emit(&unit, "weather-card");
    assert!(
        !result.js.contains("__agentBinding"),
        "client artifact must NOT contain __agentBinding, got:\n{}",
        result.js
    );
}

/// AC1c: __agentBinding absent when no @agent block.
#[test]
fn no_agent_binding_without_agent_block() {
    let source = r#"@state {
}
@template { <div>no agent</div> }"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "plain-card");
    assert!(
        !result.js.contains("__agentBinding"),
        "no-agent-block component must not have __agentBinding"
    );
}

/// AC1d: reads/writes/actions are empty objects when no @state expose entries.
#[test]
fn agent_binding_empty_reads_writes_actions() {
    let source = r#"@agent {
input name: string
}
@state {
}
@template { <div>bare</div> }"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-bare");
    assert!(result.js.contains("export const __agentBinding"), "has export");
    assert!(result.js.contains("scope: undefined"), "no scope");
    assert!(result.js.contains("rateLimit: undefined"), "no rateLimit");
}
