use crate::types::{ActionDecl, CompileError, ContractAst, InputDecl, InputKind, StateDecl};

/// Strip an inline comment (everything from `#` onwards) and trim the result.
fn strip_comment(line: &str) -> &str {
    if let Some(pos) = line.find('#') {
        line[..pos].trim()
    } else {
        line.trim()
    }
}

fn parse_type_token(token: &str, line_no: usize) -> Result<InputKind, CompileError> {
    let token = token.trim();
    match token {
        "string" => Ok(InputKind::String),
        "number" => Ok(InputKind::Number),
        "boolean" => Ok(InputKind::Boolean),
        _ if token.starts_with("enum(") && token.ends_with(')') => {
            let inner = &token[5..token.len() - 1];
            if inner.trim().is_empty() {
                return Err(CompileError {
                    message: format!("line {}: malformed enum — empty variant list", line_no),
                    line: line_no,
                    col: 0,
                    code: Some("C006".to_string()),
                    ..Default::default()
                });
            }
            let variants: Vec<String> = inner
                .split(',')
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .collect();
            if variants.is_empty() {
                return Err(CompileError {
                    message: format!("line {}: malformed enum — empty variant list", line_no),
                    line: line_no,
                    col: 0,
                    code: Some("C006".to_string()),
                    ..Default::default()
                });
            }
            Ok(InputKind::Enum(variants))
        }
        _ if token.starts_with("enum") => {
            // enum without parens or with wrong form
            Err(CompileError {
                message: format!(
                    "line {}: malformed enum — use enum(v1, v2, ...) syntax",
                    line_no
                ),
                line: line_no,
                col: 0,
                code: Some("C006".to_string()),
                ..Default::default()
            })
        }
        _ => Err(CompileError {
            message: format!(
                "line {}: unknown type '{}'; expected string, number, boolean, or enum(...)",
                line_no, token
            ),
            line: line_no,
            col: 0,
            code: Some("C002".to_string()),
            ..Default::default()
        }),
    }
}

fn parse_input_line(rest: &str, line_no: usize) -> Result<InputDecl, CompileError> {
    // rest is the part after "input "
    // format: <name>: <type> [= <default>]
    let colon_pos = rest.find(':').ok_or_else(|| CompileError {
        message: format!(
            "line {}: malformed input declaration — missing ':' (expected: input <name>: <type>)",
            line_no
        ),
        line: line_no,
        col: 0,
        code: Some("C003".to_string()),
        ..Default::default()
    })?;

    let name = rest[..colon_pos].trim().to_string();
    let after_colon = rest[colon_pos + 1..].trim();

    // Split on '=' to get type and optional default
    let (type_part, default) = if let Some(eq_pos) = after_colon.find('=') {
        let type_str = after_colon[..eq_pos].trim();
        let default_str = after_colon[eq_pos + 1..].trim().to_string();
        (type_str, Some(default_str))
    } else {
        (after_colon, None)
    };

    let kind = parse_type_token(type_part, line_no)?;

    Ok(InputDecl {
        name,
        kind,
        default,
    })
}

fn parse_state_line(rest: &str, line_no: usize) -> Result<StateDecl, CompileError> {
    // rest is the part after "state "
    // format: <name>: <type>
    let colon_pos = rest.find(':').ok_or_else(|| CompileError {
        message: format!(
            "line {}: malformed state declaration — missing ':' (expected: state <name>: <type>)",
            line_no
        ),
        line: line_no,
        col: 0,
        code: Some("C003".to_string()),
        ..Default::default()
    })?;

    let name = rest[..colon_pos].trim().to_string();
    let type_part = rest[colon_pos + 1..].trim();
    let kind = parse_type_token(type_part, line_no)?;

    Ok(StateDecl { name, kind })
}

fn parse_returns_block(
    block: &str,
    line_no: usize,
) -> Result<Vec<(String, InputKind)>, CompileError> {
    // block is the content inside { ... }
    let mut returns = Vec::new();
    for field_str in block.split(',') {
        let field_str = field_str.trim();
        if field_str.is_empty() {
            continue;
        }
        let colon_pos = field_str.find(':').ok_or_else(|| CompileError {
            message: format!(
                "line {}: malformed returns block — field '{}' missing ':'",
                line_no, field_str
            ),
            line: line_no,
            col: 0,
            code: Some("C005".to_string()),
            ..Default::default()
        })?;
        let field_name = field_str[..colon_pos].trim().to_string();
        let field_type = field_str[colon_pos + 1..].trim();
        let kind = parse_type_token(field_type, line_no)?;
        returns.push((field_name, kind));
    }
    Ok(returns)
}

fn parse_action_line(rest: &str, line_no: usize) -> Result<ActionDecl, CompileError> {
    // rest is the part after "action "
    // format: <name>() [-> { <field>: <type>, ... }]

    let paren_pos = rest.find("()").ok_or_else(|| CompileError {
        message: format!(
            "line {}: malformed action declaration — missing '()' (expected: action <name>())",
            line_no
        ),
        line: line_no,
        col: 0,
        code: Some("C004".to_string()),
        ..Default::default()
    })?;

    let name = rest[..paren_pos].trim().to_string();
    let after_parens = rest[paren_pos + 2..].trim();

    let returns = if after_parens.is_empty() {
        Vec::new()
    } else if let Some(arrow_rest) = after_parens.strip_prefix("->") {
        let block_str = arrow_rest.trim();
        // Must start with { and end with }
        if block_str.starts_with('{') && block_str.ends_with('}') {
            let inner = &block_str[1..block_str.len() - 1];
            parse_returns_block(inner, line_no)?
        } else {
            return Err(CompileError {
                message: format!(
                    "line {}: malformed returns block — expected '-> {{ ... }}'",
                    line_no
                ),
                line: line_no,
                col: 0,
                code: Some("C005".to_string()),
                ..Default::default()
            });
        }
    } else {
        return Err(CompileError {
            message: format!(
                "line {}: malformed action declaration — unexpected content after '()'",
                line_no
            ),
            line: line_no,
            col: 0,
            code: Some("C004".to_string()),
            ..Default::default()
        });
    };

    Ok(ActionDecl { name, returns })
}

pub fn parse_contract(src: &str) -> Result<ContractAst, CompileError> {
    let mut ast = ContractAst::default();
    let mut seen_input_names: std::collections::HashSet<String> = std::collections::HashSet::new();

    for (idx, raw_line) in src.lines().enumerate() {
        let line_no = idx + 1;
        let line = strip_comment(raw_line);

        if line.is_empty() {
            continue;
        }

        if let Some(rest) = line.strip_prefix("input ") {
            let decl = parse_input_line(rest.trim(), line_no)?;
            if seen_input_names.contains(&decl.name) {
                return Err(CompileError {
                    message: format!("line {}: duplicate input name '{}'", line_no, decl.name),
                    line: line_no,
                    col: 0,
                    code: Some("C007".to_string()),
                    ..Default::default()
                });
            }
            seen_input_names.insert(decl.name.clone());
            ast.inputs.push(decl);
        } else if let Some(rest) = line.strip_prefix("state ") {
            let decl = parse_state_line(rest.trim(), line_no)?;
            ast.states.push(decl);
        } else if let Some(rest) = line.strip_prefix("action ") {
            let decl = parse_action_line(rest.trim(), line_no)?;
            ast.actions.push(decl);
        } else {
            // Unknown keyword
            let keyword = line.split_whitespace().next().unwrap_or(line);
            return Err(CompileError {
                message: format!(
                    "line {}: unknown keyword '{}'; expected input, state, or action",
                    line_no, keyword
                ),
                line: line_no,
                col: 0,
                code: Some("C001".to_string()),
                ..Default::default()
            });
        }
    }

    Ok(ast)
}

#[cfg(test)]
mod tests {
    use super::*;

    // 1. empty contract → ContractAst::default()
    #[test]
    fn empty_contract() {
        let result = parse_contract("").unwrap();
        assert_eq!(result, ContractAst::default());
    }

    // 2. comment-only → ContractAst::default()
    #[test]
    fn comment_only() {
        let result = parse_contract("# this is a comment\n# another comment").unwrap();
        assert_eq!(result, ContractAst::default());
    }

    // 3. `input plan: string` → InputDecl { name:"plan", kind:String, default:None }
    #[test]
    fn input_string_no_default() {
        let result = parse_contract("input plan: string").unwrap();
        assert_eq!(result.inputs.len(), 1);
        assert_eq!(result.inputs[0].name, "plan");
        assert_eq!(result.inputs[0].kind, InputKind::String);
        assert_eq!(result.inputs[0].default, None);
    }

    // 4. `input plan: string = hello` → default:Some("hello")
    #[test]
    fn input_string_with_default() {
        let result = parse_contract("input plan: string = hello").unwrap();
        assert_eq!(result.inputs[0].default, Some("hello".to_string()));
    }

    // 5. `input amount: number = 100` → kind:Number, default:Some("100")
    #[test]
    fn input_number_with_default() {
        let result = parse_contract("input amount: number = 100").unwrap();
        assert_eq!(result.inputs[0].kind, InputKind::Number);
        assert_eq!(result.inputs[0].default, Some("100".to_string()));
    }

    // 6. `input active: boolean = false` → kind:Boolean, default:Some("false")
    #[test]
    fn input_boolean_with_default() {
        let result = parse_contract("input active: boolean = false").unwrap();
        assert_eq!(result.inputs[0].kind, InputKind::Boolean);
        assert_eq!(result.inputs[0].default, Some("false".to_string()));
    }

    // 7. enum with default
    #[test]
    fn input_enum_with_default() {
        let result = parse_contract("input plan: enum(daily, weekly, monthly) = daily").unwrap();
        assert_eq!(
            result.inputs[0].kind,
            InputKind::Enum(vec![
                "daily".to_string(),
                "weekly".to_string(),
                "monthly".to_string()
            ])
        );
        assert_eq!(result.inputs[0].default, Some("daily".to_string()));
    }

    // 8. enum without default → Enum, default:None (no error)
    #[test]
    fn input_enum_no_default() {
        let result = parse_contract("input plan: enum(daily, weekly, monthly)").unwrap();
        assert_eq!(
            result.inputs[0].kind,
            InputKind::Enum(vec![
                "daily".to_string(),
                "weekly".to_string(),
                "monthly".to_string()
            ])
        );
        assert_eq!(result.inputs[0].default, None);
    }

    // 9. `state total: number`
    #[test]
    fn state_number() {
        let result = parse_contract("state total: number").unwrap();
        assert_eq!(result.states.len(), 1);
        assert_eq!(result.states[0].name, "total");
        assert_eq!(result.states[0].kind, InputKind::Number);
    }

    // 10. `state label: string`
    #[test]
    fn state_string() {
        let result = parse_contract("state label: string").unwrap();
        assert_eq!(result.states[0].name, "label");
        assert_eq!(result.states[0].kind, InputKind::String);
    }

    // 11. `action quote()` → ActionDecl { name:"quote", returns:[] }
    #[test]
    fn action_no_returns() {
        let result = parse_contract("action quote()").unwrap();
        assert_eq!(result.actions.len(), 1);
        assert_eq!(result.actions[0].name, "quote");
        assert!(result.actions[0].returns.is_empty());
    }

    // 12. action with 4-field returns
    #[test]
    fn action_with_returns() {
        let result = parse_contract(
            "action quote() -> { plan: string, amount: number, fee: number, total: number }",
        )
        .unwrap();
        assert_eq!(result.actions[0].returns.len(), 4);
        assert_eq!(
            result.actions[0].returns[0],
            ("plan".to_string(), InputKind::String)
        );
        assert_eq!(
            result.actions[0].returns[1],
            ("amount".to_string(), InputKind::Number)
        );
        assert_eq!(
            result.actions[0].returns[2],
            ("fee".to_string(), InputKind::Number)
        );
        assert_eq!(
            result.actions[0].returns[3],
            ("total".to_string(), InputKind::Number)
        );
    }

    // 13. Mixed (2 inputs + 1 state + 1 action)
    #[test]
    fn mixed_declarations() {
        let src = "input plan: string\ninput amount: number\nstate total: number\naction quote()";
        let result = parse_contract(src).unwrap();
        assert_eq!(result.inputs.len(), 2);
        assert_eq!(result.states.len(), 1);
        assert_eq!(result.actions.len(), 1);
    }

    // 14. Blank lines between declarations
    #[test]
    fn blank_lines_between_declarations() {
        let src = "input plan: string\n\n\nstate total: number\n\naction quote()";
        let result = parse_contract(src).unwrap();
        assert_eq!(result.inputs.len(), 1);
        assert_eq!(result.states.len(), 1);
        assert_eq!(result.actions.len(), 1);
    }

    // 15. Inline comment stripped
    #[test]
    fn inline_comment_stripped() {
        let result = parse_contract("input plan: string # the plan").unwrap();
        assert_eq!(result.inputs[0].name, "plan");
        assert_eq!(result.inputs[0].kind, InputKind::String);
    }

    // 16. Unknown keyword → C001
    #[test]
    fn unknown_keyword_error() {
        let err = parse_contract("output foo: string").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C001"));
    }

    // 17. Unknown type → C002
    #[test]
    fn unknown_type_error() {
        let err = parse_contract("input x: uuid").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C002"));
    }

    // 18. Missing colon → C003
    #[test]
    fn missing_colon_error() {
        let err = parse_contract("input plan string").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C003"));
    }

    // 19. Missing () in action → C004
    #[test]
    fn missing_parens_error() {
        let err = parse_contract("action quote").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C004"));
    }

    // 20. Malformed returns block → C005
    #[test]
    fn malformed_returns_error() {
        let err = parse_contract("action quote() -> { total number }").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C005"));
    }

    // 21. Empty enum → C006
    #[test]
    fn empty_enum_error() {
        let err = parse_contract("input x: enum()").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C006"));
    }

    // 22. Duplicate input name → C007
    #[test]
    fn duplicate_input_name_error() {
        let err = parse_contract("input plan: string\ninput plan: string").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C007"));
    }

    // 23. Enum with spaces → parses correctly
    #[test]
    fn enum_with_spaces() {
        let result = parse_contract("input plan: enum( daily , weekly )").unwrap();
        assert_eq!(
            result.inputs[0].kind,
            InputKind::Enum(vec!["daily".to_string(), "weekly".to_string()])
        );
    }

    // 24. action with single field in returns
    #[test]
    fn action_single_return_field() {
        let result = parse_contract("action quote() -> { total: number }").unwrap();
        assert_eq!(result.actions[0].returns.len(), 1);
        assert_eq!(
            result.actions[0].returns[0],
            ("total".to_string(), InputKind::Number)
        );
    }

    // 25. Full airtime-quote contract
    #[test]
    fn full_airtime_quote_contract() {
        let src = "input plan: enum(daily, weekly, monthly) = daily\ninput amount: number = 100\nstate total: number   # Final quoted total\naction quote() -> { plan: string, amount: number, fee: number, total: number }";
        let result = parse_contract(src).unwrap();
        assert_eq!(result.inputs.len(), 2);
        assert_eq!(result.inputs[0].name, "plan");
        assert_eq!(
            result.inputs[0].kind,
            InputKind::Enum(vec![
                "daily".to_string(),
                "weekly".to_string(),
                "monthly".to_string()
            ])
        );
        assert_eq!(result.inputs[0].default, Some("daily".to_string()));
        assert_eq!(result.inputs[1].name, "amount");
        assert_eq!(result.inputs[1].kind, InputKind::Number);
        assert_eq!(result.inputs[1].default, Some("100".to_string()));
        assert_eq!(result.states.len(), 1);
        assert_eq!(result.states[0].name, "total");
        assert_eq!(result.states[0].kind, InputKind::Number);
        assert_eq!(result.actions.len(), 1);
        assert_eq!(result.actions[0].name, "quote");
        assert_eq!(result.actions[0].returns.len(), 4);
    }
}
