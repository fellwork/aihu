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

/// Find the next recognized block opener starting from `pos` in `source`.
/// Returns `(kind, absolute_offset)` for the earliest match, or `None`.
fn next_block(source: &str, pos: usize) -> Option<(BlockKind, usize)> {
    let slice = &source[pos..];

    let script_off = slice
        .find("<script setup")
        .map(|i| (BlockKind::Script, pos + i));
    let tmpl_off = slice
        .find("<template>")
        .map(|i| (BlockKind::Template, pos + i));
    let style_off = slice.find("<style").map(|i| (BlockKind::Style, pos + i));
    let agent_off = slice.find("<agent>").map(|i| (BlockKind::Agent, pos + i));

    [script_off, tmpl_off, style_off, agent_off]
        .into_iter()
        .flatten()
        .min_by_key(|&(_, off)| off)
}

pub fn parse(source: &str) -> Result<ScribeSource<'_>, CompileError> {
    let mut script: Option<&str> = None;
    let mut template: Option<&str> = None;
    let mut style: Option<StyleBlock> = None;
    let mut meta = ScriptMeta { name: None };
    let mut agent_raw: Option<&str> = None;

    let mut pos = 0usize;

    while let Some((kind, open_start)) = next_block(source, pos) {
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
