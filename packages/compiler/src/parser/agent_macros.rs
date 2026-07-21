/// v2 — `@agent` manifest macro declarations parser.
///
/// Per spec §4: `@agent` survives as a vestigial cross-cutting block holding
/// only `$scope` and `$rate-limit`. The v1 forms — `$expose <name>, ...`,
/// `$expose.write <name>, ...`, `$action <bareName>`, `$describe <name> "<text>"`
/// — are removed; their per-name surface lives on the corresponding `@state`
/// collection entry's `expose:` / `describe:` keys. v1 source using the
/// removed forms is rejected with C440.

use crate::types::{AgentMacroDecl, CompileError};

/// Parse agent manifest macros from the body of an `@agent { }` block.
/// Non-macro lines (input/state/action keywords) are skipped.
pub fn parse_agent_macros(body: &str) -> Result<Vec<AgentMacroDecl>, CompileError> {
    let mut result = Vec::new();

    for (idx, raw_line) in body.lines().enumerate() {
        let line_no = idx + 1;
        let line = raw_line.trim();

        // Skip blank lines and standard agent keywords/comments.
        if line.is_empty()
            || line.starts_with("input ")
            || line.starts_with("state ")
            || line.starts_with("action ")
            || line.starts_with('#')
            || line.starts_with("//")
        {
            continue;
        }

        let Some(rest) = line.strip_prefix('$') else {
            continue;
        };

        // ─── v2 retained: $scope "value" ─────────────────────────────────────
        //
        // GX Phase 1 (#437-GX, spec §2.3): the `@` prefix is a RESERVED
        // class-scope namespace. Exactly two class-scopes exist — `@human`
        // (verified human session only) and `@verified` (any verified
        // principal); any other `@`-prefixed scope is C485 so the namespace
        // stays reserved for the vocabulary instead of silently becoming an
        // ordinary (and unsatisfiable-looking) scope string.
        if let Some(decl) = rest.strip_prefix("scope ") {
            let val = strip_quotes(decl.trim()).to_string();
            if val.starts_with('@') && !matches!(val.as_str(), "@human" | "@verified") {
                return Err(CompileError {
                    message: format!(
                        "C485: unknown class-scope '{}' (line {}) — the `@` scope namespace is \
                         reserved; the defined class-scopes are `@human` (verified human session \
                         only) and `@verified` (any verified principal)",
                        val, line_no
                    ),
                    line: line_no,
                    col: 0,
                    code: Some("C485".to_string()),
                    hint: Some(
                        "ordinary authority scopes are plain names (e.g. \"reports:read\"); the \
                         `@`-prefixed class-scopes express WHO may act, not WHAT they may act on"
                            .to_string(),
                    ),
                    ..Default::default()
                });
            }
            result.push(AgentMacroDecl::Scope(val));
            continue;
        }

        // ─── v0.4.0: $stream <name> — wire agent results → $stream entry ────
        if let Some(decl) = rest.strip_prefix("stream ").or_else(|| rest.strip_prefix("stream:").map(|s| s.trim_start())) {
            let val = decl.trim().trim_matches(|c| c == '\'' || c == '"').to_string();
            if !val.is_empty() {
                result.push(AgentMacroDecl::Stream(val));
                continue;
            }
        }

        // ─── v2 retained: $rate-limit N ──────────────────────────────────────
        if let Some(decl) = rest.strip_prefix("rate-limit ") {
            let n: u32 = decl.trim().parse().map_err(|_| CompileError {
                message: format!(
                    "line {}: $rate-limit value must be a non-negative integer, got '{}'",
                    line_no,
                    decl.trim()
                ),
                line: line_no,
                col: 0,
                code: Some("C421".to_string()),
                ..Default::default()
            })?;
            result.push(AgentMacroDecl::RateLimit(n));
            continue;
        }

        // ─── v2 removed forms — C440 with codemod pointer ────────────────────
        //
        // `$expose <names>` → per-name `expose:` on @state collection entry.
        // `$expose.write <names>` → per-name `expose: { read, write }`.
        // `$action <bareName>` → per-name `expose: { read: true, write: true }`
        //   on the @state $action entry.
        // `$describe <name> "..."` → per-name `describe:` on @state entry.

        if rest.starts_with("expose.write ") || rest.starts_with("expose ") {
            return Err(c440(
                line_no,
                "expose",
                "per-name `expose: { read: true, write?: true }` on the corresponding `@state` collection entry",
            ));
        }
        if rest.starts_with("describe ") {
            return Err(c440(
                line_no,
                "describe",
                "per-name `describe: '...'` on the corresponding `@state` collection entry",
            ));
        }
        if let Some(after) = rest.strip_prefix("action ") {
            // `$action <bareName>` — no `(` follows. Reject with C440.
            // (`$action` in @state is a different macro, parsed by state_macros.)
            let after = after.trim();
            if !after.contains('(') {
                return Err(c440(
                    line_no,
                    "action",
                    "per-name `expose: { read: true, write: true }` on the `$action` entry in `@state`",
                ));
            }
            // If somehow `$action name(args) ...` shows up here, also C440.
            return Err(c440(
                line_no,
                "action",
                "per-name `expose: { read: true, write: true }` on the `$action` entry in `@state`",
            ));
        }
    }

    Ok(result)
}

fn c440(line_no: usize, form: &str, replacement: &str) -> CompileError {
    // Build a concrete from/to example per removed form for machine-readable output.
    let (from_text, to_text) = match form {
        "expose" => (
            "$expose <name>".to_string(),
            "expose: { read: true } on the @state $prop/$computed/$action entry".to_string(),
        ),
        "expose.write" => (
            "$expose.write <name>".to_string(),
            "expose: { read: true, write: true } on the @state $prop/$computed/$action entry".to_string(),
        ),
        "action" => (
            "$action <name>".to_string(),
            "expose: { read: true, write: true } on the @state $action: { <name>: ... } entry".to_string(),
        ),
        "describe" => (
            "$describe <name> \"<text>\"".to_string(),
            "describe: '<text>' on the @state collection entry for <name>".to_string(),
        ),
        _ => (
            format!("${} ...", form),
            replacement.to_string(),
        ),
    };

    // Provide a concrete before/after example in the human message.
    let example = match form {
        "expose" => " Example: `$expose count` → add `expose: { read: true }` to `$computed: { count: { expose: { read: true }, value: () => count } }`.",
        "expose.write" => " Example: `$expose.write label` → add `expose: { read: true, write: true }` to `$prop: { label: { ..., expose: { read: true, write: true } } }`.",
        "action" => " Example: `$action addTodo` in @agent → add `expose: { read: true, write: true }` to `$action: { addTodo: { ..., expose: { read: true, write: true } } }` in @state.",
        "describe" => " Example: `$describe addTodo \"Adds a todo\"` → add `describe: 'Adds a todo'` to `$action: { addTodo: { describe: 'Adds a todo', handler: ... } }` in @state.",
        _ => "",
    };

    CompileError {
        message: format!(
            "C440: `${}` is removed from the v2 `@agent` block (line {}). \
             Replace with {}.{} \
             Run the migration codemod: packages/compiler/js/codemods/macro-simplification/migrate.ts",
            form, line_no, replacement, example
        ),
        line: line_no,
        col: 0,
        code: Some("C440".to_string()),
        hint: Some(
            "v2 `@agent` block holds only `$scope` and `$rate-limit`; \
             per-name metadata (expose, describe) moves into `@state` collection-form entries"
                .to_string(),
        ),
        fix: Some(
            "see docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md §4".to_string(),
        ),
        from: Some(from_text),
        to: Some(to_text),
    }
}

fn strip_quotes(value: &str) -> &str {
    value
        .strip_prefix('"')
        .and_then(|inner| inner.strip_suffix('"'))
        .or_else(|| {
            value
                .strip_prefix('\'')
                .and_then(|inner| inner.strip_suffix('\''))
        })
        .unwrap_or(value)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ─── v2 retained ──────────────────────────────────────────────────────────

    #[test]
    fn parse_scope() {
        let macros = parse_agent_macros("$scope \"user:read\"").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(macros[0], AgentMacroDecl::Scope("user:read".to_string()));
    }

    // ─── GX Phase 1 (#437-GX) — reserved `@` class-scope namespace ───────────

    #[test]
    fn parse_reserved_class_scopes() {
        let macros = parse_agent_macros("$scope \"@human\"").unwrap();
        assert_eq!(macros[0], AgentMacroDecl::Scope("@human".to_string()));
        let macros = parse_agent_macros("$scope \"@verified\"").unwrap();
        assert_eq!(macros[0], AgentMacroDecl::Scope("@verified".to_string()));
    }

    #[test]
    fn c485_unknown_class_scope_rejected() {
        let err = parse_agent_macros("$scope \"@admin\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C485"));
    }

    #[test]
    fn parse_rate_limit() {
        let macros = parse_agent_macros("$rate-limit 100").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(macros[0], AgentMacroDecl::RateLimit(100));
    }

    #[test]
    fn parse_rate_limit_invalid() {
        let err = parse_agent_macros("$rate-limit abc").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C421"));
    }

    #[test]
    fn parse_scope_and_rate_limit_together() {
        let body = "$scope \"user:read\"\n$rate-limit 50";
        let macros = parse_agent_macros(body).unwrap();
        assert_eq!(macros.len(), 2);
        assert_eq!(macros[0], AgentMacroDecl::Scope("user:read".to_string()));
        assert_eq!(macros[1], AgentMacroDecl::RateLimit(50));
    }

    #[test]
    fn parse_with_input_lines_skipped() {
        let body = "input plan: string\n$scope \"admin\"\n$rate-limit 50";
        let macros = parse_agent_macros(body).unwrap();
        assert_eq!(macros.len(), 2);
    }

    // ─── v2 removed forms — C440 ─────────────────────────────────────────────

    #[test]
    fn c440_expose_rejected() {
        let err = parse_agent_macros("$expose count: number").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
        assert!(err.message.contains("migrate.ts"));
    }

    #[test]
    fn c440_expose_comma_list_rejected() {
        // PARSE-FAIL PC-1.2.C — three names on one line.
        let err = parse_agent_macros("$expose foo, bar").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
    }

    #[test]
    fn c440_expose_write_rejected() {
        let err = parse_agent_macros("$expose.write label: string").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
    }

    #[test]
    fn c440_describe_rejected() {
        // PARSE-FAIL PC-1.2.E — `$describe name "text"` form.
        let err = parse_agent_macros("$describe addTodo \"Adds a todo\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
    }

    #[test]
    fn c440_describe_bare_text_rejected() {
        // v1 simpler form `$describe "text"` (no name) — also rejected in v2.
        let err = parse_agent_macros("$describe \"A widget\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
    }

    #[test]
    fn c440_agent_action_bare_rejected() {
        // PARSE-FAIL PC-1.2.D — `$action addTodo` (bare name) in @agent.
        let err = parse_agent_macros("$action addTodo").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
    }
}
