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
