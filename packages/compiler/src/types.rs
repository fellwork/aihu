#[derive(Debug, PartialEq)]
pub struct ScribeSource<'a> {
    pub script: Option<&'a str>,
    pub template: Option<&'a str>,
    pub style: Option<&'a str>,
    pub meta: ScriptMeta,
}

#[derive(Debug, PartialEq)]
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

#[derive(Debug)]
pub struct CompileError {
    pub message: String,
    pub line: usize,
    pub col: usize,
}

impl std::fmt::Display for CompileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "line {}, col {}: {}", self.line, self.col, self.message)
    }
}

impl std::error::Error for CompileError {}
