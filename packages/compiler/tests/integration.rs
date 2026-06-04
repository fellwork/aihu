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

// ─── T1 (go-public) — client-safe opaque-ID dispatcher ───────────────────────

/// Source with exposed action + readable/writable prop + readable computed.
fn dispatcher_source() -> &'static str {
    r#"@agent {
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
@template { <div>{{ location }}</div> }"#
}

/// T1-a: CLIENT build emits `__agentDispatcher` with opaque-ID keyed maps.
#[test]
fn client_dispatcher_emitted_with_opaque_ids() {
    use aihu_compiler::types::BuildTarget;
    let parsed = sfc::parse(dispatcher_source()).unwrap();
    let mut unit = compile_full(&parsed).unwrap();
    unit.target = BuildTarget::Client;
    let result = emit(&unit, "weather-card");

    // The narrow client dispatcher IS present.
    assert!(
        result.js.contains("export const __agentDispatcher"),
        "client build must contain __agentDispatcher, got:\n{}",
        result.js
    );
    assert!(
        result.js.contains("tag: 'weather-card'"),
        "dispatcher must carry its tag"
    );
    // Opaque IDs are `a_` + 16 hex chars; the raw member names must NOT appear
    // as object KEYS (they only appear inside invoker bodies that call them).
    // We assert the opaque-id prefix shows up for each of action/read/write.
    let opaque_count = result.js.matches("    a_").count();
    assert!(
        opaque_count >= 3,
        "expected >=3 opaque-id entries (action+read+write), got {} in:\n{}",
        opaque_count,
        result.js
    );
}

/// T1-b: CLIENT dispatcher contains NO policy metadata (scope/rateLimit).
#[test]
fn client_dispatcher_has_no_policy() {
    use aihu_compiler::types::BuildTarget;
    let parsed = sfc::parse(dispatcher_source()).unwrap();
    let mut unit = compile_full(&parsed).unwrap();
    unit.target = BuildTarget::Client;
    let result = emit(&unit, "weather-card");

    assert!(
        !result.js.contains("scope"),
        "client build must NOT leak scope, got:\n{}",
        result.js
    );
    assert!(
        !result.js.contains("rateLimit"),
        "client build must NOT leak rateLimit, got:\n{}",
        result.js
    );
    assert!(
        !result.js.contains("authenticated"),
        "client build must NOT leak the scope value 'authenticated', got:\n{}",
        result.js
    );
}

/// T1-c: raw `__agentBinding` remains client-elided (existing gate intact).
#[test]
fn client_dispatcher_does_not_reintroduce_raw_binding() {
    use aihu_compiler::types::BuildTarget;
    let parsed = sfc::parse(dispatcher_source()).unwrap();
    let mut unit = compile_full(&parsed).unwrap();
    unit.target = BuildTarget::Client;
    let result = emit(&unit, "weather-card");

    assert!(
        !result.js.contains("__agentBinding"),
        "client build must still NOT contain raw __agentBinding, got:\n{}",
        result.js
    );
}

/// T1-d: SERVER build is unchanged — raw binding present, NO dispatcher.
#[test]
fn server_build_keeps_raw_binding_and_omits_dispatcher() {
    let parsed = sfc::parse(dispatcher_source()).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "weather-card");

    assert!(
        result.js.contains("export const __agentBinding"),
        "server build keeps raw __agentBinding"
    );
    assert!(
        result.js.contains("scope: 'authenticated'"),
        "server binding still carries policy"
    );
    assert!(
        !result.js.contains("__agentDispatcher"),
        "server build must NOT emit the client dispatcher"
    );
}

/// T1-e: opaque IDs are DETERMINISTIC — the SAME input yields the SAME IDs
/// across independent compiles. This is the load-bearing allowlist invariant.
#[test]
fn opaque_ids_are_stable_across_compiles() {
    use aihu_compiler::types::BuildTarget;

    let emit_client = || {
        let parsed = sfc::parse(dispatcher_source()).unwrap();
        let mut unit = compile_full(&parsed).unwrap();
        unit.target = BuildTarget::Client;
        emit(&unit, "weather-card").js
    };

    let first = emit_client();
    let second = emit_client();
    assert_eq!(
        first, second,
        "two independent compiles must produce byte-identical client output"
    );

    // Extract the dispatcher block and assert a known, fixed opaque id appears.
    // FNV-1a 64 of "weather-card:fetchForecast" is fully determined; if the
    // hashing scheme ever changes this literal must be updated deliberately.
    let expected_action_id = {
        // recompute via the same algorithm to avoid hard-coding a brittle hex
        // literal while still proving cross-run stability of the value.
        const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
        const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;
        let mut h = FNV_OFFSET;
        for b in "weather-card:fetchForecast".as_bytes() {
            h ^= u64::from(*b);
            h = h.wrapping_mul(FNV_PRIME);
        }
        format!("a_{:016x}", h)
    };
    assert!(
        first.contains(&expected_action_id),
        "client dispatcher must key the action under its stable opaque id {}, got:\n{}",
        expected_action_id,
        first
    );
}

/// T1-f: a different tag with the SAME member name yields a DIFFERENT opaque id
/// (IDs are namespaced by tag, preventing cross-component collisions).
#[test]
fn opaque_ids_namespaced_by_tag() {
    use aihu_compiler::types::BuildTarget;
    let src = r#"@agent {
input x: string
}
@state {
  $action: {
    go: { expose: { read: true }, handler: () => 1 },
  }
}
@template { <div>x</div> }"#;

    let emit_for = |tag: &str| {
        let parsed = sfc::parse(src).unwrap();
        let mut unit = compile_full(&parsed).unwrap();
        unit.target = BuildTarget::Client;
        emit(&unit, tag).js
    };

    let a = emit_for("alpha-card");
    let b = emit_for("beta-card");

    // Same member "go", different tag → different opaque id; so the dispatcher
    // bodies differ. (Both still call the local `go(args)`.)
    assert!(a.contains("export const __agentDispatcher"));
    assert!(b.contains("export const __agentDispatcher"));
    assert_ne!(
        a, b,
        "different tags must produce different opaque ids for the same member"
    );
}

/// T6 (go-public demo) — the CLIENT build injects a PER-INSTANCE
/// `_registerAgentDispatcher(ctx.element, …)` call INSIDE the setup body, so the
/// opaque-ID invokers bind to a specific mounted instance's signals (the inert
/// module-scope export references setup-locals that don't exist at module scope).
#[test]
fn client_build_injects_per_instance_dispatcher_registration() {
    use aihu_compiler::types::BuildTarget;
    let src = r#"@agent {
state count: number
action increment()
}
@state {
  $action: {
    increment: { expose: { read: true }, handler: () => 1 },
  }
}
@template { <div>x</div> }"#;
    let parsed = sfc::parse(src).unwrap();
    let mut unit = compile_full(&parsed).unwrap();
    unit.target = BuildTarget::Client;
    let js = emit(&unit, "tc-card").js;

    // The runtime import gained `_registerAgentDispatcher`.
    assert!(
        js.contains("_registerAgentDispatcher"),
        "client build must import + call _registerAgentDispatcher, got:\n{}",
        js
    );
    // The registration is against the host element (per-instance key).
    assert!(
        js.contains("_registerAgentDispatcher(__aihu_ctx__?.element, {"),
        "registration must key on the host element, got:\n{}",
        js
    );
    // The registration invoker body calls the REAL setup-local closure.
    assert!(
        js.contains("(args) => increment(args)"),
        "registration invoker must call the local action closure, got:\n{}",
        js
    );
    // The registration appears INSIDE setup — i.e. BEFORE the module-scope export.
    let reg_idx = js.find("_registerAgentDispatcher(__aihu_ctx__").unwrap();
    let export_idx = js.find("export const __agentDispatcher").unwrap();
    assert!(
        reg_idx < export_idx,
        "registration must be injected inside setup (before the module-scope export)"
    );
    // Still NO policy on the wire from the client.
    assert!(!js.contains("scope:"), "no scope leaked, got:\n{}", js);
    assert!(!js.contains("rateLimit:"), "no rateLimit leaked, got:\n{}", js);
}

/// T6 — the per-instance registration uses the SAME stable opaque IDs as the
/// module-scope export, so the server allowlist matches whichever the browser
/// bridge reads.
#[test]
fn per_instance_registration_uses_same_opaque_ids_as_export() {
    use aihu_compiler::types::BuildTarget;
    let parsed = sfc::parse(dispatcher_source()).unwrap();
    let mut unit = compile_full(&parsed).unwrap();
    unit.target = BuildTarget::Client;
    let js = emit(&unit, "weather-card");

    let expected_action_id = {
        const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
        const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;
        let mut h = FNV_OFFSET;
        for b in "weather-card:fetchForecast".as_bytes() {
            h ^= u64::from(*b);
            h = h.wrapping_mul(FNV_PRIME);
        }
        format!("a_{:016x}", h)
    };
    // The opaque id appears at least twice: once in the injected registration
    // (inside setup) and once in the module-scope export.
    assert!(
        js.js.matches(&expected_action_id).count() >= 2,
        "opaque id {} must appear in BOTH the per-instance registration and the export, got:\n{}",
        expected_action_id,
        js.js
    );
}

/// go-public agent-exposure lowering fixes:
///  - a writable `$prop` write invoker must call the prop signal's `.set(v)`,
///    NOT reassign the `const` binding (`{ name = v }` both throws on the const
///    and never reaches the signal).
///  - a `$action` handler must stay wrapped in `return batch(...)` so its
///    return value surfaces to the agent (batch now returns its callback value).
/// Asserted across all three emission sites: the server `__agentBinding`, the
/// client `__agentDispatcher` export, and the in-setup `_registerAgentDispatcher`.
#[test]
fn agent_prop_write_uses_setter_and_action_returns_value() {
    use aihu_compiler::types::BuildTarget;
    let source = r#"@agent {
action bump()
state label: string
}
@state {
  import { signal } from '@aihu/signals'
  const [count, setCount] = signal(0)
  $prop: {
    label: { default: 'hi', expose: { read: true, write: true } },
  }
  $action: {
    bump: { expose: { read: true }, handler: (args) => { setCount(count() + 1); return count() } },
  }
}
@template { <div>{count} {label}</div> }"#;

    // The CLIENT build is the path the capability bridge drives (the @state
    // macros are lowered here and the per-instance `_registerAgentDispatcher`
    // is what `@aihu/agent-server` reads via `_takeAgentDispatcher`).
    let parsed = sfc::parse(source).unwrap();
    let mut unit = compile_full(&parsed).unwrap();
    unit.target = BuildTarget::Client;
    let client = emit(&unit, "repro-card");

    // (A) $action stays wrapped in `return batch(...)`; combined with batch now
    // returning its callback value (see @aihu/signals batch.test.ts), the agent
    // receives the handler's return instead of `undefined`.
    assert!(
        client.js.contains("function bump(args) { return batch("),
        "$action must lower to `return batch(...)` so its value surfaces, got:\n{}",
        client.js
    );
    // (C) writable $prop write invoker uses the prop signal's `.set(v)`, never a
    // `const` reassignment (`{ label = v }` throws and never reaches the signal).
    assert!(
        !client.js.contains("label = v }"),
        "prop write must NOT reassign the const binding, got:\n{}",
        client.js
    );
    // `.set(v)` appears in BOTH the in-setup registration and the module export.
    assert!(
        client.js.matches(".set(v)").count() >= 2,
        "expected >=2 `.set(v)` writes (in-setup registration + module export), got {} in:\n{}",
        client.js.matches(".set(v)").count(),
        client.js
    );
    // Reads still resolve (prop getter is callable).
    assert!(
        client.js.contains("() => label()"),
        "prop read must call the getter, got:\n{}",
        client.js
    );
}
