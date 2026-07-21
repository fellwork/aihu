//! `scanner.rs` — walks an `SfcAst` template and extracts the utility set.
//!
//! The scanner branches on the three class-forms exactly as the compiler routes
//! them (spec `22d3a66e` §3, AST-hook spec §3):
//!
//! - **`SfcAttr::Static { name: "class", value }`** (Form A) → split on ASCII
//!   whitespace; every token (including variant-prefixed ones like `host:bg-x`)
//!   is a candidate utility. Variant prefixes are kept verbatim so the emitter
//!   (`variants.rs` / `emit.rs`) can split them at emit time.
//! - **`SfcAttr::Binding { name: "class", expr }`** (Form B) → string literals
//!   embedded in the expr are extractable utilities; bare identifiers are
//!   tracked in `unresolved` for `aihu css doctor` diagnostics (spec §3 edge #5).
//! - **`SfcAttr::Macro { name }`** where `name` starts with `class:` (Form C) →
//!   the part after `class:` is a statically-known utility.
//! - **Any other attr** (`on:click`, `if`, `bind:value`, non-`class`) → ignored.
//! - **`MacroElement` / component nodes** → their `class` attrs are skipped
//!   (edge E10: components own their own shadow scope).
//!
//! We do NOT re-parse `.aihu` source with regex (Risk #4) — only the AST.

use std::collections::BTreeSet;

use crate::ast::{SfcAst, SfcAttr, SfcNode};

/// The result of scanning an `SfcAst` template.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ScanResult {
    /// Sorted, dedup'd set of utility class literals (variant prefixes intact).
    pub utilities: BTreeSet<String>,
    /// Identifiers / sub-expressions a `Binding` could not statically resolve
    /// (e.g. `size` in `cn('btn', size)`). Surfaced for diagnostics; not
    /// compiled. Deduped + sorted for determinism.
    pub unresolved: BTreeSet<String>,
}

/// Convenience: scan an AST and return only the utility set (back-compat with
/// the plan's `scan_ast(&ast).contains(...)` test shape).
pub fn scan_ast(ast: &SfcAst) -> BTreeSet<String> {
    scan(ast).utilities
}

/// Walk the SFC template and collect the full [`ScanResult`].
pub fn scan(ast: &SfcAst) -> ScanResult {
    let mut result = ScanResult::default();
    if let Some(nodes) = &ast.template {
        for node in nodes {
            walk(node, &mut result);
        }
    }
    result
}

fn walk(node: &SfcNode, out: &mut ScanResult) {
    match node {
        SfcNode::Element { attrs, children, .. } => {
            for attr in attrs {
                collect_attr(attr, out);
            }
            for child in children {
                walk(child, out);
            }
        }
        // Edge E10: component / macroElement nodes own their own shadow scope.
        // We do NOT compile their `class` attrs into the parent's sheet, but we
        // still descend into children (slots may contain HTML elements).
        SfcNode::MacroElement { children, .. } => {
            for child in children {
                walk(child, out);
            }
        }
        SfcNode::IfBlock { branches } => {
            for branch in branches {
                for child in &branch.body {
                    walk(child, out);
                }
            }
        }
        SfcNode::EachBlock {
            body, empty_body, ..
        } => {
            for child in body {
                walk(child, out);
            }
            if let Some(empty) = empty_body {
                for child in empty {
                    walk(child, out);
                }
            }
        }
        // Text / Interpolation / HtmlBlock carry no class attrs.
        SfcNode::Text { .. } | SfcNode::Interpolation { .. } | SfcNode::HtmlBlock { .. } => {}
    }
}

fn collect_attr(attr: &SfcAttr, out: &mut ScanResult) {
    match attr {
        // Form A — static class="...".
        SfcAttr::Static { name, value } if name == "class" => {
            for token in value.split_ascii_whitespace() {
                // Interpolation placeholders like `{dynamic}` (edge E9) are not
                // literal utilities — flag, don't compile.
                if token.contains('{') || token.contains('}') {
                    out.unresolved.insert(token.to_string());
                } else {
                    out.utilities.insert(token.to_string());
                }
            }
        }
        // Form B — class={expr} / class={[...]}.
        SfcAttr::Binding { name, expr } if name == "class" => {
            collect_binding(expr, out);
        }
        // Form C — class:name={cond} → name after `class:` is the utility.
        SfcAttr::Macro { name, .. } if name.starts_with("class:") => {
            if let Some(class) = name.strip_prefix("class:") {
                if !class.is_empty() {
                    out.utilities.insert(class.to_string());
                }
            }
        }
        // Any other attr (on:click, if, bind:value, non-class static/binding).
        _ => {}
    }
}

/// Extract utility string-literals from a `class={expr}` expression.
///
/// Two sub-cases (AST-hook spec §3 Form B):
/// - **Array literal** (`[...]`): walk elements; string literals are utilities,
///   non-literal elements contribute their embedded literals + their bare
///   identifiers go to `unresolved`.
/// - **Scalar** (`cn(...)`, a ternary, a bare identifier): extract embedded
///   string literals; the rest is unresolvable.
///
/// We extract any single- or double-quoted string literal as a class token.
/// Bare identifiers (top-level, outside a string) are recorded in `unresolved`.
fn collect_binding(expr: &str, out: &mut ScanResult) {
    let literals = extract_string_literals(expr);
    let had_literals = !literals.is_empty();
    for lit in &literals {
        // A literal may itself hold a space-separated class list.
        for token in lit.split_ascii_whitespace() {
            out.utilities.insert(token.to_string());
        }
    }
    // Record identifiers we could not resolve so diagnostics can warn about
    // utilities that may ship dynamically (spec §3 edge #5 LOW concern).
    for ident in extract_bare_identifiers(expr) {
        out.unresolved.insert(ident);
    }
    // A binding with no resolvable literals at all (e.g. a bare `{theme}`) — its
    // identifiers are already in `unresolved`; nothing to compile.
    let _ = had_literals;
}

/// Pull every single- or double-quoted string literal out of an expression.
/// Handles escaped quotes inside the literal.
fn extract_string_literals(expr: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut chars = expr.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\'' || c == '"' {
            let quote = c;
            let mut lit = String::new();
            while let Some(&next) = chars.peek() {
                chars.next();
                if next == '\\' {
                    // Keep the escaped char verbatim (rarely matters for classes).
                    if let Some(&escaped) = chars.peek() {
                        lit.push(escaped);
                        chars.next();
                    }
                } else if next == quote {
                    break;
                } else {
                    lit.push(next);
                }
            }
            out.push(lit);
        }
    }
    out
}

/// Pull bare JS identifiers from an expression, EXCLUDING anything inside a
/// string literal and EXCLUDING known call-helper names. These are the
/// "unresolvable" tokens surfaced for diagnostics.
fn extract_bare_identifiers(expr: &str) -> Vec<String> {
    // Helper / keyword names that are not consumer utility identifiers.
    const SKIP: &[&str] = &["cn", "clsx", "true", "false", "null", "undefined"];

    let mut out = Vec::new();
    let mut chars = expr.chars().peekable();
    let mut current = String::new();
    let mut in_string: Option<char> = None;

    let flush = |current: &mut String, out: &mut Vec<String>| {
        if !current.is_empty() {
            let ident = std::mem::take(current);
            // Must start with a letter / _ / $ to be an identifier (not a number).
            let first = ident.chars().next().unwrap();
            if (first.is_alphabetic() || first == '_' || first == '$')
                && !SKIP.contains(&ident.as_str())
            {
                out.push(ident);
            }
        } else {
            current.clear();
        }
    };

    while let Some(c) = chars.next() {
        match in_string {
            Some(q) => {
                if c == '\\' {
                    chars.next();
                } else if c == q {
                    in_string = None;
                }
            }
            None => {
                if c == '\'' || c == '"' {
                    flush(&mut current, &mut out);
                    in_string = Some(c);
                } else if c.is_alphanumeric() || c == '_' || c == '$' {
                    current.push(c);
                } else {
                    flush(&mut current, &mut out);
                }
            }
        }
    }
    flush(&mut current, &mut out);
    out
}
