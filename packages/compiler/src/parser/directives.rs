use crate::types::{Attr, CompileError};

pub fn parse_attr(raw: &str) -> Result<Attr, CompileError> {
    let (name, value) = split_attr(raw);
    let value = strip_quotes(value);

    if let Some(event_name) = name.strip_prefix('@') {
        return Ok(Attr::Event {
            name: event_name.to_string(),
            handler: value.to_string(),
        });
    }

    if let Some(binding_name) = name.strip_prefix(':') {
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

    Ok(Attr::Static {
        name: name.to_string(),
        value: value.to_string(),
    })
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
