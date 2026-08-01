//! Golden-file coverage for the recipe channel, per family — the D4 §6 step 6
//! debt ("golden-file test per family: input class set → emitted CSS,
//! snapshotted") was prescribed but never executed for btn/card/badge. This
//! file closes it, and documents the at-rule-drop bug the tailwind-animations
//! port doc (§1, §3 Slice 13) identified as the reason that catalog does not
//! use this channel.

use std::collections::BTreeSet;

use aihu_css_core::{compile_recipes, ThemeRegistry};

fn classes(names: &[&str]) -> BTreeSet<String> {
    names.iter().map(|s| s.to_string()).collect()
}

#[test]
fn btn_family_snapshot() {
    let theme = ThemeRegistry::with_aihu_defaults();
    let css = compile_recipes(
        &classes(&["btn", "btn-primary", "btn-ghost", "btn-sm", "btn-lg"]),
        &theme,
    )
    .unwrap();
    insta::assert_snapshot!(css);
}

#[test]
fn card_family_snapshot() {
    let theme = ThemeRegistry::with_aihu_defaults();
    let css = compile_recipes(&classes(&["card", "card-title", "card-body"]), &theme).unwrap();
    insta::assert_snapshot!(css);
}

#[test]
fn badge_family_snapshot() {
    let theme = ThemeRegistry::with_aihu_defaults();
    let css = compile_recipes(
        &classes(&[
            "badge",
            "badge-success",
            "badge-warning",
            "badge-error",
            "badge-info",
        ]),
        &theme,
    )
    .unwrap();
    insta::assert_snapshot!(css);
}

/// Documents that today's shipped recipe sources (btn/card/badge) contain no
/// top-level at-rules — i.e. the `compile_recipes` at-rule-drop gap (see
/// `src/recipes.rs`'s own unit tests for the direct reproduction) is latent
/// against the current catalog, not already silently firing. If a future
/// recipe edit introduces a bare `@media`/`@keyframes` block, this test flags
/// it so the author checks Slice 13 (the fix) has landed first.
#[test]
fn shipped_recipes_contain_no_at_rules_yet() {
    let theme = ThemeRegistry::with_aihu_defaults();
    for (family, members) in [
        (
            "btn",
            vec!["btn", "btn-primary", "btn-ghost", "btn-sm", "btn-lg"],
        ),
        ("card", vec!["card", "card-title", "card-body"]),
        (
            "badge",
            vec![
                "badge",
                "badge-success",
                "badge-warning",
                "badge-error",
                "badge-info",
            ],
        ),
    ] {
        let css = compile_recipes(&classes(&members), &theme).unwrap();
        assert!(
            !css.contains('@') || css.contains("@layer aihu.components"),
            "{family}: an at-rule appears to have entered this recipe — see \
             src/recipes.rs's at-rule-drop unit test before assuming it round-trips"
        );
    }
}
