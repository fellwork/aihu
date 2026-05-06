/// v2 — `@state` macro declarations parser (object-literal collection-form).
///
/// Parses `$macro` declarations inside an `@state { }` block body and lowers
/// them to JS via `emit_state_macros`.
///
/// **The 6 changing macros** (`$prop`, `$computed`, `$action`, `$resource`,
/// `$effect`, `$lifecycle`) take the v2 collection-form: a single object
/// literal whose keys are entry names and whose values are either bare
/// function expressions (implicit handler/value/callback) or wrapped
/// metadata-bag object literals carrying `describe`, `expose`, `default`,
/// `type`, `value`, `handler`, `on`. v1 per-line forms (e.g. `$prop name:
/// Type`, `$action name(args) { body }`) are **rejected with C440** — the
/// migration codemod (`packages/compiler/codemods/macro-simplification/`)
/// upgrades v1 source to v2.
///
/// **Anonymous `$effect`** (§2.5) is `$effect: () => { body }` — the macro
/// keyword takes a single function directly, distinct from `$effect: { ... }`
/// (the named-collection form). Both shapes MAY coexist in a single `@state`
/// block (one anonymous + one named-collection); two anonymous forms is
/// rejected with C441.
///
/// **Preserved from v1 (out of v2 redesign scope):** `$watch`,
/// `$effect.on(...)`, `$route`, `$beforeNavigate`, `$afterNavigate`.

use crate::types::{CollectionEntry, CollectionKind, CompileError, StateMacro};

/// Parse `$macro` declarations from the body of an `@state { }` block.
///
/// Returns a list of parsed `StateMacro` declarations (in order of appearance).
/// Lines that are not macro declarations are ignored (they remain as plain JS).
pub fn parse_state_macros(body: &str) -> Result<Vec<StateMacro>, CompileError> {
    let mut result = Vec::new();
    let bytes = body.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        let nl = body[i..].find('\n').map(|r| i + r).unwrap_or(body.len());
        let line = body[i..nl].trim();

        if let Some(rest) = line.strip_prefix('$') {
            // The trimmed `line` may have leading whitespace in the original
            // body (indented inside `@state { ... }`). `try_parse_macro`'s
            // offset math assumes `$` lives exactly at `line_offset`, so
            // skip past leading whitespace before computing the offset.
            let mut dollar_pos = i;
            while dollar_pos < nl
                && matches!(bytes[dollar_pos], b' ' | b'\t')
            {
                dollar_pos += 1;
            }
            if let Some((mac, advance_to)) = try_parse_macro(rest, body, dollar_pos)? {
                result.push(mac);
                if advance_to > i {
                    i = advance_to;
                    if i < body.len() && body.as_bytes()[i] == b'\n' {
                        i += 1;
                    }
                    continue;
                }
            }
        }

        i = nl + 1;
    }

    // Multiplicity check (spec §2.5): at most one anonymous `$effect: () => ...`
    // line per `@state` block. Multiple named-collection `$effect: { ... }`
    // entries inside the same collection block are forbidden by JS object-
    // literal syntax (duplicate keys), so this only need check the anonymous
    // form. Two anonymous-form lines collide → C441.
    let anon_count = result
        .iter()
        .filter(|m| matches!(m, StateMacro::EffectAnon { .. }))
        .count();
    if anon_count > 1 {
        return Err(CompileError {
            message: "two anonymous `$effect: () => {...}` lines in the same `@state` block — \
                use the named-collection form (`$effect: { name: () => {...} }`) for multiple effects"
                .to_string(),
            line: 0,
            col: 0,
            code: Some("C441".to_string()),
            ..Default::default()
        });
    }

    Ok(result)
}

/// Try to parse a single macro declaration. `rest` is the line content
/// after the leading `$`; `full_body` and `line_offset` index into the
/// `@state` body so multi-line bodies can be captured. Returns `(macro,
/// advance_to)` where `advance_to` is the byte offset in `full_body` past
/// the consumed macro (caller skips to that position).
fn try_parse_macro(
    rest: &str,
    full_body: &str,
    line_offset: usize,
) -> Result<Option<(StateMacro, usize)>, CompileError> {
    // ─── v2 collection-form: $<keyword>: { ... } or $effect: () => { ... } ────
    //
    // Six keywords accept the collection-form: prop, computed, action, resource,
    // effect, lifecycle. `effect` additionally accepts the anonymous form
    // (`$effect: () => { body }`).

    // v1 form `$lifecycle.mount` / `$lifecycle.dispose` — C440 (the dot
    // discriminator means this is NOT the v2 collection form).
    if rest.starts_with("lifecycle.mount") || rest.starts_with("lifecycle.dispose") {
        return Err(c440(rest, CollectionKind::Lifecycle));
    }

    if let Some(kind) = match_collection_keyword(rest) {
        let kw_len = collection_keyword_len(kind);
        // Position in full_body just past `$<keyword>`.
        let after_kw = line_offset + 1 /* $ */ + kw_len;
        // Skip whitespace.
        let mut p = after_kw;
        while p < full_body.len()
            && matches!(full_body.as_bytes()[p], b' ' | b'\t')
        {
            p += 1;
        }
        // Expect `:` next (collection-form). Anything else (e.g. `$prop name:`,
        // `$computed name =`, `$action name(`, `$resource name =`)
        // is the old v1 form → C440.
        if p >= full_body.len() || full_body.as_bytes()[p] != b':' {
            return Err(c440(rest, kind));
        }
        p += 1; // past ':'
        // Skip whitespace (incl. newlines).
        while p < full_body.len()
            && matches!(full_body.as_bytes()[p], b' ' | b'\t' | b'\n' | b'\r')
        {
            p += 1;
        }
        if p >= full_body.len() {
            return Err(CompileError {
                message: format!(
                    "${}: expected `{{` or function expression after `:`",
                    keyword_name(kind)
                ),
                line: 0,
                col: 0,
                code: Some("C442".to_string()),
                ..Default::default()
            });
        }

        // `$effect: () => ...` — anonymous effect form (only valid for $effect).
        if matches!(kind, CollectionKind::Effect) && full_body.as_bytes()[p] == b'(' {
            // Parse the arrow-function. Find `(` ... `)` then `=>` then expr/block.
            let close_paren = find_paren_close(full_body, p + 1).ok_or_else(|| CompileError {
                message: "$effect anonymous form: unclosed `(` in arrow params".to_string(),
                line: 0,
                col: 0,
                code: Some("C442".to_string()),
                ..Default::default()
            })?;
            // After ')' skip whitespace, expect `=>`.
            let mut q = close_paren + 1;
            while q < full_body.len()
                && matches!(full_body.as_bytes()[q], b' ' | b'\t')
            {
                q += 1;
            }
            if q + 1 >= full_body.len()
                || full_body.as_bytes()[q] != b'='
                || full_body.as_bytes()[q + 1] != b'>'
            {
                return Err(CompileError {
                    message: "$effect anonymous form: expected `=>` after `()`".to_string(),
                    line: 0,
                    col: 0,
                    code: Some("C442".to_string()),
                    ..Default::default()
                });
            }
            q += 2; // past '=>'
            while q < full_body.len()
                && matches!(full_body.as_bytes()[q], b' ' | b'\t' | b'\n' | b'\r')
            {
                q += 1;
            }
            if q >= full_body.len() {
                return Err(CompileError {
                    message: "$effect anonymous form: missing arrow body".to_string(),
                    line: 0,
                    col: 0,
                    code: Some("C442".to_string()),
                    ..Default::default()
                });
            }
            let (body, advance) = if full_body.as_bytes()[q] == b'{' {
                let close = find_brace_close(full_body, q + 1).ok_or_else(|| CompileError {
                    message: "$effect anonymous form: unclosed `{` in arrow body".to_string(),
                    line: 0,
                    col: 0,
                    code: Some("C442".to_string()),
                    ..Default::default()
                })?;
                (full_body[q + 1..close].trim().to_string(), close + 1)
            } else {
                // Expression body — read to end of line / statement.
                let nl = full_body[q..].find('\n').map(|r| q + r).unwrap_or(full_body.len());
                (full_body[q..nl].trim().trim_end_matches(';').trim().to_string(), nl)
            };
            return Ok(Some((StateMacro::EffectAnon { body }, advance)));
        }

        // Otherwise expect `{` opening the collection body.
        if full_body.as_bytes()[p] != b'{' {
            return Err(c440(rest, kind));
        }
        let close = find_brace_close(full_body, p + 1).ok_or_else(|| CompileError {
            message: format!("${}: unclosed `{{` in collection body", keyword_name(kind)),
            line: 0,
            col: 0,
            code: Some("C442".to_string()),
            ..Default::default()
        })?;
        let inner = &full_body[p + 1..close];
        let entries = parse_object_collection(inner, kind)?;
        return Ok(Some((StateMacro::Collection { kind, entries }, close + 1)));
    }

    // ─── Preserved-from-v1 macros (out of v2 redesign scope) ─────────────────

    // arch-5 M1: $route name (RFC-A5-010). Prefix-match BEFORE other keywords.
    if let Some(decl) = rest.strip_prefix("route ") {
        let name = decl.trim();
        if name.contains('=') || name.is_empty() {
            return Err(CompileError {
                message: format!(
                    "$route declaration takes no rhs — expected '$route name', got '$route {}'",
                    decl
                ),
                line: 0,
                col: 0,
                code: Some("C406".to_string()),
                ..Default::default()
            });
        }
        let nl = full_body[line_offset..]
            .find('\n')
            .map(|r| line_offset + r)
            .unwrap_or(full_body.len());
        return Ok(Some((StateMacro::Route { name: name.to_string() }, nl)));
    }

    // arch-5 M1: $beforeNavigate(fn) — RFC-A5-015
    if let Some(after_kw) = rest.strip_prefix("beforeNavigate") {
        let kw_len = "$beforeNavigate".len();
        let mut p = line_offset + kw_len;
        while p < full_body.len()
            && matches!(full_body.as_bytes()[p], b' ' | b'\t' | b'\n' | b'\r')
        {
            p += 1;
        }
        if p >= full_body.len() || full_body.as_bytes()[p] != b'(' {
            return Err(CompileError {
                message: format!(
                    "$beforeNavigate expects '(' — got '$beforeNavigate{}'",
                    after_kw
                ),
                line: 0,
                col: 0,
                code: Some("C407".to_string()),
                ..Default::default()
            });
        }
        let close = find_paren_close(full_body, p + 1).ok_or_else(|| CompileError {
            message: "$beforeNavigate — unclosed '('".to_string(),
            line: 0,
            col: 0,
            code: Some("C407".to_string()),
            ..Default::default()
        })?;
        let expr = full_body[p + 1..close].trim().to_string();
        return Ok(Some((StateMacro::BeforeNavigate { expr }, close + 1)));
    }

    // arch-5 M1: $afterNavigate(fn) — RFC-A5-016
    if let Some(after_kw) = rest.strip_prefix("afterNavigate") {
        let kw_len = "$afterNavigate".len();
        let mut p = line_offset + kw_len;
        while p < full_body.len()
            && matches!(full_body.as_bytes()[p], b' ' | b'\t' | b'\n' | b'\r')
        {
            p += 1;
        }
        if p >= full_body.len() || full_body.as_bytes()[p] != b'(' {
            return Err(CompileError {
                message: format!("$afterNavigate expects '(' — got '$afterNavigate{}'", after_kw),
                line: 0,
                col: 0,
                code: Some("C408".to_string()),
                ..Default::default()
            });
        }
        let close = find_paren_close(full_body, p + 1).ok_or_else(|| CompileError {
            message: "$afterNavigate — unclosed '('".to_string(),
            line: 0,
            col: 0,
            code: Some("C408".to_string()),
            ..Default::default()
        })?;
        let expr = full_body[p + 1..close].trim().to_string();
        return Ok(Some((StateMacro::AfterNavigate { expr }, close + 1)));
    }

    // $effect.on(dep) { body } — out of v2 redesign scope, kept as-is.
    if let Some(decl) = rest.strip_prefix("effect.on(") {
        let close_paren = decl.find(')').ok_or_else(|| CompileError {
            message: "$effect.on() — missing closing ')'".to_string(),
            line: 0,
            col: 0,
            code: Some("C403".to_string()),
            ..Default::default()
        })?;
        let dep = decl[..close_paren].trim().to_string();
        let (body, advance) = extract_brace_body_with_pos(full_body, line_offset)?;
        return Ok(Some((StateMacro::EffectOn { dep, body }, advance)));
    }

    // $watch name { body } — out of v2 redesign scope, kept as-is.
    if let Some(decl) = rest.strip_prefix("watch ") {
        let decl = decl.trim();
        let end = decl
            .find(|c: char| c.is_whitespace() || c == '{')
            .unwrap_or(decl.len());
        let name = decl[..end].trim().to_string();
        let (body, advance) = extract_brace_body_with_pos(full_body, line_offset)?;
        return Ok(Some((StateMacro::Watch { name, body }, advance)));
    }

    Ok(None)
}

/// Match the leading keyword for the 6 collection-form macros. Returns
/// `Some(kind)` when `rest` (line content after `$`) starts with one of
/// `prop`, `computed`, `action`, `resource`, `effect`, `lifecycle`
/// followed by `:` or whitespace. `effect.on` and `lifecycle.mount` /
/// `lifecycle.dispose` (with a `.`) do NOT match here — those are either
/// preserved v1 forms (`$effect.on`) or v1 forms rejected via C440 (when
/// reached through the next-character check).
fn match_collection_keyword(rest: &str) -> Option<CollectionKind> {
    // Order matters: longer prefixes first so `lifecycle` wins over a
    // hypothetical shorter prefix.
    let keywords = [
        ("lifecycle", CollectionKind::Lifecycle),
        ("computed", CollectionKind::Computed),
        ("resource", CollectionKind::Resource),
        ("action", CollectionKind::Action),
        ("effect", CollectionKind::Effect),
        ("prop", CollectionKind::Prop),
    ];
    for (kw, kind) in keywords {
        if let Some(after) = rest.strip_prefix(kw) {
            // Must be followed by `:`, whitespace, or end-of-string. If the
            // next char is `.` or alpha, this is a different keyword (e.g.
            // `effect.on`, `lifecycle.mount`).
            let next = after.chars().next();
            match next {
                None | Some(':') | Some(' ') | Some('\t') => return Some(kind),
                _ => continue,
            }
        }
    }
    None
}

fn collection_keyword_len(kind: CollectionKind) -> usize {
    match kind {
        CollectionKind::Prop => 4,
        CollectionKind::Computed => 8,
        CollectionKind::Action => 6,
        CollectionKind::Resource => 8,
        CollectionKind::Effect => 6,
        CollectionKind::Lifecycle => 9,
    }
}

fn keyword_name(kind: CollectionKind) -> &'static str {
    match kind {
        CollectionKind::Prop => "prop",
        CollectionKind::Computed => "computed",
        CollectionKind::Action => "action",
        CollectionKind::Resource => "resource",
        CollectionKind::Effect => "effect",
        CollectionKind::Lifecycle => "lifecycle",
    }
}

/// Build the C440 error pointing at the migration codemod (per spec §6).
fn c440(rest: &str, kind: CollectionKind) -> CompileError {
    CompileError {
        message: format!(
            "C440 — old-spec macro form rejected for `${}`; \
             run `packages/compiler/codemods/macro-simplification/migrate.ts` to upgrade to v2 collection-form. \
             Got: `${}`",
            keyword_name(kind),
            rest.trim_end()
        ),
        line: 0,
        col: 0,
        code: Some("C440".to_string()),
        hint: Some("v2 grammar: `$<macro>: { name: { ... }, ... }`".to_string()),
        fix: Some(
            "see docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md".to_string(),
        ),
    }
}

/// Parse the inside of a collection-form macro body — `<name>: <value>, ...`.
/// `inner` is the text between the outer `{` and `}`; `kind` is used for
/// per-macro validation per spec §3 (e.g. `$prop` forbids bare; `$lifecycle`
/// forbids wrapped).
fn parse_object_collection(
    inner: &str,
    kind: CollectionKind,
) -> Result<Vec<CollectionEntry>, CompileError> {
    let mut entries = Vec::new();

    for raw_entry in split_top_level_commas(inner) {
        let trimmed = strip_line_comments(&raw_entry);
        let trimmed = trimmed.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Find the `:` separating name from value (skip top-level only —
        // the value may contain `:` inside type annotations or generics).
        let colon = find_top_level_colon(trimmed).ok_or_else(|| CompileError {
            message: format!(
                "${} entry missing `:` between name and value: `{}`",
                keyword_name(kind),
                trimmed.chars().take(60).collect::<String>()
            ),
            line: 0,
            col: 0,
            code: Some("C443".to_string()),
            ..Default::default()
        })?;
        let name = trimmed[..colon].trim().to_string();
        let value = trimmed[colon + 1..].trim().to_string();

        if name.is_empty() {
            return Err(CompileError {
                message: format!("${} entry has empty name", keyword_name(kind)),
                line: 0,
                col: 0,
                code: Some("C443".to_string()),
                ..Default::default()
            });
        }

        // Decide bare vs wrapped: a wrapped value is `{ ... }` carrying
        // metadata-bag keys (`describe`, `expose`, `default`, `type`,
        // `value`, `handler`, `on`). A bare value is anything else (a
        // function expression like `() => ...` or `(args) => { body }`).
        let is_wrapped = value.starts_with('{');

        // Per-kind rules per spec §2.4:
        //   $prop     — always wrapped (no running code to imply)
        //   $lifecycle — always bare (no metadata-bag form, per D.3)
        if matches!(kind, CollectionKind::Prop) && !is_wrapped {
            return Err(CompileError {
                message: format!(
                    "$prop entries are always wrapped — `{}` must be `{{ default: ..., type?: ..., describe?: ..., expose?: ... }}`",
                    name
                ),
                line: 0,
                col: 0,
                code: Some("C444".to_string()),
                ..Default::default()
            });
        }
        if matches!(kind, CollectionKind::Lifecycle) && is_wrapped {
            return Err(CompileError {
                message: format!(
                    "$lifecycle entries are always bare — `{}` must be a function expression, not a metadata-bag",
                    name
                ),
                line: 0,
                col: 0,
                code: Some("C444".to_string()),
                ..Default::default()
            });
        }
        // $lifecycle keys must be `mount` or `dispose` only (spec §3.6).
        if matches!(kind, CollectionKind::Lifecycle)
            && name != "mount"
            && name != "dispose"
        {
            return Err(CompileError {
                message: format!(
                    "$lifecycle key `{}` is invalid — only `mount` and `dispose` are valid",
                    name
                ),
                line: 0,
                col: 0,
                code: Some("C444".to_string()),
                ..Default::default()
            });
        }

        let (value_raw, meta) = if is_wrapped {
            // Strip the outer `{` … `}` and split into `key: source` pairs.
            let body = strip_outer_braces(&value).ok_or_else(|| CompileError {
                message: format!(
                    "${} entry `{}`: unclosed `{{` in metadata-bag",
                    keyword_name(kind),
                    name
                ),
                line: 0,
                col: 0,
                code: Some("C443".to_string()),
                ..Default::default()
            })?;
            let pairs = parse_meta_pairs(body)?;
            (String::new(), pairs)
        } else {
            (value, Vec::new())
        };

        entries.push(CollectionEntry {
            name,
            is_wrapped,
            value_raw,
            meta,
        });
    }

    Ok(entries)
}

/// Strip leading `{` and trailing `}` from a wrapped value, returning the
/// inner text. Returns `None` if the input is malformed.
fn strip_outer_braces(s: &str) -> Option<&str> {
    let s = s.trim();
    let inner = s.strip_prefix('{')?.strip_suffix('}')?;
    Some(inner)
}

/// Split a metadata-bag body into `(key, raw-value)` pairs. The body is
/// the inside of `{ ... }`. Top-level commas separate pairs; the first
/// `:` at depth-0 in each pair separates the key from the value.
fn parse_meta_pairs(body: &str) -> Result<Vec<(String, String)>, CompileError> {
    let mut pairs = Vec::new();
    for raw in split_top_level_commas(body) {
        let trimmed = strip_line_comments(&raw);
        let trimmed = trimmed.trim();
        if trimmed.is_empty() {
            continue;
        }
        let colon = find_top_level_colon(trimmed).ok_or_else(|| CompileError {
            message: format!(
                "metadata-bag entry missing `:`: `{}`",
                trimmed.chars().take(60).collect::<String>()
            ),
            line: 0,
            col: 0,
            code: Some("C443".to_string()),
            ..Default::default()
        })?;
        let key = trimmed[..colon].trim();
        let key = key.trim_matches(|c| c == '"' || c == '\'').to_string();
        let value = trimmed[colon + 1..].trim().to_string();
        pairs.push((key, value));
    }
    Ok(pairs)
}

/// Split `s` at top-level commas (respecting nested `{}`/`[]`/`()` and
/// string/template literals). Trailing-comma-only entries (empty between
/// commas) are skipped.
fn split_top_level_commas(s: &str) -> Vec<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::new();
    let mut start = 0usize;
    let mut depth_brace = 0i32;
    let mut depth_paren = 0i32;
    let mut depth_bracket = 0i32;
    let mut i = 0usize;
    while i < bytes.len() {
        match bytes[i] {
            b'{' => depth_brace += 1,
            b'}' => depth_brace = (depth_brace - 1).max(0),
            b'(' => depth_paren += 1,
            b')' => depth_paren = (depth_paren - 1).max(0),
            b'[' => depth_bracket += 1,
            b']' => depth_bracket = (depth_bracket - 1).max(0),
            b'"' | b'\'' | b'`' => {
                let q = bytes[i];
                i += 1;
                while i < bytes.len() {
                    if bytes[i] == b'\\' && i + 1 < bytes.len() {
                        i += 2;
                        continue;
                    }
                    if bytes[i] == q {
                        break;
                    }
                    i += 1;
                }
            }
            b'/' if i + 1 < bytes.len() && bytes[i + 1] == b'/' => {
                // Skip to end of line
                while i < bytes.len() && bytes[i] != b'\n' {
                    i += 1;
                }
                continue; // don't increment past newline; outer loop does
            }
            b',' if depth_brace == 0 && depth_paren == 0 && depth_bracket == 0 => {
                out.push(s[start..i].to_string());
                start = i + 1;
            }
            _ => {}
        }
        i += 1;
    }
    if start < s.len() {
        out.push(s[start..].to_string());
    }
    out
}

/// Find the first `:` at depth 0 (not inside `{}`/`[]`/`()`/`<>` or
/// strings/template literals). The collection-form's name-key separator.
fn find_top_level_colon(s: &str) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut depth_brace = 0i32;
    let mut depth_paren = 0i32;
    let mut depth_bracket = 0i32;
    let mut depth_angle = 0i32;
    let mut i = 0usize;
    while i < bytes.len() {
        match bytes[i] {
            b'{' => depth_brace += 1,
            b'}' => depth_brace = (depth_brace - 1).max(0),
            b'(' => depth_paren += 1,
            b')' => depth_paren = (depth_paren - 1).max(0),
            b'[' => depth_bracket += 1,
            b']' => depth_bracket = (depth_bracket - 1).max(0),
            b'<' => depth_angle += 1,
            b'>' if depth_angle > 0 => depth_angle = (depth_angle - 1).max(0),
            b'"' | b'\'' | b'`' => {
                let q = bytes[i];
                i += 1;
                while i < bytes.len() {
                    if bytes[i] == b'\\' && i + 1 < bytes.len() {
                        i += 2;
                        continue;
                    }
                    if bytes[i] == q {
                        break;
                    }
                    i += 1;
                }
            }
            b':' if depth_brace == 0
                && depth_paren == 0
                && depth_bracket == 0
                && depth_angle == 0 =>
            {
                return Some(i);
            }
            _ => {}
        }
        i += 1;
    }
    None
}

/// Strip JS line comments (`// ...`) — used to clean entry text before
/// further parsing. Block comments (`/* ... */`) are not handled here;
/// they're rare inside metadata bags and pass through opaquely.
fn strip_line_comments(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        match bytes[i] {
            b'"' | b'\'' | b'`' => {
                let q = bytes[i];
                out.push(q as char);
                i += 1;
                while i < bytes.len() {
                    out.push(bytes[i] as char);
                    if bytes[i] == b'\\' && i + 1 < bytes.len() {
                        i += 1;
                        out.push(bytes[i] as char);
                        i += 1;
                        continue;
                    }
                    if bytes[i] == q {
                        i += 1;
                        break;
                    }
                    i += 1;
                }
                continue;
            }
            _ => {
                out.push(bytes[i] as char);
                i += 1;
            }
        }
    }
    out
}

/// Extract the body of a brace-delimited block `{ ... }` starting from the
/// first `{` at or after `search_from` in `full_body`. Returns the trimmed
/// body and the byte offset just past the closing `}`.
fn extract_brace_body_with_pos(
    full_body: &str,
    search_from: usize,
) -> Result<(String, usize), CompileError> {
    let open_pos =
        full_body[search_from..]
            .find('{')
            .map(|r| search_from + r)
            .ok_or_else(|| CompileError {
                message: "expected '{' for macro body".to_string(),
                line: 0,
                col: 0,
                code: Some("C405".to_string()),
                ..Default::default()
            })?;
    let close_pos =
        find_brace_close(full_body, open_pos + 1).ok_or_else(|| CompileError {
            message: "unclosed '{' in macro body".to_string(),
            line: 0,
            col: 0,
            code: Some("C405".to_string()),
            ..Default::default()
        })?;
    Ok((
        full_body[open_pos + 1..close_pos].trim().to_string(),
        close_pos + 1,
    ))
}

/// Find the matching `)` for an already-opened parenthesis. `body_start`
/// is the byte just past the opening `(`. Honors brace, bracket, and
/// string nesting.
pub fn find_paren_close(s: &str, body_start: usize) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut depth: usize = 1;
    let mut i = body_start;
    while i < bytes.len() {
        match bytes[i] {
            b'(' => depth += 1,
            b')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            b'"' | b'\'' | b'`' => {
                let q = bytes[i];
                i += 1;
                while i < bytes.len() {
                    if bytes[i] == b'\\' && i + 1 < bytes.len() {
                        i += 2;
                        continue;
                    }
                    if bytes[i] == q {
                        break;
                    }
                    i += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

/// Find the matching `}` for an already-opened block.
/// `body_start` is the byte just past the opening `{`.
pub fn find_brace_close(s: &str, body_start: usize) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut depth: usize = 1;
    let mut i = body_start;
    while i < bytes.len() {
        match bytes[i] {
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            b'"' | b'\'' | b'`' => {
                let q = bytes[i];
                i += 1;
                while i < bytes.len() {
                    if bytes[i] == b'\\' && i + 1 < bytes.len() {
                        i += 2;
                        continue;
                    }
                    if bytes[i] == q {
                        break;
                    }
                    i += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

// ─── Codegen helpers used by emit.rs ────────────────────────────────────────
//
// Codegen pulls per-entry metadata (`describe`, `expose`, `default`, `type`,
// `value`, `handler`, `on`) and the running-code expression. These helpers
// implement the bare/wrapped duality at the lowering boundary so the JS
// calls emitted are byte-identical to v1 output (per AC-6).

/// Look up a key in the entry's metadata bag (wrapped form). Returns the
/// raw source string for the key's value, or `None` if absent.
pub fn meta_get<'a>(entry: &'a CollectionEntry, key: &str) -> Option<&'a str> {
    entry
        .meta
        .iter()
        .find_map(|(k, v)| if k == key { Some(v.as_str()) } else { None })
}

/// Resolve the running-code source for an entry. For bare entries, it's the
/// `value_raw` (a function expression). For wrapped entries, it's the
/// `value:` or `handler:` key.
pub fn running_code<'a>(entry: &'a CollectionEntry) -> Option<&'a str> {
    if !entry.is_wrapped {
        return Some(entry.value_raw.as_str());
    }
    meta_get(entry, "value").or_else(|| meta_get(entry, "handler"))
}

/// Extract the body text from an arrow function `(args) => body`. For
/// `() => { stmts }`, returns `stmts`. For `() => expr`, returns `expr`.
/// Returns `None` if the input is not recognizable as an arrow.
pub fn arrow_body(arrow: &str) -> Option<String> {
    let trimmed = arrow.trim();
    // Find the `=>` at depth 0 (not inside parens/braces/strings).
    let bytes = trimmed.as_bytes();
    let mut depth_paren = 0i32;
    let mut depth_brace = 0i32;
    let mut depth_bracket = 0i32;
    let mut i = 0usize;
    while i + 1 < bytes.len() {
        match bytes[i] {
            b'(' => depth_paren += 1,
            b')' => depth_paren = (depth_paren - 1).max(0),
            b'{' => depth_brace += 1,
            b'}' => depth_brace = (depth_brace - 1).max(0),
            b'[' => depth_bracket += 1,
            b']' => depth_bracket = (depth_bracket - 1).max(0),
            b'"' | b'\'' | b'`' => {
                let q = bytes[i];
                i += 1;
                while i < bytes.len() {
                    if bytes[i] == b'\\' && i + 1 < bytes.len() {
                        i += 2;
                        continue;
                    }
                    if bytes[i] == q {
                        break;
                    }
                    i += 1;
                }
            }
            b'=' if bytes[i + 1] == b'>'
                && depth_paren == 0
                && depth_brace == 0
                && depth_bracket == 0 =>
            {
                let after = trimmed[i + 2..].trim();
                if let Some(stripped) = after.strip_prefix('{') {
                    if let Some(stripped) = stripped.strip_suffix('}') {
                        return Some(stripped.trim().to_string());
                    }
                }
                // Expression body — return as-is.
                return Some(after.to_string());
            }
            _ => {}
        }
        i += 1;
    }
    None
}

/// Extract the parameter list `(args)` from an arrow function. Returns the
/// args text (between the outermost `(` and `)`), or `None` if unrecognizable.
pub fn arrow_args(arrow: &str) -> Option<String> {
    let trimmed = arrow.trim();
    let bytes = trimmed.as_bytes();
    if bytes.first() != Some(&b'(') {
        // Single-identifier param form: `x => body`.
        let arrow_pos = trimmed.find("=>")?;
        return Some(trimmed[..arrow_pos].trim().to_string());
    }
    let close = find_paren_close(trimmed, 1)?;
    Some(trimmed[1..close].trim().to_string())
}

/// Emit JS for a list of `StateMacro` declarations (no per-line indent).
/// Used by the simple emit path; the indented variant lives in
/// `codegen/emit.rs`.
pub fn emit_state_macros(macros: &[StateMacro]) -> String {
    let mut lines: Vec<String> = Vec::new();
    for mac in macros {
        match mac {
            StateMacro::Collection { kind, entries } => {
                for entry in entries {
                    if let Some(line) = emit_collection_entry(*kind, entry, "") {
                        lines.push(line);
                    }
                }
            }
            StateMacro::EffectAnon { body } => {
                lines.push(format!("effect(() => {{ {} }});", body));
            }
            StateMacro::EffectOn { dep, body } => {
                lines.push(format!("effect(() => {{ {}; {} }});", dep, body));
            }
            StateMacro::Watch { name, body } => {
                lines.push(format!("effect(() => {{ {}; {} }});", name, body));
            }
            StateMacro::Route { name } => {
                lines.push(format!(
                    "const {} = computed(() => __aihuRouter.useRoute());",
                    name
                ));
            }
            StateMacro::BeforeNavigate { expr } => {
                lines.push(format!(
                    "__aihuRouter.__router_registerBeforeGuard({});",
                    expr
                ));
            }
            StateMacro::AfterNavigate { expr } => {
                lines.push(format!(
                    "__aihuRouter.__router_registerAfterGuard({});",
                    expr
                ));
            }
        }
    }
    lines.join("\n")
}

/// Emit the lowered JS for a single collection entry. Returns `None` when
/// the entry produces no JS at this level (e.g. `$prop` lowering is more
/// involved and lives in `codegen/emit.rs`).
fn emit_collection_entry(
    kind: CollectionKind,
    entry: &CollectionEntry,
    indent: &str,
) -> Option<String> {
    match kind {
        CollectionKind::Prop => {
            // Simple lowering used by emit_state_macros: signal-style ctx.attrs
            // path. The richer typed lowering is in codegen::emit.
            Some(format!(
                "{indent}const {name} = computed(() => ctx.attrs.{name});",
                indent = indent,
                name = entry.name
            ))
        }
        CollectionKind::Computed => {
            let thunk = running_code(entry)?;
            let body = arrow_body(thunk).unwrap_or_else(|| thunk.to_string());
            Some(format!(
                "{indent}const {name} = computed(() => {body});",
                indent = indent,
                name = entry.name,
                body = body
            ))
        }
        CollectionKind::Resource => {
            let thunk = running_code(entry)?;
            let body = arrow_body(thunk).unwrap_or_else(|| thunk.to_string());
            Some(format!(
                "{indent}const {name} = createResource(() => {body});",
                indent = indent,
                name = entry.name,
                body = body
            ))
        }
        CollectionKind::Action => {
            let arrow = running_code(entry)?;
            let args = arrow_args(arrow).unwrap_or_default();
            let body = arrow_body(arrow).unwrap_or_default();
            Some(format!(
                "{indent}function {name}({args}) {{ return batch(() => {{ {body} }}) }}",
                indent = indent,
                name = entry.name,
                args = args,
                body = body
            ))
        }
        CollectionKind::Effect => {
            let thunk = running_code(entry)?;
            let body = arrow_body(thunk).unwrap_or_else(|| thunk.to_string());
            // If `on:` is present, prepend deps as a no-op statement to
            // force tracking (byte-identical to v1 `effect.on(dep) { body }`
            // lowering).
            if let Some(deps_raw) = meta_get(entry, "on") {
                let deps_inner = deps_raw
                    .trim()
                    .strip_prefix('[')
                    .and_then(|s| s.strip_suffix(']'))
                    .unwrap_or(deps_raw);
                Some(format!(
                    "{indent}effect(() => {{ {deps}; {body} }});",
                    indent = indent,
                    deps = deps_inner.trim(),
                    body = body
                ))
            } else {
                Some(format!(
                    "{indent}effect(() => {{ {body} }});",
                    indent = indent,
                    body = body
                ))
            }
        }
        CollectionKind::Lifecycle => {
            // `mount` → onMount, `dispose` → onCleanup. The entry value is
            // always a bare arrow per spec §3.6.
            let arrow = running_code(entry)?;
            let body = arrow_body(arrow).unwrap_or_else(|| arrow.to_string());
            let call = match entry.name.as_str() {
                "mount" => "onMount",
                "dispose" => "onCleanup",
                _ => return None,
            };
            Some(format!(
                "{indent}{call}(() => {{ {body} }});",
                indent = indent,
                call = call,
                body = body
            ))
        }
    }
}

/// Indented emit used by `codegen/emit.rs` (2-space indent prefix).
pub fn emit_state_macros_indented(macros: &[StateMacro], indent: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    for mac in macros {
        match mac {
            StateMacro::Collection { kind, entries } => {
                for entry in entries {
                    if matches!(kind, CollectionKind::Prop) {
                        // Richer typed lowering for $prop: extract `type:` if
                        // present, fall back to inference-friendly default.
                        let type_ann = meta_get(entry, "type")
                            .map(|s| s.trim().trim_matches(|c| c == '"' || c == '\'').to_string())
                            .unwrap_or_else(|| "any".to_string());
                        lines.push(format!(
                            "{indent}const {name}: {ty} = (() => {{ try {{ return JSON.parse((ctx.element as HTMLElement).getAttribute('{name}') ?? '{{}}') as {ty} }} catch {{ return {{}} as {ty} }} }})()",
                            indent = indent, name = entry.name, ty = type_ann
                        ));
                    } else if let Some(line) = emit_collection_entry(*kind, entry, indent) {
                        lines.push(line);
                    }
                }
            }
            StateMacro::EffectAnon { body } => {
                lines.push(format!("{indent}effect(() => {{ {body} }});"));
            }
            StateMacro::EffectOn { dep, body } => {
                lines.push(format!("{indent}effect(() => {{ {dep}; {body} }});"));
            }
            StateMacro::Watch { name, body } => {
                lines.push(format!("{indent}effect(() => {{ {name}; {body} }});"));
            }
            StateMacro::Route { name } => {
                lines.push(format!(
                    "{indent}const {name} = computed(() => __aihuRouter.useRoute());"
                ));
            }
            StateMacro::BeforeNavigate { expr } => {
                lines.push(format!(
                    "{indent}__aihuRouter.__router_registerBeforeGuard({expr});"
                ));
            }
            StateMacro::AfterNavigate { expr } => {
                lines.push(format!(
                    "{indent}__aihuRouter.__router_registerAfterGuard({expr});"
                ));
            }
        }
    }
    if lines.is_empty() {
        String::new()
    } else {
        lines.join("\n") + "\n"
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn first_collection(macros: &[StateMacro]) -> (&CollectionKind, &Vec<CollectionEntry>) {
        match &macros[0] {
            StateMacro::Collection { kind, entries } => (kind, entries),
            other => panic!("expected Collection, got {:?}", other),
        }
    }

    // ─── v2 collection-form parsing ──────────────────────────────────────────

    #[test]
    fn parse_prop_collection_wrapped() {
        let src = "$prop: { hue: { default: 215, describe: 'Hue (0-360)' } }";
        let macros = parse_state_macros(src).unwrap();
        assert_eq!(macros.len(), 1);
        let (kind, entries) = first_collection(&macros);
        assert_eq!(*kind, CollectionKind::Prop);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "hue");
        assert!(entries[0].is_wrapped);
        assert_eq!(meta_get(&entries[0], "default"), Some("215"));
        assert_eq!(meta_get(&entries[0], "describe"), Some("'Hue (0-360)'"));
    }

    #[test]
    fn parse_prop_multi_entry() {
        let src = "$prop: {\n  hue: { default: 215 },\n  saturation: { default: 70 },\n  lightness: { default: 55 },\n}";
        let macros = parse_state_macros(src).unwrap();
        let (_, entries) = first_collection(&macros);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].name, "hue");
        assert_eq!(entries[1].name, "saturation");
        assert_eq!(entries[2].name, "lightness");
    }

    #[test]
    fn parse_computed_bare() {
        let src = "$computed: { onPrimary: () => lightness < 60 ? 'a' : 'b' }";
        let macros = parse_state_macros(src).unwrap();
        let (kind, entries) = first_collection(&macros);
        assert_eq!(*kind, CollectionKind::Computed);
        assert_eq!(entries[0].name, "onPrimary");
        assert!(!entries[0].is_wrapped);
        assert!(entries[0].value_raw.starts_with("() =>"));
    }

    #[test]
    fn parse_computed_wrapped_with_metadata() {
        let src = "$computed: { primary: { describe: 'P', expose: { read: true }, value: () => 'x' } }";
        let macros = parse_state_macros(src).unwrap();
        let (_, entries) = first_collection(&macros);
        assert_eq!(entries[0].name, "primary");
        assert!(entries[0].is_wrapped);
        assert_eq!(meta_get(&entries[0], "describe"), Some("'P'"));
        assert_eq!(meta_get(&entries[0], "expose"), Some("{ read: true }"));
        assert!(meta_get(&entries[0], "value").unwrap().starts_with("() =>"));
    }

    #[test]
    fn parse_computed_mix_bare_and_wrapped() {
        // Spec §3.2 canonical example — mixed bare + wrapped in same block.
        let src = "$computed: {\n  primary: { value: () => 'a' },\n  onPrimary: () => 'b',\n  surface: () => 'c',\n}";
        let macros = parse_state_macros(src).unwrap();
        let (_, entries) = first_collection(&macros);
        assert_eq!(entries.len(), 3);
        assert!(entries[0].is_wrapped);
        assert!(!entries[1].is_wrapped);
        assert!(!entries[2].is_wrapped);
    }

    #[test]
    fn parse_action_wrapped() {
        let src = "$action: { setHue: { describe: 'Set hue', handler: (h: number) => { hue = h } } }";
        let macros = parse_state_macros(src).unwrap();
        let (kind, entries) = first_collection(&macros);
        assert_eq!(*kind, CollectionKind::Action);
        assert_eq!(entries[0].name, "setHue");
        let handler = meta_get(&entries[0], "handler").unwrap();
        assert!(handler.contains("h: number"));
    }

    #[test]
    fn parse_action_bare() {
        let src = "$action: { setHue: (h: number) => { hue = h } }";
        let macros = parse_state_macros(src).unwrap();
        let (_, entries) = first_collection(&macros);
        assert_eq!(entries[0].name, "setHue");
        assert!(!entries[0].is_wrapped);
        assert!(entries[0].value_raw.contains("h: number"));
    }

    #[test]
    fn parse_resource_collection() {
        let src = "$resource: { data: () => fetchUsers() }";
        let macros = parse_state_macros(src).unwrap();
        let (kind, _) = first_collection(&macros);
        assert_eq!(*kind, CollectionKind::Resource);
    }

    #[test]
    fn parse_effect_named_collection() {
        let src = "$effect: { logData: () => { console.log(data()) } }";
        let macros = parse_state_macros(src).unwrap();
        let (kind, entries) = first_collection(&macros);
        assert_eq!(*kind, CollectionKind::Effect);
        assert_eq!(entries[0].name, "logData");
    }

    #[test]
    fn parse_effect_with_on_deps() {
        let src = "$effect: { updateList: { on: [data], value: () => updateList(data()) } }";
        let macros = parse_state_macros(src).unwrap();
        let (_, entries) = first_collection(&macros);
        assert_eq!(meta_get(&entries[0], "on"), Some("[data]"));
    }

    #[test]
    fn parse_effect_anonymous() {
        let src = "$effect: () => { persist(state) }";
        let macros = parse_state_macros(src).unwrap();
        assert_eq!(macros.len(), 1);
        match &macros[0] {
            StateMacro::EffectAnon { body } => assert_eq!(body, "persist(state)"),
            other => panic!("expected EffectAnon, got {:?}", other),
        }
    }

    #[test]
    fn parse_lifecycle_collection() {
        let src = "$lifecycle: { mount: () => initializeWidget(), dispose: () => cleanup() }";
        let macros = parse_state_macros(src).unwrap();
        let (kind, entries) = first_collection(&macros);
        assert_eq!(*kind, CollectionKind::Lifecycle);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "mount");
        assert_eq!(entries[1].name, "dispose");
    }

    // ─── C440 — old v1 forms rejected ─────────────────────────────────────────

    #[test]
    fn c440_old_prop_form_rejected() {
        let err = parse_state_macros("$prop label: String").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
        assert!(err.message.contains("migrate.ts"));
    }

    #[test]
    fn c440_old_computed_form_rejected() {
        let err = parse_state_macros("$computed upper = label.toUpperCase()").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
    }

    #[test]
    fn c440_old_resource_form_rejected() {
        let err = parse_state_macros("$resource data = fetchUsers()").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
    }

    #[test]
    fn c440_old_action_form_rejected() {
        let err = parse_state_macros("$action submit(data) { sendForm(data) }").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
    }

    #[test]
    fn c440_old_lifecycle_mount_rejected() {
        let err = parse_state_macros("$lifecycle.mount { initializeWidget() }").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
    }

    #[test]
    fn c440_old_lifecycle_dispose_rejected() {
        let err = parse_state_macros("$lifecycle.dispose { cleanup() }").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
    }

    // ─── Per-kind validation ──────────────────────────────────────────────────

    #[test]
    fn c444_prop_must_be_wrapped() {
        let err = parse_state_macros("$prop: { hue: 215 }").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C444"));
    }

    #[test]
    fn c444_lifecycle_must_be_bare() {
        let err = parse_state_macros("$lifecycle: { mount: { handler: () => init() } }").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C444"));
    }

    #[test]
    fn c444_lifecycle_only_mount_dispose() {
        let err = parse_state_macros("$lifecycle: { foo: () => bar() }").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C444"));
    }

    // ─── Multiplicity (§2.5) ──────────────────────────────────────────────────

    #[test]
    fn c441_two_anonymous_effects_rejected() {
        let src = "$effect: () => { a() }\n$effect: () => { b() }";
        let err = parse_state_macros(src).unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C441"));
    }

    #[test]
    fn anonymous_and_named_effect_coexist() {
        let src = "$effect: { logData: () => { log() } }\n$effect: () => { persist() }";
        let macros = parse_state_macros(src).unwrap();
        assert_eq!(macros.len(), 2);
        assert!(matches!(macros[0], StateMacro::Collection { kind: CollectionKind::Effect, .. }));
        assert!(matches!(macros[1], StateMacro::EffectAnon { .. }));
    }

    // ─── Indented-line offset regression — keyword math relative to `$`, ─────
    // not relative to start-of-line. Previously the second indented line
    // mis-aligned and was rejected as v1 syntax.
    #[test]
    fn parse_indented_macros_in_block() {
        let src = "  $effect: () => { a() }\n  $prop: { x: { default: 0 } }";
        let macros = parse_state_macros(src).unwrap();
        assert_eq!(macros.len(), 2);
        assert!(matches!(macros[0], StateMacro::EffectAnon { .. }));
        assert!(matches!(
            macros[1],
            StateMacro::Collection { kind: CollectionKind::Prop, .. }
        ));
    }

    #[test]
    fn c441_indented_two_anonymous_effects() {
        // Same C441 path, but with leading indentation on each line —
        // canonical example shape inside `@state { ... }`.
        let src = "  $effect: () => { a() }\n  $effect: () => { b() }";
        let err = parse_state_macros(src).unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C441"));
    }

    // ─── Preserved-from-v1 macros ─────────────────────────────────────────────

    #[test]
    fn parse_effect_on_block() {
        let macros = parse_state_macros("$effect.on(count) { console.log(count) }").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            StateMacro::EffectOn {
                dep: "count".to_string(),
                body: "console.log(count)".to_string()
            }
        );
    }

    #[test]
    fn parse_watch_block() {
        let macros = parse_state_macros("$watch count { update() }").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            StateMacro::Watch {
                name: "count".to_string(),
                body: "update()".to_string()
            }
        );
    }

    #[test]
    fn parse_route_declaration() {
        let macros = parse_state_macros("$route currentRoute").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            StateMacro::Route { name: "currentRoute".to_string() }
        );
    }

    #[test]
    fn parse_route_rejects_rhs() {
        let err = parse_state_macros("$route currentRoute = 5").unwrap_err();
        assert!(err.message.contains("$route declaration takes no rhs"));
    }

    #[test]
    fn parse_before_navigate_inline() {
        let macros = parse_state_macros("$beforeNavigate((to, from, next) => next())").unwrap();
        assert_eq!(macros.len(), 1);
        match &macros[0] {
            StateMacro::BeforeNavigate { expr } => {
                assert_eq!(expr, "(to, from, next) => next()");
            }
            _ => panic!("expected BeforeNavigate"),
        }
    }

    #[test]
    fn parse_after_navigate_inline() {
        let macros = parse_state_macros("$afterNavigate((to) => log(to))").unwrap();
        assert_eq!(macros.len(), 1);
        match &macros[0] {
            StateMacro::AfterNavigate { expr } => {
                assert_eq!(expr, "(to) => log(to)");
            }
            _ => panic!("expected AfterNavigate"),
        }
    }

    #[test]
    fn parse_before_navigate_multiline_arrow() {
        let body = "$beforeNavigate((to, from, next) => {\n  if (dirty) return next(false)\n  next()\n})";
        let macros = parse_state_macros(body).unwrap();
        assert_eq!(macros.len(), 1);
        match &macros[0] {
            StateMacro::BeforeNavigate { expr } => {
                assert!(expr.contains("if (dirty)"));
                assert!(expr.contains("next(false)"));
            }
            _ => panic!("expected BeforeNavigate"),
        }
    }

    // ─── Emit byte-identical to v1 ────────────────────────────────────────────

    #[test]
    fn emit_prop_collection() {
        let macros = parse_state_macros("$prop: { label: { default: '' } }").unwrap();
        let js = emit_state_macros(&macros);
        assert_eq!(js, "const label = computed(() => ctx.attrs.label);");
    }

    #[test]
    fn emit_computed_bare() {
        let macros = parse_state_macros("$computed: { doubled: () => count * 2 }").unwrap();
        let js = emit_state_macros(&macros);
        assert_eq!(js, "const doubled = computed(() => count * 2);");
    }

    #[test]
    fn emit_resource_bare() {
        let macros = parse_state_macros("$resource: { data: () => fetchData() }").unwrap();
        let js = emit_state_macros(&macros);
        assert_eq!(js, "const data = createResource(() => fetchData());");
    }

    #[test]
    fn emit_action_wrapped() {
        let macros =
            parse_state_macros("$action: { increment: { handler: (n) => { count += n } } }")
                .unwrap();
        let js = emit_state_macros(&macros);
        assert_eq!(
            js,
            "function increment(n) { return batch(() => { count += n }) }"
        );
    }

    #[test]
    fn emit_effect_anonymous() {
        let macros = parse_state_macros("$effect: () => { persist(state) }").unwrap();
        let js = emit_state_macros(&macros);
        assert_eq!(js, "effect(() => { persist(state) });");
    }

    #[test]
    fn emit_lifecycle_collection() {
        let macros =
            parse_state_macros("$lifecycle: { mount: () => init(), dispose: () => cleanup() }")
                .unwrap();
        let js = emit_state_macros(&macros);
        assert_eq!(
            js,
            "onMount(() => { init() });\nonCleanup(() => { cleanup() });"
        );
    }

    #[test]
    fn emit_route_macro() {
        let macros = parse_state_macros("$route currentRoute").unwrap();
        let js = emit_state_macros(&macros);
        assert_eq!(
            js,
            "const currentRoute = computed(() => __aihuRouter.useRoute());"
        );
    }

    // ─── Canonical example (color-theme @state block) — every name must lower ─

    #[test]
    fn parse_canonical_color_theme_state_block() {
        // examples/_shared/macro-test.aihu lines 28–72 (active substance —
        // commented stretch at lines 74–99 omitted).
        let src = "\
$prop: {
  hue:        { default: 215, describe: 'Hue channel (0-360)',        expose: { read: true, write: true } },
  saturation: { default: 70,  describe: 'Saturation channel (0-100)', expose: { read: true, write: true } },
  lightness:  { default: 55,  describe: 'Lightness channel (0-100)',  expose: { read: true, write: true } },
}

$computed: {
  primary: {
    describe: 'Computed HSL primary color string',
    expose: { read: true },
    value: () => `hsl(${hue} ${saturation}% ${lightness}%)`,
  },
  onPrimary: () => lightness < 60 ? '#ffffff' : '#111111',
  surface:   () => `hsl(${hue} ${Math.max(saturation - 60, 5)}% 96%)`,
}

$action: {
  setPreset: {
    describe: 'Set a named color preset by hue value',
    expose: { read: true, write: true },
    handler: (h: number) => {
      hue = h
      saturation = 70
      lightness = 55
    },
  },
  setHue: {
    describe: 'Set hue directly (0-360)',
    expose: { read: true, write: true },
    handler: (h: number) => { hue = h },
  },
  setSaturation: {
    describe: 'Set saturation directly (0-100)',
    expose: { read: true, write: true },
    handler: (s: number) => { saturation = s },
  },
  setLightness: {
    describe: 'Set lightness directly (0-100)',
    expose: { read: true, write: true },
    handler: (l: number) => { lightness = l },
  },
}
";
        let macros = parse_state_macros(src).unwrap();
        // Expect 3 Collections: Prop, Computed, Action.
        assert_eq!(macros.len(), 3);

        // Prop: 3 entries
        match &macros[0] {
            StateMacro::Collection { kind: CollectionKind::Prop, entries } => {
                let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
                assert_eq!(names, vec!["hue", "saturation", "lightness"]);
            }
            other => panic!("expected Prop collection, got {:?}", other),
        }

        // Computed: 3 entries (mixed bare + wrapped)
        match &macros[1] {
            StateMacro::Collection { kind: CollectionKind::Computed, entries } => {
                let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
                assert_eq!(names, vec!["primary", "onPrimary", "surface"]);
                assert!(entries[0].is_wrapped);
                assert!(!entries[1].is_wrapped);
                assert!(!entries[2].is_wrapped);
            }
            other => panic!("expected Computed collection, got {:?}", other),
        }

        // Action: 4 entries, all wrapped
        match &macros[2] {
            StateMacro::Collection { kind: CollectionKind::Action, entries } => {
                let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
                assert_eq!(names, vec!["setPreset", "setHue", "setSaturation", "setLightness"]);
                for e in entries {
                    assert!(e.is_wrapped);
                }
            }
            other => panic!("expected Action collection, got {:?}", other),
        }
    }
}
