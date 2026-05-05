pub mod codegen;
pub mod parser;
pub mod types;

// WASM bindings — only compiled for the wasm32 target. The module is declared
// unconditionally so `cargo check` is consistent across native + wasm builds;
// item-level `#[cfg]` gates the actual exports.
pub mod wasm;

pub use codegen::{emit, resolve_signals, EmitResult, SignalMap};
pub use parser::sfc;
pub use types::{
    ActionDecl, AgentBlock, AgentMacroDecl, Attr, BuildTarget, CompileError, CompileUnit,
    InputDecl, InputKind, MacroValue, RouteBlock, AihuSource, ScriptMeta, StateDecl, StateMacro,
    StyleBlock, StyleMacro, StyleScope, TemplateNode,
};

pub fn compile(source: &str) -> Result<AihuSource<'_>, CompileError> {
    parser::sfc::parse(source)
}

pub fn compile_with_path<'a>(source: &'a str, file_path: Option<&str>) -> Result<AihuSource<'a>, CompileError> {
    parser::sfc::parse_with_path(source, file_path)
}

pub fn compile_full<'a>(source: &'a AihuSource<'a>) -> Result<CompileUnit<'a>, CompileError> {
    compile_full_with_target(source, BuildTarget::Universal)
}

pub fn compile_full_with_target<'a>(
    source: &'a AihuSource<'a>,
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
