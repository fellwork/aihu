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
//!
//! **C450 applies at BOTH sites.** `validate_component_tag` guards a component
//! *reference* in a template; `validate_define_tag` guards the resolved
//! *define-name* — the string handed to `customElements.define`. These were
//! split for a long time: the reference path errored while the define path
//! only printed an emit-time warning, so components that can never register
//! (`timer`, `button`, `outlet`) shipped green. A platform invariant is an
//! error everywhere or it is an error nowhere; see
//! `docs/lessons/hyphenless-custom-element-tags.md`.

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
];

/// SVG + MathML elements — known (never C611, never component tags) but NOT
/// HTML-DOM elements: `document.createElement('circle')` yields an
/// `HTMLUnknownElement`, so the strict-templates attribute type layer (#486
/// step 4) must not materialize them through `HTMLElementTagNameMap`.
const KNOWN_SVG_MATHML_ELEMENTS: &[&str] = &[
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
    KNOWN_HTML_ELEMENTS.contains(&tag) || KNOWN_SVG_MATHML_ELEMENTS.contains(&tag)
}

/// True when `tag` is an HTML (non-SVG, non-MathML) element —
/// `document.createElement(tag)` resolves a real element interface through
/// `HTMLElementTagNameMap` (or the `HTMLElement` fallback for deprecated
/// tags), which is what the strict-templates sidecar layer types against.
pub fn is_html_dom_element(tag: &str) -> bool {
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

/// The infallible half of DEFINE-name resolution: PascalCase→kebab for a
/// component-shaped name, verbatim for a plain lowercase one. Shared by the
/// CLI (`src/bin/main.rs`), the wasm binding, and the envelope so the three
/// cannot drift. Validation is `validate_define_tag`.
pub fn normalize_define_tag(raw: &str) -> String {
    if is_component_tag(raw) {
        kebab_component_tag(raw)
    } else {
        raw.to_string()
    }
}

/// The DEFINE-site rule (C450) — the same platform invariant
/// `validate_component_tag` enforces for component *references*, applied to
/// the name that actually reaches `customElements.define`.
///
/// `raw` is a resolved define-name (`@route { name }`, or the file stem, or an
/// explicit `--tag`). It is normalized, then REQUIRED to carry a hyphen: the
/// HTML spec reserves hyphen-free names for built-in elements, so
/// `customElements.define("timer", …)` throws `SyntaxError` and the element
/// never upgrades — it renders as an inert unknown element with no content.
///
/// Hard error, not a warning: a name that can never register is a defect in
/// every browser, and the alternative (silently prefixing it) would rewrite a
/// PUBLIC tag name on an already-shipped component, turning a loud build
/// failure into an invisible breaking change for every consumer of that tag.
///
/// ONLY call this where the emitted artifact contains a `defineElement(...)`
/// call. The `--ast-json` / `--route-json` paths resolve a PROVISIONAL stem
/// (a layout SFC is registered as `aihu-layout-<stem>` by the Vite plugin, so
/// its bare stem is never its define-name) and must stay infallible.
/// §15 — names the HTML spec reserves. Each satisfies the
/// PotentialCustomElementName production but `customElements.define` throws
/// `NotSupportedError` on it, because SVG/MathML already own the name.
const RESERVED_ELEMENT_NAMES: &[&str] = &[
    "annotation-xml",
    "color-profile",
    "font-face",
    "font-face-src",
    "font-face-uri",
    "font-face-format",
    "font-face-name",
    "missing-glyph",
];

/// §15 — the ASCII characters a define-name may carry, beyond the leading
/// letter. The PotentialCustomElementName production's ASCII half exactly:
/// `-`, `.`, `_`, `0-9`, `a-z`.
fn is_pcen_ascii(c: char) -> bool {
    matches!(c, '-' | '.' | '_' | '0'..='9' | 'a'..='z')
}

pub fn validate_define_tag(raw: &str) -> Result<String, String> {
    let norm = normalize_define_tag(raw);
    if !norm.contains('-') {
        return Err(format!(
            "C450: '{norm}' cannot register as a custom element (custom-element names require a hyphen), so `customElements.define('{norm}', …)` throws SyntaxError and the component never upgrades. Rename it to 'aihu-{norm}' — or any hyphenated name — and update the tag wherever it is used."
        ));
    }

    // §15 — the hyphen was the ONLY thing checked here, so
    // `@route { name: "x-evil onmouseover=alert(1) x" }` normalized happily,
    // reached `__aihu_tag__`, and was interpolated straight into `<${wrapTag}>`
    // — markup injection through a route's own metadata. The tag is also
    // emitted verbatim into `customElements.define('…')` and into every
    // `defineElement`/`branch` call site, so a name that is not a name breaks
    // in several directions at once.
    //
    // NARROW alphabet, matching the §13 posture: reject the ASCII characters
    // that are unambiguously not part of a custom-element name, and nothing
    // else. Non-ASCII is left ALONE — PotentialCustomElementName admits a large
    // unicode range, and re-deriving that range here is exactly the kind of
    // wrong production that fails a real, working build. This rejects what no
    // browser would accept; it does not attempt to accept only what every
    // browser would.
    //
    // Uppercase ASCII cannot reach this point (a hyphenated or PascalCase name
    // is lowercased by `kebab_component_tag`, and a name that skipped
    // normalization has no hyphen and failed above), but the rule is stated in
    // terms of the production rather than of what happens to be reachable.
    if let Some(bad) = norm.chars().find(|c| c.is_ascii() && !is_pcen_ascii(*c)) {
        let shown = if bad.is_control() || bad == ' ' {
            format!("U+{:04X}", bad as u32)
        } else {
            format!("'{bad}'")
        };
        return Err(format!(
            "C450: '{norm}' cannot register as a custom element — {shown} is not valid in a custom-element name (allowed: a-z, 0-9, '-', '.', '_'), so `customElements.define('{norm}', …)` throws SyntaxError and the tag is interpolated verbatim into emitted markup. Remove it, or use a hyphenated all-lowercase name."
        ));
    }
    if RESERVED_ELEMENT_NAMES.contains(&norm.as_str()) {
        return Err(format!(
            "C450: '{norm}' is a name the HTML spec reserves for SVG/MathML, so `customElements.define('{norm}', …)` throws NotSupportedError and the component never upgrades. Rename it, e.g. 'aihu-{norm}'."
        ));
    }

    // W450 — PotentialCustomElementName also requires the FIRST character to be
    // an ASCII lowercase letter, and `01-slot` genuinely cannot register. It is
    // a WARNING and not a C450 error solely because the corpus gate says so:
    // ten in-repo files (`bench/compiler-conformance/**/NN-name.aihu`) derive
    // their define-name from a digit-leading file stem, and the merge
    // precondition for this rule is ZERO new errors across the corpora. That is
    // exactly the "a wrong production fails real builds — that tier lands as a
    // warning" line in `docs/plans/2026-08-06-ssr-child-followups.md`, drawn by
    // measurement rather than by judgment. The finding is real and preserved
    // here; escalating it to an error is a rename-the-fixtures decision that
    // belongs to whoever owns `bench/`.
    let first = norm.chars().next().unwrap_or('\0');
    if !first.is_ascii_lowercase() {
        crate::diagnostics::emit_warning(&crate::types::CompileError {
            message: format!(
                "W450: '{norm}' cannot register as a custom element — a custom-element name must begin with an ASCII lowercase letter (found '{first}'), so `customElements.define('{norm}', …)` throws SyntaxError and the element never upgrades."
            ),
            line: 0,
            col: 0,
            code: Some("W450".to_string()),
            hint: Some(
                "the define-name comes from `@meta { name }`, `@route { name }`, or the file stem — a stem like `01-slot.aihu` yields `01-slot`".to_string(),
            ),
            fix: Some(format!("give it a letter-leading name, e.g. 'aihu-{}'", norm.trim_start_matches(|c: char| !c.is_ascii_lowercase()))),
            ..Default::default()
        });
    }

    Ok(norm)
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
    fn normalize_define_tag_matches_the_three_driver_copies() {
        // PascalCase component-shaped names kebab; plain lowercase names and
        // already-hyphenated names pass through verbatim.
        assert_eq!(normalize_define_tag("UserCard"), "user-card");
        assert_eq!(normalize_define_tag("Comment"), "comment");
        assert_eq!(normalize_define_tag("aihu-layout-app"), "aihu-layout-app");
        assert_eq!(normalize_define_tag("todo-mvc"), "todo-mvc");
        assert_eq!(normalize_define_tag("timer"), "timer");
    }

    #[test]
    fn validate_define_tag_accepts_hyphenated_names() {
        assert_eq!(validate_define_tag("todo-mvc"), Ok("todo-mvc".to_string()));
        assert_eq!(validate_define_tag("UserCard"), Ok("user-card".to_string()));
        assert_eq!(
            validate_define_tag("aihu-layout-app"),
            Ok("aihu-layout-app".to_string())
        );
    }

    #[test]
    fn validate_define_tag_rejects_hyphenless_names() {
        // The shipped defects this rule exists to catch.
        for (raw, norm) in [
            ("timer", "timer"),
            ("button", "button"),
            ("outlet", "outlet"),
            ("Card", "card"),
        ] {
            let err = validate_define_tag(raw)
                .expect_err("a hyphenless define-name must be a hard error");
            assert!(err.contains("C450"), "must carry the C450 code: {err}");
            assert!(
                err.contains(norm),
                "must name the offending tag '{norm}': {err}"
            );
            assert!(
                err.contains(&format!("aihu-{norm}")),
                "must suggest a concrete hyphenated rename: {err}"
            );
        }
    }

    #[test]
    fn is_component_tag_classification() {
        assert!(is_component_tag("UserCard"));
        assert!(is_component_tag("my-widget"));
        assert!(!is_component_tag("div"));
        assert!(!is_component_tag("linearGradient"));
    }
}
