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
    parser.parse_nodes(None)
}

struct Parser<'a> {
    input: &'a str,
    pos: usize,
}

impl<'a> Parser<'a> {
    fn parse_nodes(
        &mut self,
        closing_tag: Option<&str>,
    ) -> Result<Vec<TemplateNode>, CompileError> {
        let mut nodes = Vec::new();

        while !self.is_eof() {
            if self.starts_with("</") {
                if let Some(expected) = closing_tag {
                    let found = self.parse_closing_tag_name()?;
                    if found == expected {
                        return Ok(nodes);
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

        Ok(nodes)
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
        if self.starts_with("/>") {
            return Err(
                self.error("self-closing tags are not supported in v0 template parser".to_string())
            );
        }

        self.expect(">")?;

        // The closing tag for a `<$foo>` is `</$foo>` — build the full name to match.
        let closing_name = if is_macro {
            format!("${}", tag)
        } else {
            tag.clone()
        };

        let children = self.parse_nodes(Some(&closing_name))?;

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
