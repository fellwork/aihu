/// v0.4.6 — `@state` macro declarations parser.
///
/// Parses `$macro` declarations inside an `@state { }` block body and lowers
/// them to JS via `emit_state_macros`.

use crate::types::{CompileError, StateMacro};

/// Parse `$macro` declarations from the body of an `@state { }` block.
///
/// The body may contain:
/// - Ordinary JS (import, const, let, function, etc.) — passed through unchanged.
/// - `$prop name: Type` — reactive prop declaration.
/// - `$computed name = expr` — computed declaration.
/// - `$resource name = fetcher` — resource declaration.
/// - `$effect { body }` — effect block.
/// - `$effect.on(dep) { body }` — targeted effect.
/// - `$watch name { body }` — watch block.
/// - `$action name(args) { body }` — action declaration.
/// - `$lifecycle.mount { body }` — mount callback.
/// - `$lifecycle.dispose { body }` — dispose callback.
///
/// Returns a list of parsed `StateMacro` declarations (in order of appearance).
/// Lines that are not macro declarations are ignored (they remain as plain JS).
pub fn parse_state_macros(body: &str) -> Result<Vec<StateMacro>, CompileError> {
    let mut result = Vec::new();
    let bytes = body.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        // Skip whitespace and non-macro lines until we find a `$`.
        let line_start = i;

        // Find the next `$` on this line.
        let nl = body[i..].find('\n').map(|r| i + r).unwrap_or(body.len());
        let line = body[i..nl].trim();

        if let Some(rest) = line.strip_prefix('$') {
            if let Some(mac) = try_parse_macro_line(rest, body, i)? {
                // For multi-line macros (with `{ body }`), advance `i` past them.
                match &mac {
                    StateMacro::Effect { .. }
                    | StateMacro::EffectOn { .. }
                    | StateMacro::Watch { .. }
                    | StateMacro::Action { .. }
                    | StateMacro::LifecycleMount { .. }
                    | StateMacro::LifecycleDispose { .. } => {
                        // These consumed up to the matching `}`.
                        // Find the opening `{` on this line or the body, then skip to close.
                        let after_line = body[i..].find('{').map(|r| i + r);
                        if let Some(brace_start) = after_line {
                            if let Some(close) = find_brace_close(body, brace_start + 1) {
                                i = close + 1;
                            } else {
                                i = nl + 1;
                            }
                        } else {
                            i = nl + 1;
                        }
                    }
                    _ => {
                        i = nl + 1;
                    }
                }
                result.push(mac);
                continue;
            }
        }

        i = nl + 1;
        let _ = line_start;
    }

    Ok(result)
}

/// Try to parse a single macro declaration from the line content after `$`.
/// `full_body` and `line_offset` are provided for multi-line block extraction.
fn try_parse_macro_line(
    rest: &str,
    full_body: &str,
    line_offset: usize,
) -> Result<Option<StateMacro>, CompileError> {
    // $prop name: Type
    if let Some(decl) = rest.strip_prefix("prop ") {
        let decl = decl.trim();
        let colon = decl.find(':').ok_or_else(|| CompileError {
            message: format!("$prop declaration missing ':' — expected '$prop name: Type', got '$prop {}'", decl),
            line: 0,
            col: 0,
            code: Some("C400".to_string()),
            ..Default::default()
        })?;
        let name = decl[..colon].trim().to_string();
        let type_name = decl[colon + 1..].trim().to_string();
        return Ok(Some(StateMacro::Prop { name, type_name }));
    }

    // $computed name = expr
    if let Some(decl) = rest.strip_prefix("computed ") {
        let decl = decl.trim();
        let eq = decl.find('=').ok_or_else(|| CompileError {
            message: format!("$computed declaration missing '=' — expected '$computed name = expr', got '$computed {}'", decl),
            line: 0,
            col: 0,
            code: Some("C401".to_string()),
            ..Default::default()
        })?;
        let name = decl[..eq].trim().to_string();
        let expr = decl[eq + 1..].trim().to_string();
        return Ok(Some(StateMacro::Computed { name, expr }));
    }

    // $resource name = fetcher
    if let Some(decl) = rest.strip_prefix("resource ") {
        let decl = decl.trim();
        let eq = decl.find('=').ok_or_else(|| CompileError {
            message: format!("$resource declaration missing '=' — expected '$resource name = fetcher', got '$resource {}'", decl),
            line: 0,
            col: 0,
            code: Some("C402".to_string()),
            ..Default::default()
        })?;
        let name = decl[..eq].trim().to_string();
        let fetcher = decl[eq + 1..].trim().to_string();
        return Ok(Some(StateMacro::Resource { name, fetcher }));
    }

    // $effect.on(dep) { body }
    if let Some(decl) = rest.strip_prefix("effect.on(") {
        let close_paren = decl.find(')').ok_or_else(|| CompileError {
            message: "$effect.on() — missing closing ')'".to_string(),
            line: 0,
            col: 0,
            code: Some("C403".to_string()),
            ..Default::default()
        })?;
        let dep = decl[..close_paren].trim().to_string();
        let body = extract_brace_body(full_body, line_offset)?;
        return Ok(Some(StateMacro::EffectOn { dep, body }));
    }

    // $effect { body }
    if rest.trim_start() == "effect" || rest.trim_start().starts_with("effect ") || rest.trim_start().starts_with("effect{") {
        let body = extract_brace_body(full_body, line_offset)?;
        return Ok(Some(StateMacro::Effect { body }));
    }

    // $lifecycle.mount { body }
    if rest.trim_start().starts_with("lifecycle.mount") {
        let body = extract_brace_body(full_body, line_offset)?;
        return Ok(Some(StateMacro::LifecycleMount { body }));
    }

    // $lifecycle.dispose { body }
    if rest.trim_start().starts_with("lifecycle.dispose") {
        let body = extract_brace_body(full_body, line_offset)?;
        return Ok(Some(StateMacro::LifecycleDispose { body }));
    }

    // $watch name { body }
    if let Some(decl) = rest.strip_prefix("watch ") {
        let decl = decl.trim();
        // name is everything up to whitespace or `{`
        let end = decl.find(|c: char| c.is_whitespace() || c == '{').unwrap_or(decl.len());
        let name = decl[..end].trim().to_string();
        let body = extract_brace_body(full_body, line_offset)?;
        return Ok(Some(StateMacro::Watch { name, body }));
    }

    // $action name(args) { body }
    // NOTE: args may contain `{...}` type annotations (e.g. `p: { slug: string }`).
    // We must skip past the argument list's closing `)` before searching for the body `{`.
    if let Some(decl) = rest.strip_prefix("action ") {
        let decl = decl.trim();
        let open_paren = decl.find('(').ok_or_else(|| CompileError {
            message: format!("$action declaration missing '(' — expected '$action name(args) {{ body }}', got '$action {}'", decl),
            line: 0,
            col: 0,
            code: Some("C404".to_string()),
            ..Default::default()
        })?;
        let name = decl[..open_paren].trim().to_string();

        // Find the matching `)` for the argument list, respecting nested braces.
        // This handles args like `p: { slug: string }` where `}` appears before `)`.
        let close_paren = {
            let args_start = open_paren + 1;
            let mut depth = 0usize;
            let mut found = None;
            for (i, ch) in decl[args_start..].char_indices() {
                match ch {
                    '{' => depth += 1,
                    '}' => depth = depth.saturating_sub(1),
                    ')' if depth == 0 => {
                        found = Some(args_start + i);
                        break;
                    }
                    _ => {}
                }
            }
            found.ok_or_else(|| CompileError {
                message: "$action declaration missing ')'".to_string(),
                line: 0,
                col: 0,
                code: Some("C404".to_string()),
                ..Default::default()
            })?
        };

        let args = decl[open_paren + 1..close_paren].trim().to_string();

        // Strip an optional return type annotation (`: Type`) between `)` and `{`.
        // Compute the offset in `full_body` just past the argument list `)`.
        // full_body layout: ... "$action " decl_start ...
        // We need to advance past `$action ` (8 bytes) + open position in decl
        // to be just after close_paren in decl.
        let after_sig_in_decl = close_paren + 1; // byte just after `)` in decl
        // The action macro starts with "$action " — that's 8 bytes in full_body
        // (line_offset points to `$action...`).
        // decl is rest after stripping "$" and "action " from the original rest,
        // which is rest after "$" was stripped by the outer `strip_prefix('$')`.
        // So in full_body: line_offset is the `$`, then "action " (7 bytes), then decl.
        let action_keyword_len = "action ".len(); // 7
        let search_from = line_offset + 1 /* '$' */ + action_keyword_len + after_sig_in_decl;
        let body = extract_brace_body(full_body, search_from)?;
        return Ok(Some(StateMacro::Action { name, args, body }));
    }

    Ok(None)
}

/// Extract the body of a brace-delimited block `{ ... }` starting from the
/// first `{` at or after `search_from` in `full_body`.
fn extract_brace_body(full_body: &str, search_from: usize) -> Result<String, CompileError> {
    let open_pos = full_body[search_from..].find('{').map(|r| search_from + r).ok_or_else(|| CompileError {
        message: "expected '{' for macro body".to_string(),
        line: 0,
        col: 0,
        code: Some("C405".to_string()),
        ..Default::default()
    })?;
    let close_pos = find_brace_close(full_body, open_pos + 1).ok_or_else(|| CompileError {
        message: "unclosed '{' in macro body".to_string(),
        line: 0,
        col: 0,
        code: Some("C405".to_string()),
        ..Default::default()
    })?;
    Ok(full_body[open_pos + 1..close_pos].trim().to_string())
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

/// Emit JS for a list of `StateMacro` declarations.
pub fn emit_state_macros(macros: &[StateMacro]) -> String {
    let mut lines: Vec<String> = Vec::new();
    for mac in macros {
        match mac {
            StateMacro::Prop { name, type_name: _ } => {
                lines.push(format!("const {} = computed(() => ctx.attrs.{});", name, name));
            }
            StateMacro::Computed { name, expr } => {
                lines.push(format!("const {} = computed(() => {});", name, expr));
            }
            StateMacro::Resource { name, fetcher } => {
                lines.push(format!("const {} = createResource(() => {});", name, fetcher));
            }
            StateMacro::Effect { body } => {
                lines.push(format!("effect(() => {{ {} }});", body));
            }
            StateMacro::EffectOn { dep, body } => {
                lines.push(format!("effect(() => {{ {}; {} }});", dep, body));
            }
            StateMacro::Watch { name, body } => {
                lines.push(format!("effect(() => {{ {}; {} }});", name, body));
            }
            StateMacro::Action { name, args, body } => {
                lines.push(format!(
                    "function {}({}) {{ return batch(() => {{ {} }}) }}",
                    name, args, body
                ));
            }
            StateMacro::LifecycleMount { body } => {
                lines.push(format!("onMount(() => {{ {} }});", body));
            }
            StateMacro::LifecycleDispose { body } => {
                lines.push(format!("onCleanup(() => {{ {} }});", body));
            }
        }
    }
    lines.join("\n")
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_prop_declaration() {
        let macros = parse_state_macros("$prop name: String").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            StateMacro::Prop {
                name: "name".to_string(),
                type_name: "String".to_string()
            }
        );
    }

    #[test]
    fn parse_computed_declaration() {
        let macros = parse_state_macros("$computed doubled = count * 2").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            StateMacro::Computed {
                name: "doubled".to_string(),
                expr: "count * 2".to_string()
            }
        );
    }

    #[test]
    fn parse_resource_declaration() {
        let macros = parse_state_macros("$resource data = fetchData()").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            StateMacro::Resource {
                name: "data".to_string(),
                fetcher: "fetchData()".to_string()
            }
        );
    }

    #[test]
    fn parse_effect_block() {
        let macros = parse_state_macros("$effect { console.log(count) }").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            StateMacro::Effect {
                body: "console.log(count)".to_string()
            }
        );
    }

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
    fn parse_action_block() {
        let macros = parse_state_macros("$action increment(n) { count += n }").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            StateMacro::Action {
                name: "increment".to_string(),
                args: "n".to_string(),
                body: "count += n".to_string()
            }
        );
    }

    #[test]
    fn parse_lifecycle_mount() {
        let macros = parse_state_macros("$lifecycle.mount { init() }").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            StateMacro::LifecycleMount {
                body: "init()".to_string()
            }
        );
    }

    #[test]
    fn parse_lifecycle_dispose() {
        let macros = parse_state_macros("$lifecycle.dispose { cleanup() }").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            StateMacro::LifecycleDispose {
                body: "cleanup()".to_string()
            }
        );
    }

    #[test]
    fn emit_prop() {
        let macros = vec![StateMacro::Prop {
            name: "label".to_string(),
            type_name: "String".to_string(),
        }];
        let js = emit_state_macros(&macros);
        assert_eq!(js, "const label = computed(() => ctx.attrs.label);");
    }

    #[test]
    fn emit_computed() {
        let macros = vec![StateMacro::Computed {
            name: "doubled".to_string(),
            expr: "count * 2".to_string(),
        }];
        let js = emit_state_macros(&macros);
        assert_eq!(js, "const doubled = computed(() => count * 2);");
    }

    #[test]
    fn emit_resource() {
        let macros = vec![StateMacro::Resource {
            name: "data".to_string(),
            fetcher: "fetchData()".to_string(),
        }];
        let js = emit_state_macros(&macros);
        assert_eq!(js, "const data = createResource(() => fetchData());");
    }

    #[test]
    fn emit_lifecycle_mount() {
        let macros = vec![StateMacro::LifecycleMount {
            body: "init()".to_string(),
        }];
        let js = emit_state_macros(&macros);
        assert_eq!(js, "onMount(() => { init() });");
    }

    #[test]
    fn emit_lifecycle_dispose() {
        let macros = vec![StateMacro::LifecycleDispose {
            body: "cleanup()".to_string(),
        }];
        let js = emit_state_macros(&macros);
        assert_eq!(js, "onCleanup(() => { cleanup() });");
    }

    #[test]
    fn parse_multiple_macros() {
        let body = "$prop name: String\n$computed upper = name.toUpperCase()";
        let macros = parse_state_macros(body).unwrap();
        assert_eq!(macros.len(), 2);
    }
}
