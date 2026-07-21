//! arch-5 M1 — routing primitive integration tests.
//!
//! Validates that:
//! - `$route currentRoute` lowers to `useRoute()` from `@aihu/router`.
//! - `$beforeNavigate(fn)` lowers to a guard registration call.
//! - `$afterNavigate(fn)` lowers to an after-guard registration call.
//! - `<router>`, `<a>`, `<outlet>`, `<navigate>` macro elements emit
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
  <router router={myRouter}>
    <outlet></outlet>
  </router>
}"#;
    let js = compile(source, "x-app");
    assert!(
        js.contains("import * as __aihuRouter from '@aihu/router'"),
        "<router> should pull in router namespace, got:\n{js}"
    );
    assert!(
        js.contains("createRouterBoundary(myRouter"),
        "<router> should call createRouterBoundary, got:\n{js}"
    );
    assert!(
        js.contains("createOutletBoundary()"),
        "<outlet> should call createOutletBoundary, got:\n{js}"
    );
}

#[test]
fn outlet_boundary_registers_route_components_via_global_hook() {
    // F1: the nested-outlet render path must load the matched route's referenced
    // components alongside its page module. The emitted helper cannot import
    // virtual:aihu-components (it is compiler-emitted JS with no build-graph
    // import), so it calls the hook @aihu/app publishes on globalThis —
    // optional-chained, so a standalone @aihu/router app just skips it.
    let source = r#"@template {
  <outlet></outlet>
}"#;
    let js = compile(source, "x-layout");
    assert!(
        js.contains(
            "Promise.all([m.route.module(), ...(globalThis.__aihuRegisterRouteComponents?.(m.route) ?? [])]).then(async ([mod]) => {"
        ),
        "<outlet> boundary should await the route module AND the route's components via the global hook, got:\n{js}"
    );
}

#[test]
fn link_element_emits_boundary_with_attrs() {
    let source = r#"@template {
  <a href="/users/42" prefetch="hover" replace>Profile</a>
}"#;
    let js = compile(source, "x-link-test");
    assert!(
        js.contains("createLinkBoundary("),
        "<a> should call createLinkBoundary, got:\n{js}"
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
    // Regression: `<a>` used to forward ONLY href, silently dropping
    // class / class={…} / on:click (and pruning their now-"unused" imports).
    let source = r#"@state {
  close: () => void = () => {}
  isActive: (r: string) => boolean = () => false
}
@template {
  <a href="/read/Gen.1" id="home" class={isActive("Gen.1") ? "row on" : "row"} on:click={() => close()}>Genesis</a>
}"#;
    let js = compile(source, "x-link-attrs");
    assert!(
        js.contains("createLinkBoundary("),
        "should still call createLinkBoundary, got:\n{js}"
    );
    // id forwarded onto the <a> attrs object.
    assert!(js.contains("id: 'home'"), "id should forward, got:\n{js}");
    // on:click forwarded as an onClick handler (and keeps `close` referenced
    // so it is not pruned as an unused import).
    assert!(
        js.contains("onClick:") && js.contains("close()"),
        "on:click should forward as onClick, got:\n{js}"
    );
    // $class forwarded as a (reactive) class binding.
    assert!(
        js.contains("isActive(\"Gen.1\")"),
        "$class expression should forward, got:\n{js}"
    );
}

#[test]
fn each_on_link_wraps_in_each_boundary() {
    // Regression: `$each` on a `<a>` was dropped entirely, leaving the loop
    // var dangling (`ReferenceError: b is not defined`).
    let source = r#"@state { books: Array<{ ref: string; name: string }> = [] }
@template {
  <ul><a each={b of books} key={b.ref} href={"/read/" + b.ref}>{b.name}</a></ul>
}"#;
    let js = compile(source, "x-each-link");
    assert!(
        js.contains("createEachBoundary("),
        "$each on <a> must wrap in createEachBoundary, got:\n{js}"
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
@template { <div><a if={show} href="/x">go</a></div> }"#;
    let js = compile(source, "x-if-link");
    assert!(
        js.contains("createIfBoundary("),
        "$if on <a> must wrap in createIfBoundary, got:\n{js}"
    );
}

#[test]
fn each_on_link_emits_each_boundary_definition() {
    // FEL-230: when the ONLY `$each` in a module sits on a `<a>`, the
    // compiler emitted the `createEachBoundary(...)` call site but never the
    // inlined `const createEachBoundary = ...` definition (the helper collector
    // scanned only plain Element attrs, not MacroElement attrs) →
    // `ReferenceError: createEachBoundary is not defined`, blank page.
    let source = r#"@state { studies: Array<{ ref: string; name: string }> = [] }
@template {
  <div><a each={s of studies} key={s.ref} href={"/read/" + s.ref}>{s.name}</a></div>
}"#;
    let js = compile(source, "x-each-link-only");
    assert!(
        js.contains("createEachBoundary("),
        "call site must be emitted, got:\n{js}"
    );
    assert!(
        js.contains("const createEachBoundary ="),
        "FEL-230: helper DEFINITION must be emitted when the only $each is on \
         <a>, else createEachBoundary is undefined at runtime, got:\n{js}"
    );
    // The definition must precede its first call site in module order.
    let def_pos = js.find("const createEachBoundary =").unwrap();
    let call_pos = js.find("createEachBoundary([").unwrap();
    assert!(
        def_pos < call_pos,
        "definition must be declared before its call site, got:\n{js}"
    );
}

#[test]
fn if_on_link_emits_if_boundary_definition() {
    // FEL-230 sibling: `$if` on a macro element must also collect its helper
    // definition, not just emit the call site.
    let source = r#"@state { show: boolean = true }
@template { <div><a if={show} href="/x">go</a></div> }"#;
    let js = compile(source, "x-if-link-only");
    assert!(
        js.contains("const createIfBoundary ="),
        "FEL-230: $if on <a> must emit createIfBoundary definition, got:\n{js}"
    );
}

#[test]
fn link_onclick_defers_when_no_router_context() {
    // The link's click handler must NOT hard-navigate when there is no reactive
    // <router> context — it guards on useRouter() and lets the click bubble to
    // @aihu/app's document delegation instead.
    let source = r#"@template { <a href="/x">go</a> }"#;
    let js = compile(source, "x-link-guard");
    assert!(
        js.contains("__aihuRouter.useRouter()"),
        "createLinkBoundary onClick should guard on useRouter(), got:\n{js}"
    );
}

#[test]
fn link_click_is_owner_agnostic_attr_not_onmount() {
    // Bug B regression: <a> inside $each/$if threw "onMount: no owner"
    // because createLinkBoundary wired the click via addEventListener inside
    // onMount (which needs the component-setup owner — absent in an each/if
    // item factory). Click is now an arbor event attr (owner-agnostic).
    let source = r#"@template { <a href="/x">go</a> }"#;
    let js = compile(source, "x-link-click");
    assert!(
        js.contains("'data-aihu-link': '', onClick"),
        "click should be wired as an onClick attr, got:\n{js}"
    );
    assert!(
        !js.contains("a.addEventListener('click'"),
        "click must NOT be wired via addEventListener inside onMount, got:\n{js}"
    );
    // Prefetch/aria onMount must be guarded so it can't throw in a factory.
    assert!(
        js.contains("try {") && js.contains("onMount("),
        "onMount (prefetch/aria) should be guarded by try/catch, got:\n{js}"
    );
}

#[test]
fn link_composes_author_on_click_with_navigation() {
    // <a on:click={fn}> must run the author handler AND navigate (and keep
    // `fn` referenced so its import is not pruned).
    let source = r#"@state { close: () => void = () => {} }
@template { <a href="/x" on:click={close}>go</a> }"#;
    let js = compile(source, "x-link-compose");
    assert!(
        js.contains("_userClick"),
        "author onClick should be composed with navigation, got:\n{js}"
    );
    assert!(js.contains("close"), "author handler must stay referenced, got:\n{js}");
}

#[test]
fn complex_attr_binding_is_thunk_wrapped_for_reactivity() {
    // Bug A regression: a complex attr binding (e.g. $class calling a reactive
    // getter the compiler can't see in @state) compiled eager and never
    // re-ran. Complex binding exprs are now thunk-wrapped like $if/$show.
    let source = r#"@template { <div class={activeStudy() ? "a" : "b"}>x</div> }"#;
    let js = compile(source, "x-cls-reactive");
    assert!(
        js.contains("class: [() => (activeStudy()"),
        "complex $class must be thunk-wrapped for reactivity, got:\n{js}"
    );
}

#[test]
fn static_literal_attr_stays_eager() {
    // Don't over-wrap: a plain static attribute stays a literal (no thunk).
    let source = r#"@template { <div class="static-shell">x</div> }"#;
    let js = compile(source, "x-cls-static");
    assert!(
        js.contains("class: 'static-shell'"),
        "static class attribute must stay eager, got:\n{js}"
    );
}

#[test]
fn navigate_element_emits_boundary() {
    let source = r#"@template {
  <navigate to="/login" replace></navigate>
}"#;
    let parsed = sfc::parse(source).expect("parse");
    let unit = compile_full(&parsed).expect("compile_full");
    let result = emit(&unit, "x-redirect");
    let js = result.js;
    assert!(
        js.contains("createNavigateBoundary("),
        "<navigate> should call createNavigateBoundary, got:\n{js}"
    );
}

// ─── <a href> reactivity ──────────────────────────────────────────────────

#[test]
fn link_dynamic_href_is_reactive_thunk() {
    // Confirmed bug: `<a href={readHref()}>` passed the EVALUATED string to
    // createLinkBoundary (`createLinkBoundary(readHref(), …)`), so the boundary
    // baked the href once at mount and the rendered <a> never tracked the
    // selection signal — Read/Study links stayed on the chapter regardless of
    // verse selection. A dynamic href must be passed as a THUNK so the boundary
    // binds it reactively (mirroring a plain `<a href={…}>`).
    let source = r#"@state {
import { signal, computed } from '@aihu/signals'
const [verse, setVerse] = signal(1)
const readHref = computed(() => `/read/${verse()}`)
}
@template { <a href={readHref()}>Read</a> }"#;
    let js = compile(source, "x-link-dyn-href");
    assert!(
        js.contains("createLinkBoundary(() => (readHref())"),
        "dynamic href must be passed as a thunk, got:\n{js}"
    );
    assert!(
        !js.contains("createLinkBoundary(readHref(),"),
        "must NOT pass the eagerly-evaluated href (the non-reactivity bug), got:\n{js}"
    );
    // The boundary binds a function href via the thunk-array attr form and
    // reads the live value for navigation / aria-current.
    assert!(
        js.contains("href: typeof href === 'function' ? [() => href()] : href"),
        "createLinkBoundary must bind a function href reactively, got:\n{js}"
    );
    assert!(
        js.contains("const hrefVal = typeof href === 'function' ? href : () => href"),
        "createLinkBoundary must read the live href for navigate/aria, got:\n{js}"
    );
    assert!(
        js.contains("__aihuRouter.navigate(hrefVal()"),
        "navigation must use the current href value, got:\n{js}"
    );
}

#[test]
fn link_static_href_stays_eager_string() {
    // Guard against over-wrapping: a static href is a plain quoted string, so
    // the link pays no per-link effect and renders the attribute directly.
    let source = r#"@template { <a href="/about">About</a> }"#;
    let js = compile(source, "x-link-static-href");
    assert!(
        js.contains("createLinkBoundary('/about'"),
        "static href must stay a quoted string, got:\n{js}"
    );
    assert!(
        !js.contains("createLinkBoundary(() =>"),
        "static href must NOT be wrapped in a thunk, got:\n{js}"
    );
}

#[test]
fn link_dynamic_href_prop_read_is_rewritten() {
    // FEL-172 must reach the href expr too: a prop getter read in the href
    // expression is rewritten to a call so the thunk reads the VALUE.
    let source = r#"@state {
  $prop: { study: { default: null, type: object } }
}
@template { <a href={study.url}>Open</a> }"#;
    let js = compile(source, "x-link-prop-href");
    assert!(
        js.contains("createLinkBoundary(() => (study().url)")
            || js.contains("createLinkBoundary(() => ((study() as any).url)"),
        "FEL-172: prop read in href must be rewritten to a call, got:\n{js}"
    );
}
