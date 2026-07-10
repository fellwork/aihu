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
    /// B1 (SEO arc) — optional per-route `head:` metadata. Emitted into the
    /// `.route.json` sidecar as a `head` object. Downstream Builders (router
    /// threading, head-lowering, SSG prerender) consume this exact shape.
    pub head: Option<RouteHead>,
}

// ─── B1 (SEO arc) — per-route <head> metadata ────────────────────────────────

/// A nested object of head metadata, declared via `head: { ... }` inside an
/// `@route` block. All fields optional. `og`/`twitter` are parsed into typed
/// sub-objects; `jsonld` is captured verbatim as a raw JSON literal (the SFC
/// author writes valid JSON with quoted keys — see spec example).
#[derive(Debug, PartialEq, Clone, Default)]
pub struct RouteHead {
    pub title: Option<String>,
    pub description: Option<String>,
    pub canonical: Option<String>,
    /// Open Graph metadata: `og: { title, description, image, type, url }`.
    pub og: Option<OpenGraph>,
    /// Twitter card metadata: `twitter: { card, title, description, image, site }`.
    pub twitter: Option<TwitterCard>,
    /// JSON-LD structured data. Captured VERBATIM as the balanced `{...}`
    /// literal source text (a raw JSON object), not deep-parsed. Stored as the
    /// trimmed literal string so codegen can splice it into `.route.json`
    /// without re-serialization.
    pub jsonld: Option<String>,
}

/// Open Graph sub-object. All string fields, all optional.
#[derive(Debug, PartialEq, Clone, Default)]
pub struct OpenGraph {
    pub title: Option<String>,
    pub description: Option<String>,
    pub image: Option<String>,
    /// `og:type` — e.g. `"website"`, `"article"`.
    pub r#type: Option<String>,
    pub url: Option<String>,
}

/// Twitter card sub-object. All string fields, all optional.
#[derive(Debug, PartialEq, Clone, Default)]
pub struct TwitterCard {
    /// `twitter:card` — e.g. `"summary_large_image"`.
    pub card: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub image: Option<String>,
    /// `twitter:site` — e.g. `"@acme"`.
    pub site: Option<String>,
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
    /// 1-based line in the original `.aihu` file where the `@template` body's
    /// first non-whitespace character sits. Lets the type-check sidecar place
    /// each lifted template expression on its real source line so `tsc`
    /// diagnostics point at the originating `.aihu` line. 0 when no @template.
    pub template_line: usize,
    pub style: Option<StyleBlock<'a>>,
    pub meta: ScriptMeta,
    pub agent: Option<AgentBlock>,
    /// v0.6.1: parsed @route block, if present.
    pub route: Option<RouteBlock>,
    /// v0.4.0: parsed @stream block, if present.
    pub stream: Option<StreamBlock>,
    /// PR-2: parsed `@meta { … }` recipe-catalog block, if present. Carries
    /// variants/slots/dependencies/registryDependencies ONLY — never `name`
    /// (R-META-COEXIST). `None` when the SFC declared no `@meta` block.
    pub sfc_meta: Option<SfcMeta>,
}

#[derive(Debug, PartialEq, Clone)]
pub struct ScriptMeta {
    pub name: Option<String>,
}

// ─── @meta { … } — recipe-catalog metadata (PR-2) ───────────────────────────
//
// The `@meta { … }` block carries recipe-catalog fields ONLY:
// `variants` / `slots` / `dependencies` / `registryDependencies`.
//
// R-META-COEXIST: `@meta` does NOT set or override the component `name`. Tag
// resolution stays authoritative via `ScriptMeta.name` → `@route { name }` →
// file stem (see `ast_export::resolve_tag`). `name` is deliberately absent
// from this struct so the two never collide.
//
// The body is parsed as a LENIENT JSON5-style object literal (unquoted keys,
// single OR double quotes, trailing commas) via the `json5` crate. New fields
// use `#[serde(default)]` (R-SERDE-TOLERANT) so an empty `@meta {}` yields an
// all-default `SfcMeta` and unknown keys are tolerated (no `deny_unknown_fields`).
#[derive(Debug, PartialEq, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct SfcMeta {
    /// `variants: { <axis>: [<value>, …] }` — e.g. `{ variant: ['default', 'ghost'] }`.
    #[serde(default)]
    pub variants: std::collections::BTreeMap<String, Vec<String>>,
    /// `slots: [<name>, …]` — declared named slots.
    #[serde(default)]
    pub slots: Vec<String>,
    /// `dependencies: [<pkg>, …]` — npm dependencies the recipe pulls in.
    #[serde(default)]
    pub dependencies: Vec<String>,
    /// `registryDependencies: [<recipe>, …]` — other recipes this one composes.
    #[serde(default, rename = "registryDependencies")]
    pub registry_dependencies: Vec<String>,
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
    /// `$macro_name[.sub]="value"` / `$macro_name={expr}` / `$macro_name` (boolean).
    Macro { name: String, value: MacroValue },
}

#[derive(Debug)]
pub struct CompileUnit<'a> {
    pub source: AihuSource<'a>,
    pub template_ast: Option<Vec<TemplateNode>>,
    /// v0.6.4: build target for artifact gating.
    pub target: BuildTarget,
    /// W3 (advanced-js-template-expressions): which expression front-end the
    /// emitter uses for the signal-read rewrite. Set by
    /// `compile_full_with_options`; `Legacy` (the default) keeps codegen
    /// byte-identical to pre-W3. Under `Ast` the rewrite runs scope-aware on
    /// the oxc AST (spread / template-literal holes / arrow bodies /
    /// each-alias shadowing all handled — the plan's silent-miscompile rows).
    pub expr_parser: crate::expr::ExprParserMode,
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
    /// v0.4.0 — `$stream: { name: { source: () => Promise<ReadableStream<string>>, describe?: '...' } }`
    /// Reactive streaming primitive parallel to `$resource` but for ReadableStream<string>.
    /// Lowered to `createStream(factory)` call in `@aihu/runtime`. Bare form is
    /// rejected with C553; missing `source:` key is rejected with C554.
    Stream,
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
    // ─── arch-3 M2 — magna plugin macro (RFC-003) ────────────────────────────
    /// `$query name = data.X.query(vars)` — the RFC-003 magna `$query`
    /// shorthand. It is intentionally **NOT** collection-form: it is a
    /// dedicated `=`-shorthand parallel to `$route` / `$watch`, parsed by its
    /// own branch in `try_parse_macro`, and is therefore NOT subject to the
    /// collection-form C440 rejection. `$query` always lowers to
    /// `createMagnaResource(inject(MagnaFetchToken), <expr>)` because it is
    /// magna-only by definition. `expr` is the verbatim RHS (e.g.
    /// `data.posts.query(vars)`).
    Query { name: String, expr: String },
    // ─── arch-3 M2 / A3 G2 — auth plugin macro family (RFC-001) ───────────────
    /// `$auth name = $auth.session()` / `$auth name = $auth.currentUser()` —
    /// the RFC-001 `$auth.*` macro family, valid in `@state`. Like `$query`, it
    /// is intentionally **NOT** collection-form: a dedicated `=`-shorthand
    /// parsed by its own branch in `try_parse_macro`, so it is NOT subject to
    /// the collection-form C440 rejection.
    ///
    /// Both methods lower to `const <name> = useCurrentUser()` from
    /// `@aihu/auth` — the existing client reactive getter (seeded by
    /// `signIn`/`setCurrentScopes`). `$auth.session()` ADDITIONALLY emits a
    /// `/* TODO(M3-auth-ssr): ... */` codegen marker: the RFC intent is a
    /// `$shared` signal seeded server-side from `getAuthState(request, config)`,
    /// but the compiler has NO request-context/config passthrough at the
    /// `@state` lowering boundary today, so the SSR pre-seed is a deferred M3
    /// uplift. The `name` is the LHS identifier (`$auth.session()` is an
    /// expression with no inherent binding), mirroring `$query name = ...`.
    Auth { name: String, method: AuthMacroKind },
    // ─── recipe class-extension + per-file shadow mode (master spec §9.4) ─────
    /// `$extends: Identifier` — the generated element class extends the named
    /// custom-element base (a user import in `@state` scope) instead of
    /// `HTMLElement`, threaded into `defineComponent({ base: <Ident>, ... })`.
    /// A dedicated `:`-shorthand, NOT collection-form (not subject to C440).
    /// Malformed → C470.
    Extends { base: String },
    /// `$shadow: 'open' | 'closed' | 'none'` — per-file shadow mode override.
    /// Emits a `// @aihu:shadow <mode>` marker the Vite plugin reads to drive
    /// both shadow attachment and the css-engine light-DOM fold, overriding the
    /// plugin's global `shadowMode`. Malformed → C471.
    Shadow { mode: String },
}

/// Which `$auth.*` method a [`StateMacro::Auth`] declaration resolved to.
/// RFC-001 (arch-3 M2 / A3 G2). Both lower through `useCurrentUser()`;
/// `Session` additionally carries the deferred-SSR `$shared` seed marker.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthMacroKind {
    /// `$auth.session()` — SSR-seed case (M3 forward dependency for the
    /// server-side `getAuthState` pre-seed; client-resolves via `useCurrentUser`).
    Session,
    /// `$auth.currentUser()` — lowers cleanly to the client reactive getter.
    CurrentUser,
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
    /// `$stream <name>` — wire agent tool-call results → a `$stream` entry.
    Stream(String),
}

// ─── v0.4.0 — @stream block ──────────────────────────────────────────────────

/// Parsed `@stream { }` block. One per SFC at most (C552 if multiple).
#[derive(Debug, PartialEq, Clone)]
pub struct StreamBlock {
    /// From `$output: <name>` — required (C551 if absent).
    pub output: String,
    /// From `$scope: <value>` — optional.
    pub scope: Option<String>,
    /// From `$mime: <value>` — optional.
    pub mime: Option<String>,
}
