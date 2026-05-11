//! B3 — Variant B template syntax acceptance tests.
//!
//! Covers:
//! - {#if}/{:else if}/{:else}/{/if} block-tag conditional
//! - {#each list as item, idx (key)}/{:empty}/{/each} block-tag iteration
//! - {@html expr} Svelte-style raw HTML
//! - $on.click / $bind.value dot-form (Variant B namespace separator)
//! - class={[...]} array form (clsx-shaped)
//! - R4 typed-conv at $bind.value write-back site
//! - C500 reserved error code surface for unknown $-directives
//! - $ref={signal} write-on-mount lowering
//!
//! Each test compiles end-to-end and spot-checks the emitted JS shape.

use aihu_compiler::{compile_full, emit, sfc};

fn compile_fixture(source: &str, tag: &str) -> String {
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).expect("fixture must compile");
    emit(&unit, tag).js
}

// ─── AC #5 — {#if}/{#each}/{:else if}/{:else}/{:empty} block-tag syntax ──────

#[test]
fn b3_ac5_block_if_lowers_to_when() {
    let src = r#"@template {
  {#if cond}
    <span>yes</span>
  {/if}
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
  {#if a}
    <span>A</span>
  {:else if b}
    <span>B</span>
  {:else}
    <span>D</span>
  {/if}
}"#;
    let js = compile_fixture(src, "x-b3-elif");
    // The else-if chain should produce 3 sibling createIfBoundary calls
    let count = js.matches("createIfBoundary").count();
    assert!(count >= 3, "expected ≥3 createIfBoundary, got {} in:\n{}", count, js);
    // The else branch synthesizes a negated-conds thunk: !(a) && !(b)
    assert!(
        js.contains("!(a)") && js.contains("!(b)"),
        "expected negated prior conds for {{:else}}: {}",
        js
    );
}

#[test]
fn b3_ac5_block_each_lowers_to_each_call() {
    let src = r#"@template {
  <ul>
    {#each items as item, idx (item.id)}
      <li>{idx}: {item.title}</li>
    {/each}
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
  {#each items as item (item.id)}
    <li>{item.title}</li>
  {:empty}
    <li class="empty">none</li>
  {/each}
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
  {#each events.filter(e => e.ok) as evt (evt.id)}
    <li>{evt.title}</li>
  {/each}
}"#;
    let js = compile_fixture(src, "x-b3-lambda");
    assert!(
        js.contains("events.filter(e => e.ok)"),
        "expected lambda LHS preserved: {}",
        js
    );
}

// ─── AC #6 — $on.click + $bind.value dot-form ────────────────────────────────

#[test]
fn b3_ac6_dot_form_on_click_lowers_to_onclick_attr() {
    let src = r#"@template {
  <button $on.click={handle}>X</button>
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
  <input $bind.value={text} />
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
        .expect_err("colon-form must produce a compile error");
    assert_eq!(
        err.code.as_deref(),
        Some("C500"),
        "expected C500 error code for colon-form; got: {:?}",
        err.code
    );
}

#[test]
fn b3_ac16_phase2_colon_form_error_message_cites_codemod() {
    // Companion test: the C500 error message must guide users to the migration
    // tool via the codemod:template-syntax script alias (AC6/B3c.2).
    let src = r#"@template {
  <button $on:click={handle}>x</button>
}"#;
    let parsed = aihu_compiler::sfc::parse(src).unwrap();
    let err = aihu_compiler::compile_full(&parsed)
        .expect_err("colon-form must produce a compile error");
    assert!(
        err.message.contains("codemod:template-syntax"),
        "C500 error message must cite codemod:template-syntax migration tool; got: {}",
        err.message
    );
}

// ─── AC #7 — class={[...]} array form ────────────────────────────────────────

#[test]
fn b3_ac7_class_array_form_lowers_with_helper() {
    // v1.0.8 — Amendment 04: canonical form is `$class={…}`.
    // Plain `class={…}` is C306.
    let src = r#"@state {
  active: boolean = false
}
@template {
  <div $class={['box', active && 'on']}></div>
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
    // Regression: when `$class={…}` is NOT an array, the new helper is not invoked.
    // v1.0.8 — Amendment 04: canonical form is `$class={…}`.
    let src = r#"@template {
  <div $class={cond ? 'a' : 'b'}></div>
}"#;
    let js = compile_fixture(src, "x-b3-class-string");
    assert!(
        !js.contains("__aihu_cls(["),
        "non-array $class={{}} should not invoke __aihu_cls: {}",
        js
    );
}

// ─── AC #8 — {@html expr} Svelte-style raw HTML ──────────────────────────────

#[test]
fn b3_ac8_html_block_lowers_with_effect() {
    let src = r#"@state {
  raw: string = '<em>x</em>'
}
@template {
  <article>{@html raw}</article>
}"#;
    let js = compile_fixture(src, "x-b3-html-block");
    assert!(
        js.contains("createContextualFragment"),
        "expected createContextualFragment in {{@html}} lowering: {}",
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
  <input type="number" $bind.value={count} />
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
    // `$bind.checked` reads `e.target.checked` (boolean by platform contract);
    // typed-conv helper not needed at the write site.
    let src = r#"@state {
const [done, setDone] = signal(false)
}
@template {
  <input type="checkbox" $bind.checked={done} />
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

// ─── $ref={signal} closure of long-standing silent-drop bug (Scout D1.4) ────

#[test]
fn b3_ref_signal_lowers_to_setter_call_at_mount() {
    let src = r#"@state {
const [myEl, setMyEl] = signal(null)
}
@template {
  <div $ref={myEl}>x</div>
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
  {#if view === 'list'}
    <div>{count}</div>
  {:else}
    <div>none</div>
  {/if}
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
        "sidecar must include {{#if}} cond: {}",
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
  <button $on.click={() => $emit.dayjump({ day })}>x</button>
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
  <button $on.click={() => $emit.ping()}>x</button>
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
// B3c Phase 2: colon-form `$on:click` must now cause the compiler binary to
// exit non-zero and emit a C500 error to stderr. Previously this was a soft
// W202 deprecation warning; the corpus is now migrated and the transition
// window is closed.

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
    // B3c: colon-form is a hard compile error; binary must exit non-zero.
    assert!(
        !output.status.success(),
        "expected non-zero exit for C500 colon-form; exit code: {:?}",
        output.status.code()
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("C500") || stderr.contains("codemod:template-syntax"),
        "expected C500 or codemod hint in stderr; got: {}\n(stdout: {})",
        stderr,
        String::from_utf8_lossy(&output.stdout),
    );
}

// ─── AC10 — Listener `$on.<custom-event>` with payload typing surface ────────
//
// At the lowering level a custom-event listener (e.g. `$on.dayjump={…}`) is
// emitted byte-identically to a DOM listener (`onDayjump: …`). The
// distinction surfaces at the SIDECAR / tsc layer through the typed
// `$emit`/`$event` declarations the SFC exports. This test covers the
// emit-layer contract: a custom-event handler attribute compiles cleanly to
// the right `on{Event}` attribute key and the typed handler argument flows
// through to the sidecar.

#[test]
fn b3b_ac10_listener_dot_form_custom_event_lowers_attribute() {
    let src = r#"@template {
  <calendar-grid $on.dayjump={(e) => focusDate(e.detail.day)}></calendar-grid>
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
