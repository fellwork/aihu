//! Shared lexical scanner for JS expression text embedded in templates.
//!
//! Every `{expr}` boundary decision in the template/attribute/SFC parsers
//! needs the same question answered: "is this byte real code, or is it
//! inside a string, template literal, comment, or regex literal?" Before
//! this module each call site answered it with its own partial heuristic
//! (or not at all), which is exactly how `}` inside `'…'`, regex after `{`,
//! and template-literal `${…}` nesting produced misleading, far-away errors.
//!
//! `CodeScanner` walks JS source byte-by-byte and yields ONLY the bytes that
//! are code, consuming literal/comment interiors silently:
//!
//! - `'…'` / `"…"` string literals (with `\` escapes)
//! - `` `…` `` template literals, including nested `${…}` expression holes
//!   (scanned recursively with full lexical awareness, so a template literal
//!   inside a `${…}` inside a template literal is handled)
//! - `// …` line comments and `/* … */` block comments
//! - `/…/flags` regex literals, recognized by the previous-significant-token
//!   heuristic (a `/` in a position where an expression may START is a regex;
//!   after an identifier/literal/`)`/`]`/`}` it is division). This is the
//!   b03dba1 comment fix generalized to the whole lexical class.
//!
//! Consumers see a clean stream of code bytes, so a naive `{`/`}` (or `(`/`)`
//! or top-level `=` / ` as `) count over that stream is lexically correct.

/// Keywords after which a `/` starts a regex literal rather than division
/// (`return /x/.test(s)`, `typeof /x/`, `case /x/:`, …).
const REGEX_PRECEDING_KEYWORDS: &[&str] = &[
    "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
    "case", "do", "else", "yield", "await",
];

/// Byte-level scanner over JS expression source. See module docs.
pub(crate) struct CodeScanner<'a> {
    input: &'a str,
    pos: usize,
    /// Last significant (non-whitespace) code byte yielded, or a synthetic
    /// `b')'` after a consumed literal (a literal ends an expression, so a
    /// following `/` is division). `None` at expression start.
    last_sig: Option<u8>,
    /// Byte range of the identifier word ending at `last_sig`, when the last
    /// significant token is an identifier/keyword (drives the keyword branch
    /// of the regex heuristic).
    word: Option<(usize, usize)>,
}

fn is_ident_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
}

impl<'a> CodeScanner<'a> {
    pub(crate) fn new(input: &'a str) -> Self {
        Self::starting_at(input, 0)
    }

    /// Start scanning at byte offset `pos` (expression-start context: a `/`
    /// encountered first is a regex).
    pub(crate) fn starting_at(input: &'a str, pos: usize) -> Self {
        CodeScanner { input, pos, last_sig: None, word: None }
    }

    /// Yield the next code byte and its byte offset, or `None` at end of
    /// input. String/template-literal/comment/regex interiors are consumed
    /// silently and never yielded. Whitespace IS yielded (it is code — some
    /// consumers need it, e.g. the ` as ` separator scan).
    pub(crate) fn next_code_byte(&mut self) -> Option<(usize, u8)> {
        loop {
            let b = *self.input.as_bytes().get(self.pos)?;
            match b {
                b'\'' | b'"' => {
                    self.skip_quoted(b);
                    self.note_literal_end();
                }
                b'`' => {
                    self.skip_template_literal();
                    self.note_literal_end();
                }
                b'/' => match self.input.as_bytes().get(self.pos + 1) {
                    Some(b'/') => self.skip_line_comment(),
                    Some(b'*') => self.skip_block_comment(),
                    _ if self.regex_allowed() => {
                        self.skip_regex();
                        self.note_literal_end();
                    }
                    _ => return Some(self.yield_byte(b)),
                },
                _ => return Some(self.yield_byte(b)),
            }
        }
    }

    fn yield_byte(&mut self, b: u8) -> (usize, u8) {
        let off = self.pos;
        self.pos += 1;
        if !b.is_ascii_whitespace() {
            if is_ident_byte(b) {
                self.word = match self.word {
                    // Contiguous identifier run — extend the word.
                    Some((start, end)) if end == off && self.last_sig.is_some_and(is_ident_byte) => {
                        Some((start, off + 1))
                    }
                    _ => Some((off, off + 1)),
                };
            } else {
                self.word = None;
            }
            self.last_sig = Some(b);
        }
        (off, b)
    }

    /// A consumed literal (string/template/regex) ends an expression: mark it
    /// with a synthetic `)` so a following `/` reads as division.
    fn note_literal_end(&mut self) {
        self.last_sig = Some(b')');
        self.word = None;
    }

    /// Is a `/` at the current position a regex literal opener?
    fn regex_allowed(&self) -> bool {
        match self.last_sig {
            // Expression start — `{/re/.test(x)}`.
            None => true,
            Some(b) if is_ident_byte(b) => {
                // After an identifier/number a `/` is division — unless the
                // identifier is a keyword that an expression may follow.
                match self.word {
                    Some((start, end)) => {
                        REGEX_PRECEDING_KEYWORDS.contains(&&self.input[start..end])
                    }
                    None => false,
                }
            }
            // After a closed group or literal, `/` is division.
            Some(b')') | Some(b']') | Some(b'}') | Some(b'.') => false,
            // After any operator/punctuation an expression may start.
            Some(_) => true,
        }
    }

    fn skip_quoted(&mut self, quote: u8) {
        let bytes = self.input.as_bytes();
        self.pos += 1; // past the opening quote
        while let Some(&b) = bytes.get(self.pos) {
            match b {
                b'\\' => self.pos = (self.pos + 2).min(bytes.len()),
                _ if b == quote => {
                    self.pos += 1;
                    return;
                }
                _ => self.pos += 1,
            }
        }
        // Unterminated — consumed to end; the caller reports its own
        // unclosed-boundary error.
    }

    fn skip_template_literal(&mut self) {
        let bytes = self.input.as_bytes();
        self.pos += 1; // past the opening backtick
        while let Some(&b) = bytes.get(self.pos) {
            match b {
                b'\\' => self.pos = (self.pos + 2).min(bytes.len()),
                b'`' => {
                    self.pos += 1;
                    return;
                }
                b'$' if bytes.get(self.pos + 1) == Some(&b'{') => {
                    self.pos += 2; // past `${`
                    // The hole interior is a full expression — scan it with
                    // complete lexical awareness (nested strings, template
                    // literals, comments, regex) until the matching `}`.
                    self.last_sig = None;
                    self.word = None;
                    let mut depth = 0usize;
                    while let Some((_, cb)) = self.next_code_byte() {
                        match cb {
                            b'{' => depth += 1,
                            b'}' => {
                                if depth == 0 {
                                    break;
                                }
                                depth -= 1;
                            }
                            _ => {}
                        }
                    }
                }
                _ => self.pos += 1,
            }
        }
    }

    fn skip_line_comment(&mut self) {
        let bytes = self.input.as_bytes();
        self.pos += 2; // past `//`
        while let Some(&b) = bytes.get(self.pos) {
            if b == b'\n' {
                return; // leave the newline as (whitespace) code
            }
            self.pos += 1;
        }
    }

    fn skip_block_comment(&mut self) {
        match self.input[self.pos + 2..].find("*/") {
            Some(rel) => self.pos += 2 + rel + 2,
            None => self.pos = self.input.len(), // unterminated
        }
    }

    fn skip_regex(&mut self) {
        let bytes = self.input.as_bytes();
        self.pos += 1; // past the opening `/`
        let mut in_class = false;
        while let Some(&b) = bytes.get(self.pos) {
            match b {
                b'\\' => self.pos = (self.pos + 2).min(bytes.len()),
                b'[' => {
                    in_class = true;
                    self.pos += 1;
                }
                b']' => {
                    in_class = false;
                    self.pos += 1;
                }
                b'/' if !in_class => {
                    self.pos += 1;
                    // Consume flag letters.
                    while bytes.get(self.pos).is_some_and(|b| b.is_ascii_alphabetic()) {
                        self.pos += 1;
                    }
                    return;
                }
                // A regex literal cannot span a newline — bail so a stray
                // division-misread doesn't swallow the rest of the input.
                b'\n' => return,
                _ => self.pos += 1,
            }
        }
    }
}

/// If the `{` at `brace_pos` opens a block-tail-SHAPED region — `{/` ws* word
/// ws* `}` (`{/if}`, `{/each}`, `{/ if }`, and typos like `{/for}`) — return
/// the byte offset of its closing `}`. Block tails are template grammar, not
/// JS expressions, so they must NOT be handed to the expression scanner
/// (where `/if}` would read as a regex literal). Anything else after `{/` —
/// `{//` / `{/*` comments, `{/^a/.test(x)}` regex — returns `None` and falls
/// through to expression scanning.
pub(crate) fn block_tail_close(input: &str, brace_pos: usize) -> Option<usize> {
    let bytes = input.as_bytes();
    if bytes.get(brace_pos) != Some(&b'{') || bytes.get(brace_pos + 1) != Some(&b'/') {
        return None;
    }
    let mut i = brace_pos + 2;
    while bytes.get(i).is_some_and(|b| b.is_ascii_whitespace()) {
        i += 1;
    }
    let word_start = i;
    while bytes.get(i).is_some_and(|b| b.is_ascii_alphabetic()) {
        i += 1;
    }
    if i == word_start {
        return None;
    }
    while bytes.get(i).is_some_and(|b| b.is_ascii_whitespace()) {
        i += 1;
    }
    (bytes.get(i) == Some(&b'}')).then_some(i)
}

/// Find the byte offset of the `}` that closes an already-open brace region.
///
/// `start` is the byte offset just past the opening `{` (which the caller has
/// consumed or accounted for). The interior is scanned as JS: `}` inside
/// strings, template literals (including `${…}` holes), comments, and regex
/// literals never count, and nested code-level `{`/`}` pairs balance.
/// Returns `None` when the region never closes.
pub(crate) fn find_matching_close_brace(input: &str, start: usize) -> Option<usize> {
    let mut scanner = CodeScanner::starting_at(input, start);
    let mut depth = 0usize;
    while let Some((off, b)) = scanner.next_code_byte() {
        match b {
            b'{' => depth += 1,
            b'}' => {
                if depth == 0 {
                    return Some(off);
                }
                depth -= 1;
            }
            _ => {}
        }
    }
    None
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: expression text (without braces) → offset of the closing `}`
    /// when scanning `{<expr>}` from just past the `{`.
    fn close_of(expr_with_close: &str) -> Option<usize> {
        find_matching_close_brace(expr_with_close, 0)
    }

    #[test]
    fn plain_close() {
        assert_eq!(close_of("count}"), Some(5));
    }

    #[test]
    fn close_brace_inside_single_quoted_string_skipped() {
        assert_eq!(close_of("'}'}"), Some(3));
    }

    #[test]
    fn open_brace_inside_string_skipped() {
        assert_eq!(close_of("'{'}"), Some(3));
    }

    #[test]
    fn escaped_quote_inside_string() {
        assert_eq!(close_of(r#"'a\'}b'}"#), Some(7));
    }

    #[test]
    fn nested_object_literal_balances() {
        let s = " {...obj, b: 2}.b }";
        assert_eq!(close_of(s), Some(s.len() - 1));
    }

    #[test]
    fn template_literal_hole_with_braces() {
        let s = "`n=${obj.a} of ${items.length}`}";
        assert_eq!(close_of(s), Some(s.len() - 1));
    }

    #[test]
    fn template_literal_nested_in_hole() {
        let s = "`a${x ? `b${y}c` : 'd'}e`}";
        assert_eq!(close_of(s), Some(s.len() - 1));
    }

    #[test]
    fn template_literal_hole_with_string_close_brace() {
        let s = "`v=${obj['}']}`}";
        assert_eq!(close_of(s), Some(s.len() - 1));
    }

    #[test]
    fn regex_at_expression_start() {
        let s = "/^a/.test(x) ? 1 : 0}";
        assert_eq!(close_of(s), Some(s.len() - 1));
    }

    #[test]
    fn regex_with_close_brace_in_char_class() {
        let s = "/[}]/.test(x)}";
        assert_eq!(close_of(s), Some(s.len() - 1));
    }

    #[test]
    fn regex_after_operator() {
        let s = "ok && /a}b/.test(x)}";
        assert_eq!(close_of(s), Some(s.len() - 1));
    }

    #[test]
    fn regex_after_keyword_return() {
        let s = "items.map(i => { return /}/.test(i) })}";
        assert_eq!(close_of(s), Some(s.len() - 1));
    }

    #[test]
    fn division_is_not_regex() {
        // `a / b` then `}` — the `/` must NOT swallow ` b` as a regex body.
        assert_eq!(close_of("a / b}"), Some(5));
        assert_eq!(close_of("(a) / b}"), Some(7));
        assert_eq!(close_of("a[0] / b}"), Some(8));
        assert_eq!(close_of("'s' / b}"), Some(7));
    }

    #[test]
    fn line_comment_hides_close_brace_until_newline() {
        let s = "// note }\ncount}";
        assert_eq!(close_of(s), Some(s.len() - 1));
    }

    #[test]
    fn block_comment_hides_close_brace() {
        let s = "/* } */ count}";
        assert_eq!(close_of(s), Some(s.len() - 1));
    }

    #[test]
    fn unclosed_string_returns_none() {
        assert_eq!(close_of("'oops}"), None);
    }

    #[test]
    fn unclosed_region_returns_none() {
        assert_eq!(close_of("count + 1"), None);
    }

    #[test]
    fn spread_and_calls_balance() {
        let s = "JSON.stringify({...obj, b: 2})}";
        assert_eq!(close_of(s), Some(s.len() - 1));
    }
}
