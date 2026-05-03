use crate::types::{CompileError, ScribeSource, ScriptMeta, StyleBlock, StyleScope};
use crate::codegen::signals::resolve_signals;

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

/// Check the inter-block region (content between/before/after blocks) for
/// reserved top-level tokens per Block Structure Spec §8.1.
///
/// Returns a `CompileError` if a reserved token is found at the start of a line.
fn check_reserved_tokens(region: &str, region_start_line: usize) -> Result<(), CompileError> {
    for (i, line) in region.lines().enumerate() {
        let trimmed = line.trim();
        // Skip blank lines and comments.
        if trimmed.is_empty() || trimmed.starts_with("//") || trimmed.starts_with("/*") || trimmed.starts_with('*') {
            continue;
        }
        let line_no = region_start_line + i;
        if trimmed.starts_with("---") {
            return Err(CompileError {
                message: "frontmatter (`---`) is reserved for v2".to_string(),
                line: line_no,
                col: 0,
                code: Some("C200".to_string()),
                ..Default::default()
            });
        }
        if trimmed.starts_with("import ") || trimmed.starts_with("import\t") {
            return Err(CompileError {
                message: "top-level `import` is reserved; use `@state {}` for module imports".to_string(),
                line: line_no,
                col: 0,
                code: Some("C201".to_string()),
                ..Default::default()
            });
        }
        if trimmed.starts_with("export ") || trimmed.starts_with("export\t") {
            return Err(CompileError {
                message: "top-level `export` is reserved; the default export is implicit".to_string(),
                line: line_no,
                col: 0,
                code: Some("C202".to_string()),
                ..Default::default()
            });
        }
        if trimmed == ";" {
            return Err(CompileError {
                message: "bare `;` at top level is reserved".to_string(),
                line: line_no,
                col: 0,
                code: Some("C203".to_string()),
                ..Default::default()
            });
        }
    }
    Ok(())
}

/// Known JS globals that are always in scope — used by the v0.3.5 symbol-table
/// warning pass to avoid false positives for common identifiers.
const JS_GLOBALS: &[&str] = &[
    "true", "false", "null", "undefined", "NaN", "Infinity",
    "console", "window", "document", "Math", "JSON", "Date",
    "Array", "Object", "String", "Number", "Boolean", "Promise",
    "setTimeout", "clearTimeout", "setInterval", "clearInterval",
    "fetch", "URL", "URLSearchParams", "Error", "TypeError",
    "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent",
    "decodeURIComponent", "encodeURI", "decodeURI",
];

/// Emit a warning (to stderr) for template interpolations that reference names
/// not found in the state signal map and not in the JS globals list.
///
/// Per v0.3.5: this is a WARNING only (not a compile error). Full errors are v0.4+.
fn warn_undeclared_template_refs(template: &str, signal_map: &crate::codegen::signals::SignalMap) {
    // Find all `{{ name }}` interpolations in the template body.
    let mut pos = 0;
    while let Some(start) = template[pos..].find("{{") {
        let abs_start = pos + start;
        if let Some(end_rel) = template[abs_start + 2..].find("}}") {
            let inner = template[abs_start + 2..abs_start + 2 + end_rel].trim();
            // Only flag simple identifiers, not expressions.
            if inner.chars().all(|c| c.is_alphanumeric() || c == '_') && !inner.is_empty() {
                let in_signals = signal_map.0.contains_key(inner);
                let in_globals = JS_GLOBALS.contains(&inner);
                if !in_signals && !in_globals {
                    eprintln!(
                        "warning: '@template' references '{}' which is not declared in '@state'. \
                         Undeclared cross-block references will become errors in v0.4.",
                        inner
                    );
                }
            }
            pos = abs_start + 2 + end_rel + 2;
        } else {
            break;
        }
    }
}

/// Block ordering note (Block Structure Spec §3.3):
///
/// Blocks may appear in any order within a `.scribe` file. The compiler does
/// NOT enforce a canonical order. The recommended order for tooling and formatter
/// output is: `@state`, `@template`, `@style`, `@agent`. The default formatter
/// rewrites files to this order on save. No ordering enforcement occurs here.
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

    // v0.3.4: emit the HTML-form deprecation warning at most once per file.
    let mut warned_deprecation = false;

    // Track block end positions for inter-block reserved-token checks (v0.3.6).
    // Each entry is (block_end_byte, block_end_line) — we'll scan the gaps after parsing.
    let mut block_regions: Vec<(usize, usize)> = Vec::new(); // (start_byte, end_byte)

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

        // v0.3.4: emit deprecation warning when HTML-tag form is detected.
        if grammar == Grammar::Html && !warned_deprecation {
            eprintln!(
                "warning: HTML-tag form (`<script setup>`, `<template>`, etc.) is deprecated in v0.3. \
                 Use `@state {{ }}`, `@template {{ }}`, `@style {{ }}`, `@agent {{ }}` instead. \
                 Run `npx scribe migrate` to convert (ships in v0.8)."
            );
            warned_deprecation = true;
        }

        // Record the inter-block region before this block for reserved-token checking.
        let region_before = &source[pos..open_start];
        let region_start_line = line_at(source, pos);
        check_reserved_tokens(region_before, region_start_line)?;

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
                    // v0.3.3: `@style { $global }` scope recognition.
                    // If the body begins with `$global` (after stripping leading whitespace),
                    // set StyleScope::Global and remove the `$global` token from the body.
                    let (style_scope, style_content) = if body.starts_with("$global") {
                        let rest = body["$global".len()..].trim();
                        (StyleScope::Global, rest)
                    } else {
                        (StyleScope::Scoped, body)
                    };
                    style = Some(StyleBlock {
                        content: style_content,
                        scope: style_scope,
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
            let block_end = close_pos + 1; // past the `}`
            block_regions.push((open_start, block_end));
            pos = block_end;
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
                let block_end = content_end + "</script>".len();
                block_regions.push((open_start, block_end));
                pos = block_end;
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
                let block_end = close_pos + "</template>".len();
                block_regions.push((open_start, block_end));
                pos = block_end;
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
                let block_end = close_pos + "</style>".len();
                block_regions.push((open_start, block_end));
                pos = block_end;
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
                let block_end = close_pos + "</agent>".len();
                block_regions.push((open_start, block_end));
                pos = block_end;
            }
        }
    }

    // v0.3.6: Check the trailing inter-block region (after last block) for reserved tokens.
    let trailing = &source[pos..];
    let trailing_start_line = line_at(source, pos);
    check_reserved_tokens(trailing, trailing_start_line)?;

    // v0.3.5: Cross-block symbol table warning pass.
    // After all blocks are parsed, warn about template references not in @state.
    // This is a simplified implementation — warnings only (full errors are v0.4+).
    if let Some(tmpl) = template {
        let sig_map = resolve_signals(script.unwrap_or(""));
        warn_undeclared_template_refs(tmpl, &sig_map);
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
