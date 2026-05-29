//! aihu-css-core — CSS engine bootstrap.
//!
//! See `docs/superpowers/specs/2026-05-10-aihu-css-engine-and-primitives-design.md`
//! for the full design. This bootstrap implementation supports a fixed subset
//! of utility classes (see tokens.rs); Plan 2 wires the AST scanner; Plan 3
//! adds variants and progressive features.

pub mod ast;
pub mod cache;
pub mod emit;
pub mod features;
pub mod progressive;
pub mod scanner;
pub mod theme;
pub mod tokens;
pub mod variants;

pub use ast::{parse_ast, AstError, SfcAst, SfcAttr, SfcNode, SfcStyleScope};
pub use cache::{hash_ast, CssCache};
pub use emit::{emit, emit_sfc_scoped, OutputMode};
pub use progressive::{ProgressiveFeature, ProgressiveRegistry};
pub use scanner::{scan, scan_ast, ScanResult};
pub use theme::ThemeRegistry;
pub use variants::{split_variants, Variant};

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
            // Hoist the matching @keyframes as a sibling rule (animate-* only).
            if let Some(kf) = tokens::animation_keyframes(class) {
                output.push_str(kf);
                output.push('\n');
            }
        }
    }
    output
}

/// Compile a parsed `.aihu` SFC AST into CSS by scanning its template for
/// utility classes and emitting one rule per known utility.
///
/// This is the Plan 2 flat-mode entry; [`compile_sfc_scoped`] wraps the output
/// in shadow-DOM scope (the new default). `compile_classes` stays for
/// back-compat.
pub fn compile_sfc(ast: &SfcAst) -> String {
    let classes = scan_ast(ast);
    compile_classes(&classes.into_iter().collect::<Vec<_>>())
}

/// Compile a parsed `.aihu` SFC AST into scoped, shadow-DOM-embedded CSS:
/// `:host`-level theme tokens, variant-resolved utility rules, and the folded
/// authored `@style` block. This is the production entry consumed by the TS
/// bridge / `aihu-css-compile --ast-json`.
pub fn compile_sfc_scoped(ast: &SfcAst) -> String {
    emit_sfc_scoped(ast)
}
