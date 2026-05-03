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
pub struct ScribeSource<'a> {
    pub script: Option<&'a str>,
    pub template: Option<&'a str>,
    pub style: Option<StyleBlock<'a>>,
    pub meta: ScriptMeta,
    pub agent: Option<AgentBlock>,
}

#[derive(Debug, PartialEq, Clone)]
pub struct ScriptMeta {
    pub name: Option<String>,
}

#[derive(Debug, PartialEq)]
pub enum TemplateNode {
    Element {
        tag: String,
        attrs: Vec<Attr>,
        children: Vec<TemplateNode>,
    },
    Text(String),
    Interpolation(String),
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
    pub source: ScribeSource<'a>,
    pub template_ast: Option<Vec<TemplateNode>>,
}

#[derive(Debug, Default)]
pub struct CompileError {
    pub message: String,
    pub line: usize,
    pub col: usize,
    pub code: Option<String>,
    pub hint: Option<String>,
    pub fix: Option<String>,
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

// ─── v0.4.6 — @state macro declarations ─────────────────────────────────────

/// One macro declaration inside an `@state { }` block.
#[derive(Debug, PartialEq, Clone)]
pub enum StateMacro {
    /// `$prop name: Type`
    Prop { name: String, type_name: String },
    /// `$computed name = expr`
    Computed { name: String, expr: String },
    /// `$resource name = fetcher`
    Resource { name: String, fetcher: String },
    /// `$effect { body }`
    Effect { body: String },
    /// `$effect.on(dep) { body }`
    EffectOn { dep: String, body: String },
    /// `$watch name { body }`
    Watch { name: String, body: String },
    /// `$action name(args) { body }`
    Action { name: String, args: String, body: String },
    /// `$lifecycle.mount { body }`
    LifecycleMount { body: String },
    /// `$lifecycle.dispose { body }`
    LifecycleDispose { body: String },
}

// ─── v0.4.7 — @style macro declarations ─────────────────────────────────────

/// One macro declaration inside an `@style { }` block.
#[derive(Debug, PartialEq, Clone)]
pub enum StyleMacro {
    /// `$reactive name: expr`
    Reactive { name: String, expr: String },
    /// `$media breakpoint { css }`
    Media { breakpoint: String, css: String },
    /// `$when expr { css }`
    When { expr: String, css: String },
}

// ─── v0.4.8 — @agent macro declarations ─────────────────────────────────────

/// One macro declaration from inside an `@agent { }` block that extends the manifest.
#[derive(Debug, PartialEq, Clone)]
pub enum AgentMacroDecl {
    /// `$expose field: Type`
    Expose { name: String, type_name: String, writable: bool },
    /// `$scope "value"`
    Scope(String),
    /// `$rate-limit N`
    RateLimit(u32),
    /// `$describe "text"`
    Describe(String),
}
