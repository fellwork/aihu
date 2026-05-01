pub mod codegen;
pub mod parser;
pub mod types;

pub use codegen::{emit, resolve_signals, SignalMap};
pub use types::{Attr, CompileError, CompileUnit, ScribeSource, ScriptMeta, TemplateNode};

pub fn compile(source: &str) -> Result<ScribeSource<'_>, CompileError> {
    parser::sfc::parse(source)
}

pub fn compile_full(source: &str) -> Result<CompileUnit<'_>, CompileError> {
    let sfc = parser::sfc::parse(source)?;
    let template_ast = match sfc.template {
        Some(tmpl) => Some(parser::template::parse_template(tmpl)?),
        None => None,
    };
    Ok(CompileUnit {
        source: sfc,
        template_ast,
    })
}
