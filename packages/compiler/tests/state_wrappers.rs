//! #487 Phase 1 — the `@state` reactive-declaration model, end-to-end over
//! the REAL fixtures (state-model spec §8 acceptance).
//!
//! Covers: wrapper recognition + lowering parity (§2), explicit reactivity +
//! the write-rewrite pass (§4.3), zero-config `action` batch wrapping (§8.6),
//! `let`-props via CO1 (§8.7), diagnostics C622/C624/C625/C626 + W627 (§4.4–
//! §4.6), the `expose:` shorthand through the single resolver (§6.1), and the
//! compat window: old forms compile UNCHANGED (§7).

use aihu_compiler::{compile_full, emit, sfc, state_staleness_warnings};

fn emit_src(src: &str) -> aihu_compiler::EmitResult {
    let parsed = sfc::parse(src).unwrap_or_else(|e| panic!("parse failed: {e}"));
    let unit = compile_full(&parsed).unwrap_or_else(|e| panic!("compile_full failed: {e}"));
    emit(&unit, "x-test")
}

fn emit_file(path: &str) -> aihu_compiler::EmitResult {
    let full = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(path);
    let src = std::fs::read_to_string(&full).unwrap_or_else(|e| panic!("{path}: {e}"));
    emit_src(&src)
}

fn compile_err(src: &str) -> aihu_compiler::CompileError {
    let parsed = sfc::parse(src).expect("parse must succeed");
    compile_full(&parsed).expect_err("compile_full must fail")
}

// ─── §8.2 — the reactive-write headline ──────────────────────────────────────

#[test]
fn state_let_lowers_to_signal_tuple_and_plain_writes_notify() {
    let js = emit_file("tests/fixtures/state-model/counter-new.aihu").js;
    // The tuple the runtime already serves.
    assert!(js.contains("const [count, __count_set] = signal(0);"), "{js}");
    // `count++` in a zero-config action → the §4.3 fast path, batch-wrapped.
    assert!(
        js.contains("function increment() { return batch(() => { __count_set(count() + 1) }) }"),
        "{js}"
    );
    // `count -= 1` compound form.
    assert!(js.contains("__count_set(count() - (1))"), "{js}");
    // `count = 0` plain assignment.
    assert!(js.contains("__count_set(0)"), "{js}");
    // A handler-position write (`onclick={() => count = count + 10}`).
    assert!(js.contains("onClick: () => __count_set(count() + 10)"), "{js}");
    // The derived recomputes from the getter.
    assert!(js.contains("const doubled = computed(() => count() * 2);"), "{js}");
    // No authored write form survives.
    assert!(!js.contains("count++"), "authored update must be gone\n{js}");
    assert!(!js.contains("count = 0"), "authored assignment must be gone\n{js}");
}

#[test]
fn wrapper_weather_full_component() {
    let r = emit_file("tests/fixtures/state-model/weather-new.aihu");
    let js = &r.js;
    // prop lowering unchanged (options form + ctx.props binding).
    assert!(js.contains("const city = ctx.props.city"), "{js}");
    assert!(js.contains("city: { value: 'London' }"), "{js}");
    // state lets.
    assert!(js.contains("const [loading, __loading_set] = signal(false);"), "{js}");
    // derived reads spliced to getter calls.
    assert!(
        js.contains("const status = computed(() => loading() ? 'loading' : (errorMsg() ? 'error' : 'ready'));"),
        "{js}"
    );
    // async action: NOT batch-wrapped (same rule as $action), writes lowered,
    // prop read spliced inside the template literal.
    assert!(js.contains("async function fetchForecast() { __loading_set(true)"), "{js}");
    assert!(js.contains("encodeURIComponent(city())"), "{js}");
    assert!(js.contains("__forecast_set(await res.text())"), "{js}");
    // Zero-config action keeps the batch wrap (§8.6).
    assert!(
        js.contains("function reset() { return batch(() => { __forecast_set('') }) }"),
        "{js}"
    );
    // §6.1 — expose shorthands resolve through the ONE resolver into the SAME
    // artifacts: `expose: 'read'` on the prop → GX read; `expose: 'public'`
    // on the action → agent action.
    assert!(js.contains("city: () => city()"), "read-exposed prop\n{js}");
    assert!(js.contains("fetchForecast: (args) => fetchForecast(args)"), "exposed action\n{js}");
    // Unexposed member (`reset`, no expose) appears in NO agent artifact.
    assert!(!js.contains("reset: (args)"), "unexposed action must not be an agent member\n{js}");
}

// ─── §8.6 — zero-config action batch parity ──────────────────────────────────

#[test]
fn zero_config_action_batch_is_byte_equal_to_configured_form() {
    let zero = emit_src(
        "@state {\n  let x = state(0)\n  const go = action(() => { x = 1 })\n}\n@template {\n  <button on:click={go}>{x}</button>\n}",
    )
    .js;
    let configured = emit_src(
        "@state {\n  let x = state(0)\n  const go = action({ describe: 'Go' }, () => { x = 1 })\n}\n@template {\n  <button on:click={go}>{x}</button>\n}",
    )
    .js;
    let want = "function go() { return batch(() => { __x_set(1) }) }";
    assert!(zero.contains(want), "{zero}");
    assert!(configured.contains(want), "{configured}");
}

// ─── §8.7 — `let`-natured props take the CO1 forms; `const` props are C624 ───

#[test]
fn let_prop_write_emits_co1_set_form() {
    let js = emit_src(
        "@state {\n  let count = prop<number>({ default: 0 })\n  const bump = action(() => { count++ })\n}\n@template {\n  <button on:click={bump}>{count}</button>\n}",
    )
    .js;
    assert!(js.contains("count.set(count() + 1)"), "{js}");
}

#[test]
fn const_prop_write_is_c624() {
    let e = compile_err(
        "@state {\n  const count = prop<number>({ default: 0 })\n  const bump = action(() => { count++ })\n}\n@template {\n  <button on:click={bump}>{count}</button>\n}",
    );
    assert_eq!(e.code.as_deref(), Some("C624"), "{}", e.message);
}

// ─── §4.5 / §4.6 — C622 swapped args, C624 nature mismatches ─────────────────

#[test]
fn c622_swapped_args_carries_the_swap_fix() {
    let e = compile_err(
        "@state {\n  const go = action(async () => { f() }, { describe: 'x' })\n}\n@template {\n  <p>hi</p>\n}",
    );
    assert_eq!(e.code.as_deref(), Some("C622"));
    // Machine-readable from/to: the auto-fix swaps the arguments.
    let to = e.to.as_deref().unwrap();
    assert!(to.starts_with("action({ describe: 'x' },"), "{to}");
}

#[test]
fn c624_const_state_and_let_derived() {
    let e = compile_err("@state {\n  const x = state(0)\n}\n@template {\n  <p>{x}</p>\n}");
    assert_eq!(e.code.as_deref(), Some("C624"));
    let e = compile_err("@state {\n  let y = derived(() => 1)\n}\n@template {\n  <p>{y}</p>\n}");
    assert_eq!(e.code.as_deref(), Some("C624"));
}

#[test]
fn c626_destructuring_into_state() {
    let e = compile_err(
        "@state {\n  let xs = state([1])\n  const go = action(() => { [xs] = pairs })\n}\n@template {\n  <p>{xs}</p>\n}",
    );
    assert_eq!(e.code.as_deref(), Some("C626"));
}

#[test]
fn c561_write_inside_derived() {
    let e = compile_err(
        "@state {\n  let x = state(0)\n  const d = derived(() => { x = 1; return x })\n}\n@template {\n  <p>{d}</p>\n}",
    );
    assert_eq!(e.code.as_deref(), Some("C561"), "{}", e.message);
}

// ─── §7.2 wave 0 — C625 per-file dialect exclusivity ─────────────────────────

#[test]
fn c625_mixing_dialects_errors() {
    let e = compile_err(
        "@state {\n  $prop: { hue: { default: 1 } }\n  let x = state(0)\n}\n@template {\n  <p>{x}</p>\n}",
    );
    assert_eq!(e.code.as_deref(), Some("C625"));
}

#[test]
fn signal_tuples_are_exempt_from_c625() {
    // Authored tuples are orthogonal to the dialect flag (spec §7.2).
    let js = emit_src(
        "@state {\n  const [n, setN] = signal(0)\n  let x = state(1)\n}\n@template {\n  <p>{n} {x}</p>\n}",
    )
    .js;
    assert!(js.contains("const [n, setN] = signal(0)"), "{js}");
    assert!(js.contains("const [x, __x_set] = signal(1);"), "{js}");
}

#[test]
fn shadow_and_extract_directives_are_exempt_from_c625() {
    let js = emit_src(
        "@state {\n  $shadow: 'light'\n  let x = state(0)\n}\n@template {\n  <p>{x}</p>\n}",
    )
    .js;
    assert!(js.contains("// @aihu:shadow light"), "{js}");
}

// ─── §6.4 — naked directives ─────────────────────────────────────────────────

#[test]
fn naked_shadow_directive() {
    let js = emit_src(
        "@state {\n  shadow: 'light'\n  let x = state(0)\n}\n@template {\n  <p>{x}</p>\n}",
    )
    .js;
    assert!(js.contains("// @aihu:shadow light"), "{js}");
}

#[test]
fn naked_extract_directive() {
    let js = emit_src(
        "@state {\n  extract: { read: 'verified', call: 'verified' }\n  let x = state(0)\n}\n@template {\n  <p>{x}</p>\n}",
    )
    .js;
    assert!(js.contains("// @aihu:extract read=verified call=verified"), "{js}");
}

// ─── §3.2 / §3.3 — statement calls and dedicated forms ───────────────────────

#[test]
fn statement_calls_lower_to_shipped_primitives() {
    let js = emit_src(
        "@state {\n  let x = state(0)\n  effect(() => { console.log(x) })\n  effect({ on: [x] }, () => { sync() })\n  onMount(() => { init() })\n  onDispose(() => { cleanup() })\n}\n@template {\n  <p>{x}</p>\n}",
    )
    .js;
    assert!(js.contains("effect(() => { console.log(x()) });"), "auto-tracked effect + read splice\n{js}");
    assert!(js.contains("effect(() => { x(); sync() });"), "explicit-deps form tracks the getter\n{js}");
    assert!(js.contains("onMount(() => { init() });"), "{js}");
    assert!(js.contains("onCleanup(() => { cleanup() });"), "onDispose → onCleanup\n{js}");
}

#[test]
fn provide_consume_and_route() {
    let js = emit_src(
        "@state {\n  let x = state(0)\n  provide('theme', () => x)\n  const locale = consume<string>('locale')\n  const r = route()\n}\n@template {\n  <p>{x}</p>\n}",
    )
    .js;
    assert!(js.contains("provide(contextKey('theme'), (() => x())())"), "{js}");
    assert!(js.contains("const locale = inject(contextKey('locale'))"), "{js}");
    assert!(js.contains("const r = computed(() => __aihuRouter.useRoute());"), "{js}");
}

#[test]
fn event_statement_call_feeds_emit_lowering() {
    let r = emit_src(
        "@state {\n  let x = state(0)\n  event<{ id: string }>('select', { bubbles: true })\n  const pick = action(() => { $emit.select({ id: 'a' }) })\n}\n@template {\n  <button on:click={pick}>{x}</button>\n}",
    );
    // The sidecar's typed $emit interface carries the generic payload.
    let ts = r.sidecar_ts.expect("sidecar");
    assert!(ts.contains("select: (payload: { id: string }) => void;"), "{ts}");
}

// ─── §4.4 — W627 (warning; ratified §9.6) ────────────────────────────────────

#[test]
fn w627_fires_on_mutated_template_read_inert_let() {
    let src = "@state {\n  let x = state(0)\n  let stale = 0\n  const bump = action(() => { stale = stale + 1; x++ })\n}\n@template {\n  <p>{stale} {x}</p>\n}";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let ws = state_staleness_warnings(
        parsed.script.unwrap(),
        unit.template_ast.as_deref().unwrap(),
    );
    assert_eq!(ws.len(), 1, "{ws:?}");
    assert_eq!(ws[0].code.as_deref(), Some("W627"));
    assert!(ws[0].message.contains("state(…)"), "{}", ws[0].message);
}

#[test]
fn w627_does_not_fire_on_render_memo_cache() {
    // The syntax-tree memo-cache idiom (spec §1 point 4 / §8.3): bare lets
    // mutated inside a helper, read ONLY through that helper — never by a
    // template expression directly. Must stay silent.
    let src = "@state {\n  let rowKey = null\n  let rowVal = null\n  function rowsOf(n) {\n    if (rowKey !== n) { rowKey = n; rowVal = compute(n) }\n    return rowVal\n  }\n}\n@template {\n  <p>{rowsOf(1)}</p>\n}";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let ws = state_staleness_warnings(
        parsed.script.unwrap(),
        unit.template_ast.as_deref().unwrap(),
    );
    assert!(ws.is_empty(), "memo-cache must not warn: {ws:?}");
}

#[test]
fn w627_fires_on_template_handler_mutation() {
    let src = "@state {\n  let n = 0\n}\n@template {\n  <button on:click={() => n++}>{n}</button>\n}";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let ws = state_staleness_warnings(
        parsed.script.unwrap(),
        unit.template_ast.as_deref().unwrap(),
    );
    assert_eq!(ws.len(), 1, "{ws:?}");
    assert_eq!(ws[0].code.as_deref(), Some("W627"));
}

// ─── §7 compat — old forms still compile, bit-for-bit ────────────────────────

#[test]
fn old_macro_dialect_agent_weather_still_compiles() {
    // Frozen old-dialect copy: the LIVE cookbook file migrated to the wrapper
    // dialect in the §7 wave-1/2 corpus migration (spec AC-2 makes
    // agent-weather the NEW-dialect golden), so the compat-window coverage
    // pins the pre-migration content as a fixture instead.
    let js = emit_file("tests/fixtures/state-model/agent-weather-old.aihu").js;
    // The old-dialect lowerings, unchanged: bare typed decl → let, $action
    // body spliced with the CO1-era write semantics.
    assert!(js.contains("let forecast: string = ''"), "{js}");
    assert!(js.contains("async function fetchForecast()"), "{js}");
    assert!(js.contains("const city = ctx.props.city"), "{js}");
}

#[test]
fn old_signal_tuple_dialect_still_compiles() {
    let js = emit_file("../../examples/live-counter/live-counter.aihu").js;
    assert!(js.contains("signal("), "{js}");
}

#[test]
fn statement_call_alone_in_old_file_stays_plain_js() {
    // An old-dialect file calling an imported `effect` — the statement-call
    // recognizer must NOT capture it (byte-stability of the old corpus).
    let js = emit_src(
        "@state {\n  import { effect } from '@aihu/signals'\n  const [n, setN] = signal(0)\n  effect(() => { console.log(n()) })\n}\n@template {\n  <p>{n}</p>\n}",
    )
    .js;
    assert!(js.contains("effect(() => { console.log(n()) })"), "{js}");
}

// ─── §5.4 — the wrapper sidecar is valid TS checked in place ─────────────────

#[test]
fn wrapper_sidecar_declares_intrinsics_and_inlines_declarations() {
    let r = emit_file("tests/fixtures/state-model/weather-new.aihu");
    let ts = r.sidecar_ts.expect("sidecar");
    // Identity-typed intrinsics (§5.1).
    assert!(ts.contains("declare function state<T>(initial: T): T;"), "{ts}");
    assert!(ts.contains("declare function prop<T>(config: __AihuPropConfig<T> & { default: T }): T;"), "{ts}");
    // The wrapper declarations are inlined VERBATIM (checked in place) —
    // no macro blanking, no parallel decl table.
    assert!(ts.contains("const city = prop<string>({"), "{ts}");
    assert!(ts.contains("let loading = state(false)"), "{ts}");
    // Module-forced so `declare function event` can never collide with the
    // lib.dom script-scope `event` global.
    assert!(ts.trim_end().ends_with("export {}"), "{ts}");
}

#[test]
fn old_dialect_sidecar_has_no_intrinsic_decls() {
    // Same frozen old-dialect fixture as above (the live file is new-dialect).
    let r = emit_file("tests/fixtures/state-model/agent-weather-old.aihu");
    let ts = r.sidecar_ts.expect("sidecar");
    assert!(!ts.contains("declare function state<T>"), "old sidecars unchanged\n{ts}");
    assert!(!ts.contains("export {}"), "old sidecars stay as-is\n{ts}");
}
