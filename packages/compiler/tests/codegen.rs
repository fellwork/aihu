use aihu_compiler::{compile_full, emit, sfc};

fn counter_source() -> &'static str {
    concat!(
        "@state {
",
        "import { signal } from '@aihu/signals'
",
        "
",
        "const [count, setCount] = signal(0)
",
        "const increment = () => setCount(c => c + 1)
",
        "}
",
        "
",
        "@template {
",
        "  <div class=\"counter\">
",
        "    <span>{{ count }}</span>
",
        // v1.0.8 — Amendment 04: `$on.click={fn}` canonical form. Legacy
        // `@click="fn"` is now C305.
        "    <button $on.click={increment}>+</button>
",
        "  </div>
",
        "}"
    )
}

#[test]
fn counter_full() {
    let parsed = sfc::parse(counter_source()).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "counter");
    insta::assert_snapshot!(output.js);
}

#[test]
fn no_signals_plain_leaf() {
    let src = concat!(
        "@state {
",
        "const message = 'hello'
",
        "}
",
        "@template { <p>{{ message }}</p> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-msg");
    insta::assert_snapshot!(output.js);
}

#[test]
fn event_attr_onclick() {
    let src = concat!(
        "@state {
",
        "const handler = () => {}
",
        "}
",
        // v1.0.8 — Amendment 04: canonical event handler form is `$on.click={fn}`.
        // Legacy `@click="fn"` is now C305.
        "@template { <button $on.click={handler}>click</button> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-btn");
    insta::assert_snapshot!(output.js);
}

#[test]
fn signal_leaf_cast() {
    let src = concat!(
        "@state {
",
        "const [val, setVal] = signal(0)
",
        "}
",
        "@template { <span>{{ val }}</span> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-val");
    insta::assert_snapshot!(output.js);
}

#[test]
fn plain_var_no_cast() {
    let src = concat!(
        "@state {
",
        "const title = 'hello'
",
        "}
",
        "@template { <h1>{{ title }}</h1> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-head");
    insta::assert_snapshot!(output.js);
}

#[test]
fn fel228_getter_call_interpolation_is_reactive_thunk() {
    // FEL-228: a sole text-interpolation child that CALLS a getter
    // (`{selBookLabel()}`) previously compiled to an eager `leaf(selBookLabel())`
    // — a static text node evaluated once that never re-rendered when the
    // underlying signal changed (the "sole text-leaf gap"). It must lower to a
    // reactive thunk-leaf so the node tracks its reads.
    let src = concat!(
        "@state {\n",
        "import { signal, computed } from '@aihu/signals'\n",
        "const [book, setBook] = signal('Gen')\n",
        "const selBookLabel = computed(() => book())\n",
        "}\n",
        "@template { <h4>{selBookLabel()}</h4> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let js = emit(&unit, "x-fel228").js;
    assert!(
        js.contains("leaf([() => (selBookLabel())"),
        "getter-call interpolation must be a reactive thunk-leaf, got:\n{js}"
    );
    assert!(
        !js.contains("leaf(selBookLabel())"),
        "must NOT emit an eager static leaf for a getter call, got:\n{js}"
    );
}

#[test]
fn fel228_loop_var_projection_stays_eager() {
    // Guard against over-wrapping: a pure loop-var projection (`{b.name}` — no
    // call) must stay an eager `leaf(b.name)` so each row doesn't pay for a
    // needless reactive effect. The each() reconciler recreates the leaf when
    // the keyed item changes.
    let src = concat!(
        "@state { books: Array<{ name: string }> = [] }\n",
        "@template { <ul><li $each=\"books as b\">{b.name}</li></ul> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let js = emit(&unit, "x-fel228-loop").js;
    assert!(
        js.contains("leaf(b.name)"),
        "loop-var projection must stay an eager leaf, got:\n{js}"
    );
}

#[test]
fn style_scoped_emits_css_in_function_form() {
    let src = concat!(
        "@state {
",
        "const [count, setCount] = signal(0)
",
        "}
",
        "@template { <span>{{ count }}</span> }
",
        "@style {
",
        "span { color: red; }
",
        "}"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-styled");
    insta::assert_snapshot!(output.js);
}

#[test]
fn style_escapes_backtick_and_interpolation_for_template_literal() {
    // The @style block is emitted as a JS template literal passed to
    // `replaceSync(`...`)`. A backtick or `${` in the source CSS (e.g. inside
    // a `/* ... */` comment that mentions a `.foo` selector) must be escaped,
    // or the literal terminates early — throwing at runtime and aborting
    // `customElements.define`, so the element never upgrades. Regression for
    // the docs-shell `@style` comment containing a backtick-quoted `.kn`.
    let src = concat!(
        "@state {
",
        "const [count, setCount] = signal(0)
",
        "}
",
        "@template { <span>{{ count }}</span> }
",
        "@style {
",
        "/* wrap output in a `.kn` root */
",
        "span::before { content: \"${x}\"; }
",
        "}"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-styled");
    // Backtick inside the comment must be escaped.
    assert!(
        output.js.contains("\\`.kn\\`"),
        "backtick in @style comment must be escaped; got:\n{}",
        output.js
    );
    // `${` interpolation start must be escaped so it is not read as a template
    // expression.
    assert!(
        output.js.contains("\\${x}"),
        "`${{` in @style must be escaped; got:\n{}",
        output.js
    );
}

#[test]
fn ctx_param_present() {
    let src = concat!(
        "@state {
",
        "const [val, setVal] = signal(0)
",
        "}
",
        "@template { <span>{{ val }}</span> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-ctx");
    assert!(
        output.js.contains("defineComponent((_ctx)"),
        "output must contain defineComponent((_ctx)"
    );
    insta::assert_snapshot!(output.js);
}

#[test]
fn import_type_signal_present() {
    let src = concat!(
        "@state {
",
        "const [val, setVal] = signal(0)
",
        "}
",
        "@template { <span>{{ val }}</span> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-sig");
    assert!(
        output.js.contains("import type { Signal }"),
        "output must contain import type {{ Signal }}"
    );
    insta::assert_snapshot!(output.js);
}

#[test]
fn no_export_default() {
    let src = concat!(
        "@state {
",
        "const [val, setVal] = signal(0)
",
        "}
",
        "@template { <span>{{ val }}</span> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-noexp");
    assert!(
        !output.js.contains("export default"),
        "output must not contain export default"
    );
    insta::assert_snapshot!(output.js);
}

#[test]
fn static_attr_passthrough() {
    let src = "@template { <div class=\"counter\"></div> }";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-div");
    insta::assert_snapshot!(output.js);
}

// ─── Plan 1.4 / v0.5.1: slot codegen ────────────────────────────────────────
// Note: <slot> HTML form is DEPRECATED in v0.5. It emits `createSlotBoundary`
// just like <$slot> but also prints a DEPRECATED warning to stderr.

#[test]
fn slot_default_codegen() {
    // <slot></slot> → createSlotBoundary({ expose: [] }, ...) [DEPRECATED HTML form]
    let src = "@template { <div><slot></slot></div> }";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-slot");
    assert!(
        output.js.contains("createSlotBoundary"),
        "deprecated <slot> must emit createSlotBoundary: {}",
        output.js
    );
    assert!(
        !output.js.contains("branch('slot'"),
        "slot must not be emitted as branch"
    );
    insta::assert_snapshot!(output.js);
}

#[test]
fn slot_named_codegen() {
    // <slot name="header"></slot> → createSlotBoundary({ name: 'header', ... }) [DEPRECATED]
    let src = "@template { <div><slot name=\"header\"></slot></div> }";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-named-slot");
    assert!(
        output.js.contains("createSlotBoundary"),
        "deprecated named <slot> must emit createSlotBoundary: {}",
        output.js
    );
    assert!(
        output.js.contains("'header'"),
        "named slot must include slot name in output: {}",
        output.js
    );
    insta::assert_snapshot!(output.js);
}

// ─── A-4b: multiline import state machine ─────────────────────────────────

#[test]
fn multiline_import_lifted_to_module_scope() {
    // Multiline user imports inside @state / <script setup> are lifted to
    // module scope (alongside the auto-emitted framework imports), not stripped
    // and not leaked into the setup function body.
    let source = r#"@state {
import {
  computed
} from '@aihu/signals'

const fee = computed(() => 5)
}
@template {
  <div>{{ fee }}</div>
}"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-test");
    assert!(
        result.js.contains("const fee = computed"),
        "body should contain fee"
    );
    // The multiline user import must be lifted intact to module scope.
    // The lifted block lives BEFORE the defineElement call.
    let define_idx = result.js.find("defineElement(").expect("defineElement emitted");
    let module_scope = &result.js[..define_idx];
    assert!(
        module_scope.contains("import {")
            && module_scope.contains("computed")
            && module_scope.contains("from '@aihu/signals'"),
        "multiline user import should be lifted to module scope above defineElement"
    );
    // Setup body must not contain the raw `const fee = computed` followed by
    // a stray import continuation. Locate the setup function and confirm.
    let setup_idx = result.js.find("(_ctx) =>").expect("setup arrow emitted");
    let setup_body = &result.js[setup_idx..];
    assert!(
        !setup_body.contains("} from '@aihu/signals'"),
        "import continuation `}} from '@aihu/signals'` must not leak into setup body"
    );
}

#[test]
fn side_effect_import_does_not_eat_following_lines() {
    // Bare side-effect import (no `from`, no `;`) must not falsely open a
    // multiline import span — it has no `{`, so should be skipped as single-line.
    let source = r#"@state {
import '@aihu/polyfill'
const fee = 5
}
@template {
  <div>{{ fee }}</div>
}"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-test");
    assert!(
        result.js.contains("const fee = 5"),
        "line after side-effect import must be preserved"
    );
}

#[test]
fn export_keyword_stripped_from_script_body() {
    // When the user writes `export function ...` in <script setup>, the
    // emitter must strip `export ` because the body is injected inside
    // setup(ctx) where module-level exports are syntax errors.
    let source = r#"@agent {
action ping() -> { ok: boolean }
}
@state {
export function ping() {
  return { ok: true }
}
}
@template {
  <div></div>
}"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-export");
    assert!(
        result.js.contains("function ping()"),
        "function declaration preserved"
    );
    assert!(
        !result.js.contains("export function"),
        "export keyword stripped from script body"
    );
}

// ─── A-4c: options-form emission ──────────────────────────────────────────

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
fn agent_airtime_quote() {
    let source = airtime_quote_source();
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "airtime-quote");
    insta::assert_snapshot!(result.js);
}

// ─── A-4d: manifest JSON emission ─────────────────────────────────────────

#[test]
fn agent_airtime_quote_manifest() {
    let source = airtime_quote_source();
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "airtime-quote");
    assert!(
        !result.manifest_json.is_empty(),
        "manifest should be non-empty"
    );
    assert!(
        result.manifest_json.contains("\"airtime_quote\""),
        "tool name"
    );
    assert!(result.manifest_json.contains("\"airtime-quote\""), "tag");
    assert!(result.manifest_json.contains("\"quote\""), "action");
    assert!(result.manifest_json.contains("\"plan\""), "input");
    assert!(result.manifest_json.contains("\"amount\""), "input");
}

// ─── v2 manifest emission: `expose` / `describe` on @state entries ────────
//
// The v1 `@agent { input / action }` keywords above are the only shape
// `agent_airtime_quote_manifest` exercises. v2 (agent_macros.rs) gutted the
// block to `$scope` / `$rate-limit` and moved per-name metadata onto `@state`
// collection entries — which `collect_agent_members` reads and `emit_manifest`
// does not. These tests pin the v2 path.

fn v2_exposed_source() -> &'static str {
    r#"@agent {
$scope "user:write"
$rate-limit 30
}
@state {
import { signal, computed } from '@aihu/signals'

$prop: {
  label: { default: 'hi', describe: 'The visible label', expose: { read: true, write: true } },
}

$computed: {
  shout: { describe: 'Label in upper case', expose: { read: true }, value: () => label().toUpperCase() },
}

$action: {
  bump: { describe: 'Increment the counter by one', expose: { read: true }, handler: () => setCount(count() + 1) },
}

const [count, setCount] = signal(0)
}
@template {
  <div>{label}</div>
}"#
}

/// The exposed members collected by `collect_agent_members` (and proven present
/// in `__agentBinding`) must also reach the manifest sidecar.
#[test]
fn v2_exposed_members_reach_manifest() {
    let parsed = sfc::parse(v2_exposed_source()).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "v2-exposed");

    // Sanity: the binding path already works. If this fails, the fixture is bad,
    // not the manifest.
    assert!(
        result.js.contains("bump: (args) => bump(args)"),
        "precondition: action should reach __agentBinding\n{}",
        result.js
    );

    assert!(
        !result.manifest_json.is_empty(),
        "manifest should be non-empty"
    );
    assert!(
        result.manifest_json.contains("\"bump\""),
        "exposed $action missing from manifest:\n{}",
        result.manifest_json
    );
    assert!(
        result.manifest_json.contains("\"label\""),
        "exposed $prop missing from manifest:\n{}",
        result.manifest_json
    );
    assert!(
        result.manifest_json.contains("\"shout\""),
        "exposed $computed missing from manifest:\n{}",
        result.manifest_json
    );
}

/// The compiler must emit `registerAgentMetadata` — it is the ONLY input to
/// `@aihu/agent-server`'s `buildToolDefinitions`. Before this test existed the
/// call was emitted nowhere, so the registry was empty in every real app and
/// MCP tools were generated from nothing.
#[test]
fn v2_emits_agent_metadata_registration() {
    let parsed = sfc::parse(v2_exposed_source()).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "v2-exposed");

    assert!(
        result
            .js
            .contains("import { registerAgentMetadata } from '@aihu/agent'"),
        "registry import missing:\n{}",
        result.js
    );
    assert!(
        result.js.contains("registerAgentMetadata({"),
        "registerAgentMetadata call missing:\n{}",
        result.js
    );
    assert!(
        result.js.contains("Increment the counter by one"),
        "$action describe missing from metadata:\n{}",
        result.js
    );
    assert!(
        result.js.contains("The visible label"),
        "$prop describe missing from metadata:\n{}",
        result.js
    );
}

/// Client builds elide the agent surface entirely; the metadata registration
/// must go with it, or a client bundle would advertise a server capability.
#[test]
fn v2_client_build_elides_agent_metadata() {
    use aihu_compiler::types::BuildTarget;
    let parsed = sfc::parse(v2_exposed_source()).unwrap();
    let mut unit = compile_full(&parsed).unwrap();
    unit.target = BuildTarget::Client;
    let result = emit(&unit, "v2-exposed");

    assert!(
        !result.js.contains("registerAgentMetadata"),
        "client build leaked agent metadata:\n{}",
        result.js
    );
    assert!(
        !result.js.contains("Increment the counter by one"),
        "client build leaked describe text:\n{}",
        result.js
    );
}

/// `describe:` is the LLM-facing tool description. It is parsed and validated,
/// then currently dropped — it appears in no emitted artifact, which is why
/// every MCP action tool ships with an untyped, undescribed schema.
#[test]
fn v2_describe_reaches_manifest() {
    let parsed = sfc::parse(v2_exposed_source()).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "v2-exposed");

    assert!(
        result
            .manifest_json
            .contains("Increment the counter by one"),
        "$action describe missing from manifest:\n{}",
        result.manifest_json
    );
    assert!(
        result.manifest_json.contains("The visible label"),
        "$prop describe missing from manifest:\n{}",
        result.manifest_json
    );
}

/// Unexposed members must stay out of the manifest — the manifest is a public
/// artifact and is the discovery surface an agent reads.
#[test]
fn v2_unexposed_members_absent_from_manifest() {
    let source = r#"@agent {
$scope "user:read"
}
@state {
import { signal } from '@aihu/signals'

$action: {
  secret: { describe: 'Must never be advertised', handler: () => {} },
}

const [count, setCount] = signal(0)
}
@template {
  <div>{count}</div>
}"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "v2-unexposed");

    assert!(
        !result.manifest_json.contains("\"secret\""),
        "action without `expose` leaked into manifest:\n{}",
        result.manifest_json
    );
    assert!(
        !result.manifest_json.contains("Must never be advertised"),
        "unexposed describe leaked into manifest:\n{}",
        result.manifest_json
    );
}

// ─── Emitted-JS validity regressions ──────────────────────────────────────
//
// Five separate bugs, all found by syntax-checking every cookbook/ and
// examples/ component with esbuild rather than by any test. Each produced
// output that parsed as nothing — the compiler reported success and the build
// failed later, or silently shipped broken code.

/// `handler: async () => …` lowered to `function name(async ()) { … }`.
/// `arrow_args` saw a leading `a` rather than `(`, took the single-identifier
/// branch, and returned everything before `=>`.
#[test]
fn async_action_lowers_to_async_function() {
    let source = r#"@state {
$action: {
  load: { handler: async () => { const r = await fetch('/x'); return r.ok } },
}
}
@template {
  <div></div>
}"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "async-action");

    assert!(
        !result.js.contains("(async ())"),
        "async arrow parsed as a parameter list:\n{}",
        result.js
    );
    assert!(
        result.js.contains("async function load()"),
        "expected `async function load()`:\n{}",
        result.js
    );
    // `batch` takes a plain arrow, so an awaiting body must not be wrapped.
    assert!(
        !result.js.contains("async function load() { return batch"),
        "async handler must not be wrapped in batch (await would be a syntax error):\n{}",
        result.js
    );
}

/// A block-bodied `$computed` lost its braces: `arrow_body` strips them (which
/// `$action` wants, since it re-wraps) but the computed emitter splices into
/// `() => <expr>`, producing `computed(() => if (x) return y)`.
#[test]
fn block_bodied_computed_keeps_its_braces() {
    let source = r#"@state {
import { signal } from '@aihu/signals'
const [n, setN] = signal(0)

$computed: {
  label: { value: () => { if (n() < 1) return 'none'; return 'some' } },
}
}
@template {
  <div>{label}</div>
}"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "block-computed");

    assert!(
        result.js.contains("computed(() => {"),
        "block body must stay braced:\n{}",
        result.js
    );
    assert!(
        !result.js.contains("computed(() => if"),
        "bare statements spliced into expression position:\n{}",
        result.js
    );
}

/// An async `$resource` lost both its braces and its `async`, so the awaiting
/// body landed in a non-async arrow.
#[test]
fn async_resource_keeps_async_and_braces() {
    let source = r#"@state {
$resource: {
  data: async () => { const r = await fetch('/x'); return r.json() },
}
}
@template {
  <div></div>
}"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "async-resource");

    assert!(
        result.js.contains("createResource(async () => {"),
        "expected `createResource(async () => {{`:\n{}",
        result.js
    );
}

/// `$form` was the one CollectionKind missing from the plain-body skip list,
/// so its body leaked into `plain_body`, where the `name: type` declaration
/// scanner rewrote `value: () => value,` into `let value: () => value,` and
/// left a dangling `}`.
#[test]
fn form_collection_does_not_leak_into_plain_body() {
    let source = r#"@state {
value: string = ''

$form: {
  value: () => value,
  validity: () => ({ valueMissing: !value.trim() }),
}
}
@template {
  <input>
}"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "form-leak");

    assert!(
        !result.js.contains("let value: () =>"),
        "$form body leaked into plain_body as a declaration:\n{}",
        result.js
    );
    assert!(
        !result.js.contains("let validity:"),
        "$form entry leaked as a declaration:\n{}",
        result.js
    );
}

/// A destructured `$each` alias tore at the comma inside its own pattern:
/// `as [name, desc]` split into `[name` + `desc]`, emitting `([name) => name`.
/// The split existed in THREE places; the emit.rs copy was the one reached by
/// the `$each="…"` attribute form.
#[test]
fn destructured_each_alias_does_not_tear() {
    let source = r#"@state {
import { signal } from '@aihu/signals'
const [rows, setRows] = signal([])
}
@template {
  <ul>
    <li $each="rows as [name, desc]" $key="name">{name}</li>
  </ul>
}"#;
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "each-destructure");

    assert!(
        !result.js.contains("([name)"),
        "alias torn at the comma inside its destructuring pattern:\n{}",
        result.js
    );
    assert!(
        result.js.contains("([name, desc])"),
        "expected an intact destructured alias:\n{}",
        result.js
    );
}

#[test]
fn no_agent_block_manifest_empty() {
    let source = include_str!("../fixtures/vite-counter/counter.aihu");
    let parsed = sfc::parse(source).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "aihu-counter");
    assert!(
        result.manifest_json.is_empty(),
        "no agent block = no manifest"
    );
}

// ─── Plan 4.3-B: lock signal interpolation cast as stable v1 emit form ────────

#[test]
fn leaf_signal_interpolation_cast() {
    // A minimal component with a signal interpolated in the template.
    // This test locks the `as unknown as Signal<string>` double-cast as the
    // stable v1 emit form, preventing accidental regression.
    // Signal<T> = readonly [Read<T>, Write<T>]; Read<number> does not overlap
    // with Read<string>, so `unknown` is the required bridge — a single `as`
    // would produce a TypeScript compile error.
    let src = concat!(
        "@state {\n",
        "const [score, setScore] = signal(0)\n",
        "}\n",
        "@template { <span>{{ score }}</span> }"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-score");

    // Lock: the stable double-cast must be present.
    assert!(
        output.js.contains("as unknown as Signal<string>"),
        "signal interpolation must emit `as unknown as Signal<string>` cast; got:\n{}",
        output.js
    );

    // Regression guard: a naive single cast must never appear.
    assert!(
        !output.js.contains("as Signal<number>"),
        "output must not contain invalid single cast `as Signal<number>`; got:\n{}",
        output.js
    );

    insta::assert_snapshot!(output.js);
}

// --- bug3: same-line significant whitespace preservation ---
// Regression for compiler bug where `emit_node` Text arm unconditionally
// `s.trim()`d, deleting the single space between a text node and an inline
// element sibling (e.g. `<p>foo <code>bar</code> baz</p>`).

#[test]
fn text_before_inline_preserves_single_space() {
    let src = "@template { <p>Text <code>x</code> more.</p> }";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-ws-1");
    assert!(
        output.js.contains("leaf('Text ')"),
        "trailing space before <code> lost; got:\n{}",
        output.js
    );
    assert!(
        output.js.contains("leaf(' more.')"),
        "leading space after </code> lost; got:\n{}",
        output.js
    );
}

#[test]
fn whitespace_only_node_between_two_interpolations_is_preserved() {
    // #400: a whitespace-only text node flanked by dynamic boundaries was dropped
    // entirely — `<p>{a} {b}</p>` rendered `ab`, fusing two values whose only
    // separator was that space. The single space must survive as `leaf(' ')`.
    let src =
        "@state {\n  import { signal } from '@aihu/signals'\n  const [count] = signal(400)\n  const [label] = signal('x')\n}\n@template { <p>{count()} {label()}</p> }";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-ws-400a");
    assert!(
        output.js.contains("leaf(' ')"),
        "the space between two interpolations must be preserved (#400); got:\n{}",
        output.js
    );
}

#[test]
fn whitespace_only_node_before_an_inline_element_is_preserved() {
    // #400 control case: the space before a child element is also dropped.
    let src =
        "@state {\n  import { signal } from '@aihu/signals'\n  const [count] = signal(400)\n  const [label] = signal('x')\n}\n@template { <p>{count()} <span>{label()}</span></p> }";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-ws-400b");
    assert!(
        output.js.contains("leaf(' ')"),
        "the space before an inline element must be preserved (#400); got:\n{}",
        output.js
    );
}

#[test]
fn whitespace_only_node_spanning_lines_is_still_stripped() {
    // The fix must NOT inject spurious spaces from template-body indentation
    // between block-level siblings: the whitespace between the two <p>s spans a
    // newline and stays elided (HTML would collapse it to nothing between blocks).
    let src =
        "@state {\n  import { signal } from '@aihu/signals'\n  const [a] = signal(1)\n  const [b] = signal(2)\n}\n@template {\n  <div>\n    <p>{a()}</p>\n    <p>{b()}</p>\n  </div>\n}";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-ws-400c");
    assert!(
        !output.js.contains("leaf(' ')"),
        "newline-spanning indentation between block elements must not become a space; got:\n{}",
        output.js
    );
}

#[test]
fn multi_line_surrounding_whitespace_stripped() {
    // Template body newlines + indentation around a text node should be
    // stripped entirely (no leading/trailing space injected).
    let src = "@template {\n  <p>\n    Text\n  </p>\n}";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-ws-2");
    assert!(
        output.js.contains("leaf('Text')"),
        "multi-line surrounding whitespace should be fully stripped; got:\n{}",
        output.js
    );
    assert!(
        !output.js.contains("leaf(' Text')") && !output.js.contains("leaf('Text ')"),
        "stray space should not survive newline-only surrounding whitespace; got:\n{}",
        output.js
    );
}

#[test]
fn same_line_whitespace_on_both_sides_preserved() {
    let src = "@template { <p>  pre-pre  <span>x</span>  post-post  </p> }";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-ws-3");
    assert!(
        output.js.contains("leaf(' pre-pre ')"),
        "leading + trailing same-line whitespace should collapse to single space; got:\n{}",
        output.js
    );
    assert!(
        output.js.contains("leaf(' post-post ')"),
        "leading + trailing same-line whitespace should collapse to single space; got:\n{}",
        output.js
    );
}

#[test]
fn repro_translation_waves_preserves_trailing_space() {
    // Verbatim repro from .context/fw-agent/bug3-whitespace/repro.aihu
    let src = "@template { <p>Active and historical translation waves drained from <code>v_wave_status</code>.</p> }";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-ws-repro");
    assert!(
        output.js.contains("leaf('Active and historical translation waves drained from ')"),
        "trailing space before <code> lost on repro; got:\n{}",
        output.js
    );
}

#[test]
fn non_ascii_string_literals_in_expressions_are_not_latin1_mangled() {
    // Bug: non-ASCII string literals inside `{}` expressions (interpolations,
    // ternaries, $class, $each, $on handlers, $emit) were copied byte-by-byte
    // via `out.push(byte as char)` in the expression-lowering pass, mangling
    // UTF-8 (Greek/Hebrew/glyphs) into latin-1 mojibake (`λ` → `Î»`). Static
    // template text was unaffected. Critical for a Bible app interpolating
    // Greek/Hebrew through expressions. A signal must be present so the
    // rewrite pass actually runs.
    let src = concat!(
        "@state {\n",
        "import { signal } from '@aihu/signals'\n",
        "const [tier, setTier] = signal('study')\n",
        "$event: { picked: { payload: string } }\n",
        "}\n",
        "@template {\n",
        "  <span class=\"static\">λόγος שלום ▾</span>\n",
        "  <span>{tier() === 'study' ? 'λόγος' : 'word'}</span>\n",
        "  <i $class={tier() === 'study' ? 'on ▾' : 'off ▸'}>x</i>\n",
        "  <button $on.click={() => $emit.picked('χάρις')}>e</button>\n",
        "}"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let js = emit(&unit, "x-utf8").js;
    // Every non-ASCII string survives intact in expression position.
    for s in ["'λόγος'", "'on ▾'", "'off ▸'", "'χάρις'", "λόγος שלום ▾"] {
        assert!(js.contains(s), "expected intact `{s}` in:\n{js}");
    }
    // And none of the classic latin-1 mojibake leaders appear.
    for bad in ["Î»", "Ï", "â¾", "â¸", "×©"] {
        assert!(!js.contains(bad), "latin-1 mojibake `{bad}` leaked into:\n{js}");
    }
}
