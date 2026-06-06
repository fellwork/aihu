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
fn link_forwards_class_and_event_attrs() {
    // Regression: `<$link>` used to forward ONLY href, silently dropping
    // class / $class / $on.click (and pruning their now-"unused" imports).
    let source = r#"@state {
  close: () => void = () => {}
  isActive: (r: string) => boolean = () => false
}
@template {
  <$link href="/read/Gen.1" id="home" $class={isActive("Gen.1") ? "row on" : "row"} $on.click={() => close()}>Genesis</$link>
}"#;
    let js = compile(source, "x-link-attrs");
    assert!(
        js.contains("createLinkBoundary("),
        "should still call createLinkBoundary, got:\n{js}"
    );
    // id forwarded onto the <a> attrs object.
    assert!(js.contains("id: 'home'"), "id should forward, got:\n{js}");
    // $on.click forwarded as an onClick handler (and keeps `close` referenced
    // so it is not pruned as an unused import).
    assert!(
        js.contains("onClick:") && js.contains("close()"),
        "$on.click should forward as onClick, got:\n{js}"
    );
    // $class forwarded as a (reactive) class binding.
    assert!(
        js.contains("isActive(\"Gen.1\")"),
        "$class expression should forward, got:\n{js}"
    );
}

#[test]
fn each_on_link_wraps_in_each_boundary() {
    // Regression: `$each` on a `<$link>` was dropped entirely, leaving the loop
    // var dangling (`ReferenceError: b is not defined`).
    let source = r#"@state { books: Array<{ ref: string; name: string }> = [] }
@template {
  <ul><$link $each="books as b" $key={b.ref} href={"/read/" + b.ref}>{b.name}</$link></ul>
}"#;
    let js = compile(source, "x-each-link");
    assert!(
        js.contains("createEachBoundary("),
        "$each on <$link> must wrap in createEachBoundary, got:\n{js}"
    );
    // The link boundary must be INSIDE the each item function (so `b` is bound).
    let each_pos = js.find("createEachBoundary(").unwrap();
    let link_pos = js.find("createLinkBoundary(").unwrap();
    assert!(
        each_pos < link_pos,
        "createLinkBoundary must be nested inside createEachBoundary, got:\n{js}"
    );
}

#[test]
fn if_on_link_wraps_in_if_boundary() {
    let source = r#"@state { show: boolean = true }
@template { <div><$link $if={show} href="/x">go</$link></div> }"#;
    let js = compile(source, "x-if-link");
    assert!(
        js.contains("createIfBoundary("),
        "$if on <$link> must wrap in createIfBoundary, got:\n{js}"
    );
}

#[test]
fn link_onclick_defers_when_no_router_context() {
    // The link's click handler must NOT hard-navigate when there is no reactive
    // <$router> context — it guards on useRouter() and lets the click bubble to
    // @aihu/app's document delegation instead.
    let source = r#"@template { <$link href="/x">go</$link> }"#;
    let js = compile(source, "x-link-guard");
    assert!(
        js.contains("__aihuRouter.useRouter()"),
        "createLinkBoundary onClick should guard on useRouter(), got:\n{js}"
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
