use crate::parser::directives::{parse_attr, validate_identifier};
use crate::types::{CompileError, TemplateNode};

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
        let tag = self.read_tag_name();
        if tag.is_empty() {
            return Err(self.error("expected tag name".to_string()));
        }

        let attrs = self.parse_attrs()?;

        self.skip_whitespace();
        if self.starts_with("/>") {
            return Err(
                self.error("self-closing tags are not supported in v0 template parser".to_string())
            );
        }

        self.expect(">")?;

        let children = self.parse_nodes(Some(&tag))?;

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

            let next_tag = self.input[self.pos..]
                .find('<')
                .map(|offset| self.pos + offset);
            let next_interp = self.input[self.pos..]
                .find("{{")
                .map(|offset| self.pos + offset);

            let next_stop = match (next_tag, next_interp) {
                (Some(tag), Some(interp)) => tag.min(interp),
                (Some(tag), None) => tag,
                (None, Some(interp)) => interp,
                (None, None) => self.input.len(),
            };

            let text = &self.input[self.pos..next_stop];
            if !text.is_empty() {
                nodes.push(TemplateNode::Text(text.to_string()));
            }
            self.pos = next_stop;
        }

        Ok(())
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
        let tag = self.read_tag_name();
        self.skip_whitespace();
        self.expect(">")?;
        Ok(tag)
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

        while let Some(ch) = self.peek_char() {
            if in_quote {
                self.pos += ch.len_utf8();
                if ch == quote_char {
                    in_quote = false;
                }
                continue;
            }

            match ch {
                '"' | '\'' => {
                    in_quote = true;
                    quote_char = ch;
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
