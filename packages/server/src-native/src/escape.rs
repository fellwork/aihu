//! HTML attribute escape — byte-for-byte mirror of ssr.ts:110-112.
//!
//! ```ts
//! function escapeAttr(val: string): string {
//!   return val.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
//! }
//! ```
//!
//! The TS chained replace is equivalent to a single pass that maps
//! `&` -> `&amp;` and `"` -> `&quot;`, because `&amp;` itself contains no
//! `"` and `&quot;` contains no `&`. So a single-pass implementation produces
//! byte-identical output to the chained `.replace()` calls.
//!
//! Leaf text is NOT escaped (mirrors ssr.ts:120-122). Only attribute values
//! and the hydratable path are escaped.

pub fn escape_attr(val: &str) -> String {
    // Fast path: nothing to escape.
    let bytes = val.as_bytes();
    if !bytes.iter().any(|&b| b == b'&' || b == b'"') {
        return val.to_string();
    }

    let mut out = String::with_capacity(val.len() + 8);
    for ch in val.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(ch),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_special_chars_returns_same() {
        assert_eq!(escape_attr("plain text"), "plain text");
    }

    #[test]
    fn ampersand_escaped() {
        assert_eq!(escape_attr("a & b"), "a &amp; b");
    }

    #[test]
    fn quote_escaped() {
        assert_eq!(escape_attr("fo\"o"), "fo&quot;o");
    }

    #[test]
    fn ampersand_then_quote_no_double_escape() {
        // The JS chained replace would yield: `&` -> `&amp;`, then `"` -> `&quot;`.
        // The `&` inside `&amp;` produced in step 1 must NOT be re-escaped in step 2,
        // because step 2 only matches `"`. Single-pass mapping yields the same result.
        assert_eq!(escape_attr("&\""), "&amp;&quot;");
    }

    #[test]
    fn unicode_passes_through() {
        assert_eq!(escape_attr("élève"), "élève");
        assert_eq!(escape_attr("中文"), "中文");
    }

    #[test]
    fn less_greater_not_escaped() {
        // ssr.ts:111 only escapes & and ". `<` and `>` are NOT touched.
        assert_eq!(escape_attr("a < b > c"), "a < b > c");
    }
}
