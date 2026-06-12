use crate::types::{CompileError, RouteBlock, AihuSource, ScriptMeta, SfcMeta, StyleBlock, StyleScope};
use crate::codegen::signals::collect_state_decls;

/// Count newlines before `pos` to derive a 1-based line number.
fn line_at(source: &str, pos: usize) -> usize {
    source[..pos].bytes().filter(|&b| b == b'\n').count() + 1
}

/// The kind of block found at a given position.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BlockKind {
    Script,
    Template,
    Style,
    Agent,
    /// v0.6.1: `@route { … }` block — page routing metadata.
    Route,
    /// v0.6.1: `@layout 'name'` shorthand — deprecated alias for @route { layout: '...' }.
    Layout,
    /// PR-2: `@meta { … }` block — recipe-catalog metadata (variants/slots/
    /// dependencies/registryDependencies). Does NOT carry `name` (R-META-COEXIST).
    Meta,
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
        ("route", BlockKind::Route),
        ("meta", BlockKind::Meta),
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

/// Match an `@layout 'name'` shorthand at byte position `pos`.
/// Returns `(BlockKind::Layout, opener_start, end_of_line)` if matched.
fn match_layout_shorthand(source: &str, pos: usize) -> Option<(BlockKind, usize, usize)> {
    let bytes = source.as_bytes();
    if pos >= bytes.len() || bytes[pos] != b'@' {
        return None;
    }
    // Verify start-of-line.
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
    let prefix = "@layout";
    if pos + prefix.len() > source.len() {
        return None;
    }
    if &source[pos..pos + prefix.len()] != prefix {
        return None;
    }
    // Check boundary: must be followed by whitespace or end-of-line.
    let after = bytes.get(pos + prefix.len()).copied();
    if !matches!(after, Some(b' ') | Some(b'\t') | Some(b'\r') | Some(b'\n') | None) {
        return None;
    }
    // Find end of line.
    let end = source[pos..].find('\n').map(|n| pos + n + 1).unwrap_or(source.len());
    Some((BlockKind::Layout, pos, end))
}

/// Find the matching closing `}` for an `@blockname { ... }` body, with brace
/// depth tracking per Block Structure Spec §2.4.
///
/// `body_start` is the byte position just past the opening `{`. The returned
/// position is the byte offset of the matching `}` (or `None` if unclosed).
///
/// Strings (`"…"`, `'…'`, `` `…` ``) and JS-style comments (`// …`, `/* … */`)
/// are skipped so that braces appearing inside them do not affect depth.
///
/// For `BlockKind::Template` the string-literal skip is disabled: template
/// bodies contain HTML prose where a bare apostrophe (e.g. "don't") must not
/// trigger string-literal mode and accidentally swallow the closing `}`.
fn find_at_block_close(source: &str, body_start: usize, kind: BlockKind) -> Option<usize> {
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
            b'"' | b'\'' | b'`' if kind != BlockKind::Template => {
                // String literal — skip to matching quote, honoring backslash escapes.
                // Disabled for @template blocks: HTML prose may contain bare apostrophes
                // (e.g. "don't") that must not trigger string-literal mode.
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
/// Returns `(kind, opener_offset, body_start_offset)` for the earliest match
/// (body_start is the byte just past the `{`). Returns `Ok(None)` when no
/// opener is found.
///
/// v1.0.7: any HTML-tag block form (`<script setup>`, `<template>`, `<style>`,
/// `<agent>`) encountered at top level is a hard error (C107). The HTML-tag
/// grammar was deprecated in v0.3 and removed in v1.0. Use `npx aihu migrate`
/// to convert legacy files.
fn next_block(source: &str, pos: usize) -> Result<Option<(BlockKind, usize, usize)>, CompileError> {
    // v1.0.7: reject HTML-tag block form with C107 if seen before any @-form
    // opener. Walk the slice in parallel to the @-scan so we can compare offsets
    // and surface the FIRST opener (regardless of grammar) — this gives the
    // user a precise diagnostic for the offending form.
    let slice = &source[pos..];
    let html_candidates: [Option<(&str, usize)>; 4] = [
        slice.find("<script setup").map(|i| ("<script setup>", pos + i)),
        slice.find("<template>").map(|i| ("<template>", pos + i)),
        slice.find("<style").map(|i| ("<style>", pos + i)),
        slice.find("<agent>").map(|i| ("<agent>", pos + i)),
    ];
    let html_min: Option<(&str, usize)> = html_candidates
        .into_iter()
        .flatten()
        .min_by_key(|&(_, off)| off);

    // `@`-form scan — walk every `@` and check if it is a valid opener.
    let mut at_min: Option<(BlockKind, usize, usize)> = None;
    let mut search = pos;
    while let Some(rel) = source[search..].find('@') {
        let abs = search + rel;
        if let Some(m) = match_at_opener(source, abs) {
            at_min = Some(m);
            break;
        }
        if let Some(m) = match_layout_shorthand(source, abs) {
            at_min = Some(m);
            break;
        }
        search = abs + 1;
        if search >= source.len() {
            break;
        }
    }

    // If an HTML-tag literal precedes the next @-form opener (or no @-form
    // opener exists at all), reject with C107 at the HTML-tag position.
    if let Some((form_label, html_off)) = html_min {
        let html_wins = match at_min {
            Some((_, at_off, _)) => html_off <= at_off,
            None => true,
        };
        if html_wins {
            return Err(CompileError {
                message: format!(
                    "C107: HTML-tag block form `{}` was removed in v1.0. \
                     Use `@state {{ … }}`, `@template {{ … }}`, `@style {{ … }}`, or `@agent {{ … }}` instead. \
                     Run: npx aihu migrate <file>",
                    form_label
                ),
                line: line_at(source, html_off),
                col: 0,
                code: Some("C107".to_string()),
                ..Default::default()
            });
        }
    }

    Ok(at_min.map(|(k, opener, body)| (k, opener, body)))
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
        // v1.0.x (fix #1): an `@<name> {` header at top level that matches none of
        // the five recognized blocks was previously SILENTLY DROPPED by `next_block`
        // (it only scans for known openers), so any identifiers the unknown block
        // "declared" leaked through as bare free variables -> ReferenceError ->
        // blank page (investigation 17f5394b-6dd8-4504-a2db-88cb5c4050e1, defect #1).
        // Make it a hard, loud error instead. Only fires for genuine top-level block
        // *headers* in the inter-block region (this function never sees the body of a
        // recognized block, so @media/@supports inside @style, markup inside @template,
        // and @route/@agent internals are unaffected).
        if let Some(name) = unknown_block_header_name(trimmed) {
            let hint = if name == "props" {
                " — props are declared with `$prop:` inside `@state`, not a top-level `@props` block"
            } else {
                " — the only recognized blocks are `@state`, `@template`, `@style`, `@agent`, `@route`"
            };
            return Err(CompileError {
                message: format!("unknown block `@{}`{}", name, hint),
                line: line_no,
                col: 0,
                code: Some("C204".to_string()),
                hint: Some(if name == "props" {
                    "declare props via `$prop:` inside `@state`".to_string()
                } else {
                    "recognized blocks: @state, @template, @style, @agent, @route".to_string()
                }),
                ..Default::default()
            });
        }
    }
    Ok(())
}

/// The five recognized `@blockname { … }` block names, plus the deprecated-but-
/// still-valid `@layout` shorthand. Kept in sync with `match_at_opener` /
/// `match_layout_shorthand`; any `@<name>` header at top level outside this set
/// is an unknown block (C204).
const KNOWN_BLOCK_NAMES: &[&str] = &["state", "template", "style", "agent", "route", "layout", "meta"];

/// If `trimmed` (an already-trimmed inter-block source line) is the header of an
/// unknown top-level block — i.e. it starts with `@<ident>` immediately followed
/// by whitespace or `{` (the block-header shape per Block Structure Spec §2.1)
/// and `<ident>` is not a recognized block name — return that identifier.
///
/// Returns `None` for recognized block headers and for any other `@`-usage that
/// is not a block-header opener (so it cannot misfire on unrelated content).
fn unknown_block_header_name(trimmed: &str) -> Option<&str> {
    let rest = trimmed.strip_prefix('@')?;
    // Read the leading ASCII-alphabetic/`_` identifier (block names are ASCII).
    let name_len = rest
        .bytes()
        .take_while(|&b| b.is_ascii_alphanumeric() || b == b'_')
        .count();
    if name_len == 0 {
        return None;
    }
    let name = &rest[..name_len];
    // The character after the identifier must be whitespace or `{` to qualify as a
    // block header (mirrors the `match_at_opener` boundary check that rejects e.g.
    // `@states` / `@templates`). Anything else (EOL, `(`, `.`, `'`, etc.) is not a
    // block header and is left alone.
    let after = rest.as_bytes().get(name_len).copied();
    let is_block_header = matches!(after, Some(b' ') | Some(b'\t') | Some(b'\r') | Some(b'{'));
    if !is_block_header {
        return None;
    }
    if KNOWN_BLOCK_NAMES.contains(&name) {
        return None;
    }
    Some(name)
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
/// not declared in `@state` and not in the JS globals list.
///
/// Per v0.3.5: this is a WARNING only (not a compile error). Full errors are
/// v0.4+ — so correctness matters: a false positive here will reject a valid
/// app once it becomes a hard error.
///
/// Bug 7 (06cb46b1 / 17f5394b): the `declared` set is now the full
/// `collect_state_decls` symbol set — `$prop:` keys, `$computed:` keys, plain
/// `@state` const/let bindings, plus `$action`/`$resource`/`$stream`/
/// `$controller`/`$route` names — so correctly-migrated code does NOT warn.
/// The scan also covers v1 single-curly `{ expr }` interpolations/bindings, not
/// only legacy `{{ }}`.
fn warn_undeclared_template_refs(
    template: &str,
    declared: &crate::codegen::signals::StateDecls,
) {
    for name in collect_undeclared_template_refs(template, declared) {
        warn_undeclared(&name);
    }
}

/// Pure collector: returns the (in source order) names that `@template`
/// references but `@state` does not declare. Drives `warn_undeclared_template_refs`
/// and is exercised directly by unit tests (stderr is awkward to assert on).
///
/// Scans BOTH legacy double-curly `{{ name }}` and v1 single-curly `{ expr }`
/// interpolations/bindings. Only BARE simple identifiers are flagged — any
/// operator, dot, paren, quote, comma, or colon inside the braces means it's an
/// expression or object literal (not a cross-block reference) and is left alone,
/// so the pass cannot misfire on `{count + 1}`, `{ {a:1} }`, `{obj.x}`, etc.
pub(crate) fn collect_undeclared_template_refs(
    template: &str,
    declared: &crate::codegen::signals::StateDecls,
) -> Vec<String> {
    // FEL-184: `$each` loop aliases ("list as item" / "list as item, idx" —
    // attribute and `{#each}` block forms) are template-scoped bindings, not
    // cross-block references. Register them before validating so `{c}` inside
    // `$each="chaptersOf(b) as c"` doesn't warn (and doesn't become a hard
    // error at the v0.4 promotion). Template-global registration is
    // deliberate: this is a declaredness check, not a scope checker.
    let each_aliases = collect_each_aliases(template);
    let is_declared = |name: &str| -> bool {
        declared.all.contains(name)
            || JS_GLOBALS.contains(&name)
            || each_aliases.contains(name)
    };
    let mut out: Vec<String> = Vec::new();

    let bytes = template.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'{' {
            let next = bytes.get(i + 1).copied();
            // Double-curly `{{ name }}` — read to the matching `}}`.
            if next == Some(b'{') {
                if let Some(end_rel) = template[i + 2..].find("}}") {
                    let inner = template[i + 2..i + 2 + end_rel].trim();
                    if is_simple_ident(inner) && !is_declared(inner) {
                        out.push(inner.to_string());
                    }
                    i = i + 2 + end_rel + 2;
                    continue;
                } else {
                    break; // unclosed
                }
            }
            // Block-tag forms `{#`, `{:`, `{/`, `{@` — not interpolations.
            if matches!(next, Some(b'#') | Some(b':') | Some(b'/') | Some(b'@')) {
                i += 1;
                continue;
            }
            // Single-curly `{ expr }` — brace-balanced read to the matching `}`
            // (mirrors the template parser's `parse_expr_interpolation`).
            let mut depth = 1usize;
            let mut j = i + 1;
            while j < bytes.len() {
                match bytes[j] {
                    b'{' => depth += 1,
                    b'}' => {
                        depth -= 1;
                        if depth == 0 {
                            break;
                        }
                    }
                    _ => {}
                }
                j += 1;
            }
            if depth != 0 {
                break; // unbalanced — leave the rest alone
            }
            let inner = template[i + 1..j].trim();
            if is_simple_ident(inner) && !is_declared(inner) {
                out.push(inner.to_string());
            }
            i = j + 1;
            continue;
        }
        i += 1;
    }
    out
}

/// A "simple identifier" worth flagging: non-empty, all `[A-Za-z0-9_]`. Anything
/// containing operators/dots/parens/braces is an expression (or object literal),
/// not a bare cross-block reference, and is deliberately not flagged.
fn is_simple_ident(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_alphanumeric() || c == '_')
}

/// FEL-184: collect every `$each` loop alias declared anywhere in the template,
/// covering both the attribute form (`$each="list as item"` /
/// `$each="list as item, idx"`, quoted or curly value) and the block form
/// (`{#each list as item, idx}`). Mirrors the alias parsing in
/// `emit_macro_effects` (split on " as ", then ','). Aliases that aren't simple
/// identifiers are skipped — the checker only flags simple identifiers anyway.
fn collect_each_aliases(template: &str) -> std::collections::BTreeSet<String> {
    let mut aliases = std::collections::BTreeSet::new();
    let mut register = |rest: &str| {
        // rest is the text AFTER " as ": "item" or "item, idx".
        for part in rest.split(',') {
            let alias = part.trim();
            if is_simple_ident(alias) {
                aliases.insert(alias.to_string());
            }
        }
    };

    // Attribute form: `$each=` followed by a quoted string or curly expression.
    let mut search = template;
    while let Some(pos) = search.find("$each=") {
        let after = &search[pos + "$each=".len()..];
        let value: Option<&str> = match after.bytes().next() {
            Some(b'"') => after[1..].find('"').map(|end| &after[1..1 + end]),
            Some(b'\'') => after[1..].find('\'').map(|end| &after[1..1 + end]),
            Some(b'{') => {
                // Brace-balanced read (mirrors parse_expr_interpolation).
                let bytes = after.as_bytes();
                let mut depth = 0usize;
                let mut end = None;
                for (j, &b) in bytes.iter().enumerate() {
                    match b {
                        b'{' => depth += 1,
                        b'}' => {
                            depth -= 1;
                            if depth == 0 {
                                end = Some(j);
                                break;
                            }
                        }
                        _ => {}
                    }
                }
                end.map(|j| &after[1..j])
            }
            _ => None,
        };
        if let Some(v) = value {
            if let Some((_, rest)) = v.split_once(" as ") {
                register(rest);
            }
        }
        search = &search[pos + "$each=".len()..];
    }

    // Block form: `{#each list as item, idx}` — read to the closing `}`.
    let mut search = template;
    while let Some(pos) = search.find("{#each ") {
        let after = &search[pos + "{#each ".len()..];
        if let Some(end) = after.find('}') {
            if let Some((_, rest)) = after[..end].split_once(" as ") {
                register(rest);
            }
        }
        search = &search[pos + "{#each ".len()..];
    }

    aliases
}

fn warn_undeclared(name: &str) {
    eprintln!(
        "warning: '@template' references '{}' which is not declared in '@state'. \
         Undeclared cross-block references will become errors in v0.4.",
        name
    );
}

/// Parse the body of an `@route { … }` block into a `RouteBlock`.
///
/// Accepts a TypeScript-style object literal with keys:
///   `path`, `name`, `layout` — quoted strings
///   `ssr`                    — `true` or `false`
///   `middleware`             — array literal `['auth', 'admin']`
fn parse_route_body(body: &str) -> RouteBlock {
    let mut route = RouteBlock::default();
    // Parse each key: value pair. We do a simple line-by-line scan.
    let text: &str = body;
    let mut pos = 0usize;
    let bytes = text.as_bytes();

    while pos < bytes.len() {
        // Skip whitespace and commas.
        while pos < bytes.len() && matches!(bytes[pos], b' ' | b'\t' | b'\n' | b'\r' | b',') {
            pos += 1;
        }
        if pos >= bytes.len() {
            break;
        }
        // Read key identifier.
        let key_start = pos;
        while pos < bytes.len() && (bytes[pos].is_ascii_alphanumeric() || bytes[pos] == b'_') {
            pos += 1;
        }
        if pos == key_start {
            // Not an identifier — skip char.
            pos += 1;
            continue;
        }
        let key = &text[key_start..pos];
        // Skip whitespace and colon.
        while pos < bytes.len() && matches!(bytes[pos], b' ' | b'\t') {
            pos += 1;
        }
        if pos < bytes.len() && bytes[pos] == b':' {
            pos += 1;
        } else {
            continue;
        }
        // Skip whitespace.
        while pos < bytes.len() && matches!(bytes[pos], b' ' | b'\t') {
            pos += 1;
        }
        if pos >= bytes.len() {
            break;
        }

        match key {
            "path" | "name" | "layout" => {
                if let Some((val, end)) = read_quoted_string(text, pos) {
                    match key {
                        "path" => route.path = Some(val),
                        "name" => route.name = Some(val),
                        "layout" => route.layout = Some(val),
                        _ => {}
                    }
                    pos = end;
                } else {
                    pos += 1;
                }
            }
            "ssr" => {
                if text[pos..].starts_with("true") {
                    route.ssr = Some(true);
                    pos += 4;
                } else if text[pos..].starts_with("false") {
                    route.ssr = Some(false);
                    pos += 5;
                } else {
                    pos += 1;
                }
            }
            "middleware" => {
                // Expect `[...]` array.
                if bytes[pos] == b'[' {
                    pos += 1;
                    loop {
                        while pos < bytes.len() && matches!(bytes[pos], b' ' | b'\t' | b'\n' | b'\r' | b',') {
                            pos += 1;
                        }
                        if pos >= bytes.len() || bytes[pos] == b']' {
                            if pos < bytes.len() {
                                pos += 1;
                            }
                            break;
                        }
                        if let Some((val, end)) = read_quoted_string(text, pos) {
                            route.middleware.push(val);
                            pos = end;
                        } else {
                            pos += 1;
                        }
                    }
                } else {
                    pos += 1;
                }
            }
            "head" => {
                // B1 (SEO arc) — capture the balanced `{...}` head literal and
                // delegate to the SHARED head parser in `route.rs` so this
                // production parser cannot drift from the unit-test parser.
                if let Some(literal) =
                    crate::parser::route::capture_balanced_literal(text, bytes, &mut pos)
                {
                    route.head = Some(crate::parser::route::parse_head_literal(&literal));
                }
            }
            _ => {
                // Unknown key — skip to end of value (next comma or `}`).
                while pos < bytes.len() && !matches!(bytes[pos], b',' | b'}' | b'\n') {
                    pos += 1;
                }
            }
        }
    }
    route
}

/// Parse the body of an `@meta { … }` block into a `SfcMeta`.
///
/// R-JSON5: the body is a LENIENT JSON5-style object literal (unquoted keys,
/// single OR double quotes, trailing commas) — parsed via the `json5` crate.
///
/// R-BRACE-REWRAP: the block parser (`find_at_block_close`) already strips the
/// outer `{ }`, so `body` is the brace-INNER content (e.g.
/// `variants: { variant: ['a','b'] }, slots: ['button']`). We re-wrap it in
/// `{ … }` to form a complete JSON5 object literal before handing it to the
/// parser. An empty `@meta {}` re-wraps to `{}` → an all-default `SfcMeta`.
///
/// R-META-COEXIST: `SfcMeta` has no `name` field, so `@meta` cannot set or
/// override the component name; tag resolution stays authoritative elsewhere.
/// A malformed body surfaces as a C110 compile error carrying the `@meta`
/// opener line (`open_line`).
fn parse_meta_body(body: &str, open_line: usize) -> Result<SfcMeta, CompileError> {
    // R-BRACE-REWRAP — re-wrap the brace-stripped body into a full object literal.
    let wrapped = format!("{{{}}}", body);
    json5::from_str::<SfcMeta>(&wrapped).map_err(|e| CompileError {
        message: format!("C110: malformed @meta block — {}", e),
        line: open_line,
        col: 0,
        code: Some("C110".to_string()),
        hint: Some(
            "the @meta body is a JSON5 object literal with keys \
             variants/slots/dependencies/registryDependencies"
                .to_string(),
        ),
        ..Default::default()
    })
}

/// Read a quoted string (single or double quotes) from `text` starting at `pos`.
/// Returns `(value, end_pos)` where `end_pos` is the byte after the closing quote.
fn read_quoted_string(text: &str, pos: usize) -> Option<(String, usize)> {
    let bytes = text.as_bytes();
    if pos >= bytes.len() {
        return None;
    }
    let quote = bytes[pos];
    if quote != b'\'' && quote != b'"' {
        return None;
    }
    let mut i = pos + 1;
    let mut val = String::new();
    while i < bytes.len() {
        let c = bytes[i];
        if c == b'\\' && i + 1 < bytes.len() {
            val.push(bytes[i + 1] as char);
            i += 2;
            continue;
        }
        if c == quote {
            return Some((val, i + 1));
        }
        val.push(c as char);
        i += 1;
    }
    None
}

/// Check whether a file path represents a `pages/` file (per v0.6.1 C500 rule).
fn is_pages_path(file_path: Option<&str>) -> bool {
    match file_path {
        Some(p) => p.contains("/pages/") || p.contains("\\pages\\") || p.contains("/pages\\") || p.contains("\\pages/"),
        None => false,
    }
}

/// Block ordering note (Block Structure Spec §3.3):
///
/// Blocks may appear in any order within a `.aihu` file. The compiler does
/// NOT enforce a canonical order. The recommended order for tooling and formatter
/// output is: `@state`, `@template`, `@style`, `@agent`. The default formatter
/// rewrites files to this order on save. No ordering enforcement occurs here.
pub fn parse(source: &str) -> Result<AihuSource<'_>, CompileError> {
    parse_with_path(source, None)
}

/// Parse a `.aihu` source with an optional file path (used for C500 @route path check).
pub fn parse_with_path<'a>(source: &'a str, file_path: Option<&str>) -> Result<AihuSource<'a>, CompileError> {
    let mut script: Option<&str> = None;
    let mut template: Option<&str> = None;
    let mut style: Option<StyleBlock> = None;
    let meta = ScriptMeta { name: None };
    let mut agent_raw: Option<&str> = None;
    let mut route: Option<RouteBlock> = None;
    let mut sfc_meta: Option<SfcMeta> = None;

    // v1.0.7: HTML-tag block grammar (`<script setup>` / `<template>` / `<style>` /
    // `<agent>`) was removed. Only the `@blockname { … }` grammar (Block Structure
    // Spec §2) is accepted. HTML-tag literals at top level are now a C107 hard
    // error, raised by `next_block` at the first offending tag.

    // Track block end positions for inter-block reserved-token checks (v0.3.6).
    let mut block_regions: Vec<(usize, usize)> = Vec::new(); // (start_byte, end_byte)

    let mut pos = 0usize;

    while let Some((kind, open_start, body_start_at)) = next_block(source, pos)? {
        // Record the inter-block region before this block for reserved-token checking.
        let region_before = &source[pos..open_start];
        let region_start_line = line_at(source, pos);
        check_reserved_tokens(region_before, region_start_line)?;

        // v0.6.1: @layout shorthand is a single-line block — handle separately.
        if kind == BlockKind::Layout {
            // body_start_at is end_of_line for layout shorthand.
            let line_content = &source[open_start..body_start_at];
            // Parse: @layout 'name'
            // Extract the quoted value after `@layout`.
            let after_layout = line_content.trim_start_matches(|c: char| c.is_whitespace());
            let after_keyword = after_layout.strip_prefix("@layout").unwrap_or(after_layout).trim();
            let layout_val = read_quoted_string(after_keyword, 0)
                .map(|(v, _)| v)
                .unwrap_or_else(|| after_keyword.trim_matches('\'').trim_matches('"').to_string());

            // C500: @layout is also only valid in pages/ files.
            if !is_pages_path(file_path) {
                return Err(CompileError {
                    message: "C500: @route block is only valid in src/pages/ files".to_string(),
                    line: line_at(source, open_start),
                    col: 0,
                    code: Some("C500".to_string()),
                    ..Default::default()
                });
            }

            eprintln!(
                "warning: @layout shorthand is deprecated (use `@route {{ layout: '{}' }}` instead); will be removed in v1.1.",
                layout_val
            );

            if route.is_some() {
                return Err(CompileError {
                    message: "duplicate @route / @layout block".to_string(),
                    line: line_at(source, open_start),
                    col: 0,
                    ..Default::default()
                });
            }
            route = Some(RouteBlock {
                layout: Some(layout_val),
                ..Default::default()
            });
            let block_end = body_start_at;
            block_regions.push((open_start, block_end));
            pos = block_end;
            continue;
        }

        // Unified `@blockname { … }` handler — body delimited by brace
        // depth per Block Structure Spec §2.4.
        let body_start = body_start_at;
        let close_pos = find_at_block_close(source, body_start, kind).ok_or_else(|| {
            let (label, code) = match kind {
                BlockKind::Script => ("@state", "C101"),
                BlockKind::Template => ("@template", "C102"),
                BlockKind::Style => ("@style", "C103"),
                BlockKind::Agent => ("@agent", "C104"),
                BlockKind::Route => ("@route", "C105"),
                BlockKind::Layout => ("@layout", "C106"),
                BlockKind::Meta => ("@meta", "C108"),
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
                // v0.x Amendment 02: if `$global { ... }` uses a braced block form,
                // strip the outer braces so the inner content is stored as the style body.
                let (style_scope, style_content) = if body.starts_with("$global") {
                    let rest = body["$global".len()..].trim();
                    // If the rest starts with `{`, strip the outer braces (block form).
                    let inner = if rest.starts_with('{') {
                        let close = crate::parser::state_macros::find_brace_close(rest, 1)
                            .unwrap_or(rest.len());
                        rest[1..close].trim()
                    } else {
                        rest
                    };
                    (StyleScope::Global, inner)
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
            BlockKind::Route => {
                // v0.6.1: C500 — @route only valid in pages/ files.
                if !is_pages_path(file_path) {
                    return Err(CompileError {
                        message: "C500: @route block is only valid in src/pages/ files".to_string(),
                        line: line_at(source, open_start),
                        col: 0,
                        code: Some("C500".to_string()),
                        ..Default::default()
                    });
                }
                if route.is_some() {
                    return Err(CompileError {
                        message: "duplicate @route block".to_string(),
                        line: line_at(source, open_start),
                        col: 0,
                        ..Default::default()
                    });
                }
                route = Some(parse_route_body(body));
            }
            BlockKind::Meta => {
                if sfc_meta.is_some() {
                    return Err(CompileError {
                        message: "C109: duplicate @meta block".to_string(),
                        line: line_at(source, open_start),
                        col: 0,
                        code: Some("C109".to_string()),
                        ..Default::default()
                    });
                }
                sfc_meta = Some(parse_meta_body(body, line_at(source, open_start))?);
            }
            BlockKind::Layout => {
                // Layout is handled above in the shorthand branch; this arm won't be reached.
                unreachable!("@layout shorthand handled before brace-body match");
            }
        }
        let block_end = close_pos + 1; // past the `}`
        block_regions.push((open_start, block_end));
        pos = block_end;
    }

    // v0.3.6: Check the trailing inter-block region (after last block) for reserved tokens.
    let trailing = &source[pos..];
    let trailing_start_line = line_at(source, pos);
    check_reserved_tokens(trailing, trailing_start_line)?;

    // v0.3.5: Cross-block symbol table warning pass.
    // After all blocks are parsed, warn about template references not in @state.
    // This is a simplified implementation — warnings only (full errors are v0.4+).
    if let Some(tmpl) = template {
        // Bug 7: the declared-symbol set is the full @state symbol table
        // (collect_state_decls), so $prop/$computed/plain-const all count as
        // declared. Both `{{ }}` and `{ }` interpolations are scanned.
        let decls = collect_state_decls(script.unwrap_or(""));
        warn_undeclared_template_refs(tmpl, &decls);
    }

    let agent = if let Some(raw) = agent_raw {
        Some(crate::parser::agent::parse_agent(raw)?)
    } else {
        None
    };

    Ok(AihuSource {
        script,
        template,
        style,
        meta,
        agent,
        route,
        stream: None, // v0.4.0: @stream block parsing deferred to stream_macros module
        sfc_meta,
    })
}

#[cfg(test)]
mod crossblock_warn_tests {
    use super::*;
    use crate::codegen::signals::collect_state_decls;

    fn undeclared(state: &str, template: &str) -> Vec<String> {
        let decls = collect_state_decls(state);
        collect_undeclared_template_refs(template, &decls)
    }

    // ─── Bug 7 — valid migrated code does NOT warn ───────────────────────────

    #[test]
    fn migrated_prop_plus_computed_single_curly_no_warning() {
        // The report's exact repro: $prop + $computed, single-curly binding.
        let state = "\
$prop: { active: { default: '', type: \"string\" } }
$computed: { cls: () => active() === 'home' ? 'on' : '' }";
        let warnings = undeclared(state, "<a $class={cls}>Home</a>");
        assert!(warnings.is_empty(), "valid migrated code must not warn: {warnings:?}");
    }

    #[test]
    fn plain_const_single_curly_no_warning() {
        let state = "const greeting = 'hello'";
        let warnings = undeclared(state, "<p>{greeting}</p>");
        assert!(warnings.is_empty(), "declared plain const must not warn: {warnings:?}");
    }

    // ─── Bug 7 — genuinely undeclared refs STILL warn (not neutered) ─────────

    #[test]
    fn genuinely_undeclared_single_curly_still_warns() {
        let state = "$prop: { active: { default: '' } }";
        let warnings = undeclared(state, "<a $class={nope}>Home</a>");
        assert_eq!(warnings, vec!["nope".to_string()]);
    }

    #[test]
    fn genuinely_undeclared_double_curly_still_warns() {
        let state = "const [count, setCount] = signal(0)";
        // count declared (legacy signal); undeclaredName is not.
        let warnings = undeclared(state, "<div>{{ count }} {{ undeclaredName }}</div>");
        assert_eq!(warnings, vec!["undeclaredName".to_string()]);
    }

    // ─── Bug 7 (b) — single-curly is now SCANNED (was blind before) ──────────

    #[test]
    fn single_curly_is_scanned_not_ignored() {
        // Before the fix the pass only looked at `{{ }}`; a bare single-curly
        // undeclared ref was invisible. Now it is caught.
        let warnings = undeclared("", "<span>{lonelyRef}</span>");
        assert_eq!(warnings, vec!["lonelyRef".to_string()]);
    }

    // ─── FEL-184 — $each loop aliases are template-scoped, not cross-block ───

    #[test]
    fn fel184_each_attr_alias_does_not_warn() {
        // The field repro: `$each="chaptersOf(b) as c"` then `{c}` inside.
        let state = "const chaptersOf = (b) => []";
        let warnings = undeclared(
            state,
            r#"<ul><li $each="chaptersOf(b) as c">{c}</li></ul>"#,
        );
        assert!(
            warnings.is_empty(),
            "FEL-184: $each alias must be registered before validating: {warnings:?}"
        );
    }

    #[test]
    fn fel184_each_attr_alias_with_index_does_not_warn() {
        let state = "const items = []";
        let warnings = undeclared(
            state,
            r#"<ul><li $each="items as it, idx">{it} {idx}</li></ul>"#,
        );
        assert!(warnings.is_empty(), "item AND idx aliases register: {warnings:?}");
    }

    #[test]
    fn fel184_each_block_alias_does_not_warn() {
        let state = "const rows = []";
        let warnings = undeclared(state, "{#each rows as r, n}<p>{r} {n}</p>{/each}");
        assert!(warnings.is_empty(), "block-form aliases register: {warnings:?}");
    }

    #[test]
    fn fel184_nested_each_alias_does_not_warn() {
        // Second field repro: nested each over a loop var's member
        // (`$each="v.phrases as p"`).
        let state = "const verses = []";
        let warnings = undeclared(
            state,
            r#"<div $each="verses as v"><span $each="v.phrases as p">{p}</span></div>"#,
        );
        assert!(warnings.is_empty(), "nested aliases register: {warnings:?}");
    }

    #[test]
    fn fel184_genuinely_undeclared_still_warns_alongside_each() {
        // The checker must not be neutered: an unrelated bare ref still warns.
        let state = "const items = []";
        let warnings = undeclared(
            state,
            r#"<ul><li $each="items as it">{it} {strayRef}</li></ul>"#,
        );
        assert_eq!(warnings, vec!["strayRef".to_string()]);
    }

    // ─── Bug 7 — must NOT misfire on non-interpolation braces ────────────────

    #[test]
    fn expression_and_object_braces_do_not_warn() {
        // Expressions (operators/dots/parens) and object literals are not bare
        // cross-block references — they must not be flagged.
        let state = "const a = 1";
        assert!(undeclared(state, "<div>{a + 1}</div>").is_empty(), "expr not flagged");
        assert!(undeclared(state, "<div>{obj.field}</div>").is_empty(), "member not flagged");
        assert!(undeclared(state, "<div>{ {k: 1} }</div>").is_empty(), "object literal not flagged");
        assert!(undeclared(state, "<div>{fn(x)}</div>").is_empty(), "call not flagged");
    }

    #[test]
    fn block_tag_braces_are_not_interpolations() {
        // `{#if}` / `{:else}` / `{/if}` / `{@html}` must not be scanned as refs.
        let state = "const cond = true";
        let warnings = undeclared(state, "{#if cond}<p>hi</p>{:else}<p>no</p>{/if}");
        assert!(warnings.is_empty(), "block tags must not warn: {warnings:?}");
    }

    #[test]
    fn js_globals_are_not_flagged() {
        let warnings = undeclared("", "<p>{undefined}</p>");
        assert!(warnings.is_empty(), "JS globals must not warn: {warnings:?}");
    }
}
