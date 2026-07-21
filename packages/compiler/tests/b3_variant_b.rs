//! B3 — Variant B template syntax acceptance tests.
//!
//! Covers (grammar v2 — the prefix-less template):
//! - if={…}/elseif={…}/else attribute chains (assembled IfBlock lowering)
//! - each={item, idx of list} key={…} + `empty` sibling (EachBlock lowering)
//! - html={expr} raw-HTML attribute
//! - on:click / bind:value colon directives
//! - class={[...]} array form (clsx-shaped)
//! - R4 typed-conv at bind:value write-back site
//! - C606/C607 retirement surface for `$`-prefixed attributes
//! - ref={signal} write-on-mount lowering
//!
//! Each test compiles end-to-end and spot-checks the emitted JS shape.

use aihu_compiler::{compile_full, emit, sfc};

fn compile_fixture(source: &str, tag: &str) -> String {
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).expect("fixture must compile");
    emit(&unit, tag).js
}

// ─── AC #5 — if/elseif/else chains + each/empty sibling assembly ─────────────

#[test]
fn b3_ac5_block_if_lowers_to_when() {
    let src = r#"@template {
  <span if={cond}>yes</span>
}"#;
    let js = compile_fixture(src, "x-b3-if");
    assert!(
        js.contains("createIfBoundary"),
        "expected createIfBoundary lowering: {}",
        js
    );
    assert!(
        js.contains("when"),
        "expected `when` import wired (boundary helper): {}",
        js
    );
}

#[test]
fn b3_ac5_block_if_else_chain_lowers_to_negated_when_siblings() {
    let src = r#"@template {
  <span if={a}>A</span>
  <span elseif={b}>B</span>
  <span else>D</span>
}"#;
    let js = compile_fixture(src, "x-b3-elif");
    // The else-if chain should produce 3 sibling createIfBoundary calls
    let count = js.matches("createIfBoundary").count();
    assert!(count >= 3, "expected ≥3 createIfBoundary, got {} in:\n{}", count, js);
    // The else branch synthesizes a negated-conds thunk: !(a) && !(b)
    assert!(
        js.contains("!(a)") && js.contains("!(b)"),
        "expected negated prior conds for the `else` branch: {}",
        js
    );
}

#[test]
fn b3_ac5_block_each_lowers_to_each_call() {
    let src = r#"@template {
  <ul>
    <li each={item, idx of items} key={item.id}>{idx}: {item.title}</li>
  </ul>
}"#;
    let js = compile_fixture(src, "x-b3-each");
    assert!(
        js.contains("createEachBoundary") || js.contains("each("),
        "expected each lowering: {}",
        js
    );
    // Key fn should pass `(item) => item.id`
    assert!(
        js.contains("(item) => item.id"),
        "expected key function (item) => item.id: {}",
        js
    );
}

#[test]
fn b3_ac5_block_each_with_empty_emits_dual_when() {
    let src = r#"@template {
  <li each={item of items} key={item.id}>{item.title}</li>
  <li empty class="empty">none</li>
}"#;
    let js = compile_fixture(src, "x-b3-empty");
    // Two createIfBoundary calls (populated + empty branches)
    let count = js.matches("createIfBoundary").count();
    assert!(count >= 2, "expected ≥2 createIfBoundary, got {} in:\n{}", count, js);
    assert!(
        js.contains(".length > 0"),
        "expected length-check guard: {}",
        js
    );
}

#[test]
fn b3_ac5_block_each_lambda_lhs_unhoisted() {
    // The hidden landmine — Variant B accepts the lambda-LHS without forcing
    // a hoist-to-$computed.
    let src = r#"@template {
  <li each={evt of events.filter(e => e.ok)} key={evt.id}>{evt.title}</li>
}"#;
    let js = compile_fixture(src, "x-b3-lambda");
    assert!(
        js.contains("events.filter(e => e.ok)"),
        "expected lambda LHS preserved: {}",
        js
    );
}

// ─── AC #6 — on:click + bind:value colon directives ──────────────────────────

#[test]
fn b3_ac6_dot_form_on_click_lowers_to_onclick_attr() {
    let src = r#"@template {
  <button on:click={handle}>X</button>
}"#;
    let js = compile_fixture(src, "x-b3-dot-on");
    assert!(
        js.contains("onClick: handle"),
        "expected onClick: handle attr: {}",
        js
    );
}

#[test]
fn b3_ac6_dot_form_bind_value_lowers_with_writeback() {
    let src = r#"@state {
const [text, setText] = signal('')
}
@template {
  <input bind:value={text} />
}"#;
    let js = compile_fixture(src, "x-b3-dot-bind");
    assert!(
        js.contains("value: [text, setText]"),
        "expected read-side tuple: {}",
        js
    );
    assert!(
        js.contains("__aihu_conv(text(), e.target.value)"),
        "expected typed-conv write-back: {}",
        js
    );
}

#[test]
fn b3_ac16_phase2_colon_form_is_hard_error() {
    // B3c Phase 2 (AC16): v1 colon-form is now a hard C500 compile error.
    // The corpus was fully migrated in B3b; this validates the promotion.
    let src = r#"@state {
const [text, setText] = signal('')
}
@template {
  <input $bind:value={text} />
}"#;
    let parsed = aihu_compiler::sfc::parse(src).unwrap();
    let err = aihu_compiler::compile_full(&parsed)
        .expect_err("`$`-prefixed form must produce a compile error");
    assert_eq!(
        err.code.as_deref(),
        Some("C607"),
        "expected C607 retirement code for `$bind:`; got: {:?}",
        err.code
    );
}

#[test]
fn b3_ac16_phase2_colon_form_error_message_cites_fix() {
    // Companion test: the C607 retirement error must carry the exact
    // migration target in its fix hint (the C471 pattern).
    let src = r#"@template {
  <button $on:click={handle}>x</button>
}"#;
    let parsed = aihu_compiler::sfc::parse(src).unwrap();
    let err = aihu_compiler::compile_full(&parsed)
        .expect_err("`$`-prefixed form must produce a compile error");
    assert!(
        err.message.contains("on:click={handle}"),
        "C607 error message must carry the migrated form; got: {}",
        err.message
    );
}

// ─── AC #7 — class={[...]} array form ────────────────────────────────────────

#[test]
fn b3_ac7_class_array_form_lowers_with_helper() {
    // v1.0.8 — Amendment 04: canonical form is `class={…}`.
    // Plain `class={…}` is C306.
    let src = r#"@state {
  active: boolean = false
}
@template {
  <div class={['box', active && 'on']}></div>
}"#;
    let js = compile_fixture(src, "x-b3-class-array");
    assert!(
        js.contains("__aihu_cls"),
        "expected __aihu_cls helper definition: {}",
        js
    );
    assert!(
        js.contains("__aihu_cls(['box', active && 'on'])"),
        "expected helper called with array literal: {}",
        js
    );
}

#[test]
fn b3_ac7_class_string_unchanged() {
    // Regression: when `class={…}` is NOT an array, the new helper is not invoked.
    // v1.0.8 — Amendment 04: canonical form is `class={…}`.
    let src = r#"@template {
  <div class={cond ? 'a' : 'b'}></div>
}"#;
    let js = compile_fixture(src, "x-b3-class-string");
    assert!(
        !js.contains("__aihu_cls(["),
        "non-array class={{}} should not invoke __aihu_cls: {}",
        js
    );
}

// ─── AC #8 — html={expr} raw-HTML attribute ──────────────────────────────────

#[test]
fn b3_ac8_html_block_lowers_with_effect() {
    let src = r#"@state {
  raw: string = '<em>x</em>'
}
@template {
  <article html={raw}></article>
}"#;
    let js = compile_fixture(src, "x-b3-html-block");
    assert!(
        js.contains("createContextualFragment"),
        "expected createContextualFragment in `html` lowering: {}",
        js
    );
}

// ─── AC #11 — R4 typed-conv numeric signal gets number not string ────────────

#[test]
fn b3_ac11_typed_conv_helper_emitted_for_value_bind() {
    let src = r#"@state {
const [count, setCount] = signal(0)
}
@template {
  <input type="number" bind:value={count} />
}"#;
    let js = compile_fixture(src, "x-b3-typed-conv");
    assert!(
        js.contains("const __aihu_conv ="),
        "expected __aihu_conv helper definition: {}",
        js
    );
    assert!(
        js.contains("typeof cur === 'number'"),
        "expected number-coercion branch: {}",
        js
    );
    assert!(
        js.contains("__aihu_conv(count(), e.target.value)"),
        "expected helper invocation at writeback: {}",
        js
    );
}

#[test]
fn b3_ac11_typed_conv_skipped_for_checked_bind() {
    // `bind:checked` reads `e.target.checked` (boolean by platform contract);
    // typed-conv helper not needed at the write site.
    let src = r#"@state {
const [done, setDone] = signal(false)
}
@template {
  <input type="checkbox" bind:checked={done} />
}"#;
    let js = compile_fixture(src, "x-b3-bind-checked");
    assert!(
        js.contains("setDone(e.target.checked)"),
        "expected onchange writeback to use e.target.checked directly: {}",
        js
    );
    assert!(
        !js.contains("__aihu_conv(done()"),
        "typed-conv must not wrap checked-bind: {}",
        js
    );
}

// ─── ref={signal} closure of long-standing silent-drop bug (Scout D1.4) ────

#[test]
fn b3_ref_signal_lowers_to_setter_call_at_mount() {
    let src = r#"@state {
const [myEl, setMyEl] = signal(null)
}
@template {
  <div ref={myEl}>x</div>
}"#;
    let js = compile_fixture(src, "x-b3-ref");
    // Either signal-setter call (registered signal) or plain assignment.
    assert!(
        js.contains("setMyEl(_el)") || js.contains("myEl = _el"),
        "expected $ref to write the element to the signal at mount: {}",
        js
    );
    assert!(
        js.contains("onMount("),
        "expected onMount wiring for $ref: {}",
        js
    );
}

// ─── #433 (FEL-270): $ref on a $if/$each-gated element is a silent-blank trap ─
//
// The ref's onMount is otherwise emitted INSIDE the boundary factory, which has
// no component-setup owner → throws 'no owner' → the whole subtree blanks with
// nothing surfaced. The compiler must reject this at build time (C562).

#[test]
fn c562_ref_with_if_on_same_element_rejects() {
    let src = r#"@state {
let proseEl: HTMLElement | null = null
hasData: boolean = false
}
@template {
  <article class="prose" ref={proseEl} if={hasData}>content</article>
}"#;
    let parsed = sfc::parse(src).expect("parse should succeed so we reach compile_full");
    let err = compile_full(&parsed).expect_err("$ref + $if on one element must reject");
    assert_eq!(err.code.as_deref(), Some("C562"), "expected C562, got {:?}", err.code);
    // Rich-diagnostic shape: message + hint + fix (mirrors C560/C561).
    assert!(err.hint.is_some(), "C562 must carry a hint: {:?}", err);
    assert!(err.fix.is_some(), "C562 must carry a fix: {:?}", err);
    assert!(
        err.message.contains("no owner"),
        "C562 message must name the 'no owner' failure: {}",
        err.message
    );
}

#[test]
fn c562_ref_with_each_on_same_element_rejects() {
    let src = r#"@state {
let el: HTMLElement | null = null
items: string[] = []
}
@template {
  <li ref={el} each={it of items}>{it}</li>
}"#;
    let parsed = sfc::parse(src).expect("parse should succeed so we reach compile_full");
    let err = compile_full(&parsed).expect_err("$ref + $each on one element must reject");
    assert_eq!(err.code.as_deref(), Some("C562"), "expected C562, got {:?}", err.code);
}

#[test]
fn c562_does_not_overreach_ungated_ref_still_lowers() {
    // Bidirectional guard: an UNGATED $ref must still lower to its setup-level
    // onMount, unchanged — the diagnostic only fires on $if/$each co-occurrence.
    let src = r#"@state {
let stageEl: HTMLElement | null = null
}
@template {
  <div ref={stageEl}>x</div>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).expect("ungated $ref must still compile");
    let js = emit(&unit, "x-ungated-ref").js;
    assert!(
        js.contains("onMount(") && js.contains("stageEl = _el"),
        "ungated $ref must still emit its setup-level onMount setter: {}",
        js
    );
}

// ─── #432 (FEL-269): $ref-bound `let` keeps its type annotation in the sidecar ─
//
// The tsc surface (`compileSidecar` / `emit().sidecar_ts`) inlines the @state
// body verbatim, so a typed `let stageEl: HTMLElement | null = null` must reach
// tsc WITH its annotation — otherwise tsc's evolving-let infers constant `null`
// and the `stageEl && stageEl.foo` guard collapses to `never`.

fn compile_sidecar(source: &str, tag: &str) -> String {
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).expect("fixture must compile");
    emit(&unit, tag).sidecar_ts.expect("a template SFC must emit a sidecar")
}

#[test]
fn ref_bound_let_keeps_type_annotation_in_sidecar() {
    let src = r#"@state {
let stageEl: HTMLElement | null = null

function check() {
  return stageEl && stageEl.getRootNode()
}
}
@template {
  <div ref={stageEl}>x</div>
}"#;
    let sidecar = compile_sidecar(src, "x-ref-typed");
    assert!(
        sidecar.contains("let stageEl: HTMLElement | null = null"),
        "the $ref-bound `let` must keep its `: HTMLElement | null` annotation in the sidecar so \
         tsc types it `HTMLElement | null`, not constant-`null`: {}",
        sidecar
    );
}

#[test]
fn ref_bound_unannotated_let_gets_no_invented_annotation() {
    // Bidirectional guard: a $ref on an UNannotated `let` is emitted unchanged —
    // the compiler must not invent an annotation.
    let src = r#"@state {
let el = null
}
@template {
  <div ref={el}>x</div>
}"#;
    let sidecar = compile_sidecar(src, "x-ref-untyped");
    assert!(
        sidecar.contains("let el = null"),
        "an unannotated $ref-bound `let` must be emitted unchanged (no invented type): {}",
        sidecar
    );
    assert!(
        !sidecar.contains("let el:"),
        "the compiler must not invent an annotation for an unannotated $ref target: {}",
        sidecar
    );
}

// ─── Fixtures (full end-to-end SFC compilation) ──────────────────────────────

#[test]
fn b3_fixture_block_tags_basic() {
    let src = include_str!("fixtures/b3-variant-b/block-tags-basic.aihu");
    let js = compile_fixture(src, "x-b3-fixture-blocks");
    assert!(js.contains("createIfBoundary"), "missing createIfBoundary: {}", js);
    assert!(
        js.contains("createEachBoundary") || js.contains("each("),
        "missing each lowering: {}",
        js
    );
    assert!(
        js.contains("__aihu_cls"),
        "missing class array helper: {}",
        js
    );
    assert!(
        js.contains("onClick:"),
        "missing dot-form onClick attr: {}",
        js
    );
}

#[test]
fn b3_fixture_html_block() {
    let src = include_str!("fixtures/b3-variant-b/html-block.aihu");
    let js = compile_fixture(src, "x-b3-fixture-html");
    assert!(
        js.contains("createContextualFragment"),
        "missing raw HTML lowering: {}",
        js
    );
}

#[test]
fn b3_fixture_dot_form_bind() {
    let src = include_str!("fixtures/b3-variant-b/dot-form-bind.aihu");
    let js = compile_fixture(src, "x-b3-fixture-bind");
    assert!(
        js.contains("__aihu_conv(count()"),
        "missing typed-conv at numeric bind: {}",
        js
    );
    assert!(
        js.contains("__aihu_conv(text()"),
        "missing typed-conv at string bind: {}",
        js
    );
}

// ─── AC #12 — Sidecar .aihu.ts emit ───────────────────────────────────────────

#[test]
fn b3_ac12_sidecar_ts_contains_template_expressions() {
    // The sidecar should pick up every curly expression in @template so tsc
    // can flag type errors at the lang-server level.
    let src = r#"@state {
const [count, setCount] = signal(0)
const [view, setView] = signal('list')
}
@template {
  <div if={view === 'list'}>{count}</div>
  <div else>none</div>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-b3-sidecar");
    let sidecar = result.sidecar_ts.expect("sidecar must be emitted");
    assert!(
        sidecar.contains("function __aihu_template"),
        "sidecar must define __aihu_template: {}",
        sidecar
    );
    assert!(
        sidecar.contains("view === 'list'"),
        "sidecar must include the `if` cond: {}",
        sidecar
    );
    assert!(
        sidecar.contains("count"),
        "sidecar must include {{count}} interpolation: {}",
        sidecar
    );
}

#[test]
fn b3_ac12_sidecar_ts_includes_emit_and_event_decls() {
    // Sidecar preamble must declare $emit and $event so tsc doesn't flag them
    // as undefined at the call site (until the typed-payload generation lands).
    let src = r#"@template {
  <div></div>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-b3-sidecar-decls");
    let sidecar = result.sidecar_ts.expect("sidecar must be emitted");
    assert!(
        sidecar.contains("declare const $emit"),
        "sidecar must declare $emit: {}",
        sidecar
    );
    assert!(
        sidecar.contains("declare const $event"),
        "sidecar must declare $event: {}",
        sidecar
    );
}

#[test]
fn sidecar_places_expressions_on_their_aihu_source_line() {
    // Part 2 — line-preserving layout: every line of the sidecar sits at its real
    // `.aihu` line, so a `tsc` diagnostic cites the line the author actually
    // wrote. Line 1 is the compact preamble; the @state body follows on ITS lines;
    // lifted template expressions follow on theirs.
    let src = "\
@state {
  import { signal } from '@aihu/signals'
  const [count, setCount] = signal(0)
}
@template {
  <div>{count()}</div>
}";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let sidecar = emit(&unit, "x-lines").sidecar_ts.expect("sidecar must be emitted");
    let lines: Vec<&str> = sidecar.lines().collect();
    assert!(
        lines[0].contains("type-check sidecar"),
        "line 1 must be the compact preamble:\n{sidecar}"
    );
    // The @state body keeps its own source lines (2 and 3) — this is what makes a
    // type error inside @state cite the line the author wrote it on.
    assert!(
        lines[1].contains("import { signal }") && lines[2].contains("const [count, setCount]"),
        "the @state body must sit on its real lines (2, 3):\n{sidecar}"
    );
    // `{count()}` sits on .aihu line 6, so its check must be on sidecar line 6.
    assert_eq!(
        lines.get(5).copied(),
        Some("void (count());"),
        "`count()` must be on sidecar line 6 (matching .aihu line 6):\n{sidecar}"
    );
}

/// Whether `name` is in scope for the sidecar's template expressions.
///
/// These tests exist to prevent one failure: `TS2304: Cannot find name` on a
/// binding a template references. A name is in scope either because the inlined
/// `@state` body binds it (the usual case — and it carries its REAL type there),
/// or because it is a template-only loop alias, which has no declaration to
/// borrow a type from and so arrives as an `any` parameter.
///
/// It deliberately does not care WHICH: asserting `name: any` in the signature
/// would pin the test to the old all-params sidecar, where every binding was
/// `any` and a `@state` type error could never be caught.
fn in_scope(sidecar: &str, name: &str) -> bool {
    let sig = sidecar
        .lines()
        .find(|l| l.contains("function __aihu_template"))
        .unwrap_or("");
    if sig.contains(&format!("{name}: any")) {
        return true; // a template-only loop alias
    }
    // Otherwise it must be bound in the declaration region: the preamble plus the
    // inlined @state body, i.e. everything above the template function.
    let decls: String = sidecar
        .lines()
        .take_while(|l| !l.contains("function __aihu_template"))
        .collect::<Vec<_>>()
        .join("\n");
    contains_word(&decls, name)
}

/// `haystack` contains `name` as a whole identifier (not as a substring of a
/// longer one — `sel` must not match inside `setSel`).
fn contains_word(haystack: &str, name: &str) -> bool {
    let is_ident = |c: char| c.is_alphanumeric() || c == '_' || c == '$';
    haystack.match_indices(name).any(|(i, _)| {
        let before = haystack[..i].chars().next_back();
        let after = haystack[i + name.len()..].chars().next();
        !before.is_some_and(is_ident) && !after.is_some_and(is_ident)
    })
}

#[test]
fn sidecar_inlines_state_so_bindings_carry_real_types() {
    // The sidecar used to declare every template-referenced binding as an `any`
    // parameter and never emit the @state body at all — so a type error inside
    // @state was structurally impossible to catch, and `tsc` reported a green
    // check over code it had never seen. The body is now inlined verbatim (at its
    // real lines), which is what gives these bindings their true types.
    let src = r#"@state {
import { signal } from '@aihu/signals'
const [n, setN] = signal(0)
const bad: number = 'not a number'
}
@template { <p>{n()}</p> }"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let sidecar = emit(&unit, "x-inline").sidecar_ts.expect("sidecar must be emitted");
    assert!(
        sidecar.contains("const bad: number = 'not a number'"),
        "the @state body must reach tsc verbatim, or nothing in it is checked:\n{sidecar}"
    );
    let sig = sidecar
        .lines()
        .find(|l| l.contains("function __aihu_template"))
        .unwrap_or_default();
    assert!(
        sig.ends_with("function __aihu_template(): void {") && !sig.contains(": any"),
        "an inlined binding must NOT also arrive as an `any` param (that erases its type):\n{sig}"
    );
}

#[test]
fn sidecar_types_a_prop_as_an_accessor_not_a_value() {
    // At runtime `ctx.props.<name>` is a Signal, read via the getter call
    // (`props.title()`), so a template reads a prop as `language()`. Typing the
    // sidecar binding as a plain value made every such call a TS2349 "not
    // callable" — 39 false positives across the fellwork web app. A prop is
    // `() => T`, with `type:` giving the RETURN type.
    let src = "@state {\n  $prop: {\n    lang: { default: 'grc', type: string },\n  }\n}\n@template {\n  <span>{lang()}</span>\n}";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let sidecar = emit(&unit, "x-prop").sidecar_ts.expect("sidecar must be emitted");
    assert!(
        sidecar.contains("let lang: () => string"),
        "a prop must be typed as an accessor `() => T`:\n{sidecar}"
    );
    assert!(
        !sidecar.contains("let lang: string ="),
        "a prop must NOT be typed as a plain value — that breaks every `lang()` call:\n{sidecar}"
    );
}

#[test]
fn sidecar_lowers_a_bare_typed_declaration_to_valid_ts() {
    // `@state` accepts a bare typed declaration with no keyword — the runtime emit
    // lowers it to `let`. The sidecar must apply the SAME lowering: inlined
    // verbatim, `intervalId: number | null = null` reads as a labelled statement,
    // so tsc reported `'number' only refers to a type, but is being used as a value
    // here` on a line the author wrote correctly — and, worse, never declared the
    // name, so every template reference to it false-errored as undefined. It cost
    // the examples 7 phantom diagnostics.
    let src = "@state {\n  intervalId: number | null = null\n}\n@template {\n  <p>{intervalId}</p>\n}";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let sidecar = emit(&unit, "x-bare").sidecar_ts.expect("sidecar must be emitted");
    assert!(
        sidecar.contains("let intervalId: number | null = null"),
        "a bare typed declaration must be lowered to `let`, as the runtime emit does:\n{sidecar}"
    );
    // And it must still sit on its own source line (line 2) — the lowering adds a
    // keyword, it does not move the statement.
    let lines: Vec<&str> = sidecar.lines().collect();
    assert!(
        lines[1].contains("let intervalId"),
        "the lowered declaration must stay on its real .aihu line:\n{sidecar}"
    );
}

#[test]
fn sidecar_declares_state_bindings_referenced_by_template() {
    // Regression: the sidecar emitted `void (toggle())` / `void (label())` for
    // user @state consts but never DECLARED them, so every such sidecar failed
    // tsc with `TS2304: Cannot find name`. Repo-wide breakage surfaced whenever
    // sidecars were regenerated (web + api). The generator must declare every
    // @state binding the template can reference.
    let src = r#"@state {
import { signal, computed } from '@aihu/signals'
const [open, setOpen] = signal(false)
const toggle = () => setOpen(!open())
const label = computed(() => open() ? 'Close' : 'Open')
}
@template { <button on:click={toggle}>{label()}</button> }"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-sidecar-state");
    let sidecar = result.sidecar_ts.expect("sidecar must be emitted");
    // The template references `toggle` and `label`; both must be in scope as
    // __aihu_template parameters so the `void (...)` checks resolve instead of
    // TS2304-ing. Parameters (not module-scope decls) so names that shadow DOM
    // globals like `open` don't collide (TS2451).
    assert!(
        sidecar.contains("function __aihu_template(")
            && in_scope(&sidecar, "toggle")
            && in_scope(&sidecar, "label"),
        "sidecar must declare referenced @state bindings as params:\n{sidecar}"
    );
    // No @state binding should arrive as an `any` PARAM — each is bound by the
    // inlined script and carries its real type. `open` in particular: it shadows
    // lib.dom's `open`, which an ambient re-declaration would collide with
    // (TS2451), but a module-scope `const` shadows cleanly.
    let sig = sidecar
        .lines()
        .find(|l| l.contains("function __aihu_template"))
        .unwrap_or("");
    for name in ["open", "toggle", "label", "signal"] {
        assert!(
            !sig.contains(&format!("{name}: any")),
            "`{name}` must come from the inlined @state body, not an `any` param:\n{sig}"
        );
    }
}

#[test]
fn sidecar_declares_prop_and_computed_collection_names() {
    // $prop / $computed entry names are template-referenceable @state symbols
    // too — they must be declared in the sidecar.
    let src = r#"@state {
  $prop: { active: { default: '', type: string } }
  $computed: { cls: () => active() === 'home' ? 'on' : '' }
}
@template { <a class={cls()}>{active()}</a> }"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-sidecar-prop");
    let sidecar = result.sidecar_ts.expect("sidecar must be emitted");
    assert!(
        in_scope(&sidecar, "active"),
        "sidecar must declare the `active` $prop as a param:\n{sidecar}"
    );
    assert!(
        in_scope(&sidecar, "cls"),
        "sidecar must declare the `cls` $computed as a param:\n{sidecar}"
    );
}

#[test]
fn sidecar_declares_setters_loop_aliases_and_imports() {
    // The three extraction gaps that remained after the first sidecar fix, all
    // in one SFC: (1) a signal SETTER used in a handler, (2) `$each` loop
    // aliases including one whose iterable has a nested call
    // (`chaptersOf(selBook()) as c`), (3) a name imported into @state and used
    // directly in the template. Each must be an `__aihu_template` parameter or
    // the regenerated sidecar TS2304s.
    let src = r#"@state {
import { signal } from '@aihu/signals'
import { closeNav, activeStudy } from './nav-store.ts'
const [sel, setSel] = signal('')
const sections = () => []
const selBook = () => 'Gen'
const chaptersOf = (bk: string) => []
}
@template {
  <ul>
    <li each={s of sections()}>
      <span each={b of s.books} on:click={() => setSel(b.id)}>{b.name}</span>
      <i each={c of chaptersOf(selBook())}>{c}</i>
      <button on:click={closeNav}>{activeStudy()}</button>
    </li>
  </ul>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-sidecar-gaps");
    let sidecar = result.sidecar_ts.expect("sidecar must be emitted");
    // @state bindings and imports come from the inlined body, with real types.
    for name in [
        "setSel",      // signal setter
        "closeNav",    // imported, used in handler
        "activeStudy", // imported, used in interpolation
    ] {
        assert!(
            in_scope(&sidecar, name),
            "sidecar must declare `{name}`:\n{sidecar}"
        );
    }
    // #485 step 3: loop aliases are bound by real `for…of` heads over the
    // `__aihu_each` helper — inferred element types, not `any` params.
    for binder in ["for (const [s] of", "for (const [b] of", "for (const [c] of"] {
        assert!(
            sidecar.contains(binder),
            "sidecar must bind the loop alias via `{binder} …`:\n{sidecar}"
        );
    }
}

#[test]
fn sidecar_handles_multiline_imports_single_destructure_and_handler_params() {
    // The final three sidecar gaps after 0.9.4: (1) a MULTI-LINE import (the
    // line-at-a-time scan missed these), (2) a single-element destructure
    // `const [showLine] = signal()` (resolve_signals only seeds 2-element
    // pairs), (3) an inline event-handler param `(e) => …` (emitted bare it is
    // implicit-any → TS7006).
    let src = r#"@state {
import { signal } from '@aihu/signals'
import {
  closeNav,
  toggleTheme,
} from '../lib/store.ts'
const [showLine] = signal(false)
const openTerm = (e: Event, t: unknown) => {}
}
@template {
  <div>
    <button on:click={() => closeNav()}>x</button>
    <button on:click={() => toggleTheme()}>t</button>
    <hr if={showLine} />
    <a on:click={(e) => openTerm(e, showLine())}>go</a>
  </div>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-sidecar-final");
    let sidecar = result.sidecar_ts.expect("sidecar must be emitted");
    let sig = sidecar
        .lines()
        .find(|l| l.contains("function __aihu_template"))
        .unwrap_or("");
    // Multi-line import names + single-element destructure are in scope.
    for name in ["closeNav", "toggleTheme", "showLine"] {
        assert!(in_scope(&sidecar, name), "sidecar must declare `{name}`:\n{sig}");
    }
    // Handlers go through the __handler() helper (call position) so their inline
    // arrow params get a contextual `any` type instead of implicit-any (TS7006).
    assert!(
        sidecar.contains("declare function __handler(h: (...args: any[]) => any): void;"),
        "sidecar must declare the __handler typing helper:\n{sidecar}"
    );
    assert!(
        sidecar.contains("__handler((e) => openTerm(e, showLine()))"),
        "inline handler must be emitted via __handler(...):\n{sidecar}"
    );
    // #485 step 2: the element-level `if={showLine}` cond is a real `if` head
    // now (narrowing), not a flat `void (...)` lift.
    assert!(
        sidecar.contains("if (showLine) {"),
        "the `if=` cond must emit a real `if` head:\n{sidecar}"
    );
}

// ─── W4 (advanced-js-template-expressions) — AST-derived sidecar harvest ────

#[test]
fn sidecar_harvests_template_literal_and_spread_reads() {
    // W4 — the token harvest treated a backtick as a plain string open (so
    // everything inside `` `…` `` was invisible) and treated the identifier
    // after `...` as a member access. `count`/`nums`/`items` were therefore
    // never declared as params and VALID components failed sidecar tsc with
    // TS2304. The AST harvest sees `${…}` holes and spread targets as the
    // ordinary reads they are.
    let src = r#"@state {
import { signal } from '@aihu/signals'
const [count, setCount] = signal(0)
const [nums, setNums] = signal([1])
const [items, setItems] = signal(['a'])
}
@template {
  <span>{`Count: ${count}`}</span>
  <b>{Math.max(...nums)}</b>
  <i class={[...items, 'x']}>y</i>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let sidecar = emit(&unit, "x-w4-tpl-spread").sidecar_ts.expect("sidecar must be emitted");
    let sig = sidecar
        .lines()
        .find(|l| l.contains("function __aihu_template"))
        .unwrap_or("");
    for name in ["count", "nums", "items"] {
        assert!(
            in_scope(&sidecar, name),
            "sidecar must declare `{name}` (template-literal/spread read):\n{sig}"
        );
    }
}

#[test]
fn sidecar_omits_shadowed_params_and_object_keys() {
    // W4 — post-scope-model harvest: an arrow param that SHADOWS a state
    // binding is not a template read of it, and a non-computed object KEY /
    // member property is never a read (they are `IdentifierName` nodes).
    // The token scan emitted a `count: any` param for all three sites here;
    // object SHORTHAND (`{ count }`) IS a read and keeps the param.
    let base = |template: &str| {
        format!(
            r#"@state {{
import {{ signal }} from '@aihu/signals'
const [count, setCount] = signal(0)
const [items, setItems] = signal([1])
const [user, setUser] = signal({{ name: '' }})
}}
@template {{
  {template}
}}"#
        )
    };
    // Shadowed param + object key + member property: no `count` param.
    let src = base("<span>{items.map(count => count + 1).join('')}</span><b>{JSON.stringify({ count: 1 })}</b><i>{user.name}</i>");
    let parsed = sfc::parse(&src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let sidecar = emit(&unit, "x-w4-shadow").sidecar_ts.expect("sidecar must be emitted");
    let sig = sidecar
        .lines()
        .find(|l| l.contains("function __aihu_template"))
        .unwrap_or("");
    assert!(in_scope(&sidecar, "items"), "outer `items` read must surface:\n{sig}");
    assert!(in_scope(&sidecar, "user"), "member BASE `user` read must surface:\n{sig}");
    assert!(
        !sig.contains("count: any"),
        "shadowed-param/object-key `count` must NOT become a param:\n{sig}"
    );
    // Object shorthand IS a read.
    let src = base("<span>{JSON.stringify({ count })}</span>");
    let parsed = sfc::parse(&src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let sidecar = emit(&unit, "x-w4-shorthand").sidecar_ts.expect("sidecar must be emitted");
    let sig = sidecar
        .lines()
        .find(|l| l.contains("function __aihu_template"))
        .unwrap_or("");
    assert!(in_scope(&sidecar, "count"), "shorthand `{{ count }}` is a read:\n{sig}");
}

#[test]
fn sidecar_binds_destructured_each_aliases() {
    // W4 — `each={[k, v], i of pairs} key={k}`: a torn header once tore the
    // pattern across item/idx (`[k` + `v], i`), so the token extractor bound
    // NOTHING and k/v/i all TS2304'd in the sidecar. The harvest rejoins the
    // alias list and REALLY parses it as a parameter list.
    let src = r#"@state {
import { signal } from '@aihu/signals'
const [pairs, setPairs] = signal([['a', 1]])
}
@template {
  <ul>
    <li each={[k, v], i of pairs} key={k}>{k}: {v} #{i}</li>
  </ul>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let sidecar = emit(&unit, "x-w4-destructure").sidecar_ts.expect("sidecar must be emitted");
    let sig = sidecar
        .lines()
        .find(|l| l.contains("function __aihu_template"))
        .unwrap_or("");
    assert!(in_scope(&sidecar, "pairs"), "the list read must be in scope:\n{sig}");
    // #485 step 3: the destructured aliases are bound by the `for…of` head —
    // real element types from the iterable, not `any` params.
    assert!(
        sidecar.contains("for (const [[k, v], i] of"),
        "the for…of head must bind the destructured aliases:\n{sidecar}"
    );
}

#[test]
fn sidecar_binds_object_pattern_each_aliases_in_macro_form() {
    // W4 — `$each` attr with an object-pattern alias incl. a RENAME
    // (`{ name, id: rid }` binds `rid`, not `id`) — the rename's LOCAL side
    // must be the param; the key side must not.
    let src = r#"@state {
import { signal } from '@aihu/signals'
const [users, setUsers] = signal([])
}
@template {
  <li each={{ name, id: rid } of users}>{name}: {rid}</li>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let sidecar = emit(&unit, "x-w4-objpat").sidecar_ts.expect("sidecar must be emitted");
    let sig = sidecar
        .lines()
        .find(|l| l.contains("function __aihu_template"))
        .unwrap_or("");
    // #485 step 3: the object pattern (rename included) is the for…of binding.
    assert!(
        sidecar.contains("for (const [{ name, id: rid }] of"),
        "the for…of head must bind the object-pattern alias verbatim:\n{sidecar}"
    );
    assert!(
        !sig.contains(": any"),
        "no alias arrives as an `any` param anymore:\n{sig}"
    );
}

#[test]
fn sidecar_line_mapping_holds_for_newly_harvested_forms() {
    // W4 must not disturb the #390 contract: the harvest changes which names
    // become params (line 2, the opener), never how expressions are PLACED.
    // A template-literal expression — newly harvested via the AST — still
    // lands on its real `.aihu` source line.
    let src = "\
@state {
  import { signal } from '@aihu/signals'
  const [count, setCount] = signal(0)
}
@template {
  <div>x</div>
  <span>{`Count: ${count}`}</span>
}";
    // The template-literal interpolation sits on .aihu line 7.
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let sidecar = emit(&unit, "x-w4-lines").sidecar_ts.expect("sidecar must be emitted");
    let lines: Vec<&str> = sidecar.lines().collect();
    // The read inside the template literal must be in scope — it comes from the
    // inlined @state body now, not from an `any` param on the opener line.
    assert!(
        in_scope(&sidecar, "count"),
        "the template-literal read must be in scope:\n{sidecar}"
    );
    // #485 step 1: the bare `count` read is rewritten onto the `__aihu_ctx`
    // value view (so it checks as `number`, not as the getter function) — and
    // the statement still sits on its real `.aihu` line: the line-recovery
    // cursor searches the ORIGINAL capture, so the rewrite never moves it.
    assert_eq!(
        lines.get(6).copied(),
        Some("void (`Count: ${__aihu_ctx.count}`);"),
        "the template-literal expr must sit on sidecar line 7 (its .aihu line):\n{sidecar}"
    );
}

#[test]
fn sidecar_falls_back_to_raw_lift_for_unparseable_captures() {
    // Under `--expr-parser legacy` (the opt-in escape hatch — `ast` is the
    // default since #485 and rejects this capture with C320 at compile_full)
    // a capture that is not a parseable TS expression can reach emit. The
    // rewrite returns None for it and the sidecar lifts the RAW text — the
    // sidecar never loses the coverage it had, and `count` stays in scope via
    // the inlined @state body.
    let src = r#"@state {
import { signal } from '@aihu/signals'
const [count, setCount] = signal(0)
}
@template {
  <span>{count +}</span>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = aihu_compiler::compile_full_with_options(
        &parsed,
        aihu_compiler::BuildTarget::Universal,
        aihu_compiler::ExprParserMode::Legacy,
    )
    .unwrap();
    let sidecar = emit(&unit, "x-w4-fallback").sidecar_ts.expect("sidecar must be emitted");
    assert!(
        in_scope(&sidecar, "count"),
        "the inlined @state body must still declare `count`:\n{sidecar}"
    );
    assert!(
        sidecar.contains("void (count +);"),
        "an unparseable capture lifts raw (no rewrite, no drop):\n{sidecar}"
    );
}

#[test]
fn comma_less_collection_entries_error_c447_not_silent_drop() {
    // Collection entries are comma-separated. A missing comma between wrapped
    // entries previously caused the splitter to collapse them into one chunk
    // and silently keep only the first — wrong runtime codegen (referenced
    // handlers undefined → ReferenceError) and broken sidecars, no diagnostic.
    // It must now be a clear C447 compile error.
    let src = r#"@state {
  count: number = 0
  $action: {
    increment: { handler: () => { count++ }, describe: 'a' }
    decrement: { handler: () => { count-- }, describe: 'b' }
    reset:     { handler: () => { count = 0 }, describe: 'c' }
  }
}
@template { <button on:click={increment}>+</button> }"#;
    let parsed = aihu_compiler::sfc::parse(src).unwrap();
    let err = aihu_compiler::compile_full(&parsed)
        .expect_err("comma-less collection entries must error, not silently drop");
    assert_eq!(err.code.as_deref(), Some("C447"), "expected C447; got {:?}", err.code);
    // Message must name the dropped entry so the fix is obvious.
    assert!(
        err.message.contains("decrement") && err.message.contains("comma"),
        "C447 must name the dropped entry + cite the missing comma: {}",
        err.message
    );
}

#[test]
fn comma_separated_collection_entries_compile_clean() {
    // Guard: the canonical comma-separated form (incl. trailing comma) must keep
    // compiling — all entries captured, no false C447.
    let src = r#"@state {
  count: number = 0
  $action: {
    increment: { handler: () => { count++ }, describe: 'a' },
    decrement: { handler: () => { count-- }, describe: 'b' },
  }
}
@template { <button on:click={increment}>+</button><button on:click={decrement}>-</button> }"#;
    let parsed = aihu_compiler::sfc::parse(src).unwrap();
    let js = aihu_compiler::compile_full(&parsed)
        .map(|u| aihu_compiler::emit(&u, "x-actions").js)
        .expect("comma-separated collections must compile");
    assert!(
        js.contains("function increment") && js.contains("function decrement"),
        "both actions must be wired:\n{js}"
    );
}

#[test]
fn bare_typed_arrow_collection_entry_not_false_flagged() {
    // Guard: a bare arrow value with a top-level return-type colon
    // (`(t: number): string => …`) must NOT be mistaken for a missing comma.
    let src = r#"@state {
  $action: {
    ago: (t: number): string => { return `${t}m` },
    host: (u: string): string => { return u },
  }
}
@template { <span>{ago(5)}</span> }"#;
    let parsed = aihu_compiler::sfc::parse(src).unwrap();
    assert!(
        aihu_compiler::compile_full(&parsed).is_ok(),
        "typed bare-arrow entries must not trip the missing-comma guard"
    );
}

// ─── B3b — $event collection-form parsing (AC9 prerequisite) ─────────────────

#[test]
fn b3b_parse_event_collection_basic() {
    use aihu_compiler::parser::state_macros::parse_state_macros;
    use aihu_compiler::types::{CollectionKind, StateMacro};
    let src = r#"$event: { dayjump: { payload: { day: Date }, describe: 'User picked a day' } }"#;
    let macros = parse_state_macros(src).unwrap();
    assert_eq!(macros.len(), 1);
    let StateMacro::Collection { kind, entries } = &macros[0] else {
        panic!("expected Collection, got {:?}", macros[0]);
    };
    assert_eq!(*kind, CollectionKind::Event);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].name, "dayjump");
    assert!(entries[0].is_wrapped);
}

#[test]
fn b3b_parse_event_collection_multi() {
    use aihu_compiler::parser::state_macros::parse_state_macros;
    use aihu_compiler::types::{CollectionKind, StateMacro};
    let src = r#"$event: {
        dayjump: { payload: { day: Date } },
        rangechange: { payload: { start: Date, end: Date }, bubbles: false },
    }"#;
    let macros = parse_state_macros(src).unwrap();
    let StateMacro::Collection { kind, entries } = &macros[0] else {
        panic!("expected Collection");
    };
    assert_eq!(*kind, CollectionKind::Event);
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].name, "dayjump");
    assert_eq!(entries[1].name, "rangechange");
}

#[test]
fn b3b_parse_event_bare_form_rejected() {
    use aihu_compiler::parser::state_macros::parse_state_macros;
    // $event entries are always wrapped per spec §5.a — bare arrow rejected.
    let src = r#"$event: { dayjump: () => {} }"#;
    let err = parse_state_macros(src).err().expect("should reject bare $event entry");
    assert_eq!(err.code.as_deref(), Some("C444"));
}

// ─── B3b — sidecar typed $emit / $event preamble (AC9 type-flow) ─────────────

#[test]
fn b3b_sidecar_typed_emit_decl_per_event() {
    let src = r#"@state {
  $event: { dayjump: { payload: { day: Date } } }
}
@template {
  <button>x</button>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-b3b-typed-sidecar");
    let sidecar = result.sidecar_ts.expect("sidecar must be emitted");
    // Typed dispatcher entry — payload type carried verbatim from $event.payload.
    assert!(
        sidecar.contains("dayjump: (payload: { day: Date }) => void"),
        "sidecar must emit typed $emit.dayjump dispatcher: {}",
        sidecar
    );
    assert!(
        sidecar.contains("dayjump: { payload: { day: Date } }"),
        "sidecar must emit $event entry shape: {}",
        sidecar
    );
}

// ─── AC9 — $emit.<name>(payload) lowering to dispatchEvent ───────────────────

#[test]
fn b3b_ac9_emit_lowers_to_dispatch_custom_event() {
    let src = r#"@state {
  $event: { dayjump: { payload: { day: Date } } }
const day = new Date()
}
@template {
  <button on:click={() => $emit.dayjump({ day })}>x</button>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-b3b-emit-dispatch");
    let js = result.js;
    assert!(
        js.contains("this.dispatchEvent(new CustomEvent('dayjump'"),
        "expected $emit lowered to dispatchEvent: {}",
        js
    );
    assert!(
        js.contains("detail: { day }"),
        "expected detail wrapping payload: {}",
        js
    );
    assert!(
        js.contains("bubbles: true"),
        "expected default bubbles:true: {}",
        js
    );
    assert!(
        !js.contains("$emit."),
        "expected no residual $emit. in JS: {}",
        js
    );
}

#[test]
fn b3b_ac9_emit_no_args_lowers_with_undefined_detail() {
    let src = r#"@template {
  <button on:click={() => $emit.ping()}>x</button>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-b3b-emit-ping");
    let js = result.js;
    assert!(
        js.contains("this.dispatchEvent(new CustomEvent('ping'"),
        "expected ping lowering: {}",
        js
    );
    assert!(
        js.contains("detail: undefined"),
        "expected detail:undefined for empty args: {}",
        js
    );
}

// ─── AC16-Ph2 binary C500 error test ────────────────────────────────────────
//
// Grammar v2: any `$`-prefixed attribute must cause the compiler binary to
// exit non-zero and emit the C607 retirement error to stderr.

#[test]
fn b3c_ac16_c500_fires_on_colon_form_binary_stderr() {
    use std::io::Write;
    use std::path::Path;
    use std::process::{Command, Stdio};

    let pkg_dir = Path::new(env!("CARGO_MANIFEST_DIR"));

    // Prefer freshly-built target/{debug,release}/ binaries; fall back to
    // `cargo run` when no pre-built binary exists.
    let candidates = [
        pkg_dir.join("target/debug/aihu-compile.exe"),
        pkg_dir.join("target/debug/aihu-compile"),
        pkg_dir.join("target/release/aihu-compile.exe"),
        pkg_dir.join("target/release/aihu-compile"),
        pkg_dir.join("bin/aihu-compile.exe"),
        pkg_dir.join("bin/aihu-compile"),
    ];
    let mut bin: Option<std::path::PathBuf> = None;
    for c in candidates.iter() {
        if c.exists() {
            bin = Some(c.clone());
            break;
        }
    }

    let mut cmd = if let Some(b) = bin {
        let mut c = Command::new(b);
        c.args(["--stdin", "--tag", "x-c500-test"]);
        c
    } else {
        let mut c = Command::new("cargo");
        c.args([
            "run",
            "--quiet",
            "--bin",
            "aihu-compile",
            "--",
            "--stdin",
            "--tag",
            "x-c500-test",
        ]);
        c.current_dir(pkg_dir);
        c
    };

    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("aihu-compile spawn failed");

    let src = b"@template { <button $on:click={fn}>x</button> }\n";
    child
        .stdin
        .as_mut()
        .expect("stdin pipe")
        .write_all(src)
        .expect("write source");
    let output = child.wait_with_output().expect("wait child");
    // Grammar v2: the `$` layer is a hard compile error; binary must exit non-zero.
    assert!(
        !output.status.success(),
        "expected non-zero exit for the C607 retirement; exit code: {:?}",
        output.status.code()
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("C607"),
        "expected C607 retirement error in stderr; got: {}\n(stdout: {})",
        stderr,
        String::from_utf8_lossy(&output.stdout),
    );
}

// ─── AC10 — Listener `on:<custom-event>` with payload typing surface ─────────
//
// At the lowering level a custom-event listener (e.g. `on:dayjump={…}`) is
// emitted byte-identically to a DOM listener (`onDayjump: …`). The
// distinction surfaces at the SIDECAR / tsc layer through the typed
// `$emit`/`$event` declarations the SFC exports. This test covers the
// emit-layer contract: a custom-event handler attribute compiles cleanly to
// the right `on{Event}` attribute key and the typed handler argument flows
// through to the sidecar.

#[test]
fn b3b_ac10_listener_dot_form_custom_event_lowers_attribute() {
    let src = r#"@template {
  <calendar-grid on:dayjump={(e) => focusDate(e.detail.day)}></calendar-grid>
}"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-b3b-listener");
    let js = result.js;
    assert!(
        js.contains("onDayjump:"),
        "expected onDayjump attr key: {}",
        js
    );
    // The handler text passes through verbatim.
    assert!(
        js.contains("focusDate(e.detail.day)"),
        "expected handler body emitted: {}",
        js
    );
}
