//! arch-5 M1 — routing primitive integration tests.
//!
//! Validates that:
//! - `$route currentRoute` lowers to `useRoute()` from `@aihu/router`.
//! - `$beforeNavigate(fn)` lowers to a guard registration call.
//! - `$afterNavigate(fn)` lowers to an after-guard registration call.
//! - `<$router>`, `<$link>`, `<$outlet>`, `<$navigate>` macro elements emit
//!   the expected boundary helpers and the `@aihu/router` namespace import.
//!
//! These tests exercise the full pipeline (`compile_full` + `emit`) without
//! relying on snapshot fixtures — they assert structural invariants on the
//! emitted JS so they are robust to incidental formatting changes.

use aihu_compiler::{compile_full, emit, sfc};

fn compile(source: &str, tag: &str) -> String {
    let parsed = sfc::parse(source).expect("parse");
    let unit = compile_full(&parsed).expect("compile_full");
    let result = emit(&unit, tag);
    result.js
}

#[test]
fn route_macro_lowers_to_use_route() {
    let source = r#"@state {
  $route currentRoute
}
@template {
  <div>{currentRoute}</div>
}"#;
    let js = compile(source, "x-page");
    assert!(
        js.contains("import * as __aihuRouter from '@aihu/router'"),
        "should import @aihu/router namespace, got:\n{js}"
    );
    assert!(
        js.contains("computed(() => __aihuRouter.useRoute())"),
        "$route should lower to computed(() => useRoute()), got:\n{js}"
    );
}

#[test]
fn before_navigate_macro_lowers_to_register_call() {
    let source = r#"@state {
  $beforeNavigate((to, from, next) => next())
}
@template {
  <div></div>
}"#;
    let js = compile(source, "x-guard");
    assert!(
        js.contains("import * as __aihuRouter from '@aihu/router'"),
        "should import @aihu/router namespace, got:\n{js}"
    );
    assert!(
        js.contains("__aihuRouter.__router_registerBeforeGuard("),
        "$beforeNavigate should lower to __router_registerBeforeGuard, got:\n{js}"
    );
}

#[test]
fn after_navigate_macro_lowers_to_register_call() {
    let source = r#"@state {
  $afterNavigate((to, from) => log(to))
}
@template {
  <div></div>
}"#;
    let js = compile(source, "x-after");
    assert!(
        js.contains("__aihuRouter.__router_registerAfterGuard("),
        "$afterNavigate should lower to __router_registerAfterGuard, got:\n{js}"
    );
}

#[test]
fn router_element_emits_boundary_and_import() {
    let source = r#"@template {
  <$router router={myRouter}>
    <$outlet></$outlet>
  </$router>
}"#;
    let js = compile(source, "x-app");
    assert!(
        js.contains("import * as __aihuRouter from '@aihu/router'"),
        "<$router> should pull in router namespace, got:\n{js}"
    );
    assert!(
        js.contains("createRouterBoundary(myRouter"),
        "<$router> should call createRouterBoundary, got:\n{js}"
    );
    assert!(
        js.contains("createOutletBoundary()"),
        "<$outlet> should call createOutletBoundary, got:\n{js}"
    );
}

#[test]
fn link_element_emits_boundary_with_attrs() {
    let source = r#"@template {
  <$link href="/users/42" prefetch="hover" replace>Profile</$link>
}"#;
    let js = compile(source, "x-link-test");
    assert!(
        js.contains("createLinkBoundary("),
        "<$link> should call createLinkBoundary, got:\n{js}"
    );
    // href is a static attr — emitted as quoted form.
    assert!(
        js.contains("'/users/42'") || js.contains("\"/users/42\""),
        "href should be passed, got:\n{js}"
    );
    // prefetch is a static attr.
    assert!(
        js.contains("'hover'") || js.contains("\"hover\""),
        "prefetch should be passed, got:\n{js}"
    );
}

#[test]
fn navigate_element_emits_boundary() {
    let source = r#"@template {
  <$navigate to="/login" replace></$navigate>
}"#;
    let parsed = sfc::parse(source).expect("parse");
    let unit = compile_full(&parsed).expect("compile_full");
    let result = emit(&unit, "x-redirect");
    let js = result.js;
    assert!(
        js.contains("createNavigateBoundary("),
        "<$navigate> should call createNavigateBoundary, got:\n{js}"
    );
}
