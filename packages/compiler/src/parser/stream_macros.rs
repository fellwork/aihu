/// v0.4.0 — `@stream` block parser.
///
/// Parses `@stream { $output: <name> $scope: <scope> $mime: <mime> }` blocks.
/// A component may have at most one `@stream` block (C552).
///
/// Errors:
///   C550 — `$output` references unknown `$stream` entry
///   C551 — `@stream` block missing `$output`
///   C552 — multiple `@stream` blocks in one SFC

use crate::types::{CollectionKind, CompileError, StateMacro, StreamBlock};

/// One macro declaration inside an `@stream { }` block.
#[derive(Debug, PartialEq, Clone)]
pub enum StreamMacroDecl {
    /// `$output: <name>` — required.
    Output(String),
    /// `$scope: <value>` — optional.
    Scope(String),
    /// `$mime: <value>` — optional.
    Mime(String),
}

/// Parse an `@stream` block body into `StreamMacroDecl` entries.
pub fn parse_stream_macros(body: &str) -> Result<Vec<StreamMacroDecl>, CompileError> {
    let mut result = Vec::new();

    for (idx, raw_line) in body.lines().enumerate() {
        let line_no = idx + 1;
        let line = raw_line.trim();

        if line.is_empty() || line.starts_with('#') || line.starts_with("//") {
            continue;
        }

        let Some(rest) = line.strip_prefix('$') else {
            continue;
        };

        if let Some(val) = rest.strip_prefix("output:").or_else(|| rest.strip_prefix("output ")) {
            let val = strip_quotes(val.trim()).to_string();
            if val.is_empty() {
                return Err(CompileError {
                    message: format!("C551: @stream $output value is empty (line {})", line_no),
                    line: line_no,
                    col: 0,
                    code: Some("C551".to_string()),
                    ..Default::default()
                });
            }
            result.push(StreamMacroDecl::Output(val));
            continue;
        }

        if let Some(val) = rest.strip_prefix("scope:").or_else(|| rest.strip_prefix("scope ")) {
            let val = strip_quotes(val.trim()).to_string();
            result.push(StreamMacroDecl::Scope(val));
            continue;
        }

        if let Some(val) = rest.strip_prefix("mime:").or_else(|| rest.strip_prefix("mime ")) {
            let val = strip_quotes(val.trim()).to_string();
            result.push(StreamMacroDecl::Mime(val));
            continue;
        }
    }

    Ok(result)
}

/// Build a `StreamBlock` from parsed macros, validating that `$output` is present (C551)
/// and that it references a known `$stream` entry (C550).
pub fn build_stream_block(
    decls: Vec<StreamMacroDecl>,
    state_macros: &[StateMacro],
) -> Result<StreamBlock, CompileError> {
    let mut output: Option<String> = None;
    let mut scope: Option<String> = None;
    let mut mime: Option<String> = None;

    for decl in decls {
        match decl {
            StreamMacroDecl::Output(v) => output = Some(v),
            StreamMacroDecl::Scope(v) => scope = Some(v),
            StreamMacroDecl::Mime(v) => mime = Some(v),
        }
    }

    let output = output.ok_or_else(|| CompileError {
        message: "C551: @stream block requires $output — add `$output: <stream_entry_name>`".to_string(),
        line: 0,
        col: 0,
        code: Some("C551".to_string()),
        hint: Some("Example: `@stream { $output: chat }`".to_string()),
        ..Default::default()
    })?;

    // C550: check that `output` names a known `$stream` collection entry.
    let stream_entry_names: Vec<&str> = state_macros
        .iter()
        .flat_map(|m| {
            if let StateMacro::Collection {
                kind: CollectionKind::Stream,
                entries,
            } = m
            {
                entries.iter().map(|e| e.name.as_str()).collect::<Vec<_>>()
            } else {
                Vec::new()
            }
        })
        .collect();

    if !stream_entry_names.contains(&output.as_str()) {
        return Err(CompileError {
            message: format!(
                "C550: @stream $output '{}' references unknown $stream entry. \
                 Known entries: [{}]. \
                 Add `$stream: {{ {}: {{ source: () => ... }} }}` to @state.",
                output,
                stream_entry_names.join(", "),
                output
            ),
            line: 0,
            col: 0,
            code: Some("C550".to_string()),
            hint: Some(format!(
                "Add `$stream: {{ {}: {{ source: () => <factory> }} }}` to the @state block.",
                output
            )),
            ..Default::default()
        });
    }

    Ok(StreamBlock { output, scope, mime })
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

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{CollectionEntry, StateMacro};

    fn make_stream_state(entry_name: &str) -> Vec<StateMacro> {
        vec![StateMacro::Collection {
            kind: CollectionKind::Stream,
            entries: vec![CollectionEntry {
                name: entry_name.to_string(),
                is_wrapped: true,
                value_raw: String::new(),
                meta: vec![("source".to_string(), "() => null".to_string())],
                wrapper: false,
                mutable: false,
            }],
        }]
    }

    #[test]
    fn parse_output_colon() {
        let decls = parse_stream_macros("$output: chat").unwrap();
        assert_eq!(decls.len(), 1);
        assert_eq!(decls[0], StreamMacroDecl::Output("chat".to_string()));
    }

    #[test]
    fn parse_output_space() {
        let decls = parse_stream_macros("$output chat").unwrap();
        assert_eq!(decls.len(), 1);
        assert_eq!(decls[0], StreamMacroDecl::Output("chat".to_string()));
    }

    #[test]
    fn parse_scope_and_mime() {
        let body = "$output: chat\n$scope: authenticated\n$mime: text/plain";
        let decls = parse_stream_macros(body).unwrap();
        assert_eq!(decls.len(), 3);
        assert_eq!(decls[1], StreamMacroDecl::Scope("authenticated".to_string()));
        assert_eq!(decls[2], StreamMacroDecl::Mime("text/plain".to_string()));
    }

    #[test]
    fn build_block_ok() {
        let state = make_stream_state("chat");
        let decls = parse_stream_macros("$output: chat\n$scope: authenticated").unwrap();
        let block = build_stream_block(decls, &state).unwrap();
        assert_eq!(block.output, "chat");
        assert_eq!(block.scope, Some("authenticated".to_string()));
        assert!(block.mime.is_none());
    }

    #[test]
    fn c551_missing_output() {
        let state = make_stream_state("chat");
        let decls = parse_stream_macros("$scope: authenticated").unwrap();
        let err = build_stream_block(decls, &state).unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C551"));
    }

    #[test]
    fn c550_unknown_output() {
        let state = make_stream_state("chat");
        let decls = parse_stream_macros("$output: nonexistent").unwrap();
        let err = build_stream_block(decls, &state).unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C550"));
        assert!(err.message.contains("nonexistent"));
    }

    #[test]
    fn c550_empty_state_no_stream() {
        // No $stream entries at all → C550.
        let state: Vec<StateMacro> = vec![];
        let decls = parse_stream_macros("$output: chat").unwrap();
        let err = build_stream_block(decls, &state).unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C550"));
    }
}
