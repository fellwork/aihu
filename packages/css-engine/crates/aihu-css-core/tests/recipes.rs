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

/// Documents that the three ORIGINAL recipe sources (btn/card/badge) still
/// contain no top-level at-rules. Historically this guarded the
/// `compile_recipes` at-rule-drop gap; Slice 13 fixed that gap and Slice 12's
/// `recipes/dialog.css` is the first family to rely on the fix (with NESTED
/// `@media` blocks — see the dialog tests at the bottom of this file). This
/// test is kept as a pin on the pre-existing three: an at-rule appearing in
/// one of them would be an unreviewed behavioural change to shipped CSS.
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

// ── tailwind-animations Slice 12: the dialog entry/exit family ──────────────
// `recipes/dialog.css` is the first shipped recipe source to use at-rules
// (a nested `@media (prefers-reduced-motion: reduce)` per class) and the first
// whose rules are keyed on a state ATTRIBUTE rather than a bare class. These
// tests pin both, plus the tree-shaking behaviour that made the recipe channel
// the right home for it (see that file's header for the full decision record).

#[test]
fn dialog_family_snapshot() {
    let theme = ThemeRegistry::with_aihu_defaults();
    let css = compile_recipes(&classes(&["animate-dialog", "animate-dialog-backdrop"]), &theme)
        .unwrap();
    insta::assert_snapshot!(css);
}

#[test]
fn dialog_content_and_backdrop_are_independently_tree_shaken() {
    let theme = ThemeRegistry::with_aihu_defaults();

    // The two classes sit on DIFFERENT elements, so a page that scans only one
    // must not pay for the other. `.animate-dialog-backdrop` must not be
    // dragged in by a substring match on `.animate-dialog`.
    let only_content = compile_recipes(&classes(&["animate-dialog"]), &theme).unwrap();
    assert!(only_content.contains(".animate-dialog {"), "{only_content}");
    assert!(
        !only_content.contains(".animate-dialog-backdrop"),
        "{only_content}"
    );

    let only_backdrop = compile_recipes(&classes(&["animate-dialog-backdrop"]), &theme).unwrap();
    assert!(
        only_backdrop.contains(".animate-dialog-backdrop {"),
        "{only_backdrop}"
    );
    assert!(
        !only_backdrop.contains(".animate-dialog {"),
        "{only_backdrop}"
    );
}

#[test]
fn dialog_recipe_carries_its_closed_state_and_reduced_motion_guard() {
    let theme = ThemeRegistry::with_aihu_defaults();
    let css = compile_recipes(&classes(&["animate-dialog"]), &theme).unwrap();

    // The exit half of the state machine — the whole reason this family needs
    // a multi-rule channel instead of `tokens::utility_to_css`.
    assert!(css.contains("[data-state=\"closed\"]"), "{css}");
    assert!(css.contains("visibility: hidden"), "{css}");
    // Hard requirement of this port: `animations::reduced_motion_guard` covers
    // only the keyframe-backed utility channel, so a transition-driven family
    // must ship its own guard, with the same `data-motion` escape hatch.
    assert!(css.contains("prefers-reduced-motion: reduce"), "{css}");
    assert!(css.contains("[data-motion=\"always\"]"), "{css}");
    // Never `@starting-style`/`allow-discrete`: aihu's dialog content is never
    // unmounted, so neither is needed (recipes/dialog.css §"Why not …").
    assert!(!css.contains("@starting-style"), "{css}");
    assert!(!css.contains("allow-discrete"), "{css}");
    // And never `::backdrop` — there is no native `<dialog>` to host it.
    assert!(!css.contains("::backdrop"), "{css}");
}
