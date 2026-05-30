//! Structured `@style`-rule parser tests (T2, R-SHARED-PARSER).
//!
//! This parser is the SINGLE source reused by `@apply` (T3) and variant
//! validation (PR-3), so the tests pin the public API both consumers depend on:
//! the rule tree, per-rule `@apply` directives, and each rule's selector
//! context. Codex flagged a naive string scanner as a trap, so the tests
//! deliberately stress comments, strings, arbitrary-value utilities, `;`-in-
//! values, and brace nesting.

use aihu_css_core::style_parser::{parse_style, StyleNode, StyleParseError};

/// Find the first top-level rule, asserting there is one.
fn first_rule(sheet: &aihu_css_core::StyleSheet) -> &aihu_css_core::StyleRule {
    sheet
        .nodes
        .iter()
        .find_map(|n| match n {
            StyleNode::Rule(r) => Some(r),
            _ => None,
        })
        .expect("expected at least one top-level rule")
}

#[test]
fn parses_a_simple_rule_with_declarations() {
    let sheet = parse_style(".box { color: red; padding: 4px; }").unwrap();
    let rule = first_rule(&sheet);
    assert_eq!(rule.selector, ".box");
    assert_eq!(rule.declarations.len(), 2);
    assert_eq!(rule.declarations[0].prop, "color");
    assert_eq!(rule.declarations[0].value, "red");
    assert_eq!(rule.declarations[1].prop, "padding");
    assert_eq!(rule.declarations[1].value, "4px");
    assert!(rule.applies.is_empty());
}

#[test]
fn parses_multiple_top_level_rules() {
    let sheet = parse_style(".a { color: red; } .b, .c { color: blue; }").unwrap();
    let rules: Vec<_> = sheet
        .nodes
        .iter()
        .filter_map(|n| match n {
            StyleNode::Rule(r) => Some(r),
            _ => None,
        })
        .collect();
    assert_eq!(rules.len(), 2);
    assert_eq!(rules[0].selector, ".a");
    // Selector list preserved verbatim (validation/PR-3 needs the raw context).
    assert_eq!(rules[1].selector, ".b, .c");
}

#[test]
fn captures_apply_directives_per_rule() {
    let sheet = parse_style(".btn { @apply bg-primary p-4; color: red; @apply hover:bg-accent; }")
        .unwrap();
    let rule = first_rule(&sheet);
    assert_eq!(rule.applies.len(), 2);
    assert_eq!(rule.applies[0].tokens, vec!["bg-primary", "p-4"]);
    assert_eq!(rule.applies[1].tokens, vec!["hover:bg-accent"]);
    // The interleaved declaration is still captured.
    assert_eq!(rule.declarations.len(), 1);
    assert_eq!(rule.declarations[0].prop, "color");
}

#[test]
fn apply_keyword_is_not_confused_with_prefix() {
    // `@applyfoo` is NOT an `@apply` directive — it stays an at-statement, not a
    // parsed apply.
    let sheet = parse_style(".x { @applyfoo bar; }").unwrap();
    let rule = first_rule(&sheet);
    assert!(rule.applies.is_empty(), "@applyfoo must not parse as @apply");
}

#[test]
fn is_comment_aware() {
    // Braces, semicolons, and `@apply`-looking text inside comments must be
    // ignored entirely.
    let css = r#"
        /* a comment with { braces } and ; and @apply fake; */
        .a {
            /* inner comment ; { } */
            color: red; /* trailing */
        }
    "#;
    let sheet = parse_style(css).unwrap();
    let rule = first_rule(&sheet);
    assert_eq!(rule.selector, ".a");
    assert_eq!(rule.declarations.len(), 1);
    assert_eq!(rule.declarations[0].prop, "color");
    assert_eq!(rule.declarations[0].value, "red");
    // The fake @apply inside the comment was NOT captured.
    assert!(rule.applies.is_empty());
}

#[test]
fn is_string_aware_for_braces_and_semicolons() {
    // `;` and `}` inside a quoted string must not terminate the declaration or
    // rule.
    let css = r#".q { content: "a; b } c"; color: red; }"#;
    let sheet = parse_style(css).unwrap();
    let rule = first_rule(&sheet);
    assert_eq!(rule.declarations.len(), 2);
    assert_eq!(rule.declarations[0].prop, "content");
    assert_eq!(rule.declarations[0].value, r#""a; b } c""#);
    assert_eq!(rule.declarations[1].prop, "color");
}

#[test]
fn semicolon_inside_url_value_does_not_split() {
    // A `;` (and `:`) inside `url(...)` / data URI must stay in the value.
    let css = r#".bg { background: url("data:image/svg+xml;base64,AAAA") center; }"#;
    let sheet = parse_style(css).unwrap();
    let rule = first_rule(&sheet);
    assert_eq!(rule.declarations.len(), 1);
    assert_eq!(rule.declarations[0].prop, "background");
    assert_eq!(
        rule.declarations[0].value,
        r#"url("data:image/svg+xml;base64,AAAA") center"#
    );
}

#[test]
fn arbitrary_value_apply_tokens_survive() {
    // `bg-[#fff]` and `w-[calc(100%-1rem)]` must round-trip as single tokens.
    let sheet = parse_style(".c { @apply bg-[#fff] w-[calc(100%-1rem)] p-4; }").unwrap();
    let rule = first_rule(&sheet);
    assert_eq!(
        rule.applies[0].tokens,
        vec!["bg-[#fff]", "w-[calc(100%-1rem)]", "p-4"]
    );
}

#[test]
fn parses_nested_media_at_rule() {
    let css = ".a { color: red; @media (min-width: 600px) { &:hover { color: blue; } } }";
    let sheet = parse_style(css).unwrap();
    let rule = first_rule(&sheet);
    assert_eq!(rule.declarations.len(), 1);
    assert_eq!(rule.nested.len(), 1);
    match &rule.nested[0] {
        StyleNode::AtRule(at) => {
            assert_eq!(at.name, "@media");
            assert_eq!(at.prelude, "(min-width: 600px)");
            // The body has one nested rule.
            match &at.body[0] {
                StyleNode::Rule(inner) => {
                    assert_eq!(inner.selector, "&:hover");
                    assert_eq!(inner.declarations[0].prop, "color");
                }
                other => panic!("expected nested rule, got {other:?}"),
            }
        }
        other => panic!("expected @media at-rule, got {other:?}"),
    }
}

#[test]
fn parses_top_level_supports_and_container() {
    let css = "@supports (display: grid) { .g { display: grid; } } \
               @container (min-width: 20rem) { .c { color: red; } }";
    let sheet = parse_style(css).unwrap();
    let names: Vec<&str> = sheet
        .nodes
        .iter()
        .filter_map(|n| match n {
            StyleNode::AtRule(at) => Some(at.name.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(names, vec!["@supports", "@container"]);
}

#[test]
fn parses_nested_style_rule() {
    // Native CSS nesting: a rule inside a rule (with `&`).
    let css = ".card { color: red; &:hover { color: blue; } }";
    let sheet = parse_style(css).unwrap();
    let rule = first_rule(&sheet);
    assert_eq!(rule.declarations.len(), 1);
    assert_eq!(rule.nested.len(), 1);
    match &rule.nested[0] {
        StyleNode::Rule(inner) => assert_eq!(inner.selector, "&:hover"),
        other => panic!("expected nested rule, got {other:?}"),
    }
}

#[test]
fn data_attribute_selector_context_is_preserved() {
    // PR-3 validation needs the raw selector to spot `[data-variant="x"]`.
    let css = r#".btn[data-variant="primary"] { color: red; }"#;
    let sheet = parse_style(css).unwrap();
    let rule = first_rule(&sheet);
    assert_eq!(rule.selector, r#".btn[data-variant="primary"]"#);
}

#[test]
fn colon_in_selector_is_not_a_declaration_split() {
    // `:hover` / `:is(...)` in a selector must not be mistaken for a decl `:`.
    let css = ":is(.a, .b):hover { color: red; }";
    let sheet = parse_style(css).unwrap();
    let rule = first_rule(&sheet);
    assert_eq!(rule.selector, ":is(.a, .b):hover");
    assert_eq!(rule.declarations[0].prop, "color");
}

#[test]
fn unchanged_block_round_trips_equivalently() {
    // Parse → to_css → re-parse must yield the same rule tree (semantic round-
    // trip; formatting is normalized by `to_css`).
    let css = r#"
        .a { color: red; padding: 4px; }
        .b:hover { color: blue; @apply bg-primary p-4; }
        @media (min-width: 600px) {
            .a { color: green; }
        }
    "#;
    let first = parse_style(css).unwrap();
    let rendered = first.to_css();
    let second = parse_style(&rendered).unwrap();
    assert_eq!(
        first, second,
        "round-trip changed the tree:\n{rendered}"
    );
}

#[test]
fn unbalanced_braces_error() {
    let err = parse_style(".a { color: red; ").unwrap_err();
    assert_eq!(err, StyleParseError::UnbalancedBraces);
}

#[test]
fn unterminated_comment_error() {
    let err = parse_style(".a { /* never closed ").unwrap_err();
    assert_eq!(err, StyleParseError::UnterminatedComment);
}

#[test]
fn unterminated_string_error() {
    let err = parse_style(r#".a { content: "oops; }"#).unwrap_err();
    assert_eq!(err, StyleParseError::UnterminatedString);
}

#[test]
fn empty_input_is_empty_sheet() {
    let sheet = parse_style("   \n  ").unwrap();
    assert!(sheet.nodes.is_empty());
}

#[test]
fn stray_semicolons_are_ignored() {
    let sheet = parse_style(";; .a { color: red; };").unwrap();
    let rule = first_rule(&sheet);
    assert_eq!(rule.selector, ".a");
}
