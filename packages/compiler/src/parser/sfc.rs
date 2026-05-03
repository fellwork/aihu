use crate::types::{CompileError, ScribeSource, ScriptMeta, StyleBlock, StyleScope};

/// Extract the `name="..."` attribute from a `<script setup ...>` tag.
fn extract_script_meta(tag_text: &str) -> ScriptMeta {
    let name = find_attr_value(tag_text, "name");
    ScriptMeta { name }
}

/// Find an attribute value in a tag string (handles double or single quotes).
fn find_attr_value(tag_text: &str, attr: &str) -> Option<String> {
    let dq_needle = format!("{}=\"", attr);
    let sq_needle = format!("{}='", attr);

    if let Some(start) = tag_text.find(&dq_needle) {
        let after = &tag_text[start + dq_needle.len()..];
        if let Some(end) = after.find('"') {
            return Some(after[..end].to_string());
        }
    }
    if let Some(start) = tag_text.find(&sq_needle) {
        let after = &tag_text[start + sq_needle.len()..];
        if let Some(end) = after.find('\'') {
            return Some(after[..end].to_string());
        }
    }
    None
}

/// Count newlines before `pos` to derive a 1-based line number.
fn line_at(source: &str, pos: usize) -> usize {
    source[..pos].bytes().filter(|&b| b == b'\n').count() + 1
}

/// Find the closing tag with depth tracking for nested same-name tags.
/// `open_prefix` is the start of the opening tag (e.g. `<template`).
/// `close_tag` is the exact closing tag string (e.g. `</template>`).
/// `search_from` is the position in `source` right after the opening tag's `>`.
/// Returns the byte offset of the `<` in the matching closing tag, or `None` if unclosed.
fn find_closing_with_depth(
    source: &str,
    search_from: usize,
    open_prefix: &str,
    close_tag: &str,
) -> Option<usize> {
    let mut depth = 1usize;
    let mut pos = search_from;

    loop {
        let slice = &source[pos..];
        let next_close = slice.find(close_tag);
        let next_open = slice.find(open_prefix);

        match (next_open, next_close) {
            (_, None) => return None, // no closing tag found
            (None, Some(c)) => {
                let close_abs = pos + c;
                depth -= 1;
                if depth == 0 {
                    return Some(close_abs);
                }
                pos = close_abs + close_tag.len();
            }
            (Some(o), Some(c)) => {
                if o < c {
                    // Opening tag comes before closing tag — increase depth.
                    depth += 1;
                    pos += o + open_prefix.len();
                } else {
                    let close_abs = pos + c;
                    depth -= 1;
                    if depth == 0 {
                        return Some(close_abs);
                    }
                    pos = close_abs + close_tag.len();
                }
            }
        }
    }
}

/// The kind of block found at a given position.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BlockKind {
    Script,
    Template,
    Style,
    Agent,
}

/// The grammar used for a given block opener.
///
/// Per Block Structure Spec §2.1, two grammars are accepted at v0.2:
/// - `Html`  → `<script setup>`, `<template>`, `<style>`, `<agent>` (legacy)
/// - `At`    → `@state {`, `@template {`, `@style {`, `@agent {` (Block Structure Spec §2)
///
/// Both grammars lower to the same emitted JS shape. The first form detected in
/// a file wins; mixing forms in the same file is a compile error.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Grammar {
    Html,
    At,
}

impl Grammar {
    fn label(self) -> &'static str {
        match self {
            Grammar::Html => "<tag>",
            Grammar::At => "@blockname { }",
        }
    }
}

/// Match an `@blockname {` opener starting at byte position `pos` in `source`.
/// The opener must appear at the start of a line (after optional leading
/// whitespace) per Block Structure Spec §2.1.
///
/// Returns `(BlockKind, opener_start_offset, body_start_offset)` if matched,
/// where `opener_start_offset` is the `@` position and `body_start_offset` is
/// the byte just past the `{`.
fn match_at_opener(source: &str, pos: usize) -> Option<(BlockKind, usize, usize)> {
    // Verify start-of-line: the `@` must be the first non-whitespace on its line.
    let bytes = source.as_bytes();
    if pos >= bytes.len() || bytes[pos] != b'@' {
        return None;
    }
    // Walk back to start of line; any non-whitespace before `@` on the same line
    // disqualifies this candidate.
    let mut i = pos;
    while i > 0 {
        i -= 1;
        let c = bytes[i];
        if c == b'\n' {
            break;
        }
        if c != b' ' && c != b'\t' && c != b'\r' {
            return None;
        }
    }

    // Try each known block name.
    for (name, kind) in [
        ("state", BlockKind::Script),
        ("template", BlockKind::Template),
        ("style", BlockKind::Style),
        ("agent", BlockKind::Agent),
    ] {
        let after_at = pos + 1;
        let end_name = after_at + name.len();
        if end_name > source.len() {
            continue;
        }
        if &source[after_at..end_name] != name {
            continue;
        }
        // The character after the name must be whitespace or `{`. Reject
        // matches like `@states` or `@templates`.
        let after_name = bytes.get(end_name).copied();
        let boundary_ok = matches!(after_name, Some(b' ') | Some(b'\t') | Some(b'\r') | Some(b'{'));
        if !boundary_ok {
            continue;
        }
        // Skip whitespace between name and `{` (same line per §2.1).
        let mut j = end_name;
        while j < bytes.len() {
            match bytes[j] {
                b' ' | b'\t' | b'\r' => j += 1,
                b'{' => return Some((kind, pos, j + 1)),
                _ => return None,
            }
        }
        return None;
    }
    None
}

/// Find the matching closing `}` for an `@blockname { ... }` body, with brace
/// depth tracking per Block Structure Spec §2.4.
///
/// `body_start` is the byte position just past the opening `{`. The returned
/// position is the byte offset of the matching `}` (or `None` if unclosed).
///
/// Strings (`"…"`, `'…'`, `` `…` ``) and JS-style comments (`// …`, `/* … */`)
/// are skipped so that braces appearing inside them do not affect depth.
fn find_at_block_close(source: &str, body_start: usize) -> Option<usize> {
    let bytes = source.as_bytes();
    let mut depth: usize = 1;
    let mut i = body_start;

    while i < bytes.len() {
        let c = bytes[i];
        match c {
            b'{' => {
                depth += 1;
                i += 1;
            }
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
                i += 1;
            }
            b'/' if i + 1 < bytes.len() && bytes[i + 1] == b'/' => {
                // Line comment — skip to newline.
                i += 2;
                while i < bytes.len() && bytes[i] != b'\n' {
                    i += 1;
                }
            }
            b'/' if i + 1 < bytes.len() && bytes[i + 1] == b'*' => {
                // Block comment — skip to `*/`.
                i += 2;
                while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                    i += 1;
                }
                if i + 1 < bytes.len() {
                    i += 2;
                } else {
                    i = bytes.len();
                }
            }
            b'"' | b'\'' | b'`' => {
                // String literal — skip to matching quote, honoring backslash escapes.
                let quote = c;
                i += 1;
                while i < bytes.len() {
                    let cc = bytes[i];
                    if cc == b'\\' && i + 1 < bytes.len() {
                        i += 2;
                        continue;
                    }
                    if cc == quote {
                        i += 1;
                        break;
                    }
                    i += 1;
                }
            }
            b'<' if i + 3 < bytes.len() && &bytes[i..i + 4] == b"<!--" => {
                // HTML comment (used inside @template { ... }) — skip to `-->`.
                i += 4;
                while i + 2 < bytes.len() && &bytes[i..i + 3] != b"-->" {
                    i += 1;
                }
                if i + 2 < bytes.len() {
                    i += 3;
                } else {
                    i = bytes.len();
                }
            }
            _ => i += 1,
        }
    }
    None
}

/// Find the next recognized block opener starting from `pos` in `source`.
/// Returns `(kind, grammar, opener_offset, body_start_offset)` for the earliest
/// match. `body_start_offset` is the byte just past the opener (after `>` for
/// HTML form, after `{` for `@`-form). `None` if no opener found.
fn next_block(source: &str, pos: usize) -> Option<(BlockKind, Grammar, usize, usize)> {
    // HTML-form scan — same as v0.2.1 behavior.
    let slice = &source[pos..];
    let html_candidates = [
        slice
            .find("<script setup")
            .map(|i| (BlockKind::Script, pos + i)),
        slice
            .find("<template>")
            .map(|i| (BlockKind::Template, pos + i)),
        slice.find("<style").map(|i| (BlockKind::Style, pos + i)),
        slice.find("<agent>").map(|i| (BlockKind::Agent, pos + i)),
    ];
    let html_min = html_candidates
        .into_iter()
        .flatten()
        .min_by_key(|&(_, off)| off);

    // `@`-form scan — walk every `@` and check if it is a valid opener.
    let mut at_min: Option<(BlockKind, usize, usize)> = None;
    let mut search = pos;
    while let Some(rel) = source[search..].find('@') {
        let abs = search + rel;
        if let Some((kind, opener, body)) = match_at_opener(source, abs) {
            at_min = Some((kind, opener, body));
            break;
        }
        search = abs + 1;
        if search >= source.len() {
            break;
        }
    }

    match (html_min, at_min) {
        (None, None) => None,
        (Some((k, off)), None) => {
            // body starts after the opening tag's `>` for HTML form. The caller
            // re-derives this; we pass `off` for body_start as a placeholder
            // and let the per-kind branch compute the precise body_start.
            Some((k, Grammar::Html, off, off))
        }
        (None, Some((k, opener, body))) => Some((k, Grammar::At, opener, body)),
        (Some((kh, off_h)), Some((ka, off_a, body_a))) => {
            if off_h <= off_a {
                Some((kh, Grammar::Html, off_h, off_h))
            } else {
                Some((ka, Grammar::At, off_a, body_a))
            }
        }
    }
}

pub fn parse(source: &str) -> Result<ScribeSource<'_>, CompileError> {
    let mut script: Option<&str> = None;
    let mut template: Option<&str> = None;
    let mut style: Option<StyleBlock> = None;
    let mut meta = ScriptMeta { name: None };
    let mut agent_raw: Option<&str> = None;

    // Per Block Structure Spec §2 + plan §v0.2.2: dual-grammar acceptance.
    // First detected form wins; a subsequent opener using the other form is an
    // error citing both spans.
    let mut detected_grammar: Option<(Grammar, usize)> = None;

    let mut pos = 0usize;

    while let Some((kind, grammar, open_start, body_start_at)) = next_block(source, pos) {
        // Mixed-grammar check: the first opener locks the grammar for the file;
        // any later opener using the *other* form is rejected with a span
        // citing both forms.
        match detected_grammar {
            None => {
                detected_grammar = Some((grammar, open_start));
            }
            Some((first_g, first_off)) if first_g != grammar => {
                return Err(CompileError {
                    message: format!(
                        "mixed block grammars in same file: first opener was {} form (line {}), but found {} form opener at line {}. Choose one form per file.",
                        first_g.label(),
                        line_at(source, first_off),
                        grammar.label(),
                        line_at(source, open_start),
                    ),
                    line: line_at(source, open_start),
                    col: 0,
                    code: Some("C100".to_string()),
                    ..Default::default()
                });
            }
            _ => {}
        }

        if grammar == Grammar::At {
            // Unified `@blockname { … }` handler — body delimited by brace
            // depth per Block Structure Spec §2.4.
            let body_start = body_start_at;
            let close_pos = find_at_block_close(source, body_start).ok_or_else(|| {
                let (label, code) = match kind {
                    BlockKind::Script => ("@state", "C101"),
                    BlockKind::Template => ("@template", "C102"),
                    BlockKind::Style => ("@style", "C103"),
                    BlockKind::Agent => ("@agent", "C104"),
                };
                CompileError {
                    message: format!("unclosed {} block opened at line {}", label, line_at(source, open_start)),
                    line: line_at(source, open_start),
                    col: 0,
                    code: Some(code.to_string()),
                    ..Default::default()
                }
            })?;
            let body = source[body_start..close_pos].trim();
            match kind {
                BlockKind::Script => {
                    if script.is_some() {
                        return Err(CompileError {
                            message: "duplicate @state block".to_string(),
                            line: line_at(source, open_start),
                            col: 0,
                            ..Default::default()
                        });
                    }
                    script = Some(body);
                }
                BlockKind::Template => {
                    if template.is_some() {
                        return Err(CompileError {
                            message: "duplicate @template block".to_string(),
                            line: line_at(source, open_start),
                            col: 0,
                            ..Default::default()
                        });
                    }
                    template = Some(body);
                }
                BlockKind::Style => {
                    if style.is_some() {
                        return Err(CompileError {
                            message: "duplicate @style block".to_string(),
                            line: line_at(source, open_start),
                            col: 0,
                            ..Default::default()
                        });
                    }
                    // v0.2.2 stub: lowering is unchanged. The `@style { $global }`
                    // attribute migration is v0.3.3; default to Scoped here.
                    style = Some(StyleBlock {
                        content: body,
                        scope: StyleScope::Scoped,
                    });
                }
                BlockKind::Agent => {
                    if agent_raw.is_some() {
                        return Err(CompileError {
                            message: "duplicate @agent block".to_string(),
                            line: line_at(source, open_start),
                            col: 0,
                            ..Default::default()
                        });
                    }
                    agent_raw = Some(&source[body_start..close_pos]);
                }
            }
            pos = close_pos + 1; // past the `}`
            continue;
        }

        match kind {
            BlockKind::Script => {
                // Find the end of the opening tag.
                let tag_close_rel = source[open_start..].find('>').ok_or_else(|| CompileError {
                    message: "unclosed <script setup> block".to_string(),
                    line: line_at(source, open_start),
                    col: 0,
                    ..Default::default()
                })?;
                let open_tag_end = open_start + tag_close_rel + 1; // byte after '>'
                let tag_text = &source[open_start..open_tag_end];

                // Compute meta (not yet in public API; spec says compute it internally).
                meta = extract_script_meta(tag_text);

                // Find closing </script> — no depth tracking required for script per spec.
                let content_start = open_tag_end;
                let close_rel =
                    source[content_start..]
                        .find("</script>")
                        .ok_or_else(|| CompileError {
                            message: "unclosed <script setup> block".to_string(),
                            line: line_at(source, open_start),
                            col: 0,
                            ..Default::default()
                        })?;
                let content_end = content_start + close_rel;

                if script.is_some() {
                    return Err(CompileError {
                        message: "duplicate <script setup> block".to_string(),
                        line: line_at(source, open_start),
                        col: 0,
                        ..Default::default()
                    });
                }
                script = Some(source[content_start..content_end].trim());
                pos = content_end + "</script>".len();
            }

            BlockKind::Template => {
                let open_tag_end = open_start + "<template>".len();

                let close_pos =
                    find_closing_with_depth(source, open_tag_end, "<template", "</template>")
                        .ok_or_else(|| CompileError {
                            message: "unclosed <template> block".to_string(),
                            line: line_at(source, open_start),
                            col: 0,
                            ..Default::default()
                        })?;

                if template.is_some() {
                    return Err(CompileError {
                        message: "duplicate <template> block".to_string(),
                        line: line_at(source, open_start),
                        col: 0,
                        ..Default::default()
                    });
                }
                template = Some(source[open_tag_end..close_pos].trim());
                pos = close_pos + "</template>".len();
            }

            BlockKind::Style => {
                let tag_close_rel = source[open_start..].find('>').ok_or_else(|| CompileError {
                    message: "unclosed <style> block".to_string(),
                    line: line_at(source, open_start),
                    col: 0,
                    ..Default::default()
                })?;
                let open_tag_end = open_start + tag_close_rel + 1;
                let tag_text = &source[open_start..open_tag_end];
                let scope = if tag_text.contains(" global") {
                    StyleScope::Global
                } else {
                    StyleScope::Scoped
                };
                let content_start = open_tag_end;

                let close_pos =
                    find_closing_with_depth(source, content_start, "<style", "</style>")
                        .ok_or_else(|| CompileError {
                            message: "unclosed <style> block".to_string(),
                            line: line_at(source, open_start),
                            col: 0,
                            ..Default::default()
                        })?;

                if style.is_some() {
                    return Err(CompileError {
                        message: "duplicate <style> block".to_string(),
                        line: line_at(source, open_start),
                        col: 0,
                        ..Default::default()
                    });
                }
                style = Some(StyleBlock {
                    content: source[content_start..close_pos].trim(),
                    scope,
                });
                pos = close_pos + "</style>".len();
            }

            BlockKind::Agent => {
                let open_tag_end = open_start + "<agent>".len();

                let close_pos = source[open_tag_end..]
                    .find("</agent>")
                    .map(|i| open_tag_end + i)
                    .ok_or_else(|| CompileError {
                        message: "unclosed <agent> block".to_string(),
                        line: line_at(source, open_start),
                        col: 0,
                        ..Default::default()
                    })?;

                if agent_raw.is_some() {
                    return Err(CompileError {
                        message: "duplicate <agent> block".to_string(),
                        line: line_at(source, open_start),
                        col: 0,
                        ..Default::default()
                    });
                }
                agent_raw = Some(&source[open_tag_end..close_pos]);
                pos = close_pos + "</agent>".len();
            }
        }
    }

    let agent = if let Some(raw) = agent_raw {
        Some(crate::parser::agent::parse_agent(raw)?)
    } else {
        None
    };

    Ok(ScribeSource {
        script,
        template,
        style,
        meta,
        agent,
    })
}
