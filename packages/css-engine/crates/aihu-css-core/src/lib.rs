//! aihu-css-core — CSS engine bootstrap.
//!
//! See `docs/superpowers/specs/2026-05-10-aihu-css-engine-and-primitives-design.md`
//! for the full design. This bootstrap implementation supports a fixed subset
//! of utility classes (see tokens.rs); Plan 2 wires the AST scanner; Plan 3
//! adds variants and progressive features.

pub mod ast;
pub mod scanner;
pub mod tokens;

pub use ast::{parse_ast, AstError, SfcAst, SfcAttr, SfcNode, SfcStyleScope};
pub use scanner::{scan, scan_ast, ScanResult};

/// Compile a list of utility class names into CSS rules.
/// Each known class becomes `.class-name { <body> }`. Unknown classes are skipped.
///
/// # Example
/// ```
/// use aihu_css_core::compile_classes;
/// let css = compile_classes(&["bg-primary".to_string(), "p-4".to_string()]);
/// assert!(css.contains(".bg-primary"));
/// assert!(css.contains(".p-4"));
/// ```
pub fn compile_classes(classes: &[String]) -> String {
    let mut output = String::new();
    for class in classes {
        if let Some(body) = tokens::utility_to_css(class) {
            output.push('.');
            output.push_str(class);
            output.push_str(" { ");
            output.push_str(&body);
            output.push_str(" }\n");
        }
    }
    output
}

/// Compile a parsed `.aihu` SFC AST into CSS by scanning its template for
/// utility classes and emitting one rule per known utility.
///
/// This is the Plan 2 flat-mode entry; [`compile_sfc_scoped`] (Task 4) wraps
/// the output in shadow-DOM scope. `compile_classes` stays for back-compat.
pub fn compile_sfc(ast: &SfcAst) -> String {
    let classes = scan_ast(ast);
    compile_classes(&classes.into_iter().collect::<Vec<_>>())
}
