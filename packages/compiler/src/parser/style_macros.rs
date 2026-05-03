/// v0.4.7 — `@style` macro declarations parser.
///
/// Parses `$reactive`, `$media`, `$when` inside an `@style { }` block.
/// (`$global` is already handled in v0.3.3 — not duplicated here.)

use crate::parser::state_macros::find_brace_close;
use crate::types::{CompileError, StyleMacro};

/// Parse `$macro` declarations from the body of an `@style { }` block.
/// Returns a list of `StyleMacro` declarations.
pub fn parse_style_macros(body: &str) -> Result<Vec<StyleMacro>, CompileError> {
    let mut result = Vec::new();
    let mut i = 0;

    while i < body.len() {
        let nl = body[i..].find('\n').map(|r| i + r).unwrap_or(body.len());
        let line = body[i..nl].trim();

        if let Some(rest) = line.strip_prefix('$') {
            // $reactive name: expr
            if let Some(decl) = rest.strip_prefix("reactive ") {
                let decl = decl.trim();
                let colon = decl.find(':').ok_or_else(|| CompileError {
                    message: format!("$reactive declaration missing ':' — expected '$reactive name: expr', got '$reactive {}'", decl),
                    line: 0,
                    col: 0,
                    code: Some("C410".to_string()),
                    ..Default::default()
                })?;
                let name = decl[..colon].trim().to_string();
                let expr = decl[colon + 1..].trim().to_string();
                result.push(StyleMacro::Reactive { name, expr });
                i = nl + 1;
                continue;
            }

            // $media breakpoint { css }
            if let Some(decl) = rest.strip_prefix("media ") {
                let decl = decl.trim();
                let end = decl
                    .find(|c: char| c == '{')
                    .unwrap_or(decl.len());
                let breakpoint = decl[..end].trim().to_string();
                let open_pos = body[i..].find('{').map(|r| i + r).ok_or_else(|| CompileError {
                    message: "$media block missing '{'".to_string(),
                    line: 0,
                    col: 0,
                    code: Some("C411".to_string()),
                    ..Default::default()
                })?;
                let close_pos = find_brace_close(body, open_pos + 1).ok_or_else(|| CompileError {
                    message: "unclosed '{' in $media block".to_string(),
                    line: 0,
                    col: 0,
                    code: Some("C411".to_string()),
                    ..Default::default()
                })?;
                let css = body[open_pos + 1..close_pos].trim().to_string();
                result.push(StyleMacro::Media { breakpoint, css });
                i = close_pos + 1;
                continue;
            }

            // $when expr { css }
            if let Some(decl) = rest.strip_prefix("when ") {
                let decl = decl.trim();
                let end = decl.find('{').unwrap_or(decl.len());
                let expr = decl[..end].trim().to_string();
                let open_pos = body[i..].find('{').map(|r| i + r).ok_or_else(|| CompileError {
                    message: "$when block missing '{'".to_string(),
                    line: 0,
                    col: 0,
                    code: Some("C412".to_string()),
                    ..Default::default()
                })?;
                let close_pos = find_brace_close(body, open_pos + 1).ok_or_else(|| CompileError {
                    message: "unclosed '{' in $when block".to_string(),
                    line: 0,
                    col: 0,
                    code: Some("C412".to_string()),
                    ..Default::default()
                })?;
                let css = body[open_pos + 1..close_pos].trim().to_string();
                result.push(StyleMacro::When { expr, css });
                i = close_pos + 1;
                continue;
            }
        }

        i = nl + 1;
    }

    Ok(result)
}

/// Emit CSS and JS side-effects for style macros.
///
/// Returns `(css_additions, js_effects)` where:
/// - `css_additions` is CSS text to append to the stylesheet.
/// - `js_effects` is JS code to append to the component setup.
pub fn emit_style_macros(macros: &[StyleMacro]) -> (String, String) {
    let mut css_lines: Vec<String> = Vec::new();
    let mut js_lines: Vec<String> = Vec::new();

    for (idx, mac) in macros.iter().enumerate() {
        match mac {
            StyleMacro::Reactive { name, expr } => {
                // CSS variable placeholder
                css_lines.push(format!("--reactive-{}: initial;", name));
                // JS effect to update it
                js_lines.push(format!(
                    "effect(() => {{ el.style.setProperty('--reactive-{}', String({})) }});",
                    name, expr
                ));
            }
            StyleMacro::Media { breakpoint, css } => {
                css_lines.push(format!("@media ({}) {{ {} }}", breakpoint, css));
            }
            StyleMacro::When { expr, css } => {
                let n = idx;
                css_lines.push(format!("[data-when-{}] {{ {} }}", n, css));
                js_lines.push(format!(
                    "effect(() => {{ el.dataset.when{} = String(Boolean({})) }});",
                    n, expr
                ));
            }
        }
    }

    (css_lines.join("\n"), js_lines.join("\n"))
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_reactive_macro() {
        let macros = parse_style_macros("$reactive color: theme.primary").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            StyleMacro::Reactive {
                name: "color".to_string(),
                expr: "theme.primary".to_string()
            }
        );
    }

    #[test]
    fn parse_media_macro() {
        let body = "$media max-width: 600px { color: red }";
        let macros = parse_style_macros(body).unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            StyleMacro::Media {
                breakpoint: "max-width: 600px".to_string(),
                css: "color: red".to_string()
            }
        );
    }

    #[test]
    fn parse_when_macro() {
        let body = "$when isActive { color: blue }";
        let macros = parse_style_macros(body).unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            StyleMacro::When {
                expr: "isActive".to_string(),
                css: "color: blue".to_string()
            }
        );
    }

    #[test]
    fn emit_reactive() {
        let macros = vec![StyleMacro::Reactive {
            name: "bg".to_string(),
            expr: "theme.bg".to_string(),
        }];
        let (css, js) = emit_style_macros(&macros);
        assert!(css.contains("--reactive-bg"));
        assert!(js.contains("setProperty('--reactive-bg'"));
    }

    #[test]
    fn emit_media() {
        let macros = vec![StyleMacro::Media {
            breakpoint: "max-width: 768px".to_string(),
            css: "font-size: 14px".to_string(),
        }];
        let (css, js) = emit_style_macros(&macros);
        assert!(css.contains("@media (max-width: 768px)"));
        assert!(js.is_empty());
    }

    #[test]
    fn emit_when() {
        let macros = vec![StyleMacro::When {
            expr: "isActive".to_string(),
            css: "opacity: 1".to_string(),
        }];
        let (css, js) = emit_style_macros(&macros);
        assert!(css.contains("data-when-0"));
        assert!(js.contains("isActive"));
    }
}
