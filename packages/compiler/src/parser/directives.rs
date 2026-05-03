use crate::types::{Attr, CompileError, MacroValue};

/// Boolean void attributes that are valid without a value.
const VOID_ATTRS: &[&str] = &[
    "disabled", "checked", "readonly", "required", "multiple",
    "autofocus", "autoplay", "controls", "default", "defer",
    "formnovalidate", "hidden", "ismap", "loop", "novalidate",
    "open", "reversed", "scoped", "seamless", "selected",
];

pub fn parse_attr(raw: &str) -> Result<Attr, CompileError> {
    // Macro attributes: $name, $name="value", $name={expr}
    if let Some(macro_part) = raw.strip_prefix('$') {
        return parse_macro_attr(macro_part);
    }

    let (name, raw_value) = split_attr(raw);

    // Event binding: @event="handler" (deprecated alias for $on:event)
    if let Some(event_name) = name.strip_prefix('@') {
        eprintln!(
            "DEPRECATED: use $on:{} instead of @{}",
            event_name, event_name
        );
        let value = strip_quotes(raw_value);
        return Ok(Attr::Event {
            name: event_name.to_string(),
            handler: value.to_string(),
        });
    }

    // Property binding: :prop="expr" (deprecated alias for $bind:prop)
    if let Some(binding_name) = name.strip_prefix(':') {
        eprintln!(
            "DEPRECATED: use $bind:{} instead of :{}",
            binding_name, binding_name
        );
        let value = strip_quotes(raw_value);
        return Ok(Attr::Binding {
            name: binding_name.to_string(),
            expr: value.to_string(),
        });
    }

    if name == "v-if" || name == "v-for" {
        return Err(CompileError {
            message: "v-if / v-for directives are not supported in v0; see v1 roadmap".to_string(),
            line: 0,
            col: 0,
            ..Default::default()
        });
    }

    if let Some(directive_name) = name.strip_prefix("v-") {
        return Err(CompileError {
            message: format!(
                "unknown directive 'v-{}'; scribe v0 supports @event, :attr, and {{ identifier }} only",
                directive_name
            ),
            line: 0,
            col: 0,
            ..Default::default()
        });
    }

    // Boolean HTML attribute (no `=` sign)
    if raw_value.is_empty() && (VOID_ATTRS.contains(&name) || name.starts_with("data-")) {
        return Ok(Attr::Static {
            name: name.to_string(),
            value: String::new(),
        });
    }

    // If there's a value, it must be quoted or curly — bare values are C300
    if !raw_value.is_empty() {
        if !raw_value.starts_with('"')
            && !raw_value.starts_with('\'')
            && !raw_value.starts_with('{')
        {
            return Err(CompileError {
                message: "bare attribute values are not supported; use quoted form or {expression}"
                    .to_string(),
                line: 0,
                col: 0,
                code: Some("C300".to_string()),
                ..Default::default()
            });
        }
    }

    let value = strip_quotes(raw_value);
    Ok(Attr::Static {
        name: name.to_string(),
        value: value.to_string(),
    })
}

/// Parse a `$macro` attribute (the `$` prefix has already been stripped).
///
/// Handles:
/// - `$name` (boolean)
/// - `$name="quoted_value"`
/// - `$name={arbitrary_expr}`
/// - `$name.sub="value"` (e.g. `$bind:prop`, `$on:event`)
fn parse_macro_attr(rest: &str) -> Result<Attr, CompileError> {
    // Split on `=` to find the value part (if any)
    // We need to handle `$name={...}` which contains `=` inside braces.
    let eq_pos = find_top_level_eq(rest);

    let (name_part, value_part) = match eq_pos {
        Some(pos) => (&rest[..pos], &rest[pos + 1..]),
        None => (rest, ""),
    };

    let name = name_part.trim().to_string();

    // Boolean macros: no `=`, or explicit boolean void attrs
    if value_part.is_empty() {
        return Ok(Attr::Macro {
            name,
            value: MacroValue::Boolean,
        });
    }

    let value_trimmed = value_part.trim();

    // Curly form: $attr={expr}
    if value_trimmed.starts_with('{') {
        let inner = extract_balanced_braces(value_trimmed).ok_or_else(|| CompileError {
            message: format!("unclosed '{{' in macro attribute ${}", name),
            line: 0,
            col: 0,
            code: Some("C301".to_string()),
            ..Default::default()
        })?;
        return Ok(Attr::Macro {
            name,
            value: MacroValue::Curly(inner.to_string()),
        });
    }

    // Quoted form: $attr="identifier_or_dotted.path"
    if value_trimmed.starts_with('"') || value_trimmed.starts_with('\'') {
        let inner = strip_quotes(value_trimmed);
        // $each uses a specialized parser that accepts "list as item[, idx]" form.
        if name == "each" {
            parse_each_value(inner)?;
            return Ok(Attr::Macro {
                name,
                value: MacroValue::Quoted(inner.to_string()),
            });
        }
        validate_macro_quoted_value(inner, &name)?;
        return Ok(Attr::Macro {
            name,
            value: MacroValue::Quoted(inner.to_string()),
        });
    }

    // Bare value — C300
    Err(CompileError {
        message: "bare attribute values are not supported; use quoted form or {expression}"
            .to_string(),
        line: 0,
        col: 0,
        code: Some("C300".to_string()),
        ..Default::default()
    })
}

/// Find the position of the top-level `=` in a macro attribute token,
/// skipping over brace-balanced regions.
fn find_top_level_eq(s: &str) -> Option<usize> {
    let mut depth = 0usize;
    for (i, c) in s.char_indices() {
        match c {
            '{' => depth += 1,
            '}' => depth = depth.saturating_sub(1),
            '=' if depth == 0 => return Some(i),
            _ => {}
        }
    }
    None
}

/// Extract the inner content of a brace-balanced `{...}` expression.
/// `s` must start with `{`.
fn extract_balanced_braces(s: &str) -> Option<&str> {
    let bytes = s.as_bytes();
    if bytes.first() != Some(&b'{') {
        return None;
    }
    let mut depth = 0usize;
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&s[1..i]);
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

/// Parse a `$each` quoted value in `"list as item"` or `"list as item, idx"` form.
/// Returns `(list_expr, item_alias, idx_alias)`.
/// Old-style `$each="items"` (no ` as `) is error C302.
fn parse_each_value(value: &str) -> Result<(String, String, Option<String>), CompileError> {
    let Some((list_part, rest)) = value.split_once(" as ") else {
        return Err(CompileError {
            message: "$each: expected 'list as item' or 'list as item, index'".to_string(),
            line: 0,
            col: 0,
            code: Some("C302".to_string()),
            ..Default::default()
        });
    };
    let list_expr = list_part.trim().to_string();
    let (item_alias, idx_alias) = if let Some((item, idx)) = rest.split_once(',') {
        (item.trim().to_string(), Some(idx.trim().to_string()))
    } else {
        (rest.trim().to_string(), None)
    };
    if list_expr.is_empty() || item_alias.is_empty() {
        return Err(CompileError {
            message: "$each: list expression and item alias must not be empty".to_string(),
            line: 0,
            col: 0,
            code: Some("C302".to_string()),
            ..Default::default()
        });
    }
    Ok((list_expr, item_alias, idx_alias))
}

/// Validate that a quoted macro value is a bare identifier or dotted path.
/// Rejects: whitespace, brackets `[]`, call parens `()`, optional-chains `?.`.
fn validate_macro_quoted_value(value: &str, macro_name: &str) -> Result<(), CompileError> {
    if value.is_empty() {
        return Err(CompileError {
            message: format!("${} quoted value must not be empty", macro_name),
            line: 0,
            col: 0,
            code: Some("C302".to_string()),
            ..Default::default()
        });
    }
    for ch in value.chars() {
        if ch.is_whitespace() || ch == '[' || ch == ']' || ch == '(' || ch == ')' || ch == '?' {
            return Err(CompileError {
                message: format!(
                    "${} quoted value must be a bare identifier or dotted path (no whitespace, brackets, calls, or optional-chains); got '{}'",
                    macro_name, value
                ),
                line: 0,
                col: 0,
                code: Some("C302".to_string()),
                ..Default::default()
            });
        }
    }
    Ok(())
}

pub fn validate_identifier(input: &str) -> Result<String, CompileError> {
    let trimmed = input
        .trim()
        .trim_start_matches("{{")
        .trim_end_matches("}}")
        .trim();

    let mut chars = trimmed.chars();
    let Some(first) = chars.next() else {
        return Err(identifier_error());
    };

    if !(first.is_ascii_alphabetic() || first == '_') {
        return Err(identifier_error());
    }

    if chars.any(|ch| !(ch.is_ascii_alphanumeric() || ch == '_')) {
        return Err(identifier_error());
    }

    Ok(trimmed.to_string())
}

fn split_attr(raw: &str) -> (&str, &str) {
    if let Some((name, value)) = raw.split_once('=') {
        (name.trim(), value.trim())
    } else {
        (raw.trim(), "")
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

fn identifier_error() -> CompileError {
    CompileError {
        message: "interpolation must be a single identifier in v0; expressions are not supported"
            .to_string(),
        line: 0,
        col: 0,
        ..Default::default()
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::MacroValue;

    #[test]
    fn macro_boolean_once() {
        let attr = parse_attr("$once").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "once".to_string(),
                value: MacroValue::Boolean
            }
        );
    }

    #[test]
    fn macro_boolean_raw() {
        let attr = parse_attr("$raw").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "raw".to_string(),
                value: MacroValue::Boolean
            }
        );
    }

    #[test]
    fn macro_quoted_simple_identifier() {
        let attr = parse_attr("$if=\"isVisible\"").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "if".to_string(),
                value: MacroValue::Quoted("isVisible".to_string())
            }
        );
    }

    #[test]
    fn macro_quoted_dotted_path() {
        let attr = parse_attr("$if=\"user.profile.active\"").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "if".to_string(),
                value: MacroValue::Quoted("user.profile.active".to_string())
            }
        );
    }

    #[test]
    fn macro_curly_expression() {
        let attr = parse_attr("$show={count > 0}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "show".to_string(),
                value: MacroValue::Curly("count > 0".to_string())
            }
        );
    }

    #[test]
    fn macro_curly_nested_braces() {
        let attr = parse_attr("$show={obj.method({key: val})}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "show".to_string(),
                value: MacroValue::Curly("obj.method({key: val})".to_string())
            }
        );
    }

    #[test]
    fn macro_bind_dotted_name() {
        let attr = parse_attr("$bind:value=\"count\"").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "bind:value".to_string(),
                value: MacroValue::Quoted("count".to_string())
            }
        );
    }

    #[test]
    fn macro_on_event() {
        let attr = parse_attr("$on:click=\"handleClick\"").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "on:click".to_string(),
                value: MacroValue::Quoted("handleClick".to_string())
            }
        );
    }

    #[test]
    fn macro_quoted_rejects_brackets() {
        let err = parse_attr("$if=\"items[0]\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C302"));
    }

    #[test]
    fn macro_quoted_rejects_whitespace() {
        let err = parse_attr("$if=\"a b\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C302"));
    }

    #[test]
    fn macro_quoted_rejects_calls() {
        let err = parse_attr("$if=\"fn()\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C302"));
    }

    #[test]
    fn bare_value_rejected_c300() {
        let err = parse_attr("class=myClass").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C300"));
    }

    #[test]
    fn bare_macro_value_rejected_c300() {
        let err = parse_attr("$if=isVisible").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C300"));
    }

    #[test]
    fn deprecated_event_binding() {
        // @event is still parsed correctly (DEPRECATED warning to stderr)
        let attr = parse_attr("@click=\"handleClick\"").unwrap();
        assert_eq!(
            attr,
            Attr::Event {
                name: "click".to_string(),
                handler: "handleClick".to_string()
            }
        );
    }

    #[test]
    fn deprecated_colon_binding() {
        // :prop is still parsed correctly (DEPRECATED warning to stderr)
        let attr = parse_attr(":value=\"count\"").unwrap();
        assert_eq!(
            attr,
            Attr::Binding {
                name: "value".to_string(),
                expr: "count".to_string()
            }
        );
    }

    #[test]
    fn macro_each_and_key() {
        // Updated to spec-idiomatic "list as item" form (old form is C302)
        let each = parse_attr("$each=\"items as item\"").unwrap();
        let key = parse_attr("$key=\"getKey\"").unwrap();
        assert_eq!(
            each,
            Attr::Macro {
                name: "each".to_string(),
                value: MacroValue::Quoted("items as item".to_string())
            }
        );
        assert_eq!(
            key,
            Attr::Macro {
                name: "key".to_string(),
                value: MacroValue::Quoted("getKey".to_string())
            }
        );
    }

    #[test]
    fn macro_each_spec_form_with_index() {
        let each = parse_attr("$each=\"users as user, idx\"").unwrap();
        assert_eq!(
            each,
            Attr::Macro {
                name: "each".to_string(),
                value: MacroValue::Quoted("users as user, idx".to_string())
            }
        );
    }

    #[test]
    fn macro_each_old_form_is_c302() {
        let err = parse_attr("$each=\"items\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C302"));
    }

    #[test]
    fn macro_memo_curly() {
        let attr = parse_attr("$memo={[count, name]}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "memo".to_string(),
                value: MacroValue::Curly("[count, name]".to_string())
            }
        );
    }
}
