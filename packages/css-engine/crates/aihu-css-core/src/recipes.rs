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
pub fn compile_recipes(
    classes: &BTreeSet<String>,
    theme: &ThemeRegistry,
) -> Result<String, CompileError> {
    let mut out = String::new();
    for source in RECIPE_SOURCES {
        let sheet = crate::apply::expand_apply_sheet(source, SfcStyleScope::Scoped, theme)?;
        for node in &sheet.nodes {
            if let StyleNode::Rule(rule) = node {
                if rule_is_used(&rule.selector, classes) {
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
}
