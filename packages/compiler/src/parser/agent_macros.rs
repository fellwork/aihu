/// v0.4.8 — `@agent` manifest macro declarations parser.
///
/// Parses `$expose`, `$expose.write`, `$scope`, `$rate-limit`, `$describe`
/// inside an `@agent { }` block.

use crate::types::{AgentMacroDecl, CompileError};

/// Parse agent manifest macros from the body of an `@agent { }` block.
/// Non-macro lines (input/state/action keywords) are skipped.
pub fn parse_agent_macros(body: &str) -> Result<Vec<AgentMacroDecl>, CompileError> {
    let mut result = Vec::new();

    for (idx, raw_line) in body.lines().enumerate() {
        let line_no = idx + 1;
        let line = raw_line.trim();

        // Skip blank lines and standard agent keywords
        if line.is_empty()
            || line.starts_with("input ")
            || line.starts_with("state ")
            || line.starts_with("action ")
            || line.starts_with('#')
        {
            continue;
        }

        let Some(rest) = line.strip_prefix('$') else {
            continue;
        };

        // $expose.write field: Type
        if let Some(decl) = rest.strip_prefix("expose.write ") {
            let decl = decl.trim();
            let colon = decl.find(':').ok_or_else(|| CompileError {
                message: format!(
                    "line {}: $expose.write declaration missing ':' — expected '$expose.write name: Type', got '$expose.write {}'",
                    line_no, decl
                ),
                line: line_no,
                col: 0,
                code: Some("C420".to_string()),
                ..Default::default()
            })?;
            let name = decl[..colon].trim().to_string();
            let type_name = decl[colon + 1..].trim().to_string();
            result.push(AgentMacroDecl::Expose { name, type_name, writable: true });
            continue;
        }

        // $expose field: Type
        if let Some(decl) = rest.strip_prefix("expose ") {
            let decl = decl.trim();
            let colon = decl.find(':').ok_or_else(|| CompileError {
                message: format!(
                    "line {}: $expose declaration missing ':' — expected '$expose name: Type', got '$expose {}'",
                    line_no, decl
                ),
                line: line_no,
                col: 0,
                code: Some("C420".to_string()),
                ..Default::default()
            })?;
            let name = decl[..colon].trim().to_string();
            let type_name = decl[colon + 1..].trim().to_string();
            result.push(AgentMacroDecl::Expose { name, type_name, writable: false });
            continue;
        }

        // $scope "value"
        if let Some(decl) = rest.strip_prefix("scope ") {
            let val = strip_quotes(decl.trim()).to_string();
            result.push(AgentMacroDecl::Scope(val));
            continue;
        }

        // $rate-limit N
        if let Some(decl) = rest.strip_prefix("rate-limit ") {
            let n: u32 = decl.trim().parse().map_err(|_| CompileError {
                message: format!(
                    "line {}: $rate-limit value must be a non-negative integer, got '{}'",
                    line_no, decl.trim()
                ),
                line: line_no,
                col: 0,
                code: Some("C421".to_string()),
                ..Default::default()
            })?;
            result.push(AgentMacroDecl::RateLimit(n));
            continue;
        }

        // $describe "text"
        if let Some(decl) = rest.strip_prefix("describe ") {
            let val = strip_quotes(decl.trim()).to_string();
            result.push(AgentMacroDecl::Describe(val));
            continue;
        }
    }

    Ok(result)
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

    #[test]
    fn parse_expose_readonly() {
        let macros = parse_agent_macros("$expose count: number").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            AgentMacroDecl::Expose {
                name: "count".to_string(),
                type_name: "number".to_string(),
                writable: false
            }
        );
    }

    #[test]
    fn parse_expose_writable() {
        let macros = parse_agent_macros("$expose.write label: string").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            AgentMacroDecl::Expose {
                name: "label".to_string(),
                type_name: "string".to_string(),
                writable: true
            }
        );
    }

    #[test]
    fn parse_scope() {
        let macros = parse_agent_macros("$scope \"user:read\"").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(macros[0], AgentMacroDecl::Scope("user:read".to_string()));
    }

    #[test]
    fn parse_rate_limit() {
        let macros = parse_agent_macros("$rate-limit 100").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(macros[0], AgentMacroDecl::RateLimit(100));
    }

    #[test]
    fn parse_describe() {
        let macros = parse_agent_macros("$describe \"A helpful widget\"").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            AgentMacroDecl::Describe("A helpful widget".to_string())
        );
    }

    #[test]
    fn parse_mixed_agent_macros() {
        let body =
            "input plan: string\n$expose count: number\n$scope \"admin\"\n$rate-limit 50\n$describe \"Widget\"";
        let macros = parse_agent_macros(body).unwrap();
        assert_eq!(macros.len(), 4);
    }

    #[test]
    fn parse_rate_limit_invalid() {
        let err = parse_agent_macros("$rate-limit abc").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C421"));
    }

    #[test]
    fn expose_missing_colon_error() {
        let err = parse_agent_macros("$expose count number").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C420"));
    }
}
