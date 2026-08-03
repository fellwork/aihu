//! Golden coverage for the ported animation catalog (tailwind-animations port
//! doc, Slice 1). Structural invariants live as unit tests inside
//! `src/animations.rs`; this file is the behavioural/snapshot layer —
//! `utility_to_css`/`animation_keyframes` round-trips, the reduced-motion
//! guard, and the `hover:`/`motion-reduce:` variant paths a recipe-channel
//! design could never have supported (see the port doc §2 decision D-A).

use aihu_css_core::{compile_classes, compile_sfc_scoped, parse_ast, SfcAst};

fn sfc(classes: &str) -> SfcAst {
    parse_ast(&format!(
        r#"{{"tag":"X","astVersion":1,"style":null,"meta":{{"name":"X"}},
        "template":[{{"kind":"element","tag":"div","attrs":[
          {{"kind":"static","name":"class","value":"{classes}"}}
        ],"children":[]}}]}}"#
    ))
    .unwrap()
}

#[test]
fn builtins_are_not_shadowed() {
    for (class, want) in [
        ("animate-spin", "animation: spin 1s linear infinite;"),
        (
            "animate-ping",
            "animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;",
        ),
        (
            "animate-pulse",
            "animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;",
        ),
        ("animate-bounce", "animation: bounce 1s infinite;"),
    ] {
        let css = compile_classes(&[class.to_string()]);
        assert!(css.contains(want), "{class}: {css}");
    }
}

#[test]
fn every_ported_animation_round_trips_through_utility_to_css() {
    for a in aihu_css_core::animations::ANIMATIONS {
        let css = compile_classes(&[a.class.to_string()]);
        assert!(
            css.contains(&format!("animation: {};", a.shorthand)),
            "{}: {css}",
            a.class
        );
        assert!(css.contains(a.keyframes), "{}: {css}", a.class);
    }
}

#[test]
fn slice1_batch_snapshot() {
    let classes: Vec<String> = [
        "animate-fade-in",
        "animate-fade-out",
        "animate-jump",
        "animate-rotate-in",
        "animate-shake",
        "animate-slide-in-left",
        "animate-slide-in-top",
        "animate-zoom-in",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    insta::assert_snapshot!(compile_classes(&classes));
}

#[test]
fn fade_in_alone_is_one_rule_and_one_keyframe_block() {
    insta::assert_snapshot!(compile_classes(&["animate-fade-in".to_string()]));
}

#[test]
fn slice4_fade_cluster_snapshot() {
    let classes: Vec<String> = [
        "animate-blurred-fade-in",
        "animate-fade-in-down",
        "animate-fade-in-left",
        "animate-fade-in-right",
        "animate-fade-in-up",
        "animate-fade-out-down",
        "animate-fade-out-left",
        "animate-fade-out-right",
        "animate-fade-out-up",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    insta::assert_snapshot!(compile_classes(&classes));
}

#[test]
fn slice5_slide_cluster_snapshot() {
    let classes: Vec<String> = [
        "animate-slide-in-bottom",
        "animate-slide-in-right",
        "animate-slide-out-bottom",
        "animate-slide-out-left",
        "animate-slide-out-right",
        "animate-slide-out-top",
        "animate-slide-rotate-in",
        "animate-slide-rotate-out",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    insta::assert_snapshot!(compile_classes(&classes));
}

#[test]
fn slice6_zoom_scale_cluster_snapshot() {
    let classes: Vec<String> = [
        "animate-contract-horizontally",
        "animate-contract-vertically",
        "animate-expand-horizontally",
        "animate-expand-vertically",
        "animate-pop",
        "animate-scale",
        "animate-zoom-out",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    insta::assert_snapshot!(compile_classes(&classes));
}

#[test]
fn slice7_rotate_spin_cluster_snapshot() {
    let classes: Vec<String> = [
        "animate-rotate-180",
        "animate-rotate-360",
        "animate-rotate-90",
        "animate-rotate-out",
        "animate-spin-clockwise",
        "animate-spin-counter-clockwise",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    insta::assert_snapshot!(compile_classes(&classes));
}

#[test]
fn slice8_flip_cluster_snapshot() {
    let classes: Vec<String> = [
        "animate-flip-horizontal",
        "animate-flip-in-x",
        "animate-flip-in-y",
        "animate-flip-out-x",
        "animate-flip-out-y",
        "animate-flip-vertical",
        "animate-flip-x",
        "animate-flip-y",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    insta::assert_snapshot!(compile_classes(&classes));
}

#[test]
fn slice9a_attention_seeker_cluster_snapshot() {
    let classes: Vec<String> = [
        "animate-blink",
        "animate-bouncing",
        "animate-dancing",
        "animate-flash",
        "animate-float",
        "animate-hang",
        "animate-heartbeat",
        "animate-horizontal-bounce",
        "animate-horizontal-vibration",
        "animate-impulse-rotation-left",
        "animate-impulse-rotation-right",
        "animate-jelly",
        "animate-jiggle",
        "animate-pulsing",
        "animate-roll-in",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    insta::assert_snapshot!(compile_classes(&classes));
}

#[test]
fn slice9b_attention_seeker_cluster_snapshot() {
    let classes: Vec<String> = [
        "animate-roll-out",
        "animate-rotational-wave",
        "animate-rubber-band",
        "animate-sink",
        "animate-skew",
        "animate-skew-right",
        "animate-squeeze",
        "animate-sway",
        "animate-swing",
        "animate-swing-drop-in",
        "animate-tada",
        "animate-tilt",
        "animate-vertical-bounce",
        "animate-wobble",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    insta::assert_snapshot!(compile_classes(&classes));
}

#[test]
fn slice10_composites_snapshot() {
    let classes: Vec<String> = [
        "animate-bounce-fade-in",
        "animate-pulse-fade-in",
        "animate-slide-up-fade",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    insta::assert_snapshot!(compile_classes(&classes));
}

#[test]
fn reduced_motion_guard_present_for_used_animation() {
    let css = compile_sfc_scoped(&sfc("animate-shake")).unwrap();
    assert!(css.contains("prefers-reduced-motion: reduce"));
    assert!(css.contains("animation-duration: 1ms !important"));
    assert!(css.contains("data-motion=\"always\""));
}

#[test]
fn reduced_motion_guard_absent_without_ported_animations() {
    let css = compile_sfc_scoped(&sfc("p-4")).unwrap();
    assert!(!css.contains("prefers-reduced-motion"));
}

#[test]
fn hover_variant_on_ported_animation_emits_pseudo_class_rule() {
    // This is the path a recipe-channel design could never support (recipes
    // tree-shake on literal class name only) — see port doc §2, D-A.
    let css = compile_sfc_scoped(&sfc("hover:animate-shake")).unwrap();
    assert!(css.contains(":hover"));
    assert!(css.contains("animation: shake"));
    assert!(css.contains("@keyframes shake"));
}

#[test]
fn motion_reduce_variant_wraps_in_media_query() {
    let css = compile_sfc_scoped(&sfc("motion-reduce:animate-none")).unwrap();
    assert!(css.contains("@media (prefers-reduced-motion: reduce)"));
    assert!(css.contains("animation: none;"));
}

#[test]
fn motion_safe_variant_wraps_in_no_preference_media_query() {
    let css = compile_sfc_scoped(&sfc("motion-safe:animate-fade-in")).unwrap();
    assert!(css.contains("@media (prefers-reduced-motion: no-preference)"));
}

#[test]
fn reduced_motion_guard_does_not_reclamp_an_explicit_motion_reduce_opt_in() {
    // Regression: `motion-reduce:animate-fade-in` used to ALSO get a guard
    // selector forcing `animation-duration: 1ms !important` inside the same
    // `@media (prefers-reduced-motion: reduce)` block the author opted into
    // it for — defeating the whole point of the opt-in variant (D-B·b).
    let css = compile_sfc_scoped(&sfc("motion-reduce:animate-fade-in")).unwrap();
    assert!(css.contains("animation: fade-in"));
    assert!(!css.contains("animation-duration: 1ms !important"));
}

#[test]
fn reduced_motion_guard_skips_a_motion_safe_token_entirely() {
    // `motion-safe:animate-fade-in` only ever exists inside the
    // `no-preference` media block — a guard selector for it under `reduce`
    // could never match anything, dead CSS.
    let css = compile_sfc_scoped(&sfc("motion-safe:animate-fade-in")).unwrap();
    assert!(!css.contains("animation-duration: 1ms !important"));
}

#[test]
fn stacking_a_breakpoint_with_a_motion_variant_keeps_both_conditions() {
    // Regression: `at_rule` used to be a single `Option<String>` overwritten
    // by whichever `@media`-producing variant the loop visited last —
    // `md:motion-safe:animate-fade-in` would keep only ONE of the two
    // conditions, applying the animation at widths/preferences the author
    // explicitly excluded.
    let css = compile_sfc_scoped(&sfc("md:motion-safe:animate-fade-in")).unwrap();
    assert!(css.contains("min-width"));
    assert!(css.contains("prefers-reduced-motion: no-preference"));
    assert!(css.contains(" and "));
}

#[test]
fn reduced_motion_guard_covers_builtin_animations_too() {
    // Regression: the guard only covered `ANIMATIONS` (the ported table),
    // so aihu's pre-existing built-ins — three of them `infinite` — got no
    // reduced-motion treatment at all, unlike the visually-identical ported
    // entries (animate-spin vs animate-rotate-360, etc.).
    let css = compile_sfc_scoped(&sfc("animate-spin")).unwrap();
    assert!(css.contains("prefers-reduced-motion: reduce"));
    assert!(css.contains(".animate-spin:not([data-motion=\"always\"])"));
    assert!(css.contains("animation-duration: 1ms !important"));
}
