//! Component-tag naming: PascalCase→kebab normalization + validation (C450).
//!
//! `.aihu` components compile to native custom elements, and custom-element
//! names REQUIRE a hyphen. Authors write `<UserCard>` (PascalCase) or
//! `<my-widget>` (hyphenated) — both must resolve to the same valid
//! custom-element name everywhere a tag surfaces: reference emission
//! (`branch('user-card', …)`), the route manifest `components` array, and the
//! `customElements.define` name. The rule (option C):
//!
//! - Multi-word PascalCase → kebab-case: `UserCard`→`user-card`,
//!   `APIClient`→`api-client`, `HTMLParser`→`html-parser`.
//! - Already-hyphenated → lowercased verbatim: `Aihu-Button`→`aihu-button`.
//! - Single-word PascalCase → hard compile error **C450** — a single word can
//!   never become a valid custom-element name.
//! - Plain lowercase HTML/SVG tags (`div`, `linearGradient`) are NOT component
//!   tags and are never touched.

/// Grammar-v2 (C611 protection) — the known HTML element vocabulary. A
/// non-hyphenated tag must be (a) one of these, (b) a framework element
/// (`parser::template::FRAMEWORK_ELEMENTS`), or (c) a hyphenated/PascalCase
/// component reference; anything else is compile error C611. Sourced from the
/// WHATWG HTML living standard (incl. deprecated-but-parsed elements) plus the
/// SVG 2 and MathML Core element sets (SVG's camelCase tags start lowercase,
/// so they land here, not in the component classifier).
const KNOWN_HTML_ELEMENTS: &[&str] = &[
    // Document / metadata / sectioning
    "html", "head", "body", "title", "base", "link", "meta", "style", "address",
    "article", "aside", "footer", "header", "h1", "h2", "h3", "h4", "h5", "h6",
    "hgroup", "main", "nav", "section", "search",
    // Grouping content
    "blockquote", "dd", "div", "dl", "dt", "figcaption", "figure", "hr", "li",
    "menu", "ol", "p", "pre", "ul",
    // Text-level semantics
    "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn", "em",
    "i", "kbd", "mark", "q", "rp", "rt", "ruby", "s", "samp", "small", "span",
    "strong", "sub", "sup", "time", "u", "var", "wbr",
    // Edits
    "del", "ins",
    // Embedded content
    "area", "audio", "img", "map", "track", "video", "embed", "iframe",
    "object", "param", "picture", "portal", "source",
    // Scripting
    "canvas", "noscript", "script", "template", "slot",
    // Tables
    "caption", "col", "colgroup", "table", "tbody", "td", "tfoot", "th",
    "thead", "tr",
    // Forms
    "button", "datalist", "fieldset", "form", "input", "label", "legend",
    "meter", "optgroup", "option", "output", "progress", "select", "textarea",
    // Interactive
    "details", "dialog", "summary",
    // Deprecated but still parsed by browsers
    "acronym", "big", "center", "dir", "font", "marquee", "nobr", "noembed",
    "noframes", "plaintext", "rb", "rtc", "strike", "tt", "xmp",
    // SVG (camelCase tags start lowercase — they are NOT component tags)
    "svg", "animate", "animateMotion", "animateTransform", "circle", "clipPath",
    "defs", "desc", "ellipse", "feBlend", "feColorMatrix", "feComponentTransfer",
    "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap",
    "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG",
    "feFuncR", "feGaussianBlur", "feImage", "feMerge", "feMergeNode",
    "feMorphology", "feOffset", "fePointLight", "feSpecularLighting",
    "feSpotLight", "feTile", "feTurbulence", "filter", "foreignObject", "g",
    "image", "line", "linearGradient", "marker", "mask", "metadata", "mpath",
    "path", "pattern", "polygon", "polyline", "radialGradient", "rect", "set",
    "stop", "switch", "symbol", "text", "textPath", "tspan", "use", "view",
    // MathML Core
    "math", "annotation", "maction", "merror", "mfrac", "mi", "mmultiscripts",
    "mn", "mo", "mover", "mpadded", "mphantom", "mprescripts", "mroot", "mrow",
    "ms", "mspace", "msqrt", "mstyle", "msub", "msubsup", "msup", "mtable",
    "mtd", "mtext", "mtr", "munder", "munderover", "semantics",
];

/// True when `tag` is a known HTML/SVG/MathML element name.
pub fn is_known_html_element(tag: &str) -> bool {
    KNOWN_HTML_ELEMENTS.contains(&tag)
}

/// A tag references a user component (not a plain HTML/SVG element) when it
/// contains a hyphen OR starts with an ASCII uppercase letter.
pub fn is_component_tag(tag: &str) -> bool {
    tag.contains('-') || tag.chars().next().is_some_and(|c| c.is_ascii_uppercase())
}

/// PascalCase→kebab, else lowercase-verbatim. Inserts '-' before an uppercase
/// letter when the previous char is lowercase/digit, OR (acronym boundary) the
/// previous char is uppercase and the next is lowercase. Then lowercases all.
/// Infallible transform — validation is separate.
pub fn kebab_component_tag(raw: &str) -> String {
    let chars: Vec<char> = raw.chars().collect();
    let mut out = String::with_capacity(raw.len() + 4);
    for (i, &c) in chars.iter().enumerate() {
        if i > 0 && c.is_ascii_uppercase() {
            let prev = chars[i - 1];
            let next = chars.get(i + 1);
            if prev.is_ascii_lowercase()
                || prev.is_ascii_digit()
                || (prev.is_ascii_uppercase() && next.is_some_and(|n| n.is_ascii_lowercase()))
            {
                out.push('-');
            }
        }
        out.push(c.to_ascii_lowercase());
    }
    out
}

/// Transform + validate. Ok(normalized) when it contains a hyphen; else Err(msg)
/// — a single-word component tag can't be a valid custom-element name.
pub fn validate_component_tag(raw: &str) -> Result<String, String> {
    let norm = kebab_component_tag(raw);
    if norm.contains('-') {
        Ok(norm)
    } else {
        Err(format!(
            "C450: component tag '{raw}' resolves to '{norm}', which is not a valid custom-element name — custom elements require a hyphen. Use a hyphenated tag (e.g. '<x-{norm}>') or set an explicit hyphenated `@meta name`. See the Components guide, \"Tag naming\"."
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kebab_multi_word_pascal() {
        assert_eq!(kebab_component_tag("UserCard"), "user-card");
        assert_eq!(kebab_component_tag("APIClient"), "api-client");
        assert_eq!(kebab_component_tag("HTMLParser"), "html-parser");
    }

    #[test]
    fn kebab_single_word_pascal_lowercases() {
        assert_eq!(kebab_component_tag("Comment"), "comment");
        assert_eq!(kebab_component_tag("Card"), "card");
    }

    #[test]
    fn kebab_hyphenated_passes_through_lowercased() {
        assert_eq!(kebab_component_tag("my-widget"), "my-widget");
        assert_eq!(kebab_component_tag("Aihu-Button"), "aihu-button");
    }

    #[test]
    fn kebab_plain_lowercase_untouched() {
        assert_eq!(kebab_component_tag("div"), "div");
    }

    #[test]
    fn validate_multi_word_ok() {
        assert_eq!(
            validate_component_tag("UserCard"),
            Ok("user-card".to_string())
        );
    }

    #[test]
    fn validate_single_word_is_c450() {
        let err = validate_component_tag("Comment").expect_err("single-word must be C450");
        assert!(
            err.contains("C450"),
            "error must carry the C450 code: {err}"
        );
        let err = validate_component_tag("Card").expect_err("single-word must be C450");
        assert!(
            err.contains("C450"),
            "error must carry the C450 code: {err}"
        );
    }

    #[test]
    fn is_component_tag_classification() {
        assert!(is_component_tag("UserCard"));
        assert!(is_component_tag("my-widget"));
        assert!(!is_component_tag("div"));
        assert!(!is_component_tag("linearGradient"));
    }
}
