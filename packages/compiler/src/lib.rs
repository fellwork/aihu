pub mod ast_export;
pub mod codegen;
pub mod parser;
pub mod types;

// WASM bindings — only compiled for the wasm32 target. The module is declared
// unconditionally so `cargo check` is consistent across native + wasm builds;
// item-level `#[cfg]` gates the actual exports.
pub mod wasm;

pub use ast_export::{
    build_owned_ast, compile_to_ast, SfcAstOwned, SfcAttrOwned, SfcIfBranch, SfcMacroValueOwned,
    SfcMetaOwned, SfcNodeOwned, SfcStyleBlockOwned, SfcStyleScope, AST_VERSION,
};
pub use codegen::{emit, resolve_signals, EmitResult, SignalMap};
pub use parser::sfc;
pub use parser::stream_macros;
pub use parser::state_macros::parse_state_macros;
pub use parser::template::parse_template;
pub use types::{
    ActionDecl, AgentBlock, AgentMacroDecl, AihuSource, Attr, BuildTarget, CollectionEntry,
    CollectionKind, CompileError, CompileUnit, InputDecl, InputKind, MacroValue, RouteBlock,
    ScriptMeta, StateDecl, StateMacro, StreamBlock, StyleBlock, StyleMacro, StyleScope,
    TemplateNode,
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

    // v2 (B6.3): validate `@state` macro grammar at compile time so v1
    // syntax surfaces as a hard error (C440 / C441 / C442 / C443 / C444)
    // rather than being silently elided by the downstream emit pass. The
    // parsed AST is discarded here — emit re-parses for codegen — but
    // any error short-circuits the pipeline at compile_full boundary.
    if let Some(script) = source.script {
        let _ = parser::state_macros::parse_state_macros(script)?;
    }

    Ok(CompileUnit {
        source: source.clone(),
        template_ast,
        target,
    })
}
