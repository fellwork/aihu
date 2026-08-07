//! §13 layer 1 + §15 — name validation at the two places a name is serialized
//! VERBATIM into markup: template attribute names, and the resolved
//! define-name.
//!
//! Both were previously unchecked in the direction that matters. `parse_attr`
//! accepted any attribute name, and `serializeAttrs` / `__aihu_sattr` escape
//! attribute VALUES but never keys, so `<span data-x/onload="alert(1)">` parsed
//! into a real `onload` handler in the browser — and child SSR now carries such
//! attributes into prerendered pages. `validate_define_tag` checked only for a
//! hyphen, so `@route { name: "x-evil onmouseover=alert(1) x" }` reached
//! `__aihu_tag__` and was interpolated into `<${wrapTag}>`.
//!
//! The NEGATIVE batteries below are load-bearing. Both rules are deliberately
//! narrow, and the way a narrow rule fails is by growing: a test that only
//! pinned the rejections would let a later "while we're here" tightening break
//! real templates with nothing to catch it.

use aihu_compiler::envelope::{compile_envelope, EnvelopeOptions};
use aihu_compiler::{sfc, tags};

// ─── §13 — attribute names ──────────────────────────────────────────────────

/// Compile a template body as an SFC (the template AST is built by
/// `compile_full`, not by `sfc::parse_*`, so the attribute parser only runs on
/// this path) and return the error, if any.
fn parse_template(body: &str) -> Result<(), aihu_compiler::CompileError> {
    let src = format!("@template {{\n  {body}\n}}\n");
    let parsed = sfc::parse_with_path(&src, Some("src/components/x-host.aihu"))?;
    aihu_compiler::compile_full(&parsed).map(|_| ())
}

fn expect_c310(body: &str) -> String {
    let err = parse_template(body)
        .expect_err("an attribute name that cannot serialize as written must be rejected");
    assert_eq!(
        err.code.as_deref(),
        Some("C310"),
        "wrong diagnostic for `{body}`: {}",
        err.message
    );
    err.message
}

/// The reported case: `/` splits one written attribute into two parsed ones,
/// the second a live event handler.
#[test]
fn slash_in_an_attribute_name_is_rejected() {
    let msg = expect_c310(r#"<span data-x/onload="alert(1)"></span>"#);
    assert!(
        msg.contains("data-x/onload"),
        "the message must name the offending attribute: {msg}"
    );
}

/// Every other character that already means something else at the point an
/// attribute name is serialized.
#[test]
fn quote_angle_and_backtick_in_an_attribute_name_are_rejected() {
    expect_c310(r#"<span data-x"onload=x></span>"#);
    expect_c310(r#"<span data-x<onload="1"></span>"#);
    expect_c310("<span data-x`onload=\"1\"></span>");
}

/// A non-whitespace control character survives the attribute tokenizer
/// (whitespace ends the token; `\u{0}` does not), so it has to be rejected
/// here rather than assumed unreachable.
#[test]
fn control_characters_in_an_attribute_name_are_rejected() {
    let msg = expect_c310("<span data-x\u{0}onload=\"1\"></span>");
    assert!(
        msg.contains("U+0000"),
        "an invisible character must be reported by codepoint: {msg}"
    );
}

/// The `attr:` escape hatch emits a LITERAL attribute name, so it is the one
/// path where an unchecked name would be most directly weaponizable. Covered
/// by the same rule because the check runs before prefix dispatch.
#[test]
fn the_attr_escape_hatch_is_covered_by_the_same_rule() {
    expect_c310(r#"<span attr:data-x/onload="alert(1)"></span>"#);
}

/// An attribute with no name at all: an HTML parser reads the `=` as the start
/// of a name, so this never renders as written either.
#[test]
fn an_empty_attribute_name_is_rejected() {
    expect_c310(r#"<span ="alert(1)"></span>"#);
}

/// NEGATIVE battery — the rule must not grow past "characters that already
/// mean something else". Everything here is an attribute spelling real
/// templates use.
#[test]
fn legitimate_attribute_names_still_parse() {
    for body in [
        r#"<div class="a" id="b" data-foo="1" aria-label="x"></div>"#,
        r#"<div data-a.b="1" data-a_b="1" data-a-b="1"></div>"#,
        r##"<svg viewBox="0 0 24 24"><use xlink:href="#i"></use></svg>"##,
        r#"<path stroke-width="2" fill-rule="evenodd"></path>"#,
        r#"<button on:click={go} on:submit.prevent={go}>x</button>"#,
        r#"<input bind:value={name} class:active={on}>"#,
        r#"<x-kid attr:if="literal" attr:each="literal"></x-kid>"#,
        r#"<div hidden></div>"#,
        // The value may contain anything the name may not — only keys are
        // unescaped at serialization, so only keys are policed.
        r#"<div title="a/b <c> 'd' &quot;e&quot;"></div>"#,
        r#"<div title={"a/b"}></div>"#,
    ] {
        parse_template(body)
            .unwrap_or_else(|e| panic!("legitimate template rejected: {body}\n  {}", e.message));
    }
}

// ─── §15 — define-names ─────────────────────────────────────────────────────

fn expect_define_err(raw: &str) -> String {
    let err = tags::validate_define_tag(raw)
        .expect_err("a name that cannot register must be rejected");
    assert!(err.contains("C450"), "must carry the C450 code: {err}");
    err
}

/// The reported case, verbatim.
#[test]
fn a_define_name_carrying_markup_is_rejected() {
    let err = expect_define_err("x-evil onmouseover=alert(1) x");
    assert!(
        err.contains("U+0020") || err.contains("' '"),
        "must name the first offending character: {err}"
    );
}

/// Characters outside the PotentialCustomElementName ASCII set.
#[test]
fn invalid_ascii_in_a_define_name_is_rejected() {
    for raw in [
        "x-a>b", "x-a<b", "x-a\"b", "x-a'b", "x-a=b", "x-a(b", "x-a/b", "x-a&b", "x-a b",
        "x-a\u{0}b",
    ] {
        expect_define_err(raw);
    }
}

/// PCEN requires an ASCII lowercase letter first, and a digit-leading name
/// genuinely cannot register — but this is a W450 WARNING, not a C450 error,
/// because the corpus gate found ten in-repo files
/// (`bench/compiler-conformance/**/NN-name.aihu`) that derive exactly such a
/// name from their file stem, and the merge precondition is zero new errors.
///
/// Pinned as an ACCEPTANCE so the tier cannot be escalated by accident: if
/// someone promotes W450 to C450 without renaming those fixtures, this fails
/// and points at the gate.
#[test]
fn a_digit_leading_define_name_warns_but_does_not_error() {
    for raw in ["01-basic-route", "01-slot", "1-x"] {
        assert_eq!(
            tags::validate_define_tag(raw),
            Ok(raw.to_string()),
            "digit-leading names are the W450 warning tier, not a hard error — \
             see the corpus-gate note in tags.rs"
        );
    }
}

/// The spec's reserved names satisfy PCEN but throw `NotSupportedError`.
#[test]
fn reserved_element_names_are_rejected() {
    for raw in [
        "annotation-xml",
        "color-profile",
        "font-face",
        "font-face-src",
        "font-face-uri",
        "font-face-format",
        "font-face-name",
        "missing-glyph",
    ] {
        let err = expect_define_err(raw);
        assert!(
            err.contains("reserve"),
            "a reserved name deserves its own explanation, not the character rule: {err}"
        );
    }
}

/// NEGATIVE battery — every shape the repo's own naming produces, plus the
/// non-ASCII the rule deliberately does NOT police (PotentialCustomElementName
/// admits a large unicode range; re-deriving it here is the wrong-production
/// risk this narrowness exists to avoid).
#[test]
fn legitimate_define_names_still_validate() {
    for (raw, expected) in [
        ("todo-mvc", "todo-mvc"),
        ("aihu-layout-app", "aihu-layout-app"),
        ("UserCard", "user-card"),
        ("APIClient", "api-client"),
        ("x-kid1", "x-kid1"),
        ("x-a.b", "x-a.b"),
        ("x_a-b", "x_a-b"),
        ("weather-demo", "weather-demo"),
        ("x-café", "x-café"),
    ] {
        assert_eq!(
            tags::validate_define_tag(raw),
            Ok(expected.to_string()),
            "legitimate define-name rejected: {raw}"
        );
    }
}

/// End-to-end: the JS emit path is the one that reaches
/// `customElements.define`, so the rejection has to happen THERE, not merely in
/// the helper. Also pins the deliberate asymmetry — `--route-json` resolves a
/// provisional stem and must stay infallible.
#[test]
fn a_hostile_route_name_fails_the_js_emit_and_not_the_route_json() {
    let src = r#"
@route {
  path: '/x',
  name: 'x-evil onmouseover=alert(1) x'
}

@template {
  <div>hi</div>
}
"#;
    let js_err = compile_envelope(
        src,
        &EnvelopeOptions {
            path: Some("src/pages/x.aihu".to_string()),
            emits: vec!["js".to_string()],
            ..Default::default()
        },
    )
    .expect_err("a hostile define-name must fail the JS emit");
    assert_eq!(js_err.code.as_deref(), Some("C450"), "{}", js_err.message);

    compile_envelope(
        src,
        &EnvelopeOptions {
            path: Some("src/pages/x.aihu".to_string()),
            emits: vec!["route".to_string()],
            ..Default::default()
        },
    )
    .expect("the route-json path resolves a provisional stem and must stay infallible");
}
