use crate::types::{CompileError, RouteBlock};

pub fn parse_route(body: &str) -> Result<RouteBlock, CompileError> {
    let mut route = RouteBlock::default();
    let bytes = body.as_bytes();
    let mut i = 0usize;

    while i < bytes.len() {
        skip_ws_and_commas(bytes, &mut i);
        if i >= bytes.len() {
            break;
        }

        let Some(key) = parse_ident(body, bytes, &mut i) else {
            i += 1;
            continue;
        };

        skip_ws(bytes, &mut i);
        if i >= bytes.len() || bytes[i] != b':' {
            skip_value(body, bytes, &mut i);
            continue;
        }
        i += 1;
        skip_ws(bytes, &mut i);

        match key.as_str() {
            "path" => {
                route.path = parse_string(body, bytes, &mut i).or(route.path);
            }
            "name" => {
                route.name = parse_string(body, bytes, &mut i).or(route.name);
            }
            "layout" => {
                route.layout = parse_string(body, bytes, &mut i).or(route.layout);
            }
            "ssr" => {
                route.ssr = parse_bool(body, bytes, &mut i).or(route.ssr);
            }
            "middleware" => {
                route.middleware = parse_string_array(body, bytes, &mut i).unwrap_or_default();
            }
            _ => skip_value(body, bytes, &mut i),
        }
    }

    Ok(route)
}

fn skip_ws(bytes: &[u8], i: &mut usize) {
    while *i < bytes.len() && bytes[*i].is_ascii_whitespace() {
        *i += 1;
    }
}

fn skip_ws_and_commas(bytes: &[u8], i: &mut usize) {
    while *i < bytes.len()
        && (bytes[*i].is_ascii_whitespace() || bytes[*i] == b',')
    {
        *i += 1;
    }
}

fn parse_ident(body: &str, bytes: &[u8], i: &mut usize) -> Option<String> {
    let start = *i;
    while *i < bytes.len() && (bytes[*i].is_ascii_alphanumeric() || bytes[*i] == b'_' || bytes[*i] == b'-') {
        *i += 1;
    }
    if *i == start {
        None
    } else {
        Some(body[start..*i].to_string())
    }
}

fn parse_string(body: &str, bytes: &[u8], i: &mut usize) -> Option<String> {
    if *i >= bytes.len() || (bytes[*i] != b'"' && bytes[*i] != b'\'') {
        skip_value(body, bytes, i);
        return None;
    }

    let quote = bytes[*i];
    *i += 1;
    let mut out = String::new();
    while *i < bytes.len() {
        match bytes[*i] {
            b'\\' if *i + 1 < bytes.len() => {
                out.push(bytes[*i + 1] as char);
                *i += 2;
            }
            c if c == quote => {
                *i += 1;
                return Some(out);
            }
            c => {
                out.push(c as char);
                *i += 1;
            }
        }
    }
    None
}

fn parse_bool(body: &str, bytes: &[u8], i: &mut usize) -> Option<bool> {
    if body[*i..].starts_with("true") {
        *i += 4;
        Some(true)
    } else if body[*i..].starts_with("false") {
        *i += 5;
        Some(false)
    } else {
        skip_value(body, bytes, i);
        None
    }
}

fn parse_string_array(body: &str, bytes: &[u8], i: &mut usize) -> Option<Vec<String>> {
    if *i >= bytes.len() || bytes[*i] != b'[' {
        skip_value(body, bytes, i);
        return None;
    }

    *i += 1;
    let mut values = Vec::new();
    loop {
        skip_ws_and_commas(bytes, i);
        if *i >= bytes.len() {
            return None;
        }
        if bytes[*i] == b']' {
            *i += 1;
            return Some(values);
        }
        let value = parse_string(body, bytes, i)?;
        values.push(value);
        skip_ws_and_commas(bytes, i);
    }
}

fn skip_value(body: &str, bytes: &[u8], i: &mut usize) {
    let mut depth_paren = 0usize;
    let mut depth_brace = 0usize;
    let mut depth_bracket = 0usize;

    while *i < bytes.len() {
        match bytes[*i] {
            b'"' | b'\'' | b'`' => skip_string(bytes, i),
            b'/' if *i + 1 < bytes.len() && bytes[*i + 1] == b'/' => {
                *i += 2;
                while *i < bytes.len() && bytes[*i] != b'\n' {
                    *i += 1;
                }
            }
            b'/' if *i + 1 < bytes.len() && bytes[*i + 1] == b'*' => {
                *i += 2;
                while *i + 1 < bytes.len() && !(bytes[*i] == b'*' && bytes[*i + 1] == b'/') {
                    *i += 1;
                }
                *i = (*i + 2).min(bytes.len());
            }
            b'(' => {
                depth_paren += 1;
                *i += 1;
            }
            b')' => {
                depth_paren = depth_paren.saturating_sub(1);
                *i += 1;
            }
            b'{' => {
                depth_brace += 1;
                *i += 1;
            }
            b'}' => {
                if depth_paren == 0 && depth_brace == 0 && depth_bracket == 0 {
                    break;
                }
                depth_brace = depth_brace.saturating_sub(1);
                *i += 1;
            }
            b'[' => {
                depth_bracket += 1;
                *i += 1;
            }
            b']' => {
                if depth_paren == 0 && depth_brace == 0 && depth_bracket == 0 {
                    break;
                }
                depth_bracket = depth_bracket.saturating_sub(1);
                *i += 1;
            }
            b',' if depth_paren == 0 && depth_brace == 0 && depth_bracket == 0 => break,
            _ => *i += 1,
        }
    }

    let _ = body;
}

fn skip_string(bytes: &[u8], i: &mut usize) {
    let quote = bytes[*i];
    *i += 1;
    while *i < bytes.len() {
        if bytes[*i] == b'\\' && *i + 1 < bytes.len() {
            *i += 2;
            continue;
        }
        if bytes[*i] == quote {
            *i += 1;
            break;
        }
        *i += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::parse_route;

    #[test]
    fn empty_block() {
        let route = parse_route("").unwrap();
        assert!(route.path.is_none());
        assert!(route.name.is_none());
        assert!(route.middleware.is_empty());
        assert!(route.ssr.is_none());
        assert!(route.layout.is_none());
    }

    #[test]
    fn path_only() {
        let route = parse_route(r#"path: "/users""#).unwrap();
        assert_eq!(route.path.as_deref(), Some("/users"));
        assert!(route.name.is_none());
    }

    #[test]
    fn all_fields() {
        let route = parse_route(r#"path: "/users", name: "users", middleware: ["auth"], ssr: false, layout: "admin""#).unwrap();
        assert_eq!(route.path.as_deref(), Some("/users"));
        assert_eq!(route.name.as_deref(), Some("users"));
        assert_eq!(route.middleware, vec!["auth".to_string()]);
        assert_eq!(route.ssr, Some(false));
        assert_eq!(route.layout.as_deref(), Some("admin"));
    }

    #[test]
    fn middleware_array() {
        let route = parse_route(r#"middleware: ["auth", "audit"]"#).unwrap();
        assert_eq!(route.middleware, vec!["auth".to_string(), "audit".to_string()]);
    }

    #[test]
    fn unknown_key_skipped() {
        let route = parse_route(r#"path: "/users", cache: { ttl: 60 }, name: "users""#).unwrap();
        assert_eq!(route.path.as_deref(), Some("/users"));
        assert_eq!(route.name.as_deref(), Some("users"));
    }
}
