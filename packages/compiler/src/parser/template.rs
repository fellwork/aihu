use crate::parser::directives::{parse_attr, validate_identifier};
use crate::types::{Attr, CompileError, MacroValue, TemplateNode};

// ─── C400 / C401 compile-error codes ─────────────────────────────────────────

/// Check for C400: `<$suspense>` or `<$shield>` with BOTH a `fallback="..."` attr
/// AND a `<$slot name="fallback">` child.
fn check_c400(
    macro_name: &str,
    attrs: &[Attr],
    children: &[TemplateNode],
) -> Option<CompileError> {
    if macro_name != "suspense" && macro_name != "shield" {
        return None;
    }
    let has_fallback_attr = attrs.iter().any(|a| match a {
        Attr::Static { name, .. } => name == "fallback",
        _ => false,
    });
    let has_fallback_slot_child = children.iter().any(|c| match c {
        TemplateNode::MacroElement { name, attrs, .. } if name == "slot" => {
            attrs.iter().any(|a| match a {
                Attr::Static { name, value } => name == "name" && value == "fallback",
                _ => false,
            })
        }
        _ => false,
    });
    if has_fallback_attr && has_fallback_slot_child {
        return Some(CompileError {
            message:
                "C400: conflicting fallback definitions — use either fallback=\"...\" attribute or <$slot name=\"fallback\"> child, not both"
                    .to_string(),
            line: 0,
            col: 0,
            code: Some("C400".to_string()),
            ..Default::default()
        });
    }
    None
}

/// Check for C401: any attribute value (curly form) that appears to contain JSX
/// (`{<` prefix inside the braces).
fn check_c401(attrs: &[Attr]) -> Option<CompileError> {
    for attr in attrs {
        let inner = match attr {
            Attr::Macro {
                value: MacroValue::Curly(inner),
                ..
            } => inner.as_str(),
            _ => continue,
        };
        let trimmed = inner.trim_start();
        if trimmed.starts_with('<') {
            return Some(CompileError {
                message:
                    "C401: inline JSX in attributes is not supported; extract to a component or use <$slot> child instead"
                        .to_string(),
                line: 0,
                col: 0,
                code: Some("C401".to_string()),
                ..Default::default()
            });
        }
    }
    None
}

pub fn parse_template(input: &str) -> Result<Vec<TemplateNode>, CompileError> {
    let mut parser = Parser { input, pos: 0 };
    parser.parse_nodes(None, None)
}

/// B3 — block-tag boundary signals returned by `parse_nodes` when it stops at a
/// sibling-form block-tag tail (`{:else}`, `{:else if ...}`, `{:empty}`, `{/if}`,
/// `{/each}`). The caller (parse_if_block / parse_each_block) interprets these
/// to assemble the full block-tag AST.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum BlockBoundary {
    /// Stop at `{:else}` — the rest of the body collects into else branch.
    ElseBranch,
    /// Stop at `{:else if cond}` — caller starts a new branch with this cond.
    ElseIfBranch(String),
    /// Stop at `{:empty}` — caller switches to empty-body collection.
    Empty,
    /// Stop at `{/if}` — caller closes the IfBlock.
    EndIf,
    /// Stop at `{/each}` — caller closes the EachBlock.
    EndEach,
}

struct Parser<'a> {
    input: &'a str,
    pos: usize,
}

impl<'a> Parser<'a> {
    /// Parse children until a closing element tag matches `closing_tag` OR a
    /// block-tag boundary in `block_stops` is encountered. Returns the parsed
    /// children plus the boundary that ended the parse (if any). When parsing
    /// the top-level template, `closing_tag` and `block_stops` are both None.
    fn parse_nodes(
        &mut self,
        closing_tag: Option<&str>,
        block_stops: Option<&[BlockBoundary]>,
    ) -> Result<Vec<TemplateNode>, CompileError> {
        let (nodes, _) = self.parse_nodes_with_boundary(closing_tag, block_stops)?;
        Ok(nodes)
    }

    fn parse_nodes_with_boundary(
        &mut self,
        closing_tag: Option<&str>,
        block_stops: Option<&[BlockBoundary]>,
    ) -> Result<(Vec<TemplateNode>, Option<BlockBoundary>), CompileError> {
        let mut nodes = Vec::new();

        while !self.is_eof() {
            // B3 — block-tag detection. Distinguish `{#…}` / `{:…}` / `{/…}` /
            // `{@…}` from plain `{expr}` interpolation.
            if self.starts_with("{#") {
                let node = self.parse_block_tag_open()?;
                nodes.push(node);
                continue;
            }
            if self.starts_with("{@") {
                let node = self.parse_at_block()?;
                nodes.push(node);
                continue;
            }
            if self.starts_with("{:") || self.starts_with("{/") {
                if let Some(stops) = block_stops {
                    let boundary = self.parse_block_boundary()?;
                    if stops.iter().any(|s| std::mem::discriminant(s) == std::mem::discriminant(&boundary)) {
                        return Ok((nodes, Some(boundary)));
                    }
                    return Err(self.error(format!(
                        "unexpected block-tag tail: {:?}", boundary
                    )));
                }
                return Err(self.error(
                    "unexpected `{{:` or `{{/` outside of `{{#if}}` / `{{#each}}` block".to_string(),
                ));
            }

            if self.starts_with("</") {
                if let Some(expected) = closing_tag {
                    let found = self.parse_closing_tag_name()?;
                    if found == expected {
                        return Ok((nodes, None));
                    }

                    return Err(self.error(format!(
                        "mismatched closing tag: expected </{}>, found </{}>",
                        expected, found
                    )));
                }

                return Err(self.error("unexpected closing tag".to_string()));
            }

            if self.starts_with("<") {
                nodes.push(self.parse_element()?);
                continue;
            }

            self.parse_text_nodes(&mut nodes)?;
        }

        if let Some(expected) = closing_tag {
            return Err(self.error(format!("unclosed <{}> element", expected)));
        }
        if block_stops.is_some() {
            return Err(self.error("unclosed block-tag (expected `{/if}` or `{/each}`)".to_string()));
        }

        Ok((nodes, None))
    }

    /// Parse the opening of a block-tag: `{#if cond}` or `{#each list as item (key)}`.
    fn parse_block_tag_open(&mut self) -> Result<TemplateNode, CompileError> {
        self.expect("{#")?;
        // Read tag word (alphabetic) - either "if" or "each"
        let tag = self.read_word();
        match tag.as_str() {
            "if" => self.parse_if_block_body(),
            "each" => self.parse_each_block_body(),
            other => Err(self.error(format!(
                "unknown block-tag `{{#{}}}` — expected `{{#if}}` or `{{#each}}`",
                other
            ))),
        }
    }

    /// Body parser for `{#if cond}`. The `{#if` tokens have been consumed; this
    /// reads `cond` up to the matching `}` and recursively parses children.
    fn parse_if_block_body(&mut self) -> Result<TemplateNode, CompileError> {
        // Read condition expression up to closing `}` (brace-balanced).
        let cond = self.read_balanced_until_close_brace()?;
        let cond = cond.trim().to_string();
        if cond.is_empty() {
            return Err(self.error("`{#if}` requires a condition expression".to_string()));
        }

        // Recursively parse the body, watching for else/elseif/end markers.
        let stops = [
            BlockBoundary::ElseBranch,
            BlockBoundary::ElseIfBranch(String::new()),
            BlockBoundary::EndIf,
        ];
        let mut branches: Vec<(String, Vec<TemplateNode>)> = Vec::new();
        let mut current_cond = cond;

        loop {
            let (body, boundary) = self.parse_nodes_with_boundary(None, Some(&stops))?;
            branches.push((current_cond.clone(), body));
            match boundary {
                Some(BlockBoundary::EndIf) | None => break,
                Some(BlockBoundary::ElseBranch) => {
                    current_cond = String::new(); // empty marks the else branch
                    let stops_else = [BlockBoundary::EndIf];
                    let (body, _b) = self.parse_nodes_with_boundary(None, Some(&stops_else))?;
                    branches.push((current_cond.clone(), body));
                    break;
                }
                Some(BlockBoundary::ElseIfBranch(c)) => {
                    current_cond = c;
                }
                Some(other) => {
                    return Err(self.error(format!(
                        "unexpected boundary in `{{#if}}`: {:?}",
                        other
                    )));
                }
            }
        }

        Ok(TemplateNode::IfBlock { branches })
    }

    /// Body parser for `{#each list as item[, idx] [(key)]}`.
    fn parse_each_block_body(&mut self) -> Result<TemplateNode, CompileError> {
        let header = self.read_balanced_until_close_brace()?;
        let header = header.trim().to_string();
        if header.is_empty() {
            return Err(self.error("`{#each}` requires `list as item` header".to_string()));
        }

        // Parse: `<list-expr> as <item>[, <idx>] [(<key>)]`
        let (list_expr, item_alias, idx_alias, key_expr) = parse_each_header(&header)
            .map_err(|msg| self.error(msg))?;

        let stops = [BlockBoundary::Empty, BlockBoundary::EndEach];
        let (body, boundary) = self.parse_nodes_with_boundary(None, Some(&stops))?;
        let empty_body = match boundary {
            Some(BlockBoundary::Empty) => {
                let stops_empty = [BlockBoundary::EndEach];
                let (body, _) = self.parse_nodes_with_boundary(None, Some(&stops_empty))?;
                Some(body)
            }
            _ => None,
        };

        Ok(TemplateNode::EachBlock {
            list_expr,
            item_alias,
            idx_alias,
            key_expr,
            body,
            empty_body,
        })
    }

    /// Parse `{@html expr}` raw-HTML block.
    fn parse_at_block(&mut self) -> Result<TemplateNode, CompileError> {
        self.expect("{@")?;
        let tag = self.read_word();
        if tag != "html" {
            return Err(self.error(format!(
                "unknown `{{@{}}}` block — only `{{@html}}` is supported",
                tag
            )));
        }
        let expr = self.read_balanced_until_close_brace()?;
        let expr = expr.trim().to_string();
        if expr.is_empty() {
            return Err(self.error("`{@html}` requires an expression".to_string()));
        }
        Ok(TemplateNode::HtmlBlock { expr })
    }

    /// Parse a sibling-form block-tag tail: `{:else}`, `{:else if cond}`,
    /// `{:empty}`, `{/if}`, `{/each}`.
    fn parse_block_boundary(&mut self) -> Result<BlockBoundary, CompileError> {
        if self.starts_with("{/") {
            self.expect("{/")?;
            let tag = self.read_word();
            self.skip_whitespace();
            self.expect("}")?;
            return match tag.as_str() {
                "if" => Ok(BlockBoundary::EndIf),
                "each" => Ok(BlockBoundary::EndEach),
                other => Err(self.error(format!("unknown closing block-tag `{{/{}}}`", other))),
            };
        }
        // `{:else}`, `{:else if cond}`, `{:empty}`
        self.expect("{:")?;
        let word = self.read_word();
        self.skip_whitespace();
        match word.as_str() {
            "else" => {
                // either `{:else}` or `{:else if cond}`
                if self.starts_with("if") {
                    // consume `if`
                    self.pos += 2;
                    let cond = self.read_balanced_until_close_brace()?;
                    let cond = cond.trim().to_string();
                    if cond.is_empty() {
                        return Err(self.error("`{:else if}` requires a condition".to_string()));
                    }
                    Ok(BlockBoundary::ElseIfBranch(cond))
                } else {
                    self.expect("}")?;
                    Ok(BlockBoundary::ElseBranch)
                }
            }
            "empty" => {
                self.expect("}")?;
                Ok(BlockBoundary::Empty)
            }
            other => Err(self.error(format!("unknown sibling block-tag `{{:{}}}`", other))),
        }
    }

    /// Read text up to a closing `}`, respecting brace nesting. Consumes the
    /// closing `}` and returns the inner text.
    fn read_balanced_until_close_brace(&mut self) -> Result<String, CompileError> {
        let start = self.pos;
        let mut depth: usize = 0;
        while self.pos < self.input.len() {
            match self.input.as_bytes()[self.pos] {
                b'{' => {
                    depth += 1;
                    self.pos += 1;
                }
                b'}' => {
                    if depth == 0 {
                        let text = self.input[start..self.pos].to_string();
                        self.pos += 1;
                        return Ok(text);
                    }
                    depth -= 1;
                    self.pos += 1;
                }
                _ => self.pos += 1,
            }
        }
        Err(self.error("unclosed `{` in block-tag header".to_string()))
    }

    fn read_word(&mut self) -> String {
        let start = self.pos;
        while let Some(ch) = self.peek_char() {
            if ch.is_ascii_alphabetic() {
                self.pos += ch.len_utf8();
            } else {
                break;
            }
        }
        self.input[start..self.pos].to_string()
    }

    fn parse_element(&mut self) -> Result<TemplateNode, CompileError> {
        self.expect("<")?;

        // Detect <$macro-element> form: `$` immediately follows `<`
        let is_macro = self.starts_with("$");
        if is_macro {
            self.pos += 1; // skip `$`
        }

        let tag = self.read_tag_name();
        if tag.is_empty() {
            return Err(self.error("expected tag name".to_string()));
        }

        let attrs = self.parse_attrs()?;

        // C401: reject inline JSX in attribute curly values
        if let Some(err) = check_c401(&attrs) {
            return Err(err);
        }

        self.skip_whitespace();

        // HTML void elements and explicit self-closing `/>` both produce an element
        // with no children. Void elements never take a closing tag in HTML.
        const VOID_ELEMENTS: &[&str] = &[
            "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
            "source", "track", "wbr",
        ];

        let is_self_closing = self.starts_with("/>") || (!is_macro && VOID_ELEMENTS.contains(&tag.as_str()));

        if self.starts_with("/>") {
            self.pos += 2; // consume '/>'
        } else {
            self.expect(">")?;
        }

        if is_self_closing {
            if is_macro {
                return Ok(TemplateNode::MacroElement { name: tag, attrs, children: vec![] });
            }
            return Ok(TemplateNode::Element { tag, attrs, children: vec![] });
        }

        // The closing tag for a `<$foo>` is `</$foo>` — build the full name to match.
        let closing_name = if is_macro {
            format!("${}", tag)
        } else {
            tag.clone()
        };

        let children = self.parse_nodes(Some(&closing_name), None)?;

        if is_macro {
            // C400: mutual-exclusion check for <$suspense> and <$shield>
            if let Some(err) = check_c400(&tag, &attrs, &children) {
                return Err(err);
            }

            return Ok(TemplateNode::MacroElement {
                name: tag,
                attrs,
                children,
            });
        }

        // <slot> HTML form — DEPRECATED, emits same lowering as <$slot>
        if tag == "slot" {
            eprintln!(
                "DEPRECATED: <slot> HTML form is deprecated; use <$slot> instead"
            );
            return Ok(TemplateNode::MacroElement {
                name: "slot".to_string(),
                attrs,
                children,
            });
        }

        Ok(TemplateNode::Element {
            tag,
            attrs,
            children,
        })
    }

    fn parse_attrs(&mut self) -> Result<Vec<crate::types::Attr>, CompileError> {
        let mut attrs = Vec::new();

        loop {
            self.skip_whitespace();

            if self.starts_with(">") || self.starts_with("/>") {
                return Ok(attrs);
            }

            let attr_start = self.pos;
            let attr = self.read_attr_token()?;
            let parsed = parse_attr(&attr).map_err(|mut err| {
                err.line = self.line_at(attr_start);
                err.col = self.col_at(attr_start);
                err
            })?;
            attrs.push(parsed);
        }
    }

    fn parse_text_nodes(&mut self, nodes: &mut Vec<TemplateNode>) -> Result<(), CompileError> {
        while !self.is_eof() && !self.starts_with("<") {
            // B3 — block-tag forms (`{#`, `{:`, `{/`, `{@`) bubble back to the
            // caller so parse_nodes_with_boundary can dispatch them.
            if self.starts_with("{#")
                || self.starts_with("{:")
                || self.starts_with("{/")
                || self.starts_with("{@")
            {
                return Ok(());
            }

            if self.starts_with("{{") {
                nodes.push(self.parse_interpolation()?);
                continue;
            }

            // Single-brace expression interpolation: {expr}
            // Must start with `{` but not `{{` (already handled above).
            if self.starts_with("{") {
                nodes.push(self.parse_expr_interpolation()?);
                continue;
            }

            let next_tag = self.input[self.pos..]
                .find('<')
                .map(|offset| self.pos + offset);
            let next_interp = self.input[self.pos..]
                .find("{{")
                .map(|offset| self.pos + offset);
            let next_single_brace = self.input[self.pos..]
                .find('{')
                .map(|offset| self.pos + offset);

            let next_stop = match (next_tag, next_interp, next_single_brace) {
                (Some(tag), Some(interp), Some(brace)) => tag.min(interp).min(brace),
                (Some(tag), Some(interp), None) => tag.min(interp),
                (Some(tag), None, Some(brace)) => tag.min(brace),
                (None, Some(interp), Some(brace)) => interp.min(brace),
                (Some(tag), None, None) => tag,
                (None, Some(interp), None) => interp,
                (None, None, Some(brace)) => brace,
                (None, None, None) => self.input.len(),
            };

            let text = &self.input[self.pos..next_stop];
            if !text.is_empty() {
                nodes.push(TemplateNode::Text(text.to_string()));
            }
            self.pos = next_stop;
        }

        Ok(())
    }

    /// Parse a `{expr}` single-brace expression in template text content.
    /// The expr is returned as a raw string (no identifier validation).
    fn parse_expr_interpolation(&mut self) -> Result<TemplateNode, CompileError> {
        let start = self.pos;
        self.expect("{")?;
        // Read until matching `}`, respecting nesting.
        let mut depth = 1usize;
        let mut expr_end = self.pos;
        while expr_end < self.input.len() {
            match self.input.as_bytes()[expr_end] {
                b'{' => { depth += 1; expr_end += 1; }
                b'}' => {
                    depth -= 1;
                    if depth == 0 { break; }
                    expr_end += 1;
                }
                _ => expr_end += 1,
            }
        }
        if depth != 0 {
            return Err(self.error("unclosed '{' in expression interpolation".to_string()));
        }
        let expr = self.input[self.pos..expr_end].to_string();
        self.pos = expr_end + 1; // past the closing `}`
        let _ = start;
        Ok(TemplateNode::Interpolation(expr))
    }

    fn parse_interpolation(&mut self) -> Result<TemplateNode, CompileError> {
        let start = self.pos;
        self.expect("{{")?;
        let Some(end_rel) = self.input[self.pos..].find("}}") else {
            return Err(self.error("unclosed interpolation".to_string()));
        };
        let end = self.pos + end_rel + 2;
        let raw = &self.input[start..end];
        let identifier = validate_identifier(raw).map_err(|mut err| {
            err.line = self.line_at(start);
            err.col = self.col_at(start);
            err
        })?;
        self.pos = end;
        Ok(TemplateNode::Interpolation(identifier))
    }

    fn parse_closing_tag_name(&mut self) -> Result<String, CompileError> {
        self.expect("</")?;
        // Preserve `$` in closing tag name so it matches the opening-tag key
        // (e.g. `"$slot"` for `</$slot>`).
        let dollar = if self.starts_with("$") {
            self.pos += 1;
            "$"
        } else {
            ""
        };
        let tag = self.read_tag_name();
        self.skip_whitespace();
        self.expect(">")?;
        Ok(format!("{}{}", dollar, tag))
    }

    fn read_tag_name(&mut self) -> String {
        let start = self.pos;
        while let Some(ch) = self.peek_char() {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                self.pos += ch.len_utf8();
            } else {
                break;
            }
        }
        self.input[start..self.pos].to_string()
    }

    fn read_attr_token(&mut self) -> Result<String, CompileError> {
        let start = self.pos;
        let mut in_quote = false;
        let mut quote_char = '\0';
        let mut brace_depth: usize = 0;

        while let Some(ch) = self.peek_char() {
            if in_quote {
                self.pos += ch.len_utf8();
                if ch == quote_char {
                    in_quote = false;
                }
                continue;
            }

            if brace_depth > 0 {
                match ch {
                    '{' => {
                        brace_depth += 1;
                        self.pos += ch.len_utf8();
                    }
                    '}' => {
                        brace_depth -= 1;
                        self.pos += ch.len_utf8();
                    }
                    _ => {
                        self.pos += ch.len_utf8();
                    }
                }
                continue;
            }

            match ch {
                '"' | '\'' => {
                    in_quote = true;
                    quote_char = ch;
                    self.pos += ch.len_utf8();
                }
                '{' => {
                    brace_depth += 1;
                    self.pos += ch.len_utf8();
                }
                '>' => break,
                '/' if self.starts_with("/>") => break,
                ch if ch.is_whitespace() => break,
                _ => self.pos += ch.len_utf8(),
            }
        }

        if start == self.pos {
            return Err(self.error("expected attribute".to_string()));
        }

        Ok(self.input[start..self.pos].to_string())
    }

    fn skip_whitespace(&mut self) {
        while let Some(ch) = self.peek_char() {
            if ch.is_whitespace() {
                self.pos += ch.len_utf8();
            } else {
                break;
            }
        }
    }

    fn expect(&mut self, expected: &str) -> Result<(), CompileError> {
        if self.starts_with(expected) {
            self.pos += expected.len();
            Ok(())
        } else {
            Err(self.error(format!("expected '{}'", expected)))
        }
    }

    fn starts_with(&self, needle: &str) -> bool {
        self.input[self.pos..].starts_with(needle)
    }

    fn is_eof(&self) -> bool {
        self.pos >= self.input.len()
    }

    fn peek_char(&self) -> Option<char> {
        self.input[self.pos..].chars().next()
    }

    fn error(&self, message: String) -> CompileError {
        CompileError {
            message,
            line: self.line_at(self.pos),
            col: self.col_at(self.pos),
            ..Default::default()
        }
    }

    fn line_at(&self, pos: usize) -> usize {
        self.input[..pos]
            .bytes()
            .filter(|byte| *byte == b'\n')
            .count()
            + 1
    }

    fn col_at(&self, pos: usize) -> usize {
        let line_start = self.input[..pos]
            .rfind('\n')
            .map(|index| index + 1)
            .unwrap_or(0);
        self.input[line_start..pos].chars().count()
    }
}

/// Parse a `{#each}` header: `<list-expr> as <item>[, <idx>] [(<key-expr>)]`.
/// Returns `(list_expr, item_alias, idx_alias, key_expr)`.
///
/// `list-expr` may contain arbitrary expression syntax (parens, dots, lambdas)
/// — we tokenize by skipping balanced strings/parens/braces and locate the
/// first ` as ` outside of any nesting. The optional `(key)` is a parenthesized
/// expression at the very end (after balanced match — caller's parse_balanced
/// already accepted the body up to `}`, so the parenthesized key is still
/// inside `header`).
pub(crate) fn parse_each_header(
    header: &str,
) -> Result<(String, String, Option<String>, Option<String>), String> {
    // Split off optional ` (key)` from the end. We match the LAST balanced
    // `(...)` whose closing paren is the LAST non-whitespace char of header.
    let trimmed = header.trim();
    let (no_key_part, key_expr) = if trimmed.ends_with(')') {
        // Walk backwards to find the matching opening paren at depth 0.
        let bytes = trimmed.as_bytes();
        let mut depth: usize = 0;
        let mut open_idx: Option<usize> = None;
        for i in (0..bytes.len()).rev() {
            match bytes[i] {
                b')' => depth += 1,
                b'(' => {
                    depth -= 1;
                    if depth == 0 {
                        open_idx = Some(i);
                        break;
                    }
                }
                _ => {}
            }
        }
        if let Some(open) = open_idx {
            // Heuristic: the parenthesized expression at the end is the key
            // ONLY when the chars before `(` are whitespace (it's separated
            // from the iteration alias by ` `). If `(` directly follows a
            // non-space character, this is part of the list expression
            // (e.g. `{#each items.filter(p => p.ok) as p}`).
            let head_before = trimmed[..open].trim_end();
            let head_after = trimmed[..open].trim_end();
            if head_before.len() < trimmed[..open].len() {
                // there was whitespace between item alias and `(key)`
                let key = trimmed[open + 1..trimmed.len() - 1].trim().to_string();
                (head_after.to_string(), Some(key))
            } else {
                (trimmed.to_string(), None)
            }
        } else {
            (trimmed.to_string(), None)
        }
    } else {
        (trimmed.to_string(), None)
    };

    // Find ` as ` at top-level (not inside parens/strings/braces).
    let bytes = no_key_part.as_bytes();
    let mut depth_paren: usize = 0;
    let mut depth_brace: usize = 0;
    let mut depth_bracket: usize = 0;
    let mut in_string: Option<u8> = None;
    let mut as_pos: Option<usize> = None;
    let mut i = 0;
    while i + 4 <= bytes.len() {
        let c = bytes[i];
        if let Some(q) = in_string {
            if c == b'\\' && i + 1 < bytes.len() {
                i += 2;
                continue;
            }
            if c == q {
                in_string = None;
            }
            i += 1;
            continue;
        }
        match c {
            b'\'' | b'"' | b'`' => in_string = Some(c),
            b'(' => depth_paren += 1,
            b')' => depth_paren = depth_paren.saturating_sub(1),
            b'{' => depth_brace += 1,
            b'}' => depth_brace = depth_brace.saturating_sub(1),
            b'[' => depth_bracket += 1,
            b']' => depth_bracket = depth_bracket.saturating_sub(1),
            b' ' if depth_paren == 0
                && depth_brace == 0
                && depth_bracket == 0
                && bytes.get(i + 1) == Some(&b'a')
                && bytes.get(i + 2) == Some(&b's')
                && bytes.get(i + 3) == Some(&b' ') =>
            {
                as_pos = Some(i);
                break;
            }
            _ => {}
        }
        i += 1;
    }

    let Some(as_at) = as_pos else {
        return Err("`{#each}` header must contain ` as ` separator".to_string());
    };

    let list_expr = no_key_part[..as_at].trim().to_string();
    let rest = no_key_part[as_at + 4..].trim();
    if list_expr.is_empty() || rest.is_empty() {
        return Err("`{#each}` requires non-empty list and item alias".to_string());
    }
    let (item_alias, idx_alias) = if let Some((item, idx)) = rest.split_once(',') {
        (item.trim().to_string(), Some(idx.trim().to_string()))
    } else {
        (rest.to_string(), None)
    };
    Ok((list_expr, item_alias, idx_alias, key_expr))
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::TemplateNode;

    #[test]
    fn block_if_simple() {
        let nodes = parse_template("{#if cond}<span>x</span>{/if}").unwrap();
        assert_eq!(nodes.len(), 1);
        match &nodes[0] {
            TemplateNode::IfBlock { branches } => {
                assert_eq!(branches.len(), 1);
                assert_eq!(branches[0].0, "cond");
                assert_eq!(branches[0].1.len(), 1);
            }
            other => panic!("expected IfBlock, got {:?}", other),
        }
    }

    #[test]
    fn block_if_else() {
        let nodes = parse_template("{#if a}A{:else}B{/if}").unwrap();
        match &nodes[0] {
            TemplateNode::IfBlock { branches } => {
                assert_eq!(branches.len(), 2);
                assert_eq!(branches[0].0, "a");
                assert_eq!(branches[1].0, ""); // empty marks else
            }
            _ => panic!("expected IfBlock"),
        }
    }

    #[test]
    fn block_if_elseif_chain() {
        let nodes = parse_template("{#if a}A{:else if b}B{:else if c}C{:else}D{/if}").unwrap();
        match &nodes[0] {
            TemplateNode::IfBlock { branches } => {
                assert_eq!(branches.len(), 4);
                assert_eq!(branches[0].0, "a");
                assert_eq!(branches[1].0, "b");
                assert_eq!(branches[2].0, "c");
                assert_eq!(branches[3].0, "");
            }
            _ => panic!("expected IfBlock"),
        }
    }

    #[test]
    fn block_each_simple() {
        let nodes = parse_template("{#each xs as x}<li>{x}</li>{/each}").unwrap();
        match &nodes[0] {
            TemplateNode::EachBlock {
                list_expr,
                item_alias,
                idx_alias,
                key_expr,
                ..
            } => {
                assert_eq!(list_expr, "xs");
                assert_eq!(item_alias, "x");
                assert_eq!(idx_alias, &None);
                assert_eq!(key_expr, &None);
            }
            _ => panic!("expected EachBlock"),
        }
    }

    #[test]
    fn block_each_with_key() {
        let nodes = parse_template("{#each items as i (i.id)}<li>x</li>{/each}").unwrap();
        match &nodes[0] {
            TemplateNode::EachBlock {
                list_expr,
                item_alias,
                key_expr,
                ..
            } => {
                assert_eq!(list_expr, "items");
                assert_eq!(item_alias, "i");
                assert_eq!(key_expr.as_deref(), Some("i.id"));
            }
            _ => panic!("expected EachBlock"),
        }
    }

    #[test]
    fn block_each_with_idx_and_key() {
        let nodes = parse_template("{#each xs as item, idx (item.id)}<li>x</li>{/each}").unwrap();
        match &nodes[0] {
            TemplateNode::EachBlock {
                item_alias,
                idx_alias,
                key_expr,
                ..
            } => {
                assert_eq!(item_alias, "item");
                assert_eq!(idx_alias.as_deref(), Some("idx"));
                assert_eq!(key_expr.as_deref(), Some("item.id"));
            }
            _ => panic!("expected EachBlock"),
        }
    }

    #[test]
    fn block_each_lambda_lhs() {
        // The hidden landmine: lambda LHS should fit unhoisted in block-tag header.
        let nodes = parse_template(
            "{#each events.filter(e => e.ok) as evt (evt.id)}<li>x</li>{/each}",
        )
        .unwrap();
        match &nodes[0] {
            TemplateNode::EachBlock { list_expr, item_alias, key_expr, .. } => {
                assert_eq!(list_expr, "events.filter(e => e.ok)");
                assert_eq!(item_alias, "evt");
                assert_eq!(key_expr.as_deref(), Some("evt.id"));
            }
            _ => panic!("expected EachBlock"),
        }
    }

    #[test]
    fn block_each_with_empty() {
        let nodes = parse_template("{#each xs as x}<li>x</li>{:empty}none{/each}").unwrap();
        match &nodes[0] {
            TemplateNode::EachBlock { empty_body, .. } => {
                assert!(empty_body.is_some());
            }
            _ => panic!("expected EachBlock"),
        }
    }

    #[test]
    fn block_html_simple() {
        let nodes = parse_template("{@html foo}").unwrap();
        match &nodes[0] {
            TemplateNode::HtmlBlock { expr } => assert_eq!(expr, "foo"),
            _ => panic!("expected HtmlBlock"),
        }
    }

    #[test]
    fn block_if_unclosed_errors() {
        let err = parse_template("{#if a}body").unwrap_err();
        assert!(err.message.contains("unclosed"));
    }

    #[test]
    fn block_each_missing_as_errors() {
        let err = parse_template("{#each items}body{/each}").unwrap_err();
        assert!(err.message.contains("as"));
    }
}
