#[derive(Debug, PartialEq, Clone)]
pub struct ScribeSource<'a> {
    pub script: Option<&'a str>,
    pub template: Option<&'a str>,
    pub style: Option<&'a str>,
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

#[derive(Debug, PartialEq)]
pub enum Attr {
    Static { name: String, value: String },
    Binding { name: String, expr: String },
    Event { name: String, handler: String },
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
}
