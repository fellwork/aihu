//! B5 — `$controller` (R6) and `$context` (R7) collection acceptance tests.
//!
//! Covers:
//! - `$controller: { name: { value: () => new Ctrl() } }` — Lit Reactive
//!   Controller pattern. Factory called once; hostConnected/hostDisconnected
//!   auto-wired into onMount/onCleanup.
//! - `$context: { provide: { key: { value: () => expr } }, consume: { key: { type: 'T' } } }`
//!   — tree-scoped DI via DOM custom-event pattern.
//! - No overhead when neither collection is declared.

use aihu_compiler::{compile_full, emit, sfc};

fn compile_fixture(source: &str, tag: &str) -> String {
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).expect("fixture must compile");
    emit(&unit, tag).js
}

// ─── AC #1 — $controller basic: lifecycle wiring emitted ─────────────────────

#[test]
fn b5_controller_basic() {
    let src = r#"@state {
  $controller: {
    fetcher: { value: () => new FetchController('/api/x'), describe: 'Async data loader' },
  }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-b5-ctrl-basic");

    // The controller IIFE must be emitted.
    assert!(
        js.contains("const fetcher = (() => {"),
        "expected const fetcher IIFE: {js}"
    );
    // hostConnected guard.
    assert!(
        js.contains("if (typeof _ctrl.hostConnected === 'function') onMount(() => _ctrl.hostConnected())"),
        "expected hostConnected wiring: {js}"
    );
    // hostDisconnected guard.
    assert!(
        js.contains("if (typeof _ctrl.hostDisconnected === 'function') onCleanup(() => _ctrl.hostDisconnected())"),
        "expected hostDisconnected wiring: {js}"
    );
    // Factory call is present.
    assert!(
        js.contains("new FetchController('/api/x')"),
        "expected FetchController factory: {js}"
    );
    // onMount and onCleanup must be imported.
    assert!(
        js.contains("onMount"),
        "expected onMount import: {js}"
    );
    assert!(
        js.contains("onCleanup"),
        "expected onCleanup import: {js}"
    );
}

// ─── AC #2 — $controller: controller without lifecycle methods still compiles ─

#[test]
fn b5_controller_no_lifecycle_methods() {
    // The controller object returned may not have hostConnected/hostDisconnected;
    // the runtime guards (`typeof _ctrl.hostConnected === 'function'`) ensure
    // no error is thrown.
    let src = r#"@state {
  $controller: {
    mouse: { value: () => new MouseController() },
  }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-b5-ctrl-no-lifecycle");

    assert!(
        js.contains("const mouse = (() => {"),
        "expected const mouse IIFE: {js}"
    );
    assert!(
        js.contains("new MouseController()"),
        "expected MouseController factory: {js}"
    );
    // Guards are still emitted (they are runtime checks, not compile-time).
    assert!(
        js.contains("if (typeof _ctrl.hostConnected === 'function')"),
        "expected hostConnected runtime guard: {js}"
    );
    assert!(
        js.contains("if (typeof _ctrl.hostDisconnected === 'function')"),
        "expected hostDisconnected runtime guard: {js}"
    );
}

// ─── AC #3 — $controller: multiple entries both independently wired ──────────

#[test]
fn b5_controller_multiple_entries() {
    let src = r#"@state {
  $controller: {
    fetcher: { value: () => new FetchController('/api/x') },
    mouse: { value: () => new MouseController() },
  }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-b5-ctrl-multi");

    // Both controllers must be declared.
    assert!(
        js.contains("const fetcher = (() => {"),
        "expected const fetcher IIFE: {js}"
    );
    assert!(
        js.contains("const mouse = (() => {"),
        "expected const mouse IIFE: {js}"
    );
    // Each uses its own factory.
    assert!(
        js.contains("new FetchController('/api/x')"),
        "expected FetchController factory: {js}"
    );
    assert!(
        js.contains("new MouseController()"),
        "expected MouseController factory: {js}"
    );
}

// ─── AC #4 — $context provide: dispatches provide event on mount ─────────────

#[test]
fn b5_context_provide() {
    let src = r#"@state {
  $context: {
    provide: {
      theme: { value: () => themeSignal, describe: 'Active theme token' },
    },
  }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-b5-ctx-provide");

    // onMount dispatching the provide event.
    assert!(
        js.contains("onMount("),
        "expected onMount call: {js}"
    );
    assert!(
        js.contains("__aihu_ctx_provide"),
        "expected __aihu_ctx_provide event: {js}"
    );
    assert!(
        js.contains("key: 'theme'") || js.contains("key: \"theme\""),
        "expected key: 'theme' in dispatch: {js}"
    );
    assert!(
        js.contains("themeSignal"),
        "expected themeSignal value: {js}"
    );
    assert!(
        js.contains("CustomEvent"),
        "expected CustomEvent dispatch: {js}"
    );
}

// ─── AC #5 — $context consume: wires listener + request dispatch ─────────────

#[test]
fn b5_context_consume() {
    let src = r#"@state {
  $context: {
    consume: {
      locale: { type: 'Locale', describe: 'App locale from LocaleProvider' },
    },
  }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-b5-ctx-consume");

    // `let locale` binding.
    assert!(
        js.contains("let locale"),
        "expected `let locale` binding: {js}"
    );
    // onMount registering the listener.
    assert!(
        js.contains("onMount("),
        "expected onMount for consume listener: {js}"
    );
    // Listener checks key.
    assert!(
        js.contains("'locale'") || js.contains("\"locale\""),
        "expected key 'locale' check in listener: {js}"
    );
    // Request dispatch.
    assert!(
        js.contains("__aihu_ctx_request"),
        "expected __aihu_ctx_request dispatch: {js}"
    );
    assert!(
        js.contains("bubbles: true"),
        "expected bubbles: true on request: {js}"
    );
    assert!(
        js.contains("composed: true"),
        "expected composed: true on request: {js}"
    );
}

// ─── AC #6 — $context provide AND consume in same SFC ────────────────────────

#[test]
fn b5_context_provide_and_consume() {
    let src = r#"@state {
  $context: {
    provide: {
      theme: { value: () => themeSignal },
    },
    consume: {
      locale: { type: 'Locale' },
    },
  }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-b5-ctx-both");

    // Both provide and consume patterns present.
    assert!(
        js.contains("__aihu_ctx_provide"),
        "expected __aihu_ctx_provide event: {js}"
    );
    assert!(
        js.contains("__aihu_ctx_request"),
        "expected __aihu_ctx_request dispatch: {js}"
    );
    assert!(
        js.contains("let locale"),
        "expected let locale consume binding: {js}"
    );
    assert!(
        js.contains("key: 'theme'") || js.contains("key: \"theme\""),
        "expected theme provide key: {js}"
    );
}

// ─── AC #7 — no $controller → no overhead ────────────────────────────────────

#[test]
fn b5_no_controller_no_overhead() {
    let src = r#"@state {
  $prop: { label: { default: 'hello' } }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-b5-no-ctrl");

    // No controller IIFE or lifecycle guards.
    assert!(
        !js.contains("_ctrl"),
        "SFC without $controller must not emit _ctrl: {js}"
    );
    assert!(
        !js.contains("hostConnected"),
        "SFC without $controller must not emit hostConnected: {js}"
    );
    assert!(
        !js.contains("hostDisconnected"),
        "SFC without $controller must not emit hostDisconnected: {js}"
    );
}

// ─── AC #8 — no $context → no overhead ──────────────────────────────────────

#[test]
fn b5_no_context_no_overhead() {
    let src = r#"@state {
  $prop: { label: { default: 'hello' } }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-b5-no-ctx");

    // No context event dispatch or listener.
    assert!(
        !js.contains("__aihu_ctx_provide"),
        "SFC without $context must not emit __aihu_ctx_provide: {js}"
    );
    assert!(
        !js.contains("__aihu_ctx_request"),
        "SFC without $context must not emit __aihu_ctx_request: {js}"
    );
    assert!(
        !js.contains("__aihu_ctx_consume"),
        "SFC without $context must not emit __aihu_ctx_consume: {js}"
    );
}
