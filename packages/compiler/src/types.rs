// ─── v0.6.4 — BuildTarget ────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum BuildTarget {
    #[default]
    Universal,
    Client,
    Server,
}

// ─── v0.6.1 — RouteBlock ─────────────────────────────────────────────────────

#[derive(Debug, PartialEq, Clone, Default)]
pub struct RouteBlock {
    pub path: Option<String>,       // path override (defaults to file-based)
    pub name: Option<String>,
    pub middleware: Vec<String>,
    pub ssr: Option<bool>,
    pub layout: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum StyleScope {
    Scoped,
    Global,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StyleBlock<'a> {
    pub content: &'a str,
    pub scope: StyleScope,
}

#[derive(Debug, PartialEq, Clone)]
pub struct AihuSource<'a> {
    pub script: Option<&'a str>,
    pub template: Option<&'a str>,
    pub style: Option<StyleBlock<'a>>,
    pub meta: ScriptMeta,
    pub agent: Option<AgentBlock>,
    /// v0.6.1: parsed @route block, if present.
    pub route: Option<RouteBlock>,
}

#[derive(Debug, PartialEq, Clone)]
pub struct ScriptMeta {
    pub name: Option<String>,
}

#[derive(Debug, PartialEq, Clone)]
pub enum TemplateNode {
    Element {
        tag: String,
        attrs: Vec<Attr>,
        children: Vec<TemplateNode>,
    },
    /// A `<$macro-element>` compiler-lowered boundary element (v0.5).
    /// Tag name is the element name WITHOUT the `$` prefix (e.g. `"slot"`, `"suspense"`).
    MacroElement {
        name: String,
        attrs: Vec<Attr>,
        children: Vec<TemplateNode>,
    },
    Text(String),
    Interpolation(String),
    /// B3 — Variant B block-tag conditional: `{#if cond}...{:else if cond}...{:else}...{/if}`.
    /// `branches` is a non-empty list of `(cond_expr, body)`; the last entry's
    /// `cond_expr` may be empty to indicate the `{:else}` branch.
    IfBlock {
        branches: Vec<(String, Vec<TemplateNode>)>,
    },
    /// B3 — Variant B block-tag iteration: `{#each list as item[, idx] [(key)]}...{:empty}...{/each}`.
    EachBlock {
        list_expr: String,
        item_alias: String,
        idx_alias: Option<String>,
        key_expr: Option<String>,
        body: Vec<TemplateNode>,
        empty_body: Option<Vec<TemplateNode>>,
    },
    /// B3 — Svelte-style raw HTML: `{@html expr}`.
    HtmlBlock { expr: String },
}

/// The value form of a `$macro` attribute (v0.4.1–v0.4.4).
#[derive(Debug, PartialEq, Clone)]
pub enum MacroValue {
    /// Quoted form: `$attr="identifier"` or `$attr="dotted.path"`.
    Quoted(String),
    /// Curly form: `$attr={arbitrary JS expression}`.
    Curly(String),
    /// Boolean form: `$once`, `$raw`, `disabled` — no value.
    Boolean,
}

#[derive(Debug, PartialEq, Clone)]
pub enum Attr {
    Static { name: String, value: String },
    Binding { name: String, expr: String },
    Event { name: String, handler: String },
    /// `$macro_name[.sub]="value"` / `$macro_name={expr}` / `$macro_name` (boolean).
    Macro { name: String, value: MacroValue },
}

#[derive(Debug)]
pub struct CompileUnit<'a> {
    pub source: AihuSource<'a>,
    pub template_ast: Option<Vec<TemplateNode>>,
    /// v0.6.4: build target for artifact gating.
    pub target: BuildTarget,
}

#[derive(Debug, Default)]
pub struct CompileError {
    pub message: String,
    pub line: usize,
    pub col: usize,
    pub code: Option<String>,
    pub hint: Option<String>,
    pub fix: Option<String>,
    /// Machine-readable: the original text that should be replaced.
    /// Used by the LSP server to offer automated code actions.
    pub from: Option<String>,
    /// Machine-readable: the replacement text to substitute for `from`.
    /// Used by the LSP server to offer automated code actions.
    pub to: Option<String>,
}

impl std::fmt::Display for CompileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "line {}, col {}: {}", self.line, self.col, self.message)
    }
}

impl std::error::Error for CompileError {}

#[derive(Debug, PartialEq, Clone)]
pub enum InputKind {
    String,
    Number,
    Boolean,
    Enum(Vec<String>),
}

#[derive(Debug, PartialEq, Clone)]
pub struct InputDecl {
    pub name: String,
    pub kind: InputKind,
    pub default: Option<String>,
}

#[derive(Debug, PartialEq, Clone)]
pub struct StateDecl {
    pub name: String,
    pub kind: InputKind,
}

#[derive(Debug, PartialEq, Clone)]
pub struct ActionDecl {
    pub name: String,
    pub returns: Vec<(String, InputKind)>,
}

#[derive(Debug, PartialEq, Clone, Default)]
pub struct AgentBlock {
    pub inputs: Vec<InputDecl>,
    pub states: Vec<StateDecl>,
    pub actions: Vec<ActionDecl>,
    /// v0.4.8: extra manifest macros from @agent block.
    pub agent_macros: Vec<AgentMacroDecl>,
}

// ─── v2 — @state macro declarations (collection-form) ──────────────────────
//
// The 6 changing macros (`$prop`, `$computed`, `$action`, `$resource`,
// `$effect`, `$lifecycle`) all collapse into a single `Collection` variant
// per Architect §4.5.4 of `option-4-evaluation.md`. The body of each macro
// is a JS object literal whose keys are entry names and whose values are
// either bare function expressions (implicit handler/value/callback) or
// wrapped metadata-bag object literals.
//
// `$effect: () => { body }` — anonymous form per spec §2.5 — collapses
// into `EffectAnon`.
//
// Macros NOT in v2 redesign scope (preserved unchanged): `$watch`,
// `$effect.on(dep) { body }`, `$route`, `$beforeNavigate`, `$afterNavigate`.

/// Discriminator for the collection-form macros.
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum CollectionKind {
    Prop,
    Computed,
    Action,
    Resource,
    Effect,
    Lifecycle,
    /// B3b — `$event: { name: { payload: T, describe?, bubbles?, composed? } }`
    /// per Architect spec §5.a. Per-component custom-event declarations that
    /// participate in `$emit.<name>(payload)` resolution and `<Tag $on.<name>=>`
    /// listener typing.
    Event,
    /// B4 — `$aria: { role, label, pressed, ... }` — declarative ARIA via
    /// `ElementInternals` (Baseline 2023). Emits `attachInternals()` once per
    /// SFC (lazy-attach: only when `$aria` is declared) then per-key
    /// `mountEffect` wiring for reactive properties. Includes auto-keyboard-
    /// promotion and default-tabindex injection per spec §3.2 (R5).
    Aria,
    /// B5 — `$controller: { name: { value: () => new Ctrl(), describe? } }` —
    /// Lit Reactive Controller pattern without class boilerplate. Each entry's
    /// `value()` factory is called once at mount time. If the returned object
    /// has `hostConnected` / `hostDisconnected` methods they are auto-wired into
    /// onMount / onCleanup respectively.
    Controller,
    /// B5 — `$context: { provide: { ... }, consume: { ... } }` — tree-scoped
    /// dependency injection aligned with the WICG Context Protocol. Components
    /// can both provide context values (dispatched on mount) and consume context
    /// values (listened for on mount). Lowered to DOM custom-event patterns.
    Context,
    /// D5 — `$form: { value: <expr>, validity: <expr|thunk> }` — form-associated
    /// custom element APIs via `ElementInternals`. Emits `static formAssociated = true`
    /// as a class field and wires reactive `setFormValue` / `setValidity` effects.
    /// Shares the `attachInternals()` singleton guard with `$aria`.
    Form,
}

/// A single entry inside a collection-form macro body — `name: <value>`.
///
/// The metadata-bag form may carry any of: `describe`, `expose`, `default`,
/// `type`, `value`, `handler`, `on`. The bare form's whole `<value>` is
/// the running code (implicit handler/value/callback) and is stored in
/// `value_raw` with `is_wrapped == false`.
///
/// `meta` carries the parsed key→raw-source pairs from the wrapped form
/// (each key's value is the verbatim source text; codegen looks up the
/// keys it needs and emits byte-identical lowering).
#[derive(Debug, PartialEq, Clone)]
pub struct CollectionEntry {
    /// The entry-key name (e.g. `hue`, `setPreset`, `mount`).
    pub name: String,
    /// `true` when the value is a metadata-bag object literal `{...}`;
    /// `false` when the value is a bare function/expression.
    pub is_wrapped: bool,
    /// For bare entries: the raw text of the entry's value (a function
    /// expression, e.g. `(h: number) => { hue = h }`). Empty for wrapped.
    pub value_raw: String,
    /// For wrapped entries: parsed `(key, raw-source)` pairs from the
    /// metadata bag. Empty for bare.
    pub meta: Vec<(String, String)>,
}

/// One macro declaration inside an `@state { }` block.
#[derive(Debug, PartialEq, Clone)]
pub enum StateMacro {
    /// `$<kind>: { <name>: <bare|wrapped>, ... }` — v2 collection-form.
    Collection {
        kind: CollectionKind,
        entries: Vec<CollectionEntry>,
    },
    /// `$effect: () => { body }` — v2 anonymous-effect form per §2.5.
    EffectAnon { body: String },
    /// `$effect.on(dep) { body }` — preserved from v1 (out of v2 scope).
    EffectOn { dep: String, body: String },
    /// `$watch name { body }` — preserved from v1 (out of v2 scope).
    Watch { name: String, body: String },
    // ─── arch-5 M1 — routing macros (RFC-A5-010, 015, 016) ───────────────────
    /// `$route name` — reactive `MatchResult` signal. RFC-A5-010.
    Route { name: String },
    /// `$beforeNavigate(fn)` — register a guard. RFC-A5-015.
    BeforeNavigate { expr: String },
    /// `$afterNavigate(fn)` — register an after-navigation callback. RFC-A5-016.
    AfterNavigate { expr: String },
}

// ─── v0.4.7 — @style macro declarations ─────────────────────────────────────

/// One macro declaration inside an `@style { }` block.
#[derive(Debug, PartialEq, Clone)]
pub enum StyleMacro {
    /// `$reactive name: expr`
    Reactive { name: String, expr: String },
    /// `$reactive(expr)` inside a `$global { }` block — Amendment 02.
    /// Effect targets `document.documentElement` instead of the component root.
    GlobalReactive { index: usize, expr: String },
    /// `$media breakpoint { css }`
    Media { breakpoint: String, css: String },
    /// `$when expr { css }`
    When { expr: String, css: String },
}

// ─── v2 — @agent manifest macros (vestigial) ───────────────────────────────
//
// Per spec §4: `@agent` survives as a vestigial cross-cutting block holding
// only `$scope` and `$rate-limit`. `$expose`, `$expose.write`, agent-bare-
// `$action`, and `$describe` are removed (the per-name `expose:` /
// `describe:` keys on `@state` collection entries replace them); v1 source
// using the removed forms is rejected with C440.

/// One macro declaration from inside an `@agent { }` block that extends the manifest.
#[derive(Debug, PartialEq, Clone)]
pub enum AgentMacroDecl {
    /// `$scope "value"`
    Scope(String),
    /// `$rate-limit N`
    RateLimit(u32),
}
