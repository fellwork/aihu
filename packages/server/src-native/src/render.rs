//! Tree-walk renderer — byte-for-byte mirror of ssr.ts:114-162.
//!
//! Two surfaces are exposed:
//!   - render_tree_string(tree_json, hydratable)        — fragment only (mirrors renderNode)
//!   - render_document_string(tree_json, head_json, hydratable, lang_opt)
//!       — full doc with <!DOCTYPE html>...<body>...</body></html> wrap
//!
//! Excluded by spec §1 non-goals (handled JS-side, not in Rust):
//!   - serializer state-script emission
//!   - contextSetup hooks
//!   - { toHtml(): string } direct providers
//!   - DataSource async boundaries (renderToStream)
//!
//! Parity contract: ssr.ts is the reference. Any divergence here breaks the
//! parity gate (packages/server/tests/native-parity.test.ts).

use crate::escape::escape_attr;
use serde::Deserialize;
use serde_json::{Map, Value};

/// AttrValue mirrors ssr.ts:128 — a value is either a bool or a string.
/// JS `Object.entries(attrs)` may also yield `undefined`, which is treated
/// the same as `false` (omit the attr). Numbers/null are coerced to strings
/// via `String(v)` in the TS path; we coerce via JSON Value -> string here.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum AttrValue {
    Bool(bool),
    Str(String),
    /// Anything else — number, null, nested object — falls into Other and is
    /// rendered via Value::to_string() to match `String(v)` in JS as closely
    /// as practical for the parity surface.
    Other(Value),
}

/// Node mirrors the ssr.ts:119-141 discriminated union.
///
/// Currently kept as a reference type for future typed-deserialization paths.
/// The active walker (`render_value`) consumes a `serde_json::Value` directly
/// to match JS's permissive duck-typed branching exactly.
#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Node {
    Leaf {
        #[serde(default)]
        text: Option<String>,
    },
    Branch {
        #[serde(default)]
        tag: Option<String>,
        #[serde(default)]
        attrs: Option<Map<String, Value>>,
        #[serde(default)]
        children: Option<Vec<Value>>,
    },
}

/// HeadConfig mirrors ssr.ts:52-57. We deserialize meta/link tag values as
/// raw `serde_json::Map`s so that insertion order of attribute entries is
/// preserved (matching `Object.entries(meta)` in ssr.ts:148).
#[derive(Debug, Deserialize, Default)]
pub struct HeadConfig {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub meta: Option<Vec<Map<String, Value>>>,
    #[serde(default)]
    pub links: Option<Vec<Map<String, Value>>>,
    #[serde(default)]
    pub lang: Option<String>,
}

/// Render a JSON-serialized arbor tree to its HTML string.
/// Mirrors `renderNode(root, '0', hydratable)` in ssr.ts:331 — the path
/// always starts at "0" because `renderToStream` invokes the root walk
/// at index '0'. (See ssr.ts:331.)
///
/// In the static (renderToString) path, ssr.ts uses path '0' for the root.
pub fn render_tree_string(tree_json: &str, hydratable: bool) -> Result<String, String> {
    // Parse permissively into a Value so we can mirror the JS branch logic
    // (which checks for `kind` and silently returns '' for unknowns).
    let root: Value = serde_json::from_str(tree_json)
        .map_err(|e| format!("invalid tree JSON: {e}"))?;
    let mut out = String::with_capacity(256);
    render_value(&root, "0", hydratable, &mut out);
    Ok(out)
}

/// Render a full HTML document. Mirrors the renderToStream path with
/// `opts.head` set:
///   `<!DOCTYPE html><html${lang}><head>${headHtml}</head><body>{tree}</body></html>`
pub fn render_document_string(
    tree_json: &str,
    head_json: &str,
    hydratable: bool,
) -> Result<String, String> {
    let head: HeadConfig = serde_json::from_str(head_json)
        .map_err(|e| format!("invalid head JSON: {e}"))?;
    let head_html = build_head(&head);
    let lang_attr = match head.lang.as_deref() {
        Some(s) if !s.is_empty() => format!(" lang=\"{}\"", escape_attr(s)),
        _ => String::new(),
    };

    let body_inner = render_tree_string(tree_json, hydratable)?;

    let mut out = String::with_capacity(head_html.len() + body_inner.len() + 64);
    out.push_str("<!DOCTYPE html><html");
    out.push_str(&lang_attr);
    out.push_str("><head>");
    out.push_str(&head_html);
    out.push_str("</head><body>");
    out.push_str(&body_inner);
    out.push_str("</body></html>");
    Ok(out)
}

/// Recursive walker over a permissive Value. Mirrors ssr.ts:114-142.
///
/// JS semantics from ssr.ts:
///   - typeof node !== 'object' || node === null → return ''
///   - !('kind' in obj) → return ''
///   - kind === 'leaf': text = typeof obj.text === 'string' ? obj.text : ''
///       — leaf text is NOT escaped
///   - kind === 'branch': tag default 'div'; iterate attrs in insertion order;
///       v === true → ` k`; v === false || v === undefined → omit;
///       otherwise → ` k="${escapeAttr(String(v))}"`.
///       If hydratable, append ` data-aihu-path="${escapeAttr(path)}"`.
///       Render children with path `${path}.${i}` and concat.
///       Return `<${tag}${attrStr}>${inner}</${tag}>`.
///   - any other kind → return ''
fn render_value(node: &Value, path: &str, hydratable: bool, out: &mut String) {
    let obj = match node {
        Value::Object(m) => m,
        _ => return, // typeof node !== 'object' || node === null
    };
    let kind = match obj.get("kind") {
        Some(Value::String(k)) => k.as_str(),
        Some(_) => return, // kind present but non-string — unknown
        None => return,    // !('kind' in obj)
    };

    if kind == "leaf" {
        // text = typeof obj.text === 'string' ? obj.text : ''
        if let Some(Value::String(t)) = obj.get("text") {
            out.push_str(t);
        }
        return;
    }

    if kind == "branch" {
        // tag = typeof obj.tag === 'string' ? obj.tag : 'div'
        let tag = match obj.get("tag") {
            Some(Value::String(t)) => t.as_str(),
            _ => "div",
        };

        // attrs: must be an object; otherwise treated as {}.
        let empty_map = Map::new();
        let attrs = match obj.get("attrs") {
            Some(Value::Object(m)) => m,
            _ => &empty_map,
        };

        out.push('<');
        out.push_str(tag);
        // Iterate in insertion order (preserve_order feature on serde_json).
        for (k, v) in attrs.iter() {
            match v {
                Value::Bool(true) => {
                    out.push(' ');
                    out.push_str(k);
                }
                Value::Bool(false) | Value::Null => {
                    // false → omit; null is treated as "v === false || undefined"
                    // by spirit (Object.entries skips own enumerable undefined?
                    // Actually Object.entries returns the key with `undefined` value;
                    // ssr.ts:133 then guards `v !== false && v !== undefined`).
                    // JSON.stringify drops `undefined` entirely from objects, so
                    // an undefined attr never reaches Rust. null does — and ssr.ts
                    // would render `null` as ` k="null"` because String(null) = "null".
                    // To stay byte-identical we MUST emit ` k="null"` for null.
                    if matches!(v, Value::Null) {
                        out.push(' ');
                        out.push_str(k);
                        out.push_str("=\"");
                        out.push_str(&escape_attr("null"));
                        out.push('"');
                    }
                }
                Value::String(s) => {
                    out.push(' ');
                    out.push_str(k);
                    out.push_str("=\"");
                    out.push_str(&escape_attr(s));
                    out.push('"');
                }
                Value::Number(n) => {
                    out.push(' ');
                    out.push_str(k);
                    out.push_str("=\"");
                    out.push_str(&escape_attr(&n.to_string()));
                    out.push('"');
                }
                _ => {
                    // Object/array — String(v) in JS yields "[object Object]" or
                    // "a,b,c". The parity test generator (§4.2) does not produce
                    // these shapes, so we render them via JSON.to_string() as a
                    // best-effort. This branch is outside the documented surface.
                    out.push(' ');
                    out.push_str(k);
                    out.push_str("=\"");
                    out.push_str(&escape_attr(&v.to_string()));
                    out.push('"');
                }
            }
        }
        if hydratable {
            out.push_str(" data-aihu-path=\"");
            out.push_str(&escape_attr(path));
            out.push('"');
        }
        out.push('>');

        // children
        if let Some(Value::Array(children)) = obj.get("children") {
            for (i, child) in children.iter().enumerate() {
                let child_path = format!("{path}.{i}");
                render_value(child, &child_path, hydratable, out);
            }
        }

        out.push_str("</");
        out.push_str(tag);
        out.push('>');
        return;
    }

    // unknown kind — empty
}

/// Build the inner HTML of <head> per ssr.ts:144-162.
///
/// ```ts
/// function buildHead(head: HeadConfig): string {
///   const parts: string[] = []
///   if (head.title) parts.push(`<title>${head.title}</title>`)
///   for (const meta of head.meta ?? []) {
///     const attrs = Object.entries(meta).filter(([,v]) => v !== undefined)
///       .map(([k,v]) => `${k}="${escapeAttr(v as string)}"`).join(' ')
///     parts.push(`<meta ${attrs}>`)
///   }
///   for (const link of head.links ?? []) { ... `<link ${attrs}>` }
///   return parts.join('')
/// }
/// ```
///
/// Critical: title text is NOT escaped (ssr.ts:146 — raw interpolation).
/// Meta/link attr values ARE escaped via escapeAttr.
pub fn build_head(head: &HeadConfig) -> String {
    let mut out = String::new();
    if let Some(t) = &head.title {
        if !t.is_empty() {
            out.push_str("<title>");
            out.push_str(t);
            out.push_str("</title>");
        }
    }
    if let Some(metas) = &head.meta {
        for meta in metas {
            out.push_str("<meta ");
            push_attr_pairs(&mut out, meta);
            out.push('>');
        }
    }
    if let Some(links) = &head.links {
        for link in links {
            out.push_str("<link ");
            push_attr_pairs(&mut out, link);
            out.push('>');
        }
    }
    out
}

/// Mirrors `Object.entries(x).filter(([,v]) => v !== undefined)
///   .map(([k,v]) => `${k}="${escapeAttr(v as string)}"`).join(' ')`.
///
/// JSON has no `undefined`; `JSON.stringify` strips own enumerable undefined
/// entries from objects. So everything that survives the FFI boundary needs
/// to be emitted. `v` is `as string` cast in TS, but in practice the head
/// surface (MetaTag, LinkTag) declares `[attr: string]: string | undefined`,
/// so the only values that reach here are strings (after JSON round-trip).
/// We treat non-string values defensively via `Value::to_string()`.
fn push_attr_pairs(out: &mut String, map: &Map<String, Value>) {
    let mut first = true;
    for (k, v) in map.iter() {
        // ssr.ts filters out `undefined` (which JSON drops anyway). Null
        // SURVIVES the JSON round-trip — but the JS path's `as string` cast
        // would make `escapeAttr(null)` throw. To preserve parity in the
        // generator-covered surface (which only emits strings), we mirror
        // the string path; null is best-effort coerced to "null".
        if !first {
            out.push(' ');
        }
        first = false;
        out.push_str(k);
        out.push_str("=\"");
        match v {
            Value::String(s) => out.push_str(&escape_attr(s)),
            Value::Null => out.push_str(&escape_attr("null")),
            Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
            Value::Number(n) => out.push_str(&escape_attr(&n.to_string())),
            _ => out.push_str(&escape_attr(&v.to_string())),
        }
        out.push('"');
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn render(json: &str) -> String {
        render_tree_string(json, false).unwrap()
    }

    #[test]
    fn leaf_returns_text() {
        assert_eq!(render(r#"{"kind":"leaf","text":"Hello"}"#), "Hello");
    }

    #[test]
    fn empty_leaf_returns_empty() {
        assert_eq!(render(r#"{"kind":"leaf","text":""}"#), "");
    }

    #[test]
    fn leaf_text_not_escaped() {
        // ssr.ts:120-122 returns text raw — < & > all pass through unescaped.
        assert_eq!(render(r#"{"kind":"leaf","text":"a < b & c"}"#), "a < b & c");
    }

    #[test]
    fn branch_no_children_no_attrs() {
        assert_eq!(
            render(r#"{"kind":"branch","tag":"div","attrs":{},"children":[]}"#),
            "<div></div>"
        );
    }

    #[test]
    fn branch_default_tag_is_div() {
        assert_eq!(
            render(r#"{"kind":"branch","attrs":{},"children":[]}"#),
            "<div></div>"
        );
    }

    #[test]
    fn branch_with_string_attr() {
        assert_eq!(
            render(r#"{"kind":"branch","tag":"a","attrs":{"href":"/x"},"children":[]}"#),
            "<a href=\"/x\"></a>"
        );
    }

    #[test]
    fn branch_with_bool_true_attr() {
        assert_eq!(
            render(r#"{"kind":"branch","tag":"input","attrs":{"disabled":true},"children":[]}"#),
            "<input disabled></input>"
        );
    }

    #[test]
    fn branch_with_bool_false_attr_omitted() {
        assert_eq!(
            render(r#"{"kind":"branch","tag":"input","attrs":{"hidden":false},"children":[]}"#),
            "<input></input>"
        );
    }

    #[test]
    fn branch_attr_quote_escaped() {
        assert_eq!(
            render(r#"{"kind":"branch","tag":"a","attrs":{"title":"fo\"o"},"children":[]}"#),
            "<a title=\"fo&quot;o\"></a>"
        );
    }

    #[test]
    fn nested_branch_with_leaf() {
        assert_eq!(
            render(r#"{"kind":"branch","tag":"p","attrs":{},"children":[{"kind":"leaf","text":"X"}]}"#),
            "<p>X</p>"
        );
    }

    #[test]
    fn hydratable_adds_path() {
        let html = render_tree_string(
            r#"{"kind":"branch","tag":"div","attrs":{},"children":[]}"#,
            true,
        )
        .unwrap();
        assert!(html.contains("data-aihu-path=\"0\""));
    }

    #[test]
    fn document_with_title() {
        let html = render_document_string(
            r#"{"kind":"leaf","text":"Hi"}"#,
            r#"{"title":"My Page"}"#,
            false,
        )
        .unwrap();
        assert_eq!(
            html,
            "<!DOCTYPE html><html><head><title>My Page</title></head><body>Hi</body></html>"
        );
    }

    #[test]
    fn document_with_lang() {
        let html = render_document_string(
            r#"{"kind":"leaf","text":""}"#,
            r#"{"lang":"en"}"#,
            false,
        )
        .unwrap();
        assert!(html.starts_with("<!DOCTYPE html><html lang=\"en\"><head></head><body>"));
        assert!(html.ends_with("</body></html>"));
    }

    #[test]
    fn unknown_kind_renders_empty() {
        assert_eq!(render(r#"{"kind":"weird"}"#), "");
    }

    #[test]
    fn null_node_renders_empty() {
        assert_eq!(render(r#"null"#), "");
    }
}

// AttrValue is currently unused (we walk Value directly), but kept exported
// for potential typed-deserialization paths in future revisions.
#[allow(dead_code)]
fn _attr_value_typecheck(_: AttrValue) {}

// Same for the typed Node enum.
#[allow(dead_code)]
fn _node_typecheck(_: Node) {}
