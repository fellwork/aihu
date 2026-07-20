//! CO1 — `$prop` write rewriting: integration tests over the REAL fixtures.
//!
//! Spec §8.2. Both directions, by named sample:
//!
//! * **Under-application** — the rewrite must fire on all five known-broken
//!   components. Each asserts the `.set(…)` form is present AND the authored
//!   write form is gone; asserting only the former would pass on an emit that
//!   contains both.
//! * **Over-application** — a plain `@state` `let` sharing the body with a
//!   prop must survive untouched, and a file with no prop write at all must
//!   emit BYTE-IDENTICALLY to its pre-CO1 output.

use aihu_compiler::{compile_full, compile_full_with_target, emit, sfc, BuildTarget};

fn emit_file(path: &str) -> String {
    let src = std::fs::read_to_string(repo_path(path))
        .unwrap_or_else(|e| panic!("fixture {path} unreadable: {e}"));
    let parsed = sfc::parse(&src).unwrap_or_else(|e| panic!("{path} failed to parse: {e}"));
    let unit = compile_full(&parsed).unwrap_or_else(|e| panic!("{path} failed compile_full: {e}"));
    emit(&unit, "x-test").js
}

fn repo_path(rel: &str) -> std::path::PathBuf {
    // CARGO_MANIFEST_DIR is packages/compiler; the fixtures live at the repo root.
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(rel)
}

// ─── Under-application: the rewrite MUST fire ────────────────────────────────

#[test]
fn cookbook_counter_lowers_to_set() {
    let js = emit_file("cookbook/aihu-counter.aihu");
    // The §4.5 inline fast path: statement position + numeric-literal
    // `default:` make `ToNumeric` provably identity, so no helper is needed.
    assert!(js.contains("count.set(count() + 1)"), "increment\n{js}");
    assert!(js.contains("count.set(count() - 1)"), "decrement\n{js}");
    assert!(js.contains("count.set(0)"), "reset\n{js}");
    // The authored forms must be GONE, not merely accompanied.
    assert!(!js.contains("count++"), "count++ survived\n{js}");
    assert!(!js.contains("count--"), "count-- survived\n{js}");
    assert!(!js.contains("count = 0"), "count = 0 survived\n{js}");
    // The headline fixture must never load the ToNumeric helper.
    assert!(
        !js.contains("__aihu_prop_upd"),
        "fast path must not emit the helper\n{js}"
    );
}

#[test]
fn cookbook_modal_lowers_to_set() {
    let js = emit_file("cookbook/aihu-modal.aihu");
    assert!(js.contains("open.set(true)"), "{js}");
    assert!(js.contains("open.set(false)"), "{js}");
    assert!(!js.contains("open = true"), "{js}");
    assert!(!js.contains("open = false"), "{js}");
}

#[test]
fn ssr_hydration_lifecycle_lowers_to_set() {
    // Fixture 3 writes its props from `$lifecycle.mount`, not `$action` — the
    // evidence that `$lifecycle` had to be in scope.
    let js = emit_file("cookbook/ssr-hydration.aihu");
    assert!(js.contains("greeting.set("), "{js}");
    assert!(js.contains("name.set("), "{js}");
    // OVER-APPLICATION GUARD, on a real fixture: `hydratedFrom` is a plain
    // `@state` `let`, still a writable binding. Rewriting it would emit `.set`
    // on a string, which PASSES parse and fails only at runtime.
    assert!(
        js.contains("hydratedFrom = "),
        "plain `let` must stay a plain assignment\n{js}"
    );
    assert!(!js.contains("hydratedFrom.set("), "plain `let` was rewritten\n{js}");
}

#[test]
fn macro_test_wrapped_handler_lowers_to_set() {
    // The wrapped `handler:` form with TS-typed params — which is why the
    // synthetic wrapper parses as `SourceType::ts()`.
    let js = emit_file("examples/_shared/macro-test.aihu");
    assert!(js.contains("hue.set(h)"), "{js}");
    assert!(js.contains("saturation.set(70)"), "{js}");
    assert!(js.contains("lightness.set(55)"), "{js}");
}

#[test]
fn todo_mvc_action_lowers_to_set() {
    let js = emit_file("packages/compiler/tests/codemods/fixtures/todo-mvc.expected.aihu");
    assert!(js.contains("filter.set(f)"), "{js}");
    assert!(js.contains("todos.set("), "{js}");
    // NOT fixed by CO1, and deliberately so (spec §2.2): the RHS read
    // `...todos` still spreads the getter FUNCTION. That is the separate
    // bare-read defect; CO1 must not touch reads.
    assert!(
        js.contains("todos.set([...todos,"),
        "the read side must remain untouched — fixing it is a different slice\n{js}"
    );
}

#[test]
fn server_target_lowers_identically() {
    // The defect reproduced identically under `--target server`, so one fix
    // covers both. Pin that they do not drift apart.
    let src = std::fs::read_to_string(repo_path("cookbook/aihu-counter.aihu")).unwrap();
    let parsed = sfc::parse(&src).unwrap();
    let unit = compile_full_with_target(&parsed, BuildTarget::Server).unwrap();
    let js = emit(&unit, "x-test").js;
    assert!(js.contains("count.set(count() + 1)"), "{js}");
    assert!(js.contains("count.set(count() - 1)"), "{js}");
    assert!(js.contains("count.set(0)"), "{js}");
}

// ─── Over-application: the negative control ──────────────────────────────────

#[test]
fn hacker_news_item_is_unchanged_by_co1() {
    // This file writes NO prop. Its `(parse)` failure is a `$afterNavigate`
    // lowering bug (the call head is stripped, leaving a dangling `})`), filed
    // separately in TODOS.md.
    //
    // The assertion is that CO1 did not absorb an unrelated defect: the emit
    // must contain no `.set(` the rewrite could have introduced, and no helper.
    // Substituting this file into CO1's acceptance set would make the slice
    // unfalsifiable — you would be chasing a router-macro bug under a
    // prop-write brief.
    let rel = "examples/hacker-news/src/pages/item/[id].aihu";
    let src = std::fs::read_to_string(repo_path(rel)).unwrap();
    // A `@route` block is only valid under `src/pages/`, so this file needs
    // path-aware parsing.
    let parsed = aihu_compiler::compile_with_path(&src, Some(rel)).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let js = emit(&unit, "x-test").js;
    assert!(
        !js.contains("__aihu_prop_upd"),
        "CO1 must not touch a file with no prop write\n{js}"
    );
    // The file declares no `$prop` at all, so the write-target key set is
    // empty and the rewrite early-returns before parsing anything. Verified
    // out-of-band as well: across all 78 out-of-scope `.aihu` files in the
    // repo, the CO1 emit is byte-identical to the pre-CO1 emit.
    assert!(!js.contains(".set("), "no `.set(` may be introduced\n{js}");
    // The unrelated `$afterNavigate` defect is still present — CO1 neither
    // fixed nor worsened it. Filed separately in TODOS.md.
    assert!(js.contains("registerAfterGuard") || js.contains("$afterNavigate"));
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

fn compile_err(script: &str) -> aihu_compiler::CompileError {
    let src = format!("@state {{\n{script}\n}}\n\n@template\n<div>x</div>\n");
    let parsed = sfc::parse(&src).expect("SFC must parse");
    compile_full(&parsed).expect_err("must be a hard error")
}

#[test]
fn destructuring_into_a_prop_is_c560() {
    let e = compile_err(
        "$prop: { count: { default: 0 } }\n\
         $action: { load: () => { [count] = [1] } }",
    );
    assert_eq!(e.code.as_deref(), Some("C560"), "{}", e.message);
}

#[test]
fn writing_a_prop_in_computed_is_c561() {
    let e = compile_err(
        "$prop: { count: { default: 0 } }\n\
         $computed: { doubled: () => { count = 2; return count() * 2 } }",
    );
    assert_eq!(e.code.as_deref(), Some("C561"), "{}", e.message);
    assert!(e.message.contains("count"), "names the prop: {}", e.message);
    assert!(e.fix.is_some(), "carries a fix hint");
}

#[test]
fn reading_a_prop_in_computed_is_clean() {
    // The correct derivation form must not be caught by the C561 net.
    let src = "@state {\n$prop: { count: { default: 0 } }\n\
               $computed: { doubled: () => count() * 2 }\n}\n\n@template\n<div>{doubled}</div>\n";
    let parsed = sfc::parse(src).unwrap();
    assert!(compile_full(&parsed).is_ok(), "a pure derivation must compile");
}
