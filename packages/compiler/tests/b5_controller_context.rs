//! B5 — `$controller` (R6) and `$context` (R7) collection acceptance tests.
//!
//! Covers:
//! - `$controller: { name: { value: () => new Ctrl() } }` — Lit Reactive
//!   Controller pattern. Factory called once; hostConnected/hostDisconnected
//!   auto-wired into onMount/onCleanup.
//! - `$context: { provide: { key: { value: () => expr } }, consume: { key: { type: 'T' } } }`
//!   — tree-scoped DI lowered onto @aihu/context's prototype-chain
//!   provide/inject (O2), string keys interned via `contextKey`.
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

// ─── AC #4 — $context provide: synchronous setup-body provide() call ─────────

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

    // Synchronous setup-body provide onto the interned string-key token.
    assert!(
        js.contains("provide(contextKey('theme'), (() => themeSignal)())"),
        "expected provide(contextKey('theme'), ...) call: {js}"
    );
    // Exactly one @aihu/context import carrying the DI helpers.
    assert!(
        js.contains("import { provide, inject, contextKey } from '@aihu/context'"),
        "expected combined @aihu/context import: {js}"
    );
    assert_eq!(
        js.matches("from '@aihu/context'").count(),
        1,
        "expected exactly one @aihu/context import line: {js}"
    );
    // The old client-only event machinery must be gone, and the provide must
    // NOT be deferred to onMount (it must run during setup so the runtime's
    // context scope captures it) — a $context-only component imports no onMount.
    assert!(
        !js.contains("__aihu_ctx_provide"),
        "must not emit __aihu_ctx_provide event: {js}"
    );
    assert!(
        !js.contains("CustomEvent"),
        "must not emit CustomEvent dispatch: {js}"
    );
    assert!(
        js.contains("import { defineComponent, defineElement } from '@aihu/runtime'"),
        "expected runtime import without onMount: {js}"
    );
}

// ─── F3 — $context provide: static values are provided verbatim, not called ──

#[test]
fn b5_context_provide_static_value_verbatim() {
    // A non-function `value:` (string literal here) must be provided as-is.
    // The old lowering wrapped every value in `({expr})()`, turning
    // `value: 'light'` into `('light')()` — a runtime TypeError.
    let src = r#"@state {
  $context: {
    provide: {
      theme: { value: 'light', type: 'string' },
    },
  }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-b5-ctx-provide-static");

    assert!(
        js.contains("provide(contextKey('theme'), 'light')"),
        "expected verbatim static provide: {js}"
    );
    assert!(
        !js.contains("('light')()"),
        "static value must not be wrapped-and-called: {js}"
    );
}

#[test]
fn b5_context_provide_identifier_verbatim_and_factory_called() {
    // Identifiers are values too ("value is the value") — provided verbatim.
    // Arrow factories keep the wrap-and-call behavior, byte-identical to O2.
    let src = r#"@state {
  $context: {
    provide: {
      theme: { value: themeSignal },
      locale: { value: () => localeSignal },
    },
  }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-b5-ctx-provide-ident");

    assert!(
        js.contains("provide(contextKey('theme'), themeSignal)"),
        "expected verbatim identifier provide: {js}"
    );
    assert!(
        !js.contains("(themeSignal)()"),
        "identifier value must not be wrapped-and-called: {js}"
    );
    assert!(
        js.contains("provide(contextKey('locale'), (() => localeSignal)())"),
        "expected arrow factory still wrapped-and-called: {js}"
    );
}

// ─── AC #5 — $context consume: synchronous setup-body inject() binding ───────

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

    // `const locale = inject(contextKey('locale'))` binding — no `let`, no
    // listener, no request event.
    assert!(
        js.contains("const locale = inject(contextKey('locale'))"),
        "expected const locale = inject(contextKey('locale')): {js}"
    );
    assert!(
        !js.contains("let locale"),
        "must not emit `let locale` event-fill binding: {js}"
    );
    assert!(
        !js.contains("__aihu_ctx_provide"),
        "must not emit __aihu_ctx_provide listener: {js}"
    );
    assert!(
        !js.contains("__aihu_ctx_request"),
        "must not emit __aihu_ctx_request dispatch: {js}"
    );
    assert!(
        !js.contains("addEventListener('__aihu_ctx_provide'"),
        "must not register a context event listener: {js}"
    );
    // Exactly one @aihu/context import.
    assert!(
        js.contains("import { provide, inject, contextKey } from '@aihu/context'"),
        "expected combined @aihu/context import: {js}"
    );
    assert_eq!(
        js.matches("from '@aihu/context'").count(),
        1,
        "expected exactly one @aihu/context import line: {js}"
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

    // Both provide and consume lowerings present.
    assert!(
        js.contains("provide(contextKey('theme'), (() => themeSignal)())"),
        "expected theme provide call: {js}"
    );
    assert!(
        js.contains("const locale = inject(contextKey('locale'))"),
        "expected locale inject binding: {js}"
    );
    // One import line serves both.
    assert_eq!(
        js.matches("from '@aihu/context'").count(),
        1,
        "expected exactly one @aihu/context import line: {js}"
    );
    // The event contract is fully removed.
    assert!(
        !js.contains("__aihu_ctx_provide"),
        "must not emit __aihu_ctx_provide: {js}"
    );
    assert!(
        !js.contains("__aihu_ctx_request"),
        "must not emit __aihu_ctx_request: {js}"
    );
}

// ─── AC #6b — $context + magna $resource: single deduped @aihu/context import ─

#[test]
fn b5_context_with_magna_resource_single_context_import() {
    let src = r#"@state {
  $context: {
    consume: {
      locale: { type: 'Locale' },
    },
  }
  $resource: {
    feed: () => data.posts.query({ first: 10 })
  }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-b5-ctx-magna");

    // Magna lowering still injects its fetch token...
    assert!(
        js.contains("inject(MagnaFetchToken)"),
        "expected inject(MagnaFetchToken): {js}"
    );
    // ...and the $context consume coexists...
    assert!(
        js.contains("const locale = inject(contextKey('locale'))"),
        "expected locale inject binding: {js}"
    );
    // ...via a SINGLE combined @aihu/context import (no duplicate `inject`).
    assert_eq!(
        js.matches("from '@aihu/context'").count(),
        1,
        "expected exactly one @aihu/context import line: {js}"
    );
    assert!(
        js.contains("import { provide, inject, contextKey } from '@aihu/context'"),
        "expected combined @aihu/context import: {js}"
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

    // No context DI calls or import.
    assert!(
        !js.contains("contextKey("),
        "SFC without $context must not emit contextKey calls: {js}"
    );
    assert!(
        !js.contains("from '@aihu/context'"),
        "SFC without $context must not import @aihu/context: {js}"
    );
    assert!(
        !js.contains("__aihu_ctx_provide"),
        "SFC without $context must not emit __aihu_ctx_provide: {js}"
    );
}

// ─── AC #9 — $controller with mount: key lowers to onMount (Issue #498) ──────

#[test]
fn b5_controller_mount_key_lowers_to_onmount() {
    let src = r#"@state {
  $controller: {
    scrollCtrl: { mount: (host) => setupObserver(host) },
  }
}
@template {
  <div></div>
}"#;
    let js = compile_fixture(src, "x-b5-ctrl-mount");

    assert!(
        js.contains("const scrollCtrl = onMount(((host) => setupObserver(host)));"),
        "expected onMount lowering for $controller mount: key: {js}"
    );
}

