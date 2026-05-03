pub mod codegen;
pub mod parser;
pub mod types;

pub use codegen::{emit, resolve_signals, EmitResult, SignalMap};
pub use parser::sfc;
pub use types::{
    ActionDecl, AgentBlock, AgentMacroDecl, Attr, BuildTarget, CompileError, CompileUnit,
    InputDecl, InputKind, MacroValue, RouteBlock, ScribeSource, ScriptMeta, StateDecl, StateMacro,
    StyleBlock, StyleMacro, StyleScope, TemplateNode,
};

pub fn compile(source: &str) -> Result<ScribeSource<'_>, CompileError> {
    parser::sfc::parse(source)
}

pub fn compile_full<'a>(source: &'a ScribeSource<'a>) -> Result<CompileUnit<'a>, CompileError> {
    compile_full_with_target(source, BuildTarget::Universal)
}

pub fn compile_full_with_target<'a>(
    source: &'a ScribeSource<'a>,
    target: BuildTarget,
) -> Result<CompileUnit<'a>, CompileError> {
    let template_ast = match source.template {
        Some(tmpl) => Some(parser::template::parse_template(tmpl)?),
        None => None,
    };
    Ok(CompileUnit {
        source: source.clone(),
        template_ast,
        target,
    })
}
