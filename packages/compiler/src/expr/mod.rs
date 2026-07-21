//! W2 (advanced-js-template-expressions, Option C hybrid) — oxc-backed
//! template-expression VALIDATION, behind the `--expr-parser <legacy|ast>`
//! flag (env: `AIHU_EXPR_PARSER`).
//!
//! Validate-only: every expression string the template parser captured
//! (`{expr}` interpolations, `$attr={…}` bindings, `{#if}`/`{:else if}` heads,
//! `{#each}` list positions, `(key)` exprs, `{@html}`) is handed to
//! `oxc_parser::parse_expression` in TS mode. Parse failures become C320 rich
//! diagnostics; expressions that parse but are not a single side-effect-free
//! expression (statements, sequence commas, assignment/update outside `$on.*`
//! handler position, `await`/`yield`) become C321. Emitted code is UNCHANGED —
//! the existing token pipeline still performs the signal-read rewrite (the
//! AST rewrite is W3). Accepted code therefore compiles byte-identically with
//! the flag on or off.
//!
//! CONTAINMENT RULE (plan §Risks 1): all oxc types stay inside this module.
//! oxc's AST churns between minors — the exact-version pins in Cargo.toml
//! (`=0.139.0`) plus this boundary keep upgrades localized.
//!
//! POSITION MAPPING (W1-merge wiring): oxc spans are byte offsets into the
//! captured expression string. Template nodes do not yet carry their `.aihu`
//! byte offset (that threading lands with W1's capture-site rework), so the
//! absolute line/col on the emitted `CompileError` stays 0 and we anchor the
//! human codeframe through `CompileError.from` (the verbatim expression text —
//! `render_human_error` locates a unique match in the source). Once capture
//! sites carry offsets, `validate_expr` takes the expression's base offset and
//! the span math below becomes exact file line/col.

// W3 (advanced-js-template-expressions): the AST-driven, scope-aware
// signal-read rewrite (span edits over the same oxc parse). Consumed by
// `codegen/emit.rs` when the unit was compiled with `--expr-parser ast`.
pub mod rewrite;
pub use rewrite::{rewrite_signal_reads, rewrite_signal_reads_typecheck, RewriteResult};

// W4 (advanced-js-template-expressions): AST-derived sidecar harvest — the
// identifier-READ set of a captured expression and the identifier-BINDING
// set of an each-head alias list. Always-on (type-check-side only; see
// harvest.rs module docs for why it is not flag-gated).
pub mod harvest;
pub use harvest::{alias_bound_idents, referenced_idents};

// CO1/DE5 — the shared synthetic-function-wrapper parse for macro handler
// bodies. Factored OUT of `prop_write` so DE5 (typed MCP parameter schemas)
// derives its signatures from the same parse CO1 rewrites through: two parsers
// over one handler signature is a "kept in sync" seam, which thesis §2
// (Derived) forbids.
pub mod handler_parse;
pub use handler_parse::{handler_params, HandlerParam, HandlerSource};

// CO1 — `$prop` WRITE rewriting (scope-aware, span-spliced). Same containment
// rule as `rewrite`: oxc types stay inside `src/expr/`.
pub mod prop_write;
pub use prop_write::{
    detect_prop_writes, rewrite_prop_writes, PropWriteResult, PropWriteTargets,
    UPDATE_HELPER_DECL, UPDATE_HELPER_NAME,
};

use crate::types::{Attr, CompileError, MacroValue, TemplateNode};

use oxc_allocator::Allocator;
use oxc_ast::ast::Expression;
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType};

// ─── Flag plumbing ───────────────────────────────────────────────────────────

/// Which expression front-end validates template expressions.
///
/// Mirrors the `--machine-errors` / `AIHU_MACHINE_ERRORS` gating pattern in
/// `bin/main.rs`. Default is `Ast` — the W3-planned flip, landed with the
/// TS-generator work (#485): emission and typecheck share one expression
/// semantics (oxc validation + the scope-aware AST signal-read rewrite).
/// `--expr-parser legacy` remains available as an escape hatch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ExprParserMode {
    /// Hand-rolled token pipeline only (pre-W3 behavior). Opt-in escape hatch.
    Legacy,
    /// oxc `parse_expression` validation of every captured expression, plus
    /// the scope-aware AST signal-read rewrite in codegen. Default.
    #[default]
    Ast,
}

impl ExprParserMode {
    /// Parse a `--expr-parser <value>` / `AIHU_EXPR_PARSER=<value>` string.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "legacy" => Some(Self::Legacy),
            "ast" => Some(Self::Ast),
            _ => None,
        }
    }

    /// Read `AIHU_EXPR_PARSER` from the environment. `None` when unset or
    /// unrecognized (callers fall back to the default).
    pub fn from_env() -> Option<Self> {
        std::env::var("AIHU_EXPR_PARSER")
            .ok()
            .and_then(|v| Self::parse(&v))
    }
}

// ─── Positions ───────────────────────────────────────────────────────────────

/// Where in the template grammar a captured expression sits. Drives both
/// diagnostic wording and the per-position allowances (assignment/update are
/// legal at the root ONLY in `$on.*` handler position, per the plan Contract).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExprPosition {
    /// `{expr}` text interpolation (incl. the v0 `{{ident}}` form).
    Interpolation,
    /// `$attr={expr}` / `attr={expr}` binding or component prop.
    AttrBinding,
    /// `$on.<event>={expr}` handler — assignment/update permitted at root.
    Handler,
    /// `{#if expr}` / `{:else if expr}` head.
    IfHead,
    /// `{#each LIST as …}` list position.
    EachList,
    /// `{#each … as … (key)}` key expression.
    EachKey,
    /// `{@html expr}`.
    Html,
}

impl ExprPosition {
    fn describe(self) -> &'static str {
        match self {
            Self::Interpolation => "interpolation `{…}`",
            Self::AttrBinding => "attribute binding",
            Self::Handler => "`$on.*` handler",
            Self::IfHead => "`{#if}` condition",
            Self::EachList => "`{#each}` list",
            Self::EachKey => "`{#each}` key",
            Self::Html => "`{@html}`",
        }
    }
}

// ─── Template walk ───────────────────────────────────────────────────────────

/// Validate every captured expression in a parsed template AST.
///
/// Deliberately NOT validated in W2:
/// - `{#each}` item/idx aliases — the legacy header split can tear
///   destructuring patterns across the alias fields (plan c10/c11), so the
///   stored text is not reliably a parseable pattern until W5 parses the
///   alias side properly. Validating it here would false-error on code that
///   works today.
/// - `Attr::Static` values and `MacroValue::Quoted`/`Boolean` — not JS
///   expression positions.
pub fn validate_template(nodes: &[TemplateNode]) -> Result<(), CompileError> {
    for node in nodes {
        match node {
            TemplateNode::Element { attrs, children, .. }
            | TemplateNode::MacroElement { attrs, children, .. } => {
                for attr in attrs {
                    validate_attr(attr)?;
                }
                validate_template(children)?;
            }
            TemplateNode::Text(_) => {}
            TemplateNode::Interpolation(expr) => {
                validate_expr(expr, ExprPosition::Interpolation)?;
            }
            TemplateNode::IfBlock { branches } => {
                for (cond, body) in branches {
                    // The trailing `{:else}` branch stores an empty cond.
                    if !cond.trim().is_empty() {
                        validate_expr(cond, ExprPosition::IfHead)?;
                    }
                    validate_template(body)?;
                }
            }
            TemplateNode::EachBlock {
                list_expr,
                key_expr,
                body,
                empty_body,
                ..
            } => {
                validate_expr(list_expr, ExprPosition::EachList)?;
                if let Some(key) = key_expr {
                    validate_expr(key, ExprPosition::EachKey)?;
                }
                validate_template(body)?;
                if let Some(empty) = empty_body {
                    validate_template(empty)?;
                }
            }
            TemplateNode::HtmlBlock { expr } => {
                validate_expr(expr, ExprPosition::Html)?;
            }
        }
    }
    Ok(())
}

fn validate_attr(attr: &Attr) -> Result<(), CompileError> {
    match attr {
        Attr::Binding { expr, .. } => validate_expr(expr, ExprPosition::AttrBinding),
        Attr::Macro {
            name,
            value: MacroValue::Curly(expr),
        } => {
            // §3.2 — the `each` head is a HEAD, not a TS expression: it must
            // never be handed whole to the parser (`of` misparses). Split it
            // and validate only the LIST side; the binder side is validated
            // as a BindingPattern at parse time (directives.rs).
            if name == "each" {
                return match crate::parser::directives::parse_each_of_head(expr) {
                    Ok(head) => validate_expr(&head.list, ExprPosition::EachList),
                    // Malformed heads are rejected at parse time; nothing to
                    // validate here.
                    Err(_) => Ok(()),
                };
            }
            let pos = if name.starts_with("on:") {
                ExprPosition::Handler
            } else if name == "key" {
                ExprPosition::EachKey
            } else {
                ExprPosition::AttrBinding
            };
            validate_expr(expr, pos)
        }
        // Static values, quoted identifier paths, and boolean macros are not
        // JS expression positions.
        _ => Ok(()),
    }
}

// ─── Single-expression validation ────────────────────────────────────────────

/// Parse one captured expression with oxc (`SourceType::ts()` — template
/// expressions may carry TS-isms like `as` casts and non-null `!`) and check
/// the plan Contract's structural rules. Validation only; the expression
/// string is never rewritten here.
pub fn validate_expr(source: &str, position: ExprPosition) -> Result<(), CompileError> {
    // Defensive: parser layers occasionally hand through empty/whitespace
    // captures (legacy behavior varies by site); an empty capture is not this
    // pass's diagnostic to improve (W1 owns boundary diagnostics).
    if source.trim().is_empty() {
        return Ok(());
    }

    let allocator = Allocator::default();
    let parser = Parser::new(&allocator, source, SourceType::ts());

    match parser.parse_expression() {
        Err(diagnostics) => Err(syntax_error(source, position, &diagnostics)),
        Ok(expr) => {
            // Trailing input after a complete expression (`a(); b()`,
            // `count 1`) — parse_expression stops at the first full
            // expression, so enforce "the WHOLE capture is one expression"
            // ourselves. Allow only trailing whitespace/comments.
            let end = expr.span().end as usize;
            if !rest_is_trivia(&source[end.min(source.len())..]) {
                return Err(contract_error(
                    source,
                    position,
                    "contains more than one expression/statement",
                ));
            }
            check_root(source, position, &expr)
        }
    }
}

/// Root-node Contract checks (plan §Contract): sequence commas, `await`/
/// `yield` anywhere, assignment/update outside handler position.
fn check_root(
    source: &str,
    position: ExprPosition,
    expr: &Expression<'_>,
) -> Result<(), CompileError> {
    let offense: Option<&str> = match expr {
        Expression::SequenceExpression(_) => Some("is a comma-separated sequence"),
        Expression::AwaitExpression(_) => Some("uses `await`"),
        Expression::YieldExpression(_) => Some("uses `yield`"),
        Expression::AssignmentExpression(_) if position != ExprPosition::Handler => {
            Some("assigns (`=`) outside a `$on.*` handler")
        }
        Expression::UpdateExpression(_) if position != ExprPosition::Handler => {
            Some("mutates (`++`/`--`) outside a `$on.*` handler")
        }
        // TS wrappers around an offending root (e.g. `(count = 1) as any`)
        // are left to W3's full-AST pass; W2 checks the immediate root only.
        _ => None,
    };
    match offense {
        Some(why) => Err(contract_error(source, position, why)),
        None => Ok(()),
    }
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

/// C320 — the expression is not parseable JS/TS.
///
/// oxc's message text is terse but its spans are exact (byte offsets into the
/// captured expression). We surface: oxc's message, the offending slice, and
/// the expression-relative line/col; `from` carries the verbatim expression so
/// `render_human_error` can anchor a codeframe on the real `.aihu` line.
fn syntax_error(
    source: &str,
    position: ExprPosition,
    diagnostics: &[oxc_diagnostics::OxcDiagnostic],
) -> CompileError {
    // Statements/declarations (and `await`/`yield`, which oxc may reject at
    // parse time depending on context) are a Contract rejection (C321 "hoist
    // instead"), not a bare syntax error — steer to $action/$computed.
    if let Some(why) = contract_keyword_offense(source) {
        return contract_error(source, position, why);
    }

    let first = diagnostics.first();
    let oxc_message = first
        .map(|d| d.message.to_string())
        .unwrap_or_else(|| "invalid expression".to_string());

    // First labeled span → offending slice + expression-relative line/col.
    let span = first
        .and_then(|d| d.labels.first())
        .map(|l| (l.offset() as usize, l.len() as usize));

    let location = match span {
        Some((offset, len)) => {
            let offset = offset.min(source.len());
            let (line, col) = rel_line_col(source, offset);
            let token: &str = {
                let end = (offset + len).min(source.len());
                let slice = source[offset..end].trim();
                if slice.is_empty() { "end of expression" } else { slice }
            };
            format!(
                " at `{token}` (expression line {line}, col {col})"
            )
        }
        None => String::new(),
    };

    CompileError {
        message: format!(
            "C320: invalid template expression in {}: {}{} — in `{{{}}}`",
            position.describe(),
            oxc_message,
            location,
            source.trim(),
        ),
        code: Some("C320".to_string()),
        hint: Some(
            "template expressions must be a single valid JS/TS expression; \
             the marker points at where parsing failed"
                .to_string(),
        ),
        fix: Some(
            "fix the expression syntax, or move the logic into `$action` / \
             `$computed` in `@state` and reference it here"
                .to_string(),
        ),
        // Verbatim capture — unique-match anchor for the human codeframe.
        from: Some(source.trim().to_string()),
        ..Default::default()
    }
}

/// C321 — parseable, but not the single side-effect-free expression the
/// template Contract allows. Message text is the plan's, verbatim.
fn contract_error(source: &str, position: ExprPosition, why: &str) -> CompileError {
    CompileError {
        message: format!(
            "C321: expression in {} {why} — template expressions are single JS \
             expressions; move multi-statement or effectful logic into `$action`, \
             and derived values into `$computed` (then reference the computed \
             name here). — in `{{{}}}`",
            position.describe(),
            source.trim(),
        ),
        code: Some("C321".to_string()),
        hint: Some(format!("this {} {}", position.describe(), why)),
        fix: Some(
            "move multi-statement or effectful logic into `$action`, and derived \
             values into `$computed` (then reference the computed name here)"
                .to_string(),
        ),
        from: Some(source.trim().to_string()),
        ..Default::default()
    }
}

// ─── Small text helpers (expression-local; no file offsets until W1 merge) ──

/// 1-based line/col of a byte offset within the expression string.
fn rel_line_col(source: &str, offset: usize) -> (usize, usize) {
    let upto = &source[..offset.min(source.len())];
    let line = upto.bytes().filter(|b| *b == b'\n').count() + 1;
    let col = upto.rfind('\n').map(|i| offset - i - 1).unwrap_or(offset) + 1;
    (line, col)
}

/// Leading-keyword sniff for C321-vs-C320 classification of parse failures.
/// (`function`/`class`/`new` are expression-legal and deliberately absent.)
fn contract_keyword_offense(source: &str) -> Option<&'static str> {
    let trimmed = source.trim_start();
    const STMT_KEYWORDS: &[&str] = &[
        "const", "let", "var", "if", "for", "while", "do", "switch", "return",
        "throw", "try", "break", "continue", "import", "export",
    ];
    let at_word_boundary = |kw: &str| {
        trimmed.starts_with(kw)
            && trimmed[kw.len()..]
                .chars()
                .next()
                .map(|c| !c.is_alphanumeric() && c != '_' && c != '$')
                .unwrap_or(true)
    };
    if STMT_KEYWORDS.iter().any(|kw| at_word_boundary(kw)) {
        return Some("is a statement, not an expression");
    }
    if at_word_boundary("await") {
        return Some("uses `await`");
    }
    if at_word_boundary("yield") {
        return Some("uses `yield`");
    }
    None
}

/// True when `rest` is only whitespace and JS comments — the only things
/// allowed to trail a complete expression inside a `{…}` capture.
fn rest_is_trivia(rest: &str) -> bool {
    let bytes = rest.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i];
        if c.is_ascii_whitespace() {
            i += 1;
        } else if c == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
            // Line comment → to end of line.
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
        } else if c == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            // Block comment → past `*/` (unterminated ⇒ not trivia).
            match rest[i + 2..].find("*/") {
                Some(end) => i += 2 + end + 2,
                None => return false,
            }
        } else {
            return false;
        }
    }
    true
}

// ─── Unit tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn ok(src: &str, pos: ExprPosition) {
        if let Err(e) = validate_expr(src, pos) {
            panic!("expected `{src}` to validate, got: {}", e.message);
        }
    }

    fn err_code(src: &str, pos: ExprPosition) -> String {
        match validate_expr(src, pos) {
            Ok(()) => panic!("expected `{src}` to be rejected"),
            Err(e) => e.code.expect("diagnostic must carry a code"),
        }
    }

    // Every ACCEPT row from the plan's empirical truth table that is a pure
    // expression must validate (the flag must not reject working code).
    #[test]
    fn accepts_the_plan_fixture_grammar() {
        use ExprPosition::*;
        ok("user.name", Interpolation);
        ok("items.join(', ')", Interpolation);
        ok("items.filter(i => i > 1).map(i => i * 2).join(',')", Interpolation);
        ok("count > 0 ? 'many' : 'none'", Interpolation);
        ok("(() => count)()", Interpolation);
        ok("`Count: ${count}`", Interpolation);
        ok("user?.name", Interpolation);
        ok("count ?? 0", Interpolation);
        ok("Math.max(...nums)", Interpolation);
        ok("[...items, extra].length", Interpolation);
        ok(" {...obj, b: 2}.b ", Interpolation);
        ok("JSON.stringify({ a: 1 })", Interpolation);
        ok("new Date().getFullYear()", Interpolation);
        ok("/^a/.test(user.name) ? 1 : 0", Interpolation);
        ok("'}'", Interpolation);
        ok("items.map(i => { return i * 2 }).join('')", Interpolation);
        ok("items.map(({ x }) => x)", Interpolation);
        ok("// note\ncount", Interpolation);
        ok("count // trailing note", Interpolation);
        ok("count /* trailing block */", Interpolation);
        // TS-isms (SourceType::ts()).
        ok("(user as any).name", Interpolation);
        ok("user!.name", Interpolation);
        ok("items.filter(e => e.ok)", EachList);
        ok("Array.from({ length: count }, (_, i) => i)", EachList);
        ok("x.id", EachKey);
        ok("user.bio", Html);
        ok("[...items, 'x']", AttrBinding);
        ok("() => setCount(count() + 1)", Handler);
        ok("(e) => { count = 1; log(e) }", Handler);
    }

    #[test]
    fn rejects_syntax_errors_with_c320() {
        use ExprPosition::*;
        assert_eq!(err_code("count +", Interpolation), "C320");
        assert_eq!(err_code("items.", Interpolation), "C320");
        assert_eq!(err_code("count ===", IfHead), "C320");
        assert_eq!(err_code("(count", Interpolation), "C320");
    }

    #[test]
    fn c320_message_carries_span_and_expression() {
        let e = validate_expr("count +", ExprPosition::Interpolation).unwrap_err();
        assert!(e.message.starts_with("C320:"), "got: {}", e.message);
        assert!(
            e.message.contains("`{count +}`"),
            "message must quote the capture, got: {}",
            e.message
        );
        assert_eq!(e.from.as_deref(), Some("count +"));
    }

    #[test]
    fn rejects_contract_violations_with_c321() {
        use ExprPosition::*;
        // Statements / declarations.
        assert_eq!(err_code("const x = 1", Interpolation), "C321");
        assert_eq!(err_code("if (count) { 1 }", Interpolation), "C321");
        assert_eq!(err_code("return count", Interpolation), "C321");
        // Sequence commas.
        assert_eq!(err_code("count, extra", Interpolation), "C321");
        // Assignment/update outside handler position…
        assert_eq!(err_code("count = 5", Interpolation), "C321");
        assert_eq!(err_code("count++", AttrBinding), "C321");
        // …but permitted at the root in handler position.
        ok("count = 5", Handler);
        ok("count++", Handler);
        // await / yield.
        assert_eq!(err_code("await fetchData()", Interpolation), "C321");
        // Multiple statements in one capture.
        assert_eq!(err_code("a(); b()", Interpolation), "C321");
    }

    #[test]
    fn c321_uses_the_contract_message() {
        let e = validate_expr("count = 5", ExprPosition::Interpolation).unwrap_err();
        assert!(
            e.message.contains(
                "template expressions are single JS expressions; move \
                 multi-statement or effectful logic into `$action`, and derived \
                 values into `$computed` (then reference the computed name here)."
            ),
            "got: {}",
            e.message
        );
    }

    #[test]
    fn empty_captures_are_not_this_passes_problem() {
        ok("", ExprPosition::Interpolation);
        ok("   ", ExprPosition::IfHead);
    }

    #[test]
    fn rel_line_col_is_one_based() {
        assert_eq!(rel_line_col("abc", 0), (1, 1));
        assert_eq!(rel_line_col("abc", 2), (1, 3));
        assert_eq!(rel_line_col("a\nbc", 2), (2, 1));
        assert_eq!(rel_line_col("a\nbc", 3), (2, 2));
    }
}
