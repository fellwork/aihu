//! `recipes.rs` — the daisyUI-style semantic recipe layer (D4 §6, Slice 4).
//!
//! Recipe families are transcribed (not vendored) into `recipes/*.css` next to
//! this crate, authored exactly like a component's own `@style` block: plain
//! class selectors, `@apply`, and `&`-relative nesting. `build.rs` globs the
//! directory into [`RECIPE_SOURCES`] so dropping in a new family file needs no
//! Rust-source change — see that file for the generation step.
//!
//! Recipes are GLOBAL, not per-component `@scope`d (unlike LDF's light-DOM
//! selector-rewrite pass) — `.btn`/`.card`/`.badge` are meant to apply
//! document-wide to any element bearing the class, exactly like an imported
//! utility framework. They live in `@layer aihu.components`, which
//! [`crate::emit::LAYER_PREAMBLE`] already places below `aihu.utilities` in
//! the cascade (D4 Q5, ratified): `class="btn p-8"` must resolve `padding`
//! from the utility, not the recipe.
//!
//! Emission tree-shakes exactly like
//! [`crate::theme::ThemeRegistry::emit_used_tokens`]: a recipe rule is only
//! emitted when the SFC's scanned utility set actually references ITS class
//! name (D4 §6.2's worked example: `.btn-ghost`/`.btn-sm`/`.btn-lg` are
//! "never looked up, so absent" when only `class="btn btn-primary"` is used).

use std::collections::BTreeSet;

use crate::ast::SfcStyleScope;
use crate::emit::CompileError;
use crate::style_parser::{StyleNode, StyleSheet};
use crate::theme::ThemeRegistry;

include!(concat!(env!("OUT_DIR"), "/recipes_generated.rs"));

/// Every class name a top-level rule's selector addresses — handles
/// comma-separated lists (`.btn-sm, .btn-lg`) and compound selectors
/// (`.btn.btn-lg`) by extracting every `.name` token, not just the first.
fn selector_class_names(selector: &str) -> Vec<&str> {
    let mut names = Vec::new();
    let bytes = selector.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'.' {
            let start = i + 1;
            let mut end = start;
            while end < bytes.len()
                && (bytes[end].is_ascii_alphanumeric() || bytes[end] == b'-' || bytes[end] == b'_')
            {
                end += 1;
            }
            if end > start {
                names.push(&selector[start..end]);
            }
            i = end;
        } else {
            i += 1;
        }
    }
    names
}

fn rule_is_used(selector: &str, classes: &BTreeSet<String>) -> bool {
    selector_class_names(selector)
        .iter()
        .any(|name| classes.contains(*name))
}

/// Whether `rule` (including anything nested under it via `&`) declares
/// `animation`/`animation-name: <keyframe_name>` — the reference that keeps
/// a `@keyframes` block alive under tree-shaking.
fn rule_references_keyframe(rule: &crate::style_parser::StyleRule, keyframe_name: &str) -> bool {
    let declares = rule.declarations.iter().any(|d| {
        (d.prop == "animation" || d.prop == "animation-name")
            && d.value
                .split(|c: char| c.is_whitespace() || c == ',')
                .any(|tok| tok == keyframe_name)
    });
    if declares {
        return true;
    }
    rule.nested.iter().any(|n| match n {
        StyleNode::Rule(r) => rule_references_keyframe(r, keyframe_name),
        StyleNode::AtRule(at) => at
            .body
            .iter()
            .any(|n2| matches!(n2, StyleNode::Rule(r) if rule_references_keyframe(r, keyframe_name))),
        StyleNode::AtStatement(_) => false,
    })
}

/// Whether ANY of `rules` (the emitted, USED top-level rules from this
/// recipe source) references `keyframe_name`.
fn rules_reference_keyframe(
    rules: &[&crate::style_parser::StyleRule],
    keyframe_name: &str,
) -> bool {
    rules
        .iter()
        .any(|r| rule_references_keyframe(r, keyframe_name))
}

/// Whether any rule nested (recursively, through further at-rules) inside
/// `at` has a selector naming a scanned class — the tree-shake test for a
/// non-`@keyframes` at-rule (`@media`, `@supports`, `@container`,
/// `@starting-style`, …).
fn at_rule_selectors_used(at: &crate::style_parser::AtRule, classes: &BTreeSet<String>) -> bool {
    at.body.iter().any(|node| match node {
        StyleNode::Rule(rule) => rule_is_used(&rule.selector, classes),
        StyleNode::AtRule(nested) => at_rule_selectors_used(nested, classes),
        StyleNode::AtStatement(_) => false,
    })
}

/// Compile the recipe channel for one SFC: every top-level recipe rule whose
/// class name appears in `classes` (the SFC's scanned utility set), wrapped
/// in `@layer aihu.components`. Empty when no scanned class matches any
/// recipe family — the common case, since most components use none of the
/// daisyUI-style recipes.
///
/// `@apply` inside a recipe resolves through the same `expand_apply_sheet`
/// pass a component's own authored `@style` uses, with `SfcStyleScope::Scoped`
/// — recipes nest pseudo-class variants against their own selector
/// (`.btn { &:hover {...} } `via `@apply disabled:...`), which is exactly
/// what `Scoped` mode permits and `Global` mode's `$global` guard would
/// reject (`GlobalApplyVariant`). "Scoped" here only means "may nest against
/// `&`" — recipes are still emitted unscoped, module-doc above.
///
/// Top-level at-rules (tailwind-animations port doc, Track A Slice 13 — the
/// fix for the gap `at_rules_are_tree_shaken_alongside_rules` below used to
/// document as a live bug) get a SECOND tree-shake pass, since they don't
/// carry a class-name selector of their own to test directly:
///   - `@keyframes <name>` is kept iff an EMITTED rule from this same source
///     references `<name>` via `animation`/`animation-name` — the same
///     reference-based tree-shake `tokens::animation_keyframes` hoisting
///     already does for utility-engine animations.
///   - Any other brace-bodied at-rule is kept iff one of its own nested
///     rules' selectors names a scanned class — emitted WHOLE (not
///     selectively pruned rule-by-rule inside it), since these wrap
///     presentation state for a class the author already opted into via the
///     base rule.
pub fn compile_recipes(
    classes: &BTreeSet<String>,
    theme: &ThemeRegistry,
) -> Result<String, CompileError> {
    let mut out = String::new();
    for source in RECIPE_SOURCES {
        let sheet = crate::apply::expand_apply_sheet(source, SfcStyleScope::Scoped, theme)?;

        let mut used_rules: Vec<&crate::style_parser::StyleRule> = Vec::new();
        for node in &sheet.nodes {
            if let StyleNode::Rule(rule) = node {
                if rule_is_used(&rule.selector, classes) {
                    used_rules.push(rule);
                    out.push_str(
                        &StyleSheet {
                            nodes: vec![node.clone()],
                        }
                        .to_css(),
                    );
                }
            }
        }

        for node in &sheet.nodes {
            if let StyleNode::AtRule(at) = node {
                let used = if at.name == "@keyframes" {
                    let keyframe_name = at.prelude.trim();
                    !keyframe_name.is_empty()
                        && rules_reference_keyframe(&used_rules, keyframe_name)
                } else {
                    at_rule_selectors_used(at, classes)
                };
                if used {
                    out.push_str(
                        &StyleSheet {
                            nodes: vec![node.clone()],
                        }
                        .to_css(),
                    );
                }
            }
        }
    }
    if out.trim().is_empty() {
        return Ok(String::new());
    }
    Ok(format!("@layer aihu.components {{\n{out}}}\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn classes(names: &[&str]) -> BTreeSet<String> {
        names.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn no_scanned_class_matches_any_recipe_emits_nothing() {
        let theme = ThemeRegistry::with_aihu_defaults();
        let out = compile_recipes(&classes(&["flex", "p-4"]), &theme).unwrap();
        assert_eq!(out, "");
    }

    #[test]
    fn base_btn_class_emits_only_btn_not_its_siblings() {
        let theme = ThemeRegistry::with_aihu_defaults();
        let out = compile_recipes(&classes(&["btn"]), &theme).unwrap();
        assert!(out.starts_with("@layer aihu.components {"), "{out}");
        assert!(out.contains(".btn {"), "{out}");
        assert!(out.contains("&:hover"), "{out}");
        assert!(out.contains("&:disabled"), "{out}");
        // Never looked up — must be tree-shaken out (D4 §6.2).
        assert!(!out.contains(".btn-ghost"), "{out}");
        assert!(!out.contains(".btn-sm"), "{out}");
        assert!(!out.contains(".btn-lg"), "{out}");
        assert!(!out.contains(".btn-primary"), "{out}");
    }

    #[test]
    fn btn_plus_btn_primary_emits_both() {
        let theme = ThemeRegistry::with_aihu_defaults();
        let out = compile_recipes(&classes(&["btn", "btn-primary"]), &theme).unwrap();
        assert!(out.contains(".btn {"), "{out}");
        assert!(out.contains(".btn-primary {"), "{out}");
        assert!(!out.contains(".btn-ghost"), "{out}");
    }

    #[test]
    fn recipes_from_different_families_are_independently_tree_shaken() {
        let theme = ThemeRegistry::with_aihu_defaults();
        let out = compile_recipes(&classes(&["card", "badge-info"]), &theme).unwrap();
        assert!(out.contains(".card {"), "{out}");
        assert!(out.contains(".badge-info {"), "{out}");
        // `.badge` (the base) was never scanned — absent, same as `.btn` above.
        assert!(!out.contains(".badge {"), "{out}");
        assert!(!out.contains(".card-body"), "{out}");
        assert!(!out.contains(".card-title"), "{out}");
    }

    /// Documents a live gap, cited by the tailwind-animations port doc (§1,
    /// §3 Slice 13) as the reason that catalog does not use this channel:
    /// this loop only matches `StyleNode::Rule` — a top-level `@media`/
    /// `@keyframes` block in a recipe source parses successfully and then
    /// silently produces no output. Reproduced directly against the same
    /// `expand_apply_sheet` + match-on-`StyleNode::Rule` pattern
    /// `compile_recipes` uses, since `compile_recipes` itself only reads the
    /// `compile_recipes` itself only ever runs against the compiled-in
    /// `RECIPE_SOURCES` (real files), so these test the two-pass tree-shake
    /// helpers directly against a synthetic source via `expand_apply_sheet`
    /// — same fixture shape the original (pre-Slice-13) documenting test for
    /// this gap used.
    #[test]
    fn keyframes_referenced_by_an_emitted_rule_are_kept() {
        let theme = ThemeRegistry::with_aihu_defaults();
        let source =
            ".btn { animation: spin-demo 1s linear infinite; } @keyframes spin-demo { to { transform: rotate(360deg); } }";
        let sheet = crate::apply::expand_apply_sheet(source, SfcStyleScope::Scoped, &theme)
            .expect("valid CSS with one rule + one at-rule should parse");

        let used_rules: Vec<&crate::style_parser::StyleRule> = sheet
            .nodes
            .iter()
            .filter_map(|n| match n {
                StyleNode::Rule(r) if rule_is_used(&r.selector, &classes(&["btn"])) => Some(r),
                _ => None,
            })
            .collect();
        assert!(rules_reference_keyframe(&used_rules, "spin-demo"));

        let at = sheet
            .nodes
            .iter()
            .find_map(|n| match n {
                StyleNode::AtRule(at) if at.name == "@keyframes" => Some(at),
                _ => None,
            })
            .expect("fixture must contain a @keyframes at-rule");
        assert_eq!(at.prelude.trim(), "spin-demo");
    }

    #[test]
    fn keyframes_not_referenced_by_any_emitted_rule_are_dropped() {
        let theme = ThemeRegistry::with_aihu_defaults();
        // No rule in this source declares `animation: spin-demo`, so the
        // keyframe block has nothing keeping it alive.
        let source = ".btn { color: red; } @keyframes spin-demo { to { transform: rotate(360deg); } }";
        let sheet = crate::apply::expand_apply_sheet(source, SfcStyleScope::Scoped, &theme)
            .expect("valid CSS with one rule + one at-rule should parse");

        let used_rules: Vec<&crate::style_parser::StyleRule> = sheet
            .nodes
            .iter()
            .filter_map(|n| match n {
                StyleNode::Rule(r) if rule_is_used(&r.selector, &classes(&["btn"])) => Some(r),
                _ => None,
            })
            .collect();
        assert!(!rules_reference_keyframe(&used_rules, "spin-demo"));
    }

    #[test]
    fn non_keyframe_at_rule_kept_iff_a_nested_selector_is_scanned() {
        let theme = ThemeRegistry::with_aihu_defaults();
        let source = "@media (min-width: 768px) { .btn { padding: 2rem; } }";
        let sheet = crate::apply::expand_apply_sheet(source, SfcStyleScope::Scoped, &theme)
            .expect("valid @media-wrapped rule should parse");
        let at = sheet
            .nodes
            .iter()
            .find_map(|n| match n {
                StyleNode::AtRule(at) => Some(at),
                _ => None,
            })
            .expect("fixture must contain an @media at-rule");

        assert!(at_rule_selectors_used(at, &classes(&["btn"])));
        assert!(!at_rule_selectors_used(at, &classes(&["card"])));
    }

    #[test]
    fn compile_recipes_end_to_end_still_tree_shakes_ordinary_rules() {
        // Sanity check that the two-pass rewrite didn't change the
        // already-covered rule-only behavior for the real recipe sources —
        // no shipped family uses at-rules yet, so this is the same assertion
        // `base_btn_class_emits_only_btn_not_its_siblings` makes, kept here
        // as a companion to the at-rule-specific tests above.
        let theme = ThemeRegistry::with_aihu_defaults();
        let out = compile_recipes(&classes(&["btn"]), &theme).unwrap();
        assert!(out.contains(".btn {"), "{out}");
        assert!(!out.contains("@keyframes"), "{out}");
    }
}
