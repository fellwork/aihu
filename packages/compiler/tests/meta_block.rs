//! PR-2 (COMPILER) — `@meta { … }` recipe-catalog block.
//!
//! Locked decisions exercised here:
//! - R-JSON5      — lenient JSON5-style body (unquoted keys, single/double
//!                  quotes, trailing commas) all accepted.
//! - R-BRACE-REWRAP — the block parser strips the outer braces; the body is
//!                  re-wrapped in `{ }` before JSON5 parsing.
//! - R-META-COEXIST — `@meta` carries variants/slots/dependencies/
//!                  registryDependencies ONLY; it never sets/overrides `name`.

use aihu_compiler::{sfc, SfcMeta};
use std::collections::BTreeMap;

fn parse_meta(src: &str) -> SfcMeta {
    sfc::parse(src)
        .expect("parse should succeed")
        .sfc_meta
        .expect("@meta block should be present")
}

#[test]
fn valid_json5_round_trips() {
    let src = "@meta { variants: { variant: ['a','b'] }, slots: ['button'] }\n";
    let meta = parse_meta(src);

    let mut expected_variants: BTreeMap<String, Vec<String>> = BTreeMap::new();
    expected_variants.insert("variant".to_string(), vec!["a".to_string(), "b".to_string()]);
    assert_eq!(meta.variants, expected_variants);
    assert_eq!(meta.slots, vec!["button".to_string()]);
    assert!(meta.dependencies.is_empty());
    assert!(meta.registry_dependencies.is_empty());
}

#[test]
fn unquoted_keys_single_quotes_trailing_commas_all_accepted() {
    // Unquoted keys (variants/slots/dependencies), single quotes throughout,
    // and trailing commas at every level.
    let src = "@meta {\n  variants: { size: ['sm', 'lg',], },\n  slots: ['icon', 'label',],\n  dependencies: ['clsx',],\n  registryDependencies: ['button',],\n}\n";
    let meta = parse_meta(src);

    let mut expected_variants: BTreeMap<String, Vec<String>> = BTreeMap::new();
    expected_variants.insert("size".to_string(), vec!["sm".to_string(), "lg".to_string()]);
    assert_eq!(meta.variants, expected_variants);
    assert_eq!(meta.slots, vec!["icon".to_string(), "label".to_string()]);
    assert_eq!(meta.dependencies, vec!["clsx".to_string()]);
    assert_eq!(meta.registry_dependencies, vec!["button".to_string()]);
}

#[test]
fn double_quotes_also_accepted() {
    let src = "@meta { \"slots\": [\"a\", \"b\"], \"dependencies\": [\"dep\"] }\n";
    let meta = parse_meta(src);
    assert_eq!(meta.slots, vec!["a".to_string(), "b".to_string()]);
    assert_eq!(meta.dependencies, vec!["dep".to_string()]);
}

#[test]
fn empty_meta_yields_empty_sfc_meta() {
    // R-BRACE-REWRAP: empty body re-wraps to `{}` → an all-default SfcMeta.
    let meta = parse_meta("@meta {}\n");
    assert_eq!(meta, SfcMeta::default());
    assert!(meta.variants.is_empty());
    assert!(meta.slots.is_empty());
    assert!(meta.dependencies.is_empty());
    assert!(meta.registry_dependencies.is_empty());
}

#[test]
fn malformed_body_errors_with_line_info() {
    // Unterminated array literal — JSON5 parse failure surfaces as C110 with
    // the @meta opener line.
    let src = "\n\n@meta { slots: ['a' }\n";
    let err = sfc::parse(src).expect_err("malformed @meta should error");
    assert_eq!(err.code.as_deref(), Some("C110"));
    assert!(err.message.contains("@meta"), "got: {}", err.message);
    assert_eq!(err.line, 3, "should point at the @meta opener line");
}

#[test]
fn duplicate_meta_errors() {
    let src = "@meta { slots: ['a'] }\n@meta { slots: ['b'] }\n";
    let err = sfc::parse(src).expect_err("duplicate @meta should error");
    assert_eq!(err.code.as_deref(), Some("C109"));
    assert!(err.message.contains("duplicate @meta"), "got: {}", err.message);
}

#[test]
fn meta_does_not_set_name_r_meta_coexist() {
    // R-META-COEXIST: @meta must not touch the component name. ScriptMeta.name
    // stays None even though @meta is populated, and SfcMeta has no `name` field.
    let src = "@meta { variants: { variant: ['a'] } }\n@template { <p>hi</p> }\n";
    let parsed = sfc::parse(src).unwrap();
    assert!(parsed.meta.name.is_none(), "@meta must not set the component name");
    assert!(parsed.sfc_meta.is_some());
}

#[test]
fn no_meta_block_yields_none() {
    let parsed = sfc::parse("@template { <p>hi</p> }\n").unwrap();
    assert!(parsed.sfc_meta.is_none());
}

#[test]
fn meta_ast_snapshot() {
    let src = "@meta {\n  variants: { variant: ['default', 'ghost'], size: ['sm', 'lg'] },\n  slots: ['button'],\n  dependencies: ['clsx'],\n  registryDependencies: ['utils'],\n}\n@template {\n  <button>{{ label }}</button>\n}\n";
    let parsed = sfc::parse(src).unwrap();
    insta::assert_debug_snapshot!(parsed);
}
