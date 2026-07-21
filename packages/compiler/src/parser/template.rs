use crate::parser::directives::parse_attr;
use crate::types::{Attr, CompileError, MacroValue, TemplateNode};

// ─── Grammar v2 (40-spec) — naked framework elements ─────────────────────────
//
// §2.5: the framework claims naked single-word elements forever, because user
// components MUST be hyphenated (custom-element platform rule). `<group>` is
// the new invisible fragment carrier; `<slot>` becomes THE projection form
// (the v1 `<slot>`-deprecation warning is inverted). The remaining rows are
// the v1 `<$…>` vocabulary carried through the one rule by stripping `$`
// ([R→] — incl. guard/warp and the a11y primitives, which the corpus uses).
pub(crate) const FRAMEWORK_ELEMENTS: &[&str] = &[
    "group", "slot", "suspense", "shield", "outlet", "router", "navigate",
    // [R→] rule-carried boundary + a11y vocabulary (v1 `<$guard>`, `<$warp>`,
    // `<$focusTrap>`, `<$liveRegion>`, `<$visuallyHidden>`, `<$skipLink>`).
    "guard", "warp", "focusTrap", "liveRegion", "visuallyHidden", "skipLink",
];

// ─── C400 / C401 compile-error codes ─────────────────────────────────────────

/// Check for C400: `<suspense>` or `<shield>` with BOTH a `fallback="..."` attr
/// AND a `<slot name="fallback">` child.
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
                "C400: conflicting fallback definitions — use either fallback=\"...\" attribute or <slot name=\"fallback\"> child, not both"
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
            Attr::Binding { expr, .. } => expr.as_str(),
            _ => continue,
        };
        let trimmed = inner.trim_start();
        if trimmed.starts_with('<') {
            return Some(CompileError {
                message:
                    "C401: inline JSX in attributes is not supported; extract to a component or use a <slot> child instead"
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
    let nodes = parser.parse_nodes(None)?;
    assemble_control_chains(nodes)
}

struct Parser<'a> {
    input: &'a str,
    pos: usize,
}

impl<'a> Parser<'a> {
    /// Parse children until a closing element tag matches `closing_tag`.
    /// When parsing the top-level template, `closing_tag` is None.
    fn parse_nodes(
        &mut self,
        closing_tag: Option<&str>,
    ) -> Result<Vec<TemplateNode>, CompileError> {
        let mut nodes = Vec::new();

        while !self.is_eof() {
            // §4 retirement — the v1 block-tag grammar is a compile error.
            if self.starts_with("{#") {
                return Err(self.block_open_retired());
            }
            if self.starts_with("{@") {
                return Err(self.at_block_retired());
            }
            if self.starts_with("{:") || self.starts_block_tail() {
                return Err(self.block_tail_retired());
            }

            // HTML comments (`<!-- … -->`) are authoring annotations — parse
            // and drop them so they never reach the compiled output.
            if self.starts_with("<!--") {
                self.skip_html_comment()?;
                continue;
            }

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

    /// Snippet of the source at `pos` for a `from:` diagnostic anchor —
    /// through the matching `}` when one exists, else up to 40 chars/EOL.
    fn brace_snippet(&self) -> String {
        let rest = &self.input[self.pos..];
        if let Some(close) =
            crate::parser::expr_scan::find_matching_close_brace(self.input, self.pos + 1)
        {
            return self.input[self.pos..=close].to_string();
        }
        let end = rest
            .char_indices()
            .take_while(|(i, c)| *i < 40 && *c != '\n')
            .last()
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(0);
        rest[..end].to_string()
    }

    /// Read the keyword after a 2-byte opener (`{#`, `{@`, `{:`) at `pos`.
    fn block_word(&self) -> String {
        let start = self.pos + 2;
        let mut end = start;
        let bytes = self.input.as_bytes();
        while end < bytes.len()
            && (bytes[end].is_ascii_alphabetic())
        {
            end += 1;
        }
        self.input[start..end].to_string()
    }

    /// C601/C602 — `{#if}` / `{#each}` blocks are retired.
    fn block_open_retired(&self) -> CompileError {
        let word = self.block_word();
        let from = self.brace_snippet();
        match word.as_str() {
            "each" => self.retired_error(
                "C602",
                "`{#each}` blocks are removed — control flow attaches to the element it governs",
                "rewrite as `each={item, i of list} key={keyExpr}` on the repeated element \
                 (or `<group>`); move the `{:empty}` body to an `empty` sibling",
                from,
                Some("each={item of list}".to_string()),
            ),
            _ => self.retired_error(
                "C601",
                "`{#if}` blocks are removed — control flow attaches to the element it governs",
                "rewrite as attribute control flow: `if={e}` on the governed element, \
                 `elseif={e}`/`else` on immediate siblings; wrap multi-element branches \
                 in `<group>`",
                from,
                Some("if={expr}".to_string()),
            ),
        }
    }

    /// C603 — `{@html}` (and every `{@…}` block) is retired.
    fn at_block_retired(&self) -> CompileError {
        let word = self.block_word();
        let from = self.brace_snippet();
        self.retired_error(
            "C603",
            &format!(
                "`{{@{}}}` blocks are removed — braces mean expression; `{{@…}}` is not one",
                word
            ),
            "use the `html={expr}` attribute on the containing element",
            from,
            Some("html={expr}".to_string()),
        )
    }

    /// C601/C602 — orphan v1 block tails (`{:else}`, `{:empty}`, `{/if}`, `{/each}`).
    fn block_tail_retired(&self) -> CompileError {
        let word = if self.starts_with("{/") {
            // `{/ if }` — whitespace-tolerant tail shape.
            let rest = &self.input[self.pos + 2..];
            rest.trim_start()
                .chars()
                .take_while(|c| c.is_ascii_alphabetic())
                .collect::<String>()
        } else {
            self.block_word()
        };
        let from = self.brace_snippet();
        match word.as_str() {
            "each" | "empty" => self.retired_error(
                "C602",
                "`{#each}` block tags are removed — control flow attaches to the element it governs",
                "rewrite as `each={item, i of list}` on the repeated element (or `<group>`); \
                 move the `{:empty}` body to an `empty` sibling",
                from,
                Some("each={item of list}".to_string()),
            ),
            _ => self.retired_error(
                "C601",
                "`{#if}` block tags are removed — control flow attaches to the element it governs",
                "rewrite as attribute control flow: `if={e}` on the governed element, \
                 `elseif={e}`/`else` on immediate siblings; wrap multi-element branches \
                 in `<group>`",
                from,
                Some("if={expr}".to_string()),
            ),
        }
    }

    /// C604 — the v0 `{{ident}}` double-brace interpolation is retired.
    fn double_brace_retired(&self) -> CompileError {
        let from = self.brace_snippet();
        self.retired_error(
            "C604",
            "`{{…}}` double-brace interpolation is removed — braces mean expression, \
             single-brace only",
            "use single braces `{ident}`; an expression starting with an object literal \
             needs a space: `{ {…} }`",
            from,
            Some("{expr}".to_string()),
        )
    }

    fn retired_error(
        &self,
        code: &str,
        message: &str,
        fix: &str,
        from: String,
        to: Option<String>,
    ) -> CompileError {
        CompileError {
            message: format!("{}: {}. fix: {}.", code, message, fix),
            code: Some(code.to_string()),
            hint: Some(
                "grammar v2 is prefix-less: naked keywords + naked HTML attributes + \
                 naked framework vocabulary; `{expr}` braces mean expression"
                    .to_string(),
            ),
            fix: Some(fix.to_string()),
            from: Some(from),
            to,
            ..self.error(String::new())
        }
    }

    /// C605/C608/C609 — `<$…>` macro elements are retired.
    fn macro_element_retired(&self, tag: &str, at: usize) -> CompileError {
        let (code, to, fix): (&str, String, String) = match tag {
            "if" | "else" => (
                "C605",
                format!("{}={{…}}", tag),
                "use `if={…}` / `else` attributes on the governed element".to_string(),
            ),
            "link" => (
                "C608",
                "<a href={…} prefetch=\"…\">".to_string(),
                "use `<a href={…} prefetch=\"…\">` — `<a>` carries the SPA navigation, \
                 `prefetch`, `replace`, and `aria-current` behaviors; `replace` carries \
                 over; add `reload` to opt out of SPA navigation"
                    .to_string(),
            ),
            other => (
                "C609",
                format!("<{}>", other),
                format!(
                    "framework elements are naked words — use `<{}>` (`<$slot>` → `<slot>`, \
                     `<$suspense>` → `<suspense>`, `<$shield>` → `<shield>`, \
                     `<$outlet>` → `<outlet>`, `<$router>` → `<router>`, \
                     `<$navigate>` → `<navigate>`)",
                    other
                ),
            ),
        };
        let mut err = CompileError {
            message: format!(
                "{}: `<${}>` is removed — no element may begin with `$`. fix: {}.",
                code, tag, fix
            ),
            code: Some(code.to_string()),
            hint: Some(
                "grammar v2 is prefix-less: framework elements are naked single words \
                 (`<group>`, `<suspense>`, `<slot>`, …); `$` belongs to `@state` macros only"
                    .to_string(),
            ),
            fix: Some(fix),
            from: Some(format!("<${}>", tag)),
            to: Some(to),
            ..Default::default()
        };
        err.line = self.line_at(at);
        err.col = self.col_at(at);
        err
    }

    fn parse_element(&mut self) -> Result<TemplateNode, CompileError> {
        let elem_start = self.pos;
        self.expect("<")?;

        // `<$macro-element>` form is retired (C605/C608/C609).
        if self.starts_with("$") {
            self.pos += 1; // skip `$` to read the name for the diagnostic
            let tag = self.read_tag_name();
            return Err(self.macro_element_retired(&tag, elem_start));
        }

        let tag = self.read_tag_name();
        if tag.is_empty() {
            return Err(self.error("expected tag name".to_string()));
        }

        // §2.5 — naked framework elements lower as macro boundaries.
        let is_framework = FRAMEWORK_ELEMENTS.contains(&tag.as_str());

        // §2.8 protection (C611) — a non-hyphenated tag must be a known HTML
        // element, a framework word, or a component reference (hyphen /
        // PascalCase). Anything else can never silently reach the DOM.
        if !is_framework
            && !crate::tags::is_component_tag(&tag)
            && !crate::tags::is_known_html_element(&tag)
        {
            let mut err = CompileError {
                message: format!(
                    "C611: unknown element `<{}>` — framework elements are `<group>`, \
                     `<suspense>`, `<slot>`, `<shield>`, `<outlet>`, `<router>`, \
                     `<navigate>`; components must be hyphenated (custom-element rule)",
                    tag
                ),
                code: Some("C611".to_string()),
                hint: Some(
                    "a non-hyphenated tag can never be a user component, so an unknown \
                     one is always a typo or an unsupported framework word"
                        .to_string(),
                ),
                fix: Some(format!(
                    "fix the typo, or rename the component to a hyphenated tag \
                     (e.g. `<x-{}>`)",
                    tag
                )),
                from: Some(format!("<{}>", tag)),
                ..Default::default()
            };
            err.line = self.line_at(elem_start);
            err.col = self.col_at(elem_start);
            return Err(err);
        }

        // Element-kind discriminator: plain-HTML rules (boolean-attr W602)
        // apply only to standard HTML elements. Components and framework
        // elements take prop-passing semantics.
        let is_html_element = !is_framework && !crate::tags::is_component_tag(&tag);

        let attrs = self.parse_attrs(is_html_element)?;

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

        let is_self_closing =
            self.starts_with("/>") || (!is_framework && VOID_ELEMENTS.contains(&tag.as_str()));

        if self.starts_with("/>") {
            self.pos += 2; // consume '/>'
        } else {
            self.expect(">")?;
        }

        if is_self_closing {
            if is_framework {
                return Ok(TemplateNode::MacroElement { name: tag, attrs, children: vec![] });
            }
            return Ok(TemplateNode::Element { tag, attrs, children: vec![] });
        }

        let children = self.parse_nodes(Some(&tag))?;

        if is_framework {
            // C400: mutual-exclusion check for <suspense> and <shield>
            if let Some(err) = check_c400(&tag, &attrs, &children) {
                return Err(err);
            }

            return Ok(TemplateNode::MacroElement {
                name: tag,
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

    fn parse_attrs(&mut self, is_html_element: bool) -> Result<Vec<crate::types::Attr>, CompileError> {
        let mut attrs = Vec::new();

        loop {
            self.skip_whitespace();

            if self.starts_with(">") || self.starts_with("/>") {
                return Ok(attrs);
            }

            let attr_start = self.pos;
            let attr = self.read_attr_token()?;
            let parsed = parse_attr(&attr, is_html_element).map_err(|mut err| {
                err.line = self.line_at(attr_start);
                err.col = self.col_at(attr_start);
                err
            })?;
            attrs.push(parsed);
        }
    }

    fn parse_text_nodes(&mut self, nodes: &mut Vec<TemplateNode>) -> Result<(), CompileError> {
        while !self.is_eof() && !self.starts_with("<") {
            // Retired v1 block-tag forms bubble back to the caller, which
            // reports the precise C601/C602/C603 diagnostic.
            if self.starts_with("{#")
                || self.starts_with("{:")
                || self.starts_with("{@")
                || self.starts_block_tail()
            {
                return Ok(());
            }

            // C604 — `{{…}}` double-brace interpolation is retired.
            if self.starts_with("{{") {
                return Err(self.double_brace_retired());
            }

            // Single-brace expression interpolation: {expr}
            if self.starts_with("{") {
                nodes.push(self.parse_expr_interpolation()?);
                continue;
            }

            let next_tag = self.input[self.pos..]
                .find('<')
                .map(|offset| self.pos + offset);
            let next_brace = self.input[self.pos..]
                .find('{')
                .map(|offset| self.pos + offset);

            let next_stop = match (next_tag, next_brace) {
                (Some(tag), Some(brace)) => tag.min(brace),
                (Some(tag), None) => tag,
                (None, Some(brace)) => brace,
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

    /// Parse a `{expr}` single-brace expression in template text content.
    /// The expr is returned as a raw string (no identifier validation).
    /// Boundary detection is lexically aware (shared scanner): `}` inside
    /// strings, template literals (incl. `${…}` holes), comments, and regex
    /// literals never ends the expression.
    fn parse_expr_interpolation(&mut self) -> Result<TemplateNode, CompileError> {
        self.expect("{")?;
        let Some(close) = crate::parser::expr_scan::find_matching_close_brace(self.input, self.pos)
        else {
            return Err(self.error_with_help(
                "unclosed `{` in template expression".to_string(),
                "template expressions are single JS expressions — member access, \
                 calls, method chains, ternaries, arrows, template literals, regex, \
                 object/array literals; strings and comments are understood, so an \
                 unterminated string or template literal here also triggers this error"
                    .to_string(),
                "close the expression with `}`, or hoist complex logic into \
                 `$computed` and reference the computed name here"
                    .to_string(),
            ));
        };
        let expr = self.input[self.pos..close].to_string();
        self.pos = close + 1; // past the closing `}`
        Ok(TemplateNode::Interpolation(expr))
    }

    fn parse_closing_tag_name(&mut self) -> Result<String, CompileError> {
        self.expect("</")?;
        // A `</$name>` closing tag is part of the retired `<$…>` grammar; the
        // opening tag errors first in well-formed input, but keep the `$` so
        // a stray one reports a precise mismatch.
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
                '{' => {
                    // Delegate the whole `{…}` region to the shared scanner so
                    // quotes, template literals, comments, and regex INSIDE the
                    // braces are lexically understood (fixes `title={'}'}`,
                    // which the old depth-only counter tore apart).
                    match crate::parser::expr_scan::find_matching_close_brace(
                        self.input,
                        self.pos + 1,
                    ) {
                        Some(close) => self.pos = close + 1,
                        // Unclosed `{…}` — consume the rest; parse_attr's
                        // brace extraction reports the unclosed error (C301/C303).
                        None => self.pos = self.input.len(),
                    }
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

    /// Classify a `{/…` sequence: it is block-tail-SHAPED only when it reads
    /// `{/` ws* word ws* `}` (`{/if}`, `{/each}`, `{/ if }`, and typos like
    /// `{/for}`). Anything else — `{//` and `{/*` comments and the whole
    /// lexical class, e.g. `{/^a/.test(x)}` regex literals — is an expression
    /// that happens to start with `/` and falls through to expression
    /// parsing, where the shared scanner understands it.
    fn starts_block_tail(&self) -> bool {
        crate::parser::expr_scan::block_tail_close(self.input, self.pos).is_some()
    }

    /// Skip an HTML comment (`<!-- … -->`). Comments carry authoring intent
    /// only; they are dropped from the compiled template.
    fn skip_html_comment(&mut self) -> Result<(), CompileError> {
        debug_assert!(self.starts_with("<!--"));
        self.pos += 4; // consume `<!--`
        match self.input[self.pos..].find("-->") {
            Some(rel) => {
                self.pos += rel + 3; // consume up to and including `-->`
                Ok(())
            }
            None => Err(self.error("unclosed HTML comment (missing `-->`)".to_string())),
        }
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

    /// Like `error`, but with the rich-diagnostic `hint`/`fix` fields set
    /// (rendered by `bin/main.rs::render_human_error`).
    fn error_with_help(&self, message: String, hint: String, fix: String) -> CompileError {
        CompileError {
            hint: Some(hint),
            fix: Some(fix),
            ..self.error(message)
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

// ─── §3.1 adjacency — chain assembly for elseif/else/empty ───────────────────

fn attrs_of(node: &TemplateNode) -> Option<&Vec<Attr>> {
    match node {
        TemplateNode::Element { attrs, .. } | TemplateNode::MacroElement { attrs, .. } => {
            Some(attrs)
        }
        _ => None,
    }
}

fn attrs_of_mut(node: &mut TemplateNode) -> Option<&mut Vec<Attr>> {
    match node {
        TemplateNode::Element { attrs, .. } | TemplateNode::MacroElement { attrs, .. } => {
            Some(attrs)
        }
        _ => None,
    }
}

fn has_macro(attrs: &[Attr], name: &str) -> bool {
    attrs
        .iter()
        .any(|a| matches!(a, Attr::Macro { name: n, .. } if n == name))
}

/// Remove and return the macro attr `name` from the element's attrs.
fn take_macro(node: &mut TemplateNode, name: &str) -> Option<MacroValue> {
    let attrs = attrs_of_mut(node)?;
    let idx = attrs
        .iter()
        .position(|a| matches!(a, Attr::Macro { name: n, .. } if n == name))?;
    match attrs.remove(idx) {
        Attr::Macro { value, .. } => Some(value),
        _ => None,
    }
}

fn tag_of(node: &TemplateNode) -> String {
    match node {
        TemplateNode::Element { tag, .. } => tag.clone(),
        TemplateNode::MacroElement { name, .. } => name.clone(),
        TemplateNode::Text(_) => "#text".to_string(),
        TemplateNode::Interpolation(_) => "{…}".to_string(),
        TemplateNode::IfBlock { .. } => "if-chain".to_string(),
        TemplateNode::EachBlock { .. } => "each".to_string(),
        TemplateNode::HtmlBlock { .. } => "html".to_string(),
    }
}

fn c610(marker: &str, detail: String) -> CompileError {
    CompileError {
        message: format!(
            "C610: `{}` must sit on the immediately-following element sibling of its chain \
             head — {}. fix: move the branch element directly after its chain head; only \
             whitespace and comments may sit between.",
            marker, detail
        ),
        code: Some("C610".to_string()),
        hint: Some(
            "`elseif`/`else` chain onto the preceding `if`/`elseif` element; `empty` \
             chains onto the preceding `each` element (Marko's adjacency model)"
                .to_string(),
        ),
        fix: Some(
            "move the branch element directly after its chain head; only whitespace/comments \
             may sit between"
                .to_string(),
        ),
        from: Some(marker.to_string()),
        ..Default::default()
    }
}

fn macro_value_text(v: &MacroValue) -> String {
    match v {
        MacroValue::Curly(s) | MacroValue::Quoted(s) => s.clone(),
        MacroValue::Boolean => String::new(),
    }
}

/// §2.3/§3.1 — assemble `if`/`elseif`/`else` element chains into `IfBlock`
/// nodes and `each` + `empty` sibling pairs into `EachBlock` nodes. Elements
/// carrying a lone `if` or `each` stay in attribute form (they lower through
/// `emit_macro_effects`, byte-compatible with the v1 `$if`/`$each` output).
pub(crate) fn assemble_control_chains(
    nodes: Vec<TemplateNode>,
) -> Result<Vec<TemplateNode>, CompileError> {
    let mut out: Vec<TemplateNode> = Vec::new();

    for node in nodes {
        // Recurse into children first.
        let mut node = match node {
            TemplateNode::Element { tag, attrs, children } => TemplateNode::Element {
                tag,
                attrs,
                children: assemble_control_chains(children)?,
            },
            TemplateNode::MacroElement { name, attrs, children } => TemplateNode::MacroElement {
                name,
                attrs,
                children: assemble_control_chains(children)?,
            },
            other => other,
        };

        let marker = match attrs_of(&node) {
            Some(attrs) => {
                let m = [
                    has_macro(attrs, "elseif"),
                    has_macro(attrs, "else"),
                    has_macro(attrs, "empty"),
                ];
                let count = m.iter().filter(|b| **b).count()
                    + usize::from(m[0] || m[1]) * usize::from(has_macro(attrs, "if"));
                if count > 1 {
                    return Err(c610(
                        "elseif/else",
                        format!(
                            "`<{}>` carries more than one chain marker (`if`/`elseif`/`else`/`empty` \
                             are mutually exclusive on one element)",
                            tag_of(&node)
                        ),
                    ));
                }
                if m[0] {
                    Some("elseif")
                } else if m[1] {
                    Some("else")
                } else if m[2] {
                    Some("empty")
                } else {
                    None
                }
            }
            None => None,
        };

        let Some(marker) = marker else {
            out.push(node);
            continue;
        };

        // Walk back over interstitial whitespace-only text (comments were
        // dropped at parse). Anything else between chain members is C610.
        let mut dropped_ws = 0usize;
        while matches!(out.last(), Some(TemplateNode::Text(t)) if t.trim().is_empty()) {
            out.pop();
            dropped_ws += 1;
        }
        let _ = dropped_ws;

        let Some(mut prev) = out.pop() else {
            return Err(c610(
                marker,
                format!(
                    "`<{} {}>` has no preceding element to chain from",
                    tag_of(&node),
                    marker
                ),
            ));
        };

        match marker {
            "elseif" | "else" => {
                let cond = match take_macro(&mut node, marker) {
                    Some(v) => macro_value_text(&v),
                    None => String::new(),
                };

                // Continuation: the previous node is an already-assembled chain.
                if let TemplateNode::IfBlock { mut branches } = prev {
                    let closed = branches
                        .last()
                        .map(|(c, _)| c.is_empty())
                        .unwrap_or(false);
                    if closed {
                        return Err(c610(
                            marker,
                            format!(
                                "the chain before `<{}>` is already closed by an `else` branch",
                                tag_of(&node)
                            ),
                        ));
                    }
                    branches.push((cond, vec![node]));
                    out.push(TemplateNode::IfBlock { branches });
                    continue;
                }

                // Chain start: the previous node must be an element carrying `if`.
                let prev_is_head = attrs_of(&prev).is_some_and(|a| has_macro(a, "if"));
                if !prev_is_head {
                    return Err(c610(
                        marker,
                        format!(
                            "the immediately preceding sibling `<{}>` does not carry `if` \
                             (found `<{} {}>` after it)",
                            tag_of(&prev),
                            tag_of(&node),
                            marker
                        ),
                    ));
                }
                if attrs_of(&prev).is_some_and(|a| has_macro(a, "each")) {
                    return Err(c610(
                        marker,
                        format!(
                            "`<{}>` carries both `if` and `each` — a looped element cannot \
                             head an `elseif`/`else` chain (the `if` evaluates per item)",
                            tag_of(&prev)
                        ),
                    ));
                }
                let head_cond = take_macro(&mut prev, "if")
                    .map(|v| macro_value_text(&v))
                    .unwrap_or_default();
                out.push(TemplateNode::IfBlock {
                    branches: vec![(head_cond, vec![prev]), (cond, vec![node])],
                });
            }
            "empty" => {
                take_macro(&mut node, "empty");

                if matches!(prev, TemplateNode::EachBlock { .. }) {
                    return Err(c610(
                        marker,
                        format!(
                            "the `each` before `<{}>` already has an `empty` sibling",
                            tag_of(&node)
                        ),
                    ));
                }
                let prev_is_each = attrs_of(&prev).is_some_and(|a| has_macro(a, "each"));
                if !prev_is_each {
                    return Err(c610(
                        marker,
                        format!(
                            "the immediately preceding sibling `<{}>` does not carry `each` \
                             (found `<{} empty>` after it)",
                            tag_of(&prev),
                            tag_of(&node)
                        ),
                    ));
                }

                let head_text = take_macro(&mut prev, "each")
                    .map(|v| macro_value_text(&v))
                    .unwrap_or_default();
                let head = crate::parser::directives::parse_each_of_head(&head_text)
                    .map_err(|msg| CompileError {
                        message: msg,
                        code: Some("C302".to_string()),
                        ..Default::default()
                    })?;
                let key_expr = take_macro(&mut prev, "key").map(|v| macro_value_text(&v));

                out.push(TemplateNode::EachBlock {
                    list_expr: head.list,
                    item_alias: head.item,
                    idx_alias: head.idx,
                    key_expr,
                    body: vec![prev],
                    empty_body: Some(vec![node]),
                });
            }
            _ => unreachable!(),
        }
    }

    Ok(out)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::TemplateNode;

    #[test]
    fn html_comment_dropped_top_level() {
        let nodes = parse_template("<!-- note --><span>x</span>").unwrap();
        assert_eq!(nodes.len(), 1);
        match &nodes[0] {
            TemplateNode::Element { tag, .. } => assert_eq!(tag, "span"),
            other => panic!("expected Element, got {:?}", other),
        }
    }

    #[test]
    fn html_comment_dropped_between_children() {
        let nodes =
            parse_template("<div><b>a</b><!-- between siblings --><i>b</i></div>").unwrap()
        ;
        match &nodes[0] {
            TemplateNode::Element { children, .. } => {
                let tags: Vec<_> = children
                    .iter()
                    .filter_map(|n| match n {
                        TemplateNode::Element { tag, .. } => Some(tag.as_str()),
                        _ => None,
                    })
                    .collect();
                assert_eq!(tags, vec!["b", "i"]);
            }
            other => panic!("expected Element, got {:?}", other),
        }
    }

    #[test]
    fn html_comment_may_contain_angle_brackets() {
        let nodes = parse_template("<!-- <div> not parsed --><p>y</p>").unwrap();
        assert_eq!(nodes.len(), 1);
    }

    #[test]
    fn js_block_comment_opens_expression() {
        // `{/*` is a JS comment opening an expression, not a `{/…}` block tail.
        let nodes = parse_template("<h1>{/* note */ count}</h1>").unwrap();
        match &nodes[0] {
            TemplateNode::Element { children, .. } => match &children[0] {
                TemplateNode::Interpolation(expr) => {
                    assert!(expr.contains("count"), "{}", expr);
                }
                other => panic!("expected Interpolation, got {:?}", other),
            },
            other => panic!("expected Element, got {:?}", other),
        }
    }

    #[test]
    fn js_line_comment_opens_expression() {
        let nodes = parse_template("<h1>{// note\ncount}</h1>").unwrap();
        match &nodes[0] {
            TemplateNode::Element { children, .. } => match &children[0] {
                TemplateNode::Interpolation(expr) => {
                    assert!(expr.contains("count"), "{}", expr);
                }
                other => panic!("expected Interpolation, got {:?}", other),
            },
            other => panic!("expected Element, got {:?}", other),
        }
    }

    #[test]
    fn html_comment_unclosed_errors() {
        let err = parse_template("<!-- oops <span>x</span>").unwrap_err();
        assert!(err.message.contains("unclosed HTML comment"), "{}", err.message);
    }

    // ─── Grammar v2 — attribute control flow ─────────────────────────────────

    #[test]
    fn naked_if_stays_attribute_form() {
        let nodes = parse_template("<p if={loading}>x</p>").unwrap();
        match &nodes[0] {
            TemplateNode::Element { attrs, .. } => {
                assert!(attrs.iter().any(|a| matches!(
                    a,
                    crate::types::Attr::Macro { name, .. } if name == "if"
                )));
            }
            other => panic!("expected Element, got {:?}", other),
        }
    }

    #[test]
    fn if_elseif_else_chain_assembles() {
        let nodes = parse_template(
            "<p if={a}>A</p><p elseif={b}>B</p><p elseif={c}>C</p><p else>D</p>",
        )
        .unwrap();
        assert_eq!(nodes.len(), 1);
        match &nodes[0] {
            TemplateNode::IfBlock { branches } => {
                assert_eq!(branches.len(), 4);
                assert_eq!(branches[0].0, "a");
                assert_eq!(branches[1].0, "b");
                assert_eq!(branches[2].0, "c");
                assert_eq!(branches[3].0, "");
                // Every branch body is the single governed element, with the
                // chain marker attr stripped.
                for (_, body) in branches {
                    assert_eq!(body.len(), 1);
                    match &body[0] {
                        TemplateNode::Element { tag, attrs, .. } => {
                            assert_eq!(tag, "p");
                            assert!(!attrs.iter().any(|a| matches!(
                                a,
                                crate::types::Attr::Macro { name, .. }
                                    if name == "if" || name == "elseif" || name == "else"
                            )));
                        }
                        other => panic!("expected Element branch body, got {:?}", other),
                    }
                }
            }
            other => panic!("expected IfBlock, got {:?}", other),
        }
    }

    #[test]
    fn chain_tolerates_whitespace_and_comments_between() {
        let nodes = parse_template(
            "<p if={a}>A</p>\n  <!-- why -->\n  <p else>B</p>",
        )
        .unwrap();
        assert_eq!(nodes.len(), 1);
        assert!(matches!(&nodes[0], TemplateNode::IfBlock { branches } if branches.len() == 2));
    }

    #[test]
    fn interposed_element_between_chain_is_c610() {
        let err =
            parse_template("<p if={a}>A</p><span>mid</span><p else>B</p>").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C610"), "{}", err.message);
    }

    #[test]
    fn interposed_text_between_chain_is_c610() {
        let err = parse_template("<p if={a}>A</p>mid<p else>B</p>").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C610"), "{}", err.message);
    }

    #[test]
    fn orphan_else_is_c610() {
        let err = parse_template("<p else>B</p>").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C610"), "{}", err.message);
    }

    #[test]
    fn elseif_after_else_is_c610() {
        let err = parse_template(
            "<p if={a}>A</p><p else>B</p><p elseif={c}>C</p>",
        )
        .unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C610"), "{}", err.message);
    }

    #[test]
    fn each_with_empty_sibling_assembles_each_block() {
        let nodes = parse_template(
            "<li each={item of items} key={item.id}>{item.label}</li><li empty class=\"none\">No items.</li>",
        )
        .unwrap();
        assert_eq!(nodes.len(), 1);
        match &nodes[0] {
            TemplateNode::EachBlock {
                list_expr,
                item_alias,
                idx_alias,
                key_expr,
                body,
                empty_body,
            } => {
                assert_eq!(list_expr, "items");
                assert_eq!(item_alias, "item");
                assert_eq!(idx_alias, &None);
                assert_eq!(key_expr.as_deref(), Some("item.id"));
                assert_eq!(body.len(), 1);
                assert!(empty_body.is_some());
            }
            other => panic!("expected EachBlock, got {:?}", other),
        }
    }

    #[test]
    fn lone_each_stays_attribute_form() {
        let nodes = parse_template("<li each={item of items}>{item}</li>").unwrap();
        match &nodes[0] {
            TemplateNode::Element { attrs, .. } => {
                assert!(attrs.iter().any(|a| matches!(
                    a,
                    crate::types::Attr::Macro { name, .. } if name == "each"
                )));
            }
            other => panic!("expected Element, got {:?}", other),
        }
    }

    #[test]
    fn orphan_empty_is_c610() {
        let err = parse_template("<li empty>none</li>").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C610"), "{}", err.message);
    }

    #[test]
    fn group_carries_each() {
        let nodes = parse_template(
            "<group each={day of days} key={day.date}><dt>{day.date}</dt><dd>{day.temp}</dd></group>",
        )
        .unwrap();
        match &nodes[0] {
            TemplateNode::MacroElement { name, attrs, children } => {
                assert_eq!(name, "group");
                assert!(attrs.iter().any(|a| matches!(
                    a,
                    crate::types::Attr::Macro { name, .. } if name == "each"
                )));
                assert_eq!(children.len(), 2);
            }
            other => panic!("expected MacroElement group, got {:?}", other),
        }
    }

    // ─── Grammar v2 — framework elements ─────────────────────────────────────

    #[test]
    fn naked_slot_is_macro_element() {
        let nodes = parse_template("<slot name=\"header\"></slot>").unwrap();
        assert!(matches!(
            &nodes[0],
            TemplateNode::MacroElement { name, .. } if name == "slot"
        ));
    }

    #[test]
    fn naked_suspense_is_macro_element() {
        let nodes = parse_template("<suspense source={data}><p>done</p></suspense>").unwrap();
        assert!(matches!(
            &nodes[0],
            TemplateNode::MacroElement { name, .. } if name == "suspense"
        ));
    }

    #[test]
    fn naked_outlet_self_closing() {
        let nodes = parse_template("<outlet />").unwrap();
        assert!(matches!(
            &nodes[0],
            TemplateNode::MacroElement { name, .. } if name == "outlet"
        ));
    }

    #[test]
    fn c400_fires_for_naked_suspense() {
        let err = parse_template(
            "<suspense fallback=\"loading\"><slot name=\"fallback\">x</slot></suspense>",
        )
        .unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C400"));
    }

    // ─── §4 retirement — elements ────────────────────────────────────────────

    #[test]
    fn dollar_slot_is_c609() {
        let err = parse_template("<$slot></$slot>").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C609"));
        assert_eq!(err.to.as_deref(), Some("<slot>"));
        assert_eq!(err.from.as_deref(), Some("<$slot>"));
    }

    #[test]
    fn dollar_link_is_c608() {
        let err = parse_template("<$link href=\"/x\">go</$link>").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C608"));
        assert!(err.fix.as_deref().unwrap().contains("<a href="), "{:?}", err.fix);
    }

    #[test]
    fn dollar_if_element_is_c605() {
        let err = parse_template("<$if test={x}><p>y</p></$if>").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C605"));
    }

    // ─── §2.8 protection — C611 ──────────────────────────────────────────────

    #[test]
    fn unknown_nonhyphenated_element_is_c611() {
        let err = parse_template("<grup each={x of xs}>y</grup>").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C611"));
        assert!(err.message.contains("<grup>"), "{}", err.message);
    }

    #[test]
    fn hyphenated_component_is_not_c611() {
        let nodes = parse_template("<weather-badge temp={x}></weather-badge>").unwrap();
        assert!(matches!(&nodes[0], TemplateNode::Element { tag, .. } if tag == "weather-badge"));
    }

    #[test]
    fn svg_camelcase_element_is_known() {
        let nodes = parse_template("<svg><linearGradient></linearGradient></svg>").unwrap();
        assert!(matches!(&nodes[0], TemplateNode::Element { tag, .. } if tag == "svg"));
    }

    // ─── §4 retirement — blocks + interpolation ──────────────────────────────

    #[test]
    fn if_block_is_c601() {
        let err = parse_template("{#if cond}<span>x</span>{/if}").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C601"));
        assert!(err.fix.as_deref().unwrap().contains("if={e}"), "{:?}", err.fix);
        assert_eq!(err.from.as_deref(), Some("{#if cond}"));
    }

    #[test]
    fn each_block_is_c602() {
        let err = parse_template("{#each xs as x}<li>{x}</li>{/each}").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C602"));
        assert!(
            err.fix.as_deref().unwrap().contains("of list"),
            "{:?}",
            err.fix
        );
    }

    #[test]
    fn orphan_else_tail_is_c601() {
        let err = parse_template("<div></div>{:else}").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C601"));
    }

    #[test]
    fn orphan_empty_tail_is_c602() {
        let err = parse_template("{:empty}").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C602"));
    }

    #[test]
    fn orphan_end_each_tail_is_c602() {
        let err = parse_template("{/each}").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C602"));
    }

    #[test]
    fn html_block_is_c603() {
        let err = parse_template("{@html foo}").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C603"));
        assert!(err.fix.as_deref().unwrap().contains("html={expr}"), "{:?}", err.fix);
        assert_eq!(err.from.as_deref(), Some("{@html foo}"));
    }

    #[test]
    fn double_brace_is_c604() {
        let err = parse_template("<h1>{{count}}</h1>").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C604"));
        assert!(
            err.fix.as_deref().unwrap().contains("single braces"),
            "{:?}",
            err.fix
        );
    }

    // ─── W1 boundary-scanner hardening (shared lexical scanner) ──────────────

    fn first_interpolation(template: &str) -> String {
        let nodes = parse_template(template).unwrap();
        fn find(nodes: &[TemplateNode]) -> Option<String> {
            for n in nodes {
                match n {
                    TemplateNode::Interpolation(e) => return Some(e.clone()),
                    TemplateNode::Element { children, .. }
                    | TemplateNode::MacroElement { children, .. } => {
                        if let Some(e) = find(children) {
                            return Some(e);
                        }
                    }
                    _ => {}
                }
            }
            None
        }
        find(&nodes).expect("template must contain an Interpolation")
    }

    #[test]
    fn a16_regex_literal_opens_expression() {
        let expr = first_interpolation("<p>{/^a/.test(user.name) ? 1 : 0}</p>");
        assert_eq!(expr, "/^a/.test(user.name) ? 1 : 0");
    }

    #[test]
    fn a16_regex_with_close_brace_in_char_class() {
        let expr = first_interpolation("<p>{/[}]/.test(user.name) ? 1 : 0}</p>");
        assert_eq!(expr, "/[}]/.test(user.name) ? 1 : 0");
    }

    #[test]
    fn a17_close_brace_inside_string_literal() {
        let expr = first_interpolation("<p>{'}'}</p>");
        assert_eq!(expr, "'}'");
    }

    #[test]
    fn a17_open_brace_inside_string_literal() {
        let expr = first_interpolation("<p>{'{'}</p>");
        assert_eq!(expr, "'{'");
    }

    #[test]
    fn a24_template_literal_holes_with_braces() {
        let expr = first_interpolation("<p>{`n=${count} of ${items.length}`}</p>");
        assert_eq!(expr, "`n=${count} of ${items.length}`");
    }

    #[test]
    fn template_literal_hole_containing_string_close_brace() {
        let expr = first_interpolation("<p>{`v=${obj['}']}`}</p>");
        assert_eq!(expr, "`v=${obj['}']}`");
    }

    #[test]
    fn a12_nested_object_literal_braces() {
        let expr = first_interpolation("<p>{ {...obj, b: 2}.b }</p>");
        assert_eq!(expr.trim(), "{...obj, b: 2}.b");
    }

    #[test]
    fn js_block_comment_containing_close_brace() {
        let expr = first_interpolation("<h1>{/* } */ count}</h1>");
        assert!(expr.contains("count"), "{}", expr);
    }

    #[test]
    fn b15_attr_close_brace_inside_string() {
        let nodes = parse_template(r#"<span title={'}'}></span>"#).unwrap();
        match &nodes[0] {
            TemplateNode::Element { attrs, .. } => {
                assert_eq!(
                    attrs[0],
                    crate::types::Attr::Binding {
                        name: "title".to_string(),
                        expr: "'}'".to_string(),
                    }
                );
            }
            other => panic!("expected Element, got {:?}", other),
        }
    }

    #[test]
    fn b10_attr_regex_still_parses() {
        let nodes =
            parse_template(r#"<span title={/a/.test(user.name) ? 'y' : 'n'}></span>"#).unwrap();
        match &nodes[0] {
            TemplateNode::Element { attrs, .. } => {
                assert_eq!(
                    attrs[0],
                    crate::types::Attr::Binding {
                        name: "title".to_string(),
                        expr: "/a/.test(user.name) ? 'y' : 'n'".to_string(),
                    }
                );
            }
            other => panic!("expected Element, got {:?}", other),
        }
    }

    #[test]
    fn attr_template_literal_with_hole() {
        let nodes = parse_template(r#"<span title={`c=${count}`}></span>"#).unwrap();
        match &nodes[0] {
            TemplateNode::Element { attrs, .. } => {
                assert_eq!(
                    attrs[0],
                    crate::types::Attr::Binding {
                        name: "title".to_string(),
                        expr: "`c=${count}`".to_string(),
                    }
                );
            }
            other => panic!("expected Element, got {:?}", other),
        }
    }

    #[test]
    fn each_head_with_string_containing_brace() {
        let nodes = parse_template("<li each={it of ['}']}>x</li>").unwrap();
        match &nodes[0] {
            TemplateNode::Element { attrs, .. } => {
                assert!(attrs.iter().any(|a| matches!(
                    a,
                    crate::types::Attr::Macro { name, value } if name == "each"
                        && matches!(value, crate::types::MacroValue::Curly(s) if s == "it of ['}']")
                )));
            }
            other => panic!("expected Element, got {:?}", other),
        }
    }

    #[test]
    fn if_attr_with_string_close_brace() {
        let nodes = parse_template("<span if={name === '}'}>x</span>").unwrap();
        match &nodes[0] {
            TemplateNode::Element { attrs, .. } => {
                assert!(attrs.iter().any(|a| matches!(
                    a,
                    crate::types::Attr::Macro { name, value } if name == "if"
                        && matches!(value, crate::types::MacroValue::Curly(s) if s == "name === '}'")
                )));
            }
            other => panic!("expected Element, got {:?}", other),
        }
    }

    // ─── W1 diagnostics: honest messages + hoisting guidance ─────────────────

    #[test]
    fn unclosed_expression_diagnostic_says_what_is_allowed() {
        let err = parse_template("<p>{count</p>").unwrap_err();
        assert_eq!(err.message, "unclosed `{` in template expression");
        let hint = err.hint.expect("hint present");
        assert!(hint.contains("single JS expressions"), "{}", hint);
        let fix = err.fix.expect("fix present");
        assert!(fix.contains("$computed"), "{}", fix);
    }

    #[test]
    fn unterminated_string_surfaces_as_unclosed_expression_here() {
        let err = parse_template("<p>{'oops}</p>").unwrap_err();
        assert_eq!(err.message, "unclosed `{` in template expression");
    }
}
