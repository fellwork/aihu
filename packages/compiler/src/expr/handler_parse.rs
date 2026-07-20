//! Shared synthetic-function-wrapper parse for **macro handler bodies**.
//!
//! A macro body (`$action`, `$lifecycle`, `$effect`, `$computed`, `$resource`)
//! is a STATEMENT LIST, not an expression, so `parse_expression` does not
//! apply. The technique — introduced by CO1 (`prop_write.rs`, spec §4.2) and
//! factored out here — is to wrap the body in a synthetic function:
//!
//! ```text
//! {async }function __aihu_pw(<params>) {
//! <body>
//! }
//! ```
//!
//! and parse THAT as a Program with `SourceType::ts()`. Three things fall out
//! free, and all three are load-bearing:
//!
//! 1. **The handler's params become real bindings**, shadowed by oxc's own
//!    scope model. No hand-rolled param collection — which is exactly where a
//!    scanner over-collects and silently corrupts a shadowed local.
//! 2. `return` and `await` parse legally.
//! 3. **TS-typed params parse** (`(h: number)`,
//!    `(f: 'all' | 'active' | 'completed')`). Required by `macro-test` and
//!    `todo-mvc` today, and it is the whole point for DE5 below.
//!
//! ## Why this is a shared primitive rather than a CO1 detail
//!
//! The conformance plan records the dependency `CO1 ──> DE5 (shared handler
//! parsing)`. DE5 (typed MCP parameter schemas) must derive a tool's parameter
//! schema from the same authored handler signature that CO1 already parses to
//! find prop writes. Two parsers over one signature is the "kept in sync" seam
//! the thesis §2 (Derived) forbids — the agent-facing schema would drift from
//! the code it claims to describe, silently.
//!
//! So this module owns the wrapper shape, the span arithmetic, and the
//! signature extraction, and both consumers read from it.
//!
//! ## Containment
//!
//! Same rule as `rewrite.rs`: **oxc types stay inside `src/expr/`.** The
//! oxc-typed entry points ([`HandlerSource::parse`]) are for in-module
//! consumers; [`handler_params`] is the plain-data door DE5 can call from
//! anywhere without importing oxc.

use oxc_allocator::Allocator;
use oxc_ast::ast::{BindingPattern, Program, Statement};
use oxc_parser::{Parser, ParserReturn};
use oxc_span::SourceType;

/// The synthetic wrapper around one macro handler body, plus the span
/// arithmetic needed to map oxc offsets back onto the ORIGINAL body text.
///
/// Offsets matter: edits are spliced into the original body by byte offset and
/// nothing is reprinted from the AST, so comments, string contents, regex
/// literals, and multibyte glyphs survive verbatim.
pub struct HandlerSource {
    source: String,
    prefix_len: usize,
    body_len: usize,
}

impl HandlerSource {
    /// Build the wrapper. `is_async` parses it as `async function` so `await`
    /// in the body is not a syntax error.
    pub fn wrap(body: &str, params: &str, is_async: bool) -> Self {
        let head = format!(
            "{}function __aihu_pw({}) {{\n",
            if is_async { "async " } else { "" },
            params
        );
        let prefix_len = head.len();
        Self {
            source: format!("{head}{body}\n}}"),
            prefix_len,
            body_len: body.len(),
        }
    }

    /// The full wrapped source handed to the parser.
    pub fn source(&self) -> &str {
        &self.source
    }

    /// Byte offset at which the original body begins inside [`Self::source`].
    pub fn body_start(&self) -> usize {
        self.prefix_len
    }

    /// Byte offset one past the end of the original body inside
    /// [`Self::source`].
    pub fn body_end(&self) -> usize {
        self.prefix_len + self.body_len
    }

    /// Is `[start, end]` fully inside the original body?
    ///
    /// Spans outside it belong to the synthetic wrapper (the head, the params,
    /// the closing brace) and MUST be discarded — rewriting one would corrupt
    /// text the author never wrote.
    pub fn span_in_body(&self, start: usize, end: usize) -> bool {
        start >= self.body_start() && end <= self.body_end()
    }

    /// Translate a wrapper offset into an offset in the original body, or
    /// `None` when it falls outside.
    pub fn to_body_offset(&self, offset: usize) -> Option<usize> {
        if offset >= self.body_start() && offset <= self.body_end() {
            Some(offset - self.body_start())
        } else {
            None
        }
    }

    /// Parse the wrapper.
    ///
    /// `None` on ANY parse failure or diagnostic, which callers treat as
    /// "leave the body exactly as authored". Strictly non-regressive: emit
    /// must never panic on a body oxc cannot model.
    pub fn parse<'a>(&'a self, allocator: &'a Allocator) -> Option<ParserReturn<'a>> {
        let parsed = Parser::new(allocator, &self.source, SourceType::ts()).parse();
        if parsed.panicked || !parsed.diagnostics.is_empty() {
            return None;
        }
        Some(parsed)
    }
}

/// The synthetic wrapper function's own statement body, i.e. the author's
/// statements. `None` if the program is not the single wrapper function this
/// module builds (which cannot happen for a successful parse of our own
/// wrapper, but is checked rather than unwrapped).
pub fn wrapper_body<'a, 'b>(program: &'b Program<'a>) -> Option<&'b [Statement<'a>]> {
    for stmt in &program.body {
        if let Statement::FunctionDeclaration(func) = stmt {
            if let Some(body) = &func.body {
                return Some(&body.statements);
            }
        }
    }
    None
}

/// One parameter of an authored macro handler, as plain data.
///
/// The `type_text` is the VERBATIM source slice of the TS type annotation, not
/// a parsed type. DE5 maps these onto JSON-Schema types; keeping the raw text
/// means this module does not have to model TS's type grammar, and an
/// unmappable annotation is visible to DE5 as text it can reject explicitly
/// rather than silently mis-schema.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HandlerParam {
    /// Binding name. `None` for a destructuring or otherwise non-identifier
    /// parameter — DE5 cannot name such a parameter in a schema and must say
    /// so rather than guess.
    pub name: Option<String>,
    /// Verbatim TS type annotation text, without the leading `:`.
    pub type_text: Option<String>,
    /// Declared optional (`x?: number`).
    pub optional: bool,
    /// Has a default value (`x = 3`), which also makes it optional in practice.
    pub has_default: bool,
    /// Rest parameter (`...rest`).
    pub rest: bool,
}

/// The bound name of a simple identifier pattern.
///
/// `None` for destructuring patterns: DE5 cannot name such a parameter in a
/// schema, and must be able to SEE that rather than receive a guessed name.
fn binding_name(pattern: &BindingPattern<'_>) -> Option<String> {
    match pattern {
        BindingPattern::BindingIdentifier(id) => Some(id.name.to_string()),
        _ => None,
    }
}

/// Extract the parameter signature of an authored macro handler.
///
/// This is the DE5 door: plain data in, plain data out, no oxc in the
/// signature. It parses through the SAME wrapper CO1's rewrite uses, so the
/// schema DE5 derives and the rewrite CO1 performs cannot disagree about what
/// the handler's parameters are.
///
/// `None` when the handler does not parse — the caller must not invent a
/// schema for a signature it could not read.
pub fn handler_params(params: &str, is_async: bool) -> Option<Vec<HandlerParam>> {
    // The body is irrelevant to the signature; an empty one keeps the parse
    // minimal and cannot itself fail.
    let wrapped = HandlerSource::wrap("", params, is_async);
    let allocator = Allocator::default();
    let parsed = wrapped.parse(&allocator)?;

    let mut out = Vec::new();
    for stmt in &parsed.program.body {
        let Statement::FunctionDeclaration(func) = stmt else {
            continue;
        };
        for p in &func.params.items {
            // In a FORMAL PARAMETER position a default is carried by
            // `initializer`, not by an `AssignmentPattern` — oxc documents
            // `AssignmentPattern` as invalid here. Reading `initializer` is
            // therefore the only correct source for `has_default`.
            let name = binding_name(&p.pattern);
            let type_text = p.type_annotation.as_ref().map(|t| {
                let span = t.type_annotation.span();
                wrapped.source()[span.start as usize..span.end as usize]
                    .trim()
                    .to_string()
            });
            out.push(HandlerParam {
                name,
                type_text,
                optional: p.optional,
                has_default: p.initializer.is_some(),
                rest: false,
            });
        }
        if let Some(rest) = &func.params.rest {
            let name = binding_name(&rest.rest.argument);
            out.push(HandlerParam {
                name,
                type_text: None,
                optional: false,
                has_default: false,
                rest: true,
            });
        }
        return Some(out);
    }
    None
}

use oxc_span::GetSpan;

#[cfg(test)]
mod tests {
    use super::*;

    // ─── wrapper shape + span arithmetic ─────────────────────────────────────

    #[test]
    fn wrapper_head_is_the_documented_shape() {
        let h = HandlerSource::wrap("count++", "a, b", false);
        assert_eq!(h.source(), "function __aihu_pw(a, b) {\ncount++\n}");
        assert_eq!(&h.source()[h.body_start()..h.body_end()], "count++");
    }

    #[test]
    fn async_wrapper_lets_await_parse() {
        let h = HandlerSource::wrap("await f()", "", true);
        assert!(h.source().starts_with("async function __aihu_pw("));
        let alloc = Allocator::default();
        assert!(h.parse(&alloc).is_some());
    }

    #[test]
    fn await_in_a_sync_wrapper_fails_to_parse() {
        // The `is_async` flag is not cosmetic — it decides whether the body is
        // modelable at all. Locks that the flag is actually threaded.
        let h = HandlerSource::wrap("await f()", "", false);
        let alloc = Allocator::default();
        assert!(h.parse(&alloc).is_none());
    }

    #[test]
    fn body_offsets_round_trip_and_reject_the_wrapper() {
        let h = HandlerSource::wrap("xy", "", false);
        assert_eq!(h.to_body_offset(h.body_start()), Some(0));
        assert_eq!(h.to_body_offset(h.body_end()), Some(2));
        assert_eq!(h.to_body_offset(0), None); // inside the synthetic head
        assert_eq!(h.to_body_offset(h.body_end() + 1), None); // closing brace
        assert!(h.span_in_body(h.body_start(), h.body_end()));
        assert!(!h.span_in_body(0, 4));
    }

    #[test]
    fn multibyte_body_offsets_are_byte_exact() {
        let body = "const s = '→→'; count++";
        let h = HandlerSource::wrap(body, "", false);
        assert_eq!(&h.source()[h.body_start()..h.body_end()], body);
    }

    #[test]
    fn unparseable_body_yields_none_rather_than_panicking() {
        let h = HandlerSource::wrap("const = = =", "", false);
        let alloc = Allocator::default();
        assert!(h.parse(&alloc).is_none());
    }

    #[test]
    fn wrapper_body_returns_the_authors_statements() {
        let h = HandlerSource::wrap("let a = 1; let b = 2;", "", false);
        let alloc = Allocator::default();
        let parsed = h.parse(&alloc).unwrap();
        assert_eq!(wrapper_body(&parsed.program).unwrap().len(), 2);
    }

    // ─── DE5 door: signature extraction ──────────────────────────────────────

    #[test]
    fn untyped_params_are_extracted() {
        let ps = handler_params("a, b", false).unwrap();
        assert_eq!(ps.len(), 2);
        assert_eq!(ps[0].name.as_deref(), Some("a"));
        assert_eq!(ps[0].type_text, None);
    }

    #[test]
    fn ts_typed_params_keep_verbatim_annotation_text() {
        // The macro-test / todo-mvc shapes, which are exactly what DE5 needs.
        let ps = handler_params("h: number, f: 'all' | 'active' | 'completed'", false).unwrap();
        assert_eq!(ps[0].name.as_deref(), Some("h"));
        assert_eq!(ps[0].type_text.as_deref(), Some("number"));
        assert_eq!(ps[1].name.as_deref(), Some("f"));
        assert_eq!(
            ps[1].type_text.as_deref(),
            Some("'all' | 'active' | 'completed'")
        );
    }

    #[test]
    fn optional_and_defaulted_params_are_flagged() {
        let ps = handler_params("a?: number, b: string = 'x'", false).unwrap();
        assert!(ps[0].optional);
        assert!(!ps[0].has_default);
        assert!(ps[1].has_default);
        assert_eq!(ps[1].type_text.as_deref(), Some("string"));
    }

    #[test]
    fn rest_param_is_flagged() {
        let ps = handler_params("a, ...rest", false).unwrap();
        assert_eq!(ps.len(), 2);
        assert!(ps[1].rest);
        assert_eq!(ps[1].name.as_deref(), Some("rest"));
    }

    #[test]
    fn destructured_param_has_no_name_rather_than_a_guessed_one() {
        // DE5 must be able to SEE that it cannot name this parameter.
        let ps = handler_params("{ a, b }", false).unwrap();
        assert_eq!(ps.len(), 1);
        assert_eq!(ps[0].name, None);
    }

    #[test]
    fn empty_params_yield_an_empty_signature_not_none() {
        assert_eq!(handler_params("", false).unwrap().len(), 0);
    }

    #[test]
    fn unparseable_params_yield_none() {
        assert!(handler_params("a: , = ,", false).is_none());
    }
}
