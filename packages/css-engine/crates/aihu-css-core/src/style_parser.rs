//! `style_parser.rs` — structured `@style`-rule parser (R-SHARED-PARSER).
//!
//! Parses an authored `@style` block (the CSS body that `emit_sfc_scoped` folds
//! into the shadow `<style>`, minus `@theme` directives) into a structured rule
//! tree. This is the SINGLE source of `@style` structure reused by two passes:
//!
//! - **`@apply` expansion** (`apply.rs`, T3): each rule's `@apply` directives are
//!   replaced — base utilities inline as declarations, variant tokens lift to
//!   nested selectors.
//! - **Variant validation** (`validate.rs`, PR-3): each rule's selector context
//!   is checked against the declared `@meta.variants` axes.
//!
//! Codex flagged a naive string scanner as a trap: arbitrary-value utilities
//! (`bg-[#fff]`), `;` inside `url(...)`/string values, `:` inside selectors and
//! values, and braces inside comments/strings must NOT break tokenization. So
//! this is a real comment-aware, string-aware, brace-nesting-aware parse — not a
//! `split(';')`/`split('{')` scanner.
//!
//! ## Rule tree shape
//!
//! ```text
//! @style {
//!   .a, .b {            ← StyleRule { selector: ".a, .b", … }
//!     color: red;       ←   declarations: [Declaration { prop: "color", value: "red" }]
//!     @apply p-4 m-2;    ←   applies: [ApplyDirective { tokens: ["p-4", "m-2"] }]
//!     @media (...) {     ←   nested: [StyleNode::AtRule(AtRule { prelude, body })]
//!       .a { … }
//!     }
//!   }
//! }
//! ```
//!
//! `StyleSheet` is the top-level list of [`StyleNode`]s (a rule, a bare at-rule,
//! or — for full fidelity round-tripping — verbatim leading/trailing text such
//! as a stray declaration outside any rule, which authored `@style` may contain).

/// A single `prop: value` declaration inside a rule body.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Declaration {
    /// The property name, trimmed (`color`, `--my-var`, `background`).
    pub prop: String,
    /// The value text, trimmed, WITHOUT the trailing `;`. May itself contain
    /// `:`, `;`-in-`url()`, commas, parentheses, and quoted strings.
    pub value: String,
}

/// An `@apply <tokens>;` directive captured inside a rule body. The tokens are
/// the whitespace-separated utility class names (variant prefixes intact, e.g.
/// `hover:bg-accent`, `bg-[#fff]`), exactly as the scanner/emitter expect.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplyDirective {
    pub tokens: Vec<String>,
}

/// A style rule: a selector prelude plus a body of declarations, `@apply`
/// directives, and nested nodes (nested rules or nested at-rules).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StyleRule {
    /// The raw selector text (everything before the `{`), trimmed. May be a
    /// selector list (`.a, .b`) and contain `:is(...)`, attribute selectors,
    /// pseudo-classes, combinators, and nesting `&`.
    pub selector: String,
    /// `prop: value` declarations directly in this rule's body, in source order.
    pub declarations: Vec<Declaration>,
    /// `@apply` directives directly in this rule's body, in source order.
    pub applies: Vec<ApplyDirective>,
    /// Nested nodes (nested rules / nested at-rules) in this rule's body.
    pub nested: Vec<StyleNode>,
}

/// A nested or bare at-rule (`@media`, `@supports`, `@container`, …) with a
/// prelude and a brace body of further [`StyleNode`]s.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AtRule {
    /// The at-rule name including `@` (`@media`, `@supports`, `@container`).
    pub name: String,
    /// The prelude between the name and the `{` (`(min-width: 600px)`), trimmed.
    pub prelude: String,
    /// The body nodes inside the braces.
    pub body: Vec<StyleNode>,
}

/// A statement-level at-rule with no brace body (`@import url(...);`,
/// `@charset "utf-8";`). Captured verbatim so round-tripping is lossless.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AtStatement {
    /// The full statement text WITHOUT the trailing `;` (`@import url("a.css")`).
    pub text: String,
}

/// A node in the `@style` tree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StyleNode {
    /// A style rule (`selector { … }`).
    Rule(StyleRule),
    /// A nested/bare at-rule with a brace body (`@media (...) { … }`).
    AtRule(AtRule),
    /// A statement at-rule with no body (`@import …;`).
    AtStatement(AtStatement),
}

/// The parsed `@style` block: an ordered list of top-level nodes.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StyleSheet {
    pub nodes: Vec<StyleNode>,
}

/// An error raised while parsing a `@style` block — an unbalanced brace, an
/// unterminated comment, or an unterminated string. Surfaced as a structured
/// error so callers (`@apply`, validation) can convert it into a `CompileError`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StyleParseError {
    /// A `{` with no matching `}` (or vice versa) by end of input.
    UnbalancedBraces,
    /// A `/* … */` comment that never closed.
    UnterminatedComment,
    /// A `"…"` or `'…'` string that never closed.
    UnterminatedString,
}

impl std::fmt::Display for StyleParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let msg = match self {
            StyleParseError::UnbalancedBraces => "unbalanced braces in @style block",
            StyleParseError::UnterminatedComment => "unterminated comment in @style block",
            StyleParseError::UnterminatedString => "unterminated string in @style block",
        };
        f.write_str(msg)
    }
}

impl std::error::Error for StyleParseError {}

/// Parse an authored `@style` body into a structured [`StyleSheet`].
///
/// Input is the raw CSS text inside the `@style { … }` block (the same text
/// `emit_sfc_scoped` folds), already stripped of `@theme` directives. Output is
/// the rule tree; [`StyleSheet::to_css`] round-trips it back to equivalent CSS.
pub fn parse_style(input: &str) -> Result<StyleSheet, StyleParseError> {
    let mut parser = Parser::new(input);
    let nodes = parser.parse_nodes(/* top_level = */ true)?;
    Ok(StyleSheet { nodes })
}

/// Cursor over the input that is aware of comments and strings so structural
/// characters (`{`, `}`, `;`, `:`) inside them are never treated as syntax.
struct Parser<'a> {
    src: &'a str,
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Parser<'a> {
    fn new(src: &'a str) -> Self {
        Self {
            src,
            bytes: src.as_bytes(),
            pos: 0,
        }
    }

    /// Parse a sequence of nodes until either end of input (`top_level`) or an
    /// unmatched `}` that closes the enclosing block (consumed by the caller).
    fn parse_nodes(&mut self, top_level: bool) -> Result<Vec<StyleNode>, StyleParseError> {
        let mut nodes = Vec::new();
        loop {
            self.skip_trivia()?;
            if self.pos >= self.bytes.len() {
                if top_level {
                    return Ok(nodes);
                }
                // Reached EOF inside a block with no closing brace.
                return Err(StyleParseError::UnbalancedBraces);
            }
            if self.bytes[self.pos] == b'}' {
                if top_level {
                    // A stray `}` at top level is unbalanced.
                    return Err(StyleParseError::UnbalancedBraces);
                }
                // Leave the `}` for the caller to consume.
                return Ok(nodes);
            }
            if let Some(node) = self.parse_statement()? {
                nodes.push(node);
            }
        }
    }

    /// Parse one statement: a declaration, an `@apply`/at-statement, an at-rule
    /// with a body, or a style rule. Returns `None` for an empty `;`.
    fn parse_statement(&mut self) -> Result<Option<StyleNode>, StyleParseError> {
        // Scan the "prelude" (everything up to the next top-level `{`, `;`, or
        // `}`) while honouring comments/strings/nested brackets/parens.
        let start = self.pos;
        let terminator = self.scan_to_terminator()?;
        let prelude = self.src[start..self.pos].trim().to_string();

        match terminator {
            Terminator::Brace => {
                // `prelude {` — a rule or a body-bearing at-rule.
                self.pos += 1; // consume `{`
                let body = self.parse_nodes(false)?;
                // consume the matching `}`
                if self.pos >= self.bytes.len() || self.bytes[self.pos] != b'}' {
                    return Err(StyleParseError::UnbalancedBraces);
                }
                self.pos += 1;

                if prelude.starts_with('@') {
                    let (name, rest) = split_at_name(&prelude);
                    Ok(Some(StyleNode::AtRule(AtRule {
                        name,
                        prelude: rest,
                        body,
                    })))
                } else {
                    Ok(Some(StyleNode::Rule(build_rule(prelude, body))))
                }
            }
            Terminator::Semicolon | Terminator::Eof => {
                // A statement ending in `;` (or trailing at EOF with no `;`).
                if terminator == Terminator::Semicolon {
                    self.pos += 1; // consume `;`
                }
                if prelude.is_empty() {
                    return Ok(None);
                }
                if prelude.starts_with('@') {
                    // A statement at-rule (e.g. `@import …`). `@apply` is handled
                    // inside `build_rule` when it appears in a rule body; a
                    // top-level `@apply` (outside any rule) is unusual but we
                    // keep it as an at-statement so nothing is lost.
                    Ok(Some(StyleNode::AtStatement(AtStatement { text: prelude })))
                } else if let Some((prop, value)) = split_declaration(&prelude) {
                    // A bare declaration outside a rule — authored `@style` may
                    // legitimately contain custom-property declarations at the
                    // block root. Wrap it in a selector-less rule so it round-
                    // trips, but the common in-rule case is handled in
                    // `build_rule`.
                    Ok(Some(StyleNode::Rule(StyleRule {
                        selector: String::new(),
                        declarations: vec![Declaration { prop, value }],
                        applies: Vec::new(),
                        nested: Vec::new(),
                    })))
                } else {
                    // Unrecognized statement (no `:`): keep verbatim as an
                    // at-statement-like node only if it began with `@`; otherwise
                    // drop empty noise. Here it is non-`@`, non-declaration text
                    // — preserve as a selector-less rule with the raw text as a
                    // single "declaration"-less marker is lossy, so keep it as a
                    // rule selector to round-trip.
                    Ok(Some(StyleNode::Rule(StyleRule {
                        selector: prelude,
                        declarations: Vec::new(),
                        applies: Vec::new(),
                        nested: Vec::new(),
                    })))
                }
            }
            Terminator::CloseBrace => {
                // Hit `}` while scanning a prelude — a trailing fragment before
                // the block closes (e.g. a final declaration with no `;`).
                if prelude.is_empty() {
                    return Ok(None);
                }
                if let Some((prop, value)) = split_declaration(&prelude) {
                    Ok(Some(StyleNode::Rule(StyleRule {
                        selector: String::new(),
                        declarations: vec![Declaration { prop, value }],
                        applies: Vec::new(),
                        nested: Vec::new(),
                    })))
                } else if prelude.starts_with('@') {
                    Ok(Some(StyleNode::AtStatement(AtStatement { text: prelude })))
                } else {
                    Ok(Some(StyleNode::Rule(StyleRule {
                        selector: prelude,
                        declarations: Vec::new(),
                        applies: Vec::new(),
                        nested: Vec::new(),
                    })))
                }
            }
        }
    }

    /// Advance to the next top-level structural terminator (`{`, `;`, or `}`),
    /// stepping over comments, strings, `(...)`, and `[...]` so their inner
    /// `{`/`;`/`:` never count. Leaves `self.pos` AT the terminator.
    fn scan_to_terminator(&mut self) -> Result<Terminator, StyleParseError> {
        while self.pos < self.bytes.len() {
            let b = self.bytes[self.pos];
            match b {
                b'/' if self.peek(1) == Some(b'*') => self.skip_block_comment()?,
                b'"' | b'\'' => self.skip_string(b)?,
                b'(' => self.skip_balanced(b'(', b')')?,
                b'[' => self.skip_balanced(b'[', b']')?,
                b'{' => return Ok(Terminator::Brace),
                b';' => return Ok(Terminator::Semicolon),
                b'}' => return Ok(Terminator::CloseBrace),
                _ => self.pos += 1,
            }
        }
        Ok(Terminator::Eof)
    }

    /// Skip whitespace and comments (used between statements).
    fn skip_trivia(&mut self) -> Result<(), StyleParseError> {
        loop {
            while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_whitespace() {
                self.pos += 1;
            }
            if self.pos < self.bytes.len()
                && self.bytes[self.pos] == b'/'
                && self.peek(1) == Some(b'*')
            {
                self.skip_block_comment()?;
            } else {
                break;
            }
        }
        Ok(())
    }

    fn skip_block_comment(&mut self) -> Result<(), StyleParseError> {
        // self.pos is at `/`, next is `*`.
        self.pos += 2;
        while self.pos < self.bytes.len() {
            if self.bytes[self.pos] == b'*' && self.peek(1) == Some(b'/') {
                self.pos += 2;
                return Ok(());
            }
            self.pos += 1;
        }
        Err(StyleParseError::UnterminatedComment)
    }

    fn skip_string(&mut self, quote: u8) -> Result<(), StyleParseError> {
        // self.pos is at the opening quote.
        self.pos += 1;
        while self.pos < self.bytes.len() {
            let b = self.bytes[self.pos];
            if b == b'\\' {
                // Skip the escaped byte.
                self.pos += 2;
                continue;
            }
            if b == quote {
                self.pos += 1;
                return Ok(());
            }
            self.pos += 1;
        }
        Err(StyleParseError::UnterminatedString)
    }

    /// Skip a balanced `(...)` / `[...]` span, honouring comments and strings
    /// inside it so e.g. `url(")")` or `[data-x="}"]` do not confuse the scan.
    fn skip_balanced(&mut self, open: u8, close: u8) -> Result<(), StyleParseError> {
        let mut depth = 0u32;
        while self.pos < self.bytes.len() {
            let b = self.bytes[self.pos];
            match b {
                b'/' if self.peek(1) == Some(b'*') => {
                    self.skip_block_comment()?;
                    continue;
                }
                b'"' | b'\'' => {
                    self.skip_string(b)?;
                    continue;
                }
                _ if b == open => depth += 1,
                _ if b == close => {
                    depth -= 1;
                    if depth == 0 {
                        self.pos += 1;
                        return Ok(());
                    }
                }
                _ => {}
            }
            self.pos += 1;
        }
        // Unbalanced parens/brackets: treat as unbalanced braces (structural).
        Err(StyleParseError::UnbalancedBraces)
    }

    fn peek(&self, ahead: usize) -> Option<u8> {
        self.bytes.get(self.pos + ahead).copied()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Terminator {
    Brace,
    Semicolon,
    CloseBrace,
    Eof,
}

/// Split a body's nodes into declarations / `@apply`s / nested nodes for a rule.
///
/// The body was parsed as a flat `Vec<StyleNode>` by [`Parser::parse_nodes`];
/// declaration-bearing selector-less rules and at-statements are re-classified
/// here. `@apply …;` arrives as a `StyleNode::AtStatement` (it has no body), so
/// we lift those into [`StyleRule::applies`].
fn build_rule(selector: String, body: Vec<StyleNode>) -> StyleRule {
    let mut declarations = Vec::new();
    let mut applies = Vec::new();
    let mut nested = Vec::new();

    for node in body {
        match node {
            // A selector-less rule produced by a bare declaration in the body.
            StyleNode::Rule(r) if r.selector.is_empty() && r.nested.is_empty() => {
                declarations.extend(r.declarations);
                applies.extend(r.applies);
            }
            StyleNode::AtStatement(at) => {
                if let Some(directive) = parse_apply(&at.text) {
                    applies.push(directive);
                } else {
                    // A non-@apply statement at-rule inside a body (rare) — keep
                    // it as a nested node so nothing is dropped.
                    nested.push(StyleNode::AtStatement(at));
                }
            }
            other => nested.push(other),
        }
    }

    StyleRule {
        selector,
        declarations,
        applies,
        nested,
    }
}

/// If `text` is an `@apply <tokens>` directive, return the parsed tokens.
fn parse_apply(text: &str) -> Option<ApplyDirective> {
    let rest = text.strip_prefix("@apply")?;
    // Ensure it's the `@apply` keyword, not `@applyfoo`.
    if !rest.is_empty() && !rest.as_bytes()[0].is_ascii_whitespace() {
        return None;
    }
    let tokens: Vec<String> = rest.split_whitespace().map(|t| t.to_string()).collect();
    Some(ApplyDirective { tokens })
}

/// Split `@name rest` into (`@name`, `rest`) where `@name` is the at-keyword.
fn split_at_name(prelude: &str) -> (String, String) {
    let end = prelude
        .char_indices()
        .find(|(_, c)| c.is_whitespace() || *c == '(')
        .map(|(i, _)| i)
        .unwrap_or(prelude.len());
    let name = prelude[..end].to_string();
    let rest = prelude[end..].trim().to_string();
    (name, rest)
}

/// Split `prop: value` on the FIRST top-level `:` (none inside `(...)`/`[...]`
/// /strings). Returns `None` if there is no such `:` (not a declaration).
fn split_declaration(text: &str) -> Option<(String, String)> {
    let bytes = text.as_bytes();
    let mut i = 0;
    let mut paren = 0u32;
    let mut bracket = 0u32;
    while i < bytes.len() {
        let b = bytes[i];
        match b {
            b'"' | b'\'' => {
                // Skip string.
                let quote = b;
                i += 1;
                while i < bytes.len() {
                    if bytes[i] == b'\\' {
                        i += 2;
                        continue;
                    }
                    if bytes[i] == quote {
                        i += 1;
                        break;
                    }
                    i += 1;
                }
                continue;
            }
            b'(' => paren += 1,
            b')' => paren = paren.saturating_sub(1),
            b'[' => bracket += 1,
            b']' => bracket = bracket.saturating_sub(1),
            b':' if paren == 0 && bracket == 0 => {
                let prop = text[..i].trim().to_string();
                let value = text[i + 1..].trim().to_string();
                if prop.is_empty() {
                    return None;
                }
                return Some((prop, value));
            }
            _ => {}
        }
        i += 1;
    }
    None
}

impl StyleSheet {
    /// Render the rule tree back to CSS. Round-trips a parsed unchanged block to
    /// an equivalent (re-formatted) stylesheet. Used by `@apply` after rewriting
    /// directives, and by tests asserting round-trip fidelity.
    pub fn to_css(&self) -> String {
        let mut out = String::new();
        for node in &self.nodes {
            write_node(&mut out, node, 0);
        }
        out
    }
}

fn write_node(out: &mut String, node: &StyleNode, depth: usize) {
    let pad = "  ".repeat(depth);
    match node {
        StyleNode::Rule(rule) => {
            if rule.selector.is_empty()
                && rule.nested.is_empty()
                && rule.applies.is_empty()
                && rule.declarations.len() == 1
            {
                // A root-level bare declaration: emit without a wrapping block.
                let d = &rule.declarations[0];
                out.push_str(&pad);
                out.push_str(&d.prop);
                out.push_str(": ");
                out.push_str(&d.value);
                out.push_str(";\n");
                return;
            }
            out.push_str(&pad);
            out.push_str(&rule.selector);
            if !rule.selector.is_empty() {
                out.push(' ');
            }
            out.push_str("{\n");
            let inner = "  ".repeat(depth + 1);
            for d in &rule.declarations {
                out.push_str(&inner);
                out.push_str(&d.prop);
                out.push_str(": ");
                out.push_str(&d.value);
                out.push_str(";\n");
            }
            for a in &rule.applies {
                out.push_str(&inner);
                out.push_str("@apply ");
                out.push_str(&a.tokens.join(" "));
                out.push_str(";\n");
            }
            for n in &rule.nested {
                write_node(out, n, depth + 1);
            }
            out.push_str(&pad);
            out.push_str("}\n");
        }
        StyleNode::AtRule(at) => {
            out.push_str(&pad);
            out.push_str(&at.name);
            if !at.prelude.is_empty() {
                out.push(' ');
                out.push_str(&at.prelude);
            }
            out.push_str(" {\n");
            for n in &at.body {
                write_node(out, n, depth + 1);
            }
            out.push_str(&pad);
            out.push_str("}\n");
        }
        StyleNode::AtStatement(at) => {
            out.push_str(&pad);
            out.push_str(&at.text);
            out.push_str(";\n");
        }
    }
}
