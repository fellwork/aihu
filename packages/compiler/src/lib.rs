pub mod codegen;
pub mod parser;
pub mod types;

pub use codegen::{emit, resolve_signals, EmitResult, SignalMap};
pub use parser::sfc;
pub use types::{
    ActionDecl, AgentBlock, Attr, CompileError, CompileUnit, InputDecl, InputKind, ScribeSource,
    ScriptMeta, StateDecl, TemplateNode,
};

pub fn compile(source: &str) -> Result<ScribeSource<'_>, CompileError> {
    parser::sfc::parse(source)
}

pub fn compile_full<'a>(source: &'a ScribeSource<'a>) -> Result<CompileUnit<'a>, CompileError> {
    let template_ast = match source.template {
        Some(tmpl) => Some(parser::template::parse_template(tmpl)?),
        None => None,
    };
    Ok(CompileUnit {
        source: source.clone(),
        template_ast,
    })
}
