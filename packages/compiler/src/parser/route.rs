use crate::types::{CompileError, OpenGraph, RouteBlock, RouteHead, TwitterCard};

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
            "head" => {
                // B1 (SEO arc) — capture the balanced `{...}` head literal, then
                // parse it into the typed RouteHead. If the value isn't an object
                // literal, skip it gracefully.
                if let Some(literal) = capture_balanced_literal(body, bytes, &mut i) {
                    route.head = Some(parse_head_body(&literal));
                }
            }
            "extract" => {
                // GX Phase 1 (#437-GX) — the SHARED `extract` value parser
                // (`extract::parse_extract_literal`, also used by the
                // production parser in `sfc.rs` and the `$extract` macro).
                // Unlike `head`, a non-object or malformed value is a hard
                // C483 — a governance declaration must never fail open.
                if route.extract.is_some() {
                    return Err(crate::extract::c484(
                        0,
                        "duplicate `extract:` key in one `@route` block",
                    ));
                }
                match capture_balanced_literal(body, bytes, &mut i) {
                    Some(literal) => {
                        route.extract = Some(crate::extract::parse_extract_literal(&literal, 0)?);
                    }
                    None => {
                        return Err(CompileError {
                            message: "C483: malformed `extract` policy value — `extract:` takes \
                                      an object literal `{ read: ..., call: ... }`"
                                .to_string(),
                            line: 0,
                            col: 0,
                            code: Some("C483".to_string()),
                            fix: Some(
                                "extract: { read: 'agents', call: 'anonymous' }".to_string(),
                            ),
                            ..Default::default()
                        });
                    }
                }
            }
            "data" => {
                // GX Phase 4 (#466) — the SHARED `data:` value parser
                // (`data::parse_data_literal`, also used by the production
                // parser in `sfc.rs`). Like `extract`, a non-object or
                // malformed value is a hard C485 — a governance declaration
                // must never fail open; `$gx`-touching names are C487.
                if route.data.is_some() {
                    return Err(crate::data::c485(
                        0,
                        "duplicate `data:` key in one `@route` block",
                    ));
                }
                match capture_balanced_literal(body, bytes, &mut i) {
                    Some(literal) => {
                        route.data = Some(crate::data::parse_data_literal(&literal, 0)?);
                    }
                    None => {
                        return Err(crate::data::c485(
                            0,
                            "`data:` takes an object literal `{ type: '<Name>', preview: [...] }`",
                        ));
                    }
                }
            }
            _ => skip_value(body, bytes, &mut i),
        }
    }

    Ok(route)
}

// ─── B1 (SEO arc) — head metadata parsing ────────────────────────────────────

/// Capture a balanced `{...}` or `[...]` literal starting at the value position.
/// Returns the verbatim inner+outer text (including delimiters), or `None` if
/// the value at `*i` is not an opening brace/bracket. Advances `*i` past the
/// closing delimiter. String/comment-aware so braces inside strings don't
/// throw off the depth count.
///
/// Exposed `pub(crate)` so the production SFC parser (`sfc.rs::parse_route_body`)
/// can capture the `head: { ... }` literal with identical semantics.
pub(crate) fn capture_balanced_literal(body: &str, bytes: &[u8], i: &mut usize) -> Option<String> {
    skip_ws(bytes, i);
    if *i >= bytes.len() {
        return None;
    }
    let open = bytes[*i];
    let close = match open {
        b'{' => b'}',
        b'[' => b']',
        _ => {
            skip_value(body, bytes, i);
            return None;
        }
    };
    let start = *i;
    let mut depth = 0usize;
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
            c if c == open => {
                depth += 1;
                *i += 1;
            }
            c if c == close => {
                depth -= 1;
                *i += 1;
                if depth == 0 {
                    return Some(body[start..*i].to_string());
                }
            }
            _ => *i += 1,
        }
    }
    // Unbalanced — return what we captured so far (best-effort).
    Some(body[start..*i].to_string())
}

/// Parse the inner key/value pairs of a `head: { ... }` literal into RouteHead.
/// `literal` includes the outer braces. Scalars (title/description/canonical)
/// are strings; `og`/`twitter` recurse into typed sub-objects; `jsonld` is
/// captured verbatim as a balanced literal.
///
/// Exposed `pub(crate)` so both the unit-test parser (`route.rs::parse_route`)
/// and the production SFC parser (`sfc.rs::parse_route_body`) share ONE head
/// implementation — the two route parsers cannot drift on head shape.
pub(crate) fn parse_head_literal(literal: &str) -> RouteHead {
    parse_head_body(literal)
}

fn parse_head_body(literal: &str) -> RouteHead {
    let mut head = RouteHead::default();
    let inner = strip_outer_braces(literal);
    let bytes = inner.as_bytes();
    let mut i = 0usize;

    while i < bytes.len() {
        skip_ws_and_commas(bytes, &mut i);
        if i >= bytes.len() {
            break;
        }
        let Some(key) = parse_head_key(inner, bytes, &mut i) else {
            i += 1;
            continue;
        };
        skip_ws(bytes, &mut i);
        if i >= bytes.len() || bytes[i] != b':' {
            skip_value(inner, bytes, &mut i);
            continue;
        }
        i += 1;
        skip_ws(bytes, &mut i);

        match key.as_str() {
            "title" => head.title = parse_string(inner, bytes, &mut i).or(head.title),
            "description" => {
                head.description = parse_string(inner, bytes, &mut i).or(head.description)
            }
            "canonical" => head.canonical = parse_string(inner, bytes, &mut i).or(head.canonical),
            "og" => {
                if let Some(lit) = capture_balanced_literal(inner, bytes, &mut i) {
                    head.og = Some(parse_og(&lit));
                }
            }
            "twitter" => {
                if let Some(lit) = capture_balanced_literal(inner, bytes, &mut i) {
                    head.twitter = Some(parse_twitter(&lit));
                }
            }
            "jsonld" => {
                // Capture VERBATIM — the raw JSON object literal, normalized
                // whitespace preserved as authored.
                if let Some(lit) = capture_balanced_literal(inner, bytes, &mut i) {
                    head.jsonld = Some(lit.trim().to_string());
                }
            }
            _ => skip_value(inner, bytes, &mut i),
        }
    }
    head
}

fn parse_og(literal: &str) -> OpenGraph {
    let mut og = OpenGraph::default();
    for (k, v) in scalar_pairs(literal) {
        match k.as_str() {
            "title" => og.title = Some(v),
            "description" => og.description = Some(v),
            "image" => og.image = Some(v),
            "type" => og.r#type = Some(v),
            "url" => og.url = Some(v),
            _ => {}
        }
    }
    og
}

fn parse_twitter(literal: &str) -> TwitterCard {
    let mut tw = TwitterCard::default();
    for (k, v) in scalar_pairs(literal) {
        match k.as_str() {
            "card" => tw.card = Some(v),
            "title" => tw.title = Some(v),
            "description" => tw.description = Some(v),
            "image" => tw.image = Some(v),
            "site" => tw.site = Some(v),
            _ => {}
        }
    }
    tw
}

/// Extract `key: "value"` string pairs from a braced object literal. Non-string
/// values are skipped. Used for the fixed-key og/twitter sub-objects.
fn scalar_pairs(literal: &str) -> Vec<(String, String)> {
    let inner = strip_outer_braces(literal);
    let bytes = inner.as_bytes();
    let mut i = 0usize;
    let mut out = Vec::new();
    while i < bytes.len() {
        skip_ws_and_commas(bytes, &mut i);
        if i >= bytes.len() {
            break;
        }
        let Some(key) = parse_head_key(inner, bytes, &mut i) else {
            i += 1;
            continue;
        };
        skip_ws(bytes, &mut i);
        if i >= bytes.len() || bytes[i] != b':' {
            skip_value(inner, bytes, &mut i);
            continue;
        }
        i += 1;
        skip_ws(bytes, &mut i);
        if let Some(val) = parse_string(inner, bytes, &mut i) {
            out.push((key, val));
        } else {
            skip_value(inner, bytes, &mut i);
        }
    }
    out
}

/// Strip a single layer of outer `{}`/`[]` from a captured literal, returning
/// the inner slice. If no recognizable delimiters, returns the input trimmed.
fn strip_outer_braces(literal: &str) -> &str {
    let t = literal.trim();
    let b = t.as_bytes();
    if b.len() >= 2
        && ((b[0] == b'{' && b[b.len() - 1] == b'}') || (b[0] == b'[' && b[b.len() - 1] == b']'))
    {
        &t[1..t.len() - 1]
    } else {
        t
    }
}

/// Parse a key identifier in a head object. Accepts bare idents AND quoted
/// keys (e.g. `"@context"`), though quoted keys only appear inside `jsonld`
/// which is captured verbatim — so this is for og/twitter/head scalar keys.
fn parse_head_key(body: &str, bytes: &[u8], i: &mut usize) -> Option<String> {
    if *i < bytes.len() && (bytes[*i] == b'"' || bytes[*i] == b'\'') {
        return parse_string(body, bytes, i);
    }
    parse_ident(body, bytes, i)
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

    // ─── B1 (SEO arc) — head metadata ────────────────────────────────────────

    #[test]
    fn no_head_is_none() {
        let route = parse_route(r#"path: "/about", name: "about""#).unwrap();
        assert!(route.head.is_none());
    }

    #[test]
    fn head_scalars_parsed() {
        let route = parse_route(
            r#"path: "/about", head: { title: "About Us", description: "Who we are", canonical: "/about" }"#,
        )
        .unwrap();
        assert_eq!(route.path.as_deref(), Some("/about"));
        let head = route.head.expect("head present");
        assert_eq!(head.title.as_deref(), Some("About Us"));
        assert_eq!(head.description.as_deref(), Some("Who we are"));
        assert_eq!(head.canonical.as_deref(), Some("/about"));
        assert!(head.og.is_none());
        assert!(head.twitter.is_none());
        assert!(head.jsonld.is_none());
    }

    #[test]
    fn head_og_and_twitter_subobjects() {
        let route = parse_route(
            r#"head: { og: { title: "About", description: "d", image: "/og.png", type: "website", url: "/about" }, twitter: { card: "summary_large_image", title: "About", description: "d", image: "/og.png", site: "@acme" } }"#,
        )
        .unwrap();
        let head = route.head.expect("head present");
        let og = head.og.expect("og present");
        assert_eq!(og.title.as_deref(), Some("About"));
        assert_eq!(og.description.as_deref(), Some("d"));
        assert_eq!(og.image.as_deref(), Some("/og.png"));
        assert_eq!(og.r#type.as_deref(), Some("website"));
        assert_eq!(og.url.as_deref(), Some("/about"));
        let tw = head.twitter.expect("twitter present");
        assert_eq!(tw.card.as_deref(), Some("summary_large_image"));
        assert_eq!(tw.title.as_deref(), Some("About"));
        assert_eq!(tw.image.as_deref(), Some("/og.png"));
        assert_eq!(tw.site.as_deref(), Some("@acme"));
    }

    #[test]
    fn head_jsonld_captured_verbatim() {
        let route = parse_route(
            r#"head: { jsonld: { "@context": "https://schema.org", "@type": "Organization", "name": "Acme" } }"#,
        )
        .unwrap();
        let head = route.head.expect("head present");
        let jsonld = head.jsonld.expect("jsonld present");
        assert!(jsonld.starts_with('{') && jsonld.ends_with('}'));
        assert!(jsonld.contains(r#""@context": "https://schema.org""#));
        assert!(jsonld.contains(r#""@type": "Organization""#));
        assert!(jsonld.contains(r#""name": "Acme""#));
    }

    #[test]
    fn head_does_not_break_following_keys() {
        // A key after head: must still parse — proves balanced capture consumes
        // exactly the head object and no more.
        let route = parse_route(
            r#"path: "/about", head: { title: "T", og: { url: "/u" } }, name: "about", ssr: true"#,
        )
        .unwrap();
        assert_eq!(route.path.as_deref(), Some("/about"));
        assert_eq!(route.name.as_deref(), Some("about"));
        assert_eq!(route.ssr, Some(true));
        assert_eq!(route.head.unwrap().title.as_deref(), Some("T"));
    }
}
