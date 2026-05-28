//! Tailwind v4 utility-table coverage — one snapshot per category plus
//! arbitrary-value bracket syntax. Proves the table compiles all six
//! categories (Plan 2 Task 3).

use aihu_css_core::compile_classes;

fn css(classes: &[&str]) -> String {
    compile_classes(&classes.iter().map(|s| s.to_string()).collect::<Vec<_>>())
}

#[test]
fn category_colors() {
    insta::assert_snapshot!(css(&[
        "bg-primary",
        "text-accent",
        "border-muted",
        "bg-red-500",
        "text-slate-700",
        "bg-white",
    ]));
}

#[test]
fn category_spacing() {
    insta::assert_snapshot!(css(&[
        "p-4", "px-2", "py-8", "m-0", "mt-1", "gap-2", "p-0.5"
    ]));
}

#[test]
fn category_layout() {
    insta::assert_snapshot!(css(&[
        "flex",
        "grid",
        "hidden",
        "items-center",
        "justify-between",
        "absolute",
        "w-full",
        "w-1/2",
    ]));
}

#[test]
fn category_typography() {
    insta::assert_snapshot!(css(&[
        "text-lg",
        "text-center",
        "font-bold",
        "italic",
        "underline",
        "uppercase",
        "truncate",
    ]));
}

#[test]
fn category_borders() {
    insta::assert_snapshot!(css(&["border", "rounded", "rounded-lg", "rounded-full",]));
}

#[test]
fn category_effects() {
    insta::assert_snapshot!(css(&["shadow", "shadow-lg", "shadow-none", "opacity-50"]));
}

#[test]
fn arbitrary_values() {
    insta::assert_snapshot!(css(&[
        "bg-[#1a1d24]",
        "w-[34ch]",
        "text-[14px]",
        "p-[2.5rem]",
        "leading-[1.4]",
    ]));
}

// --- New utility families (Round 1: tailwind-support) ---------------------
//
// These use exact-string assertions (not snapshots) so the emitted CSS is
// pinned per-class. The expected declarations mirror Tailwind v4 defaults.

#[test]
fn space_x_emits_nested_sibling_margin() {
    assert_eq!(
        css(&["space-x-4"]),
        ".space-x-4 { & > * + * { margin-inline-start: 1rem; } }\n"
    );
}

#[test]
fn space_y_emits_nested_sibling_margin() {
    assert_eq!(
        css(&["space-y-2"]),
        ".space-y-2 { & > * + * { margin-block-start: 0.5rem; } }\n"
    );
}

#[test]
fn mx_auto_emits_margin_inline_auto() {
    assert_eq!(css(&["mx-auto"]), ".mx-auto { margin-inline: auto; }\n");
}

#[test]
fn max_w_named_scale() {
    assert_eq!(css(&["max-w-7xl"]), ".max-w-7xl { max-width: 80rem; }\n");
    assert_eq!(css(&["max-w-prose"]), ".max-w-prose { max-width: 65ch; }\n");
}

#[test]
fn grid_cols_repeat() {
    assert_eq!(
        css(&["grid-cols-3"]),
        ".grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }\n"
    );
}

#[test]
fn col_span_n() {
    assert_eq!(
        css(&["col-span-2"]),
        ".col-span-2 { grid-column: span 2 / span 2; }\n"
    );
}

#[test]
fn row_span_full_keyword() {
    assert_eq!(
        css(&["row-span-full"]),
        ".row-span-full { grid-row: 1 / -1; }\n"
    );
}

#[test]
fn border_n_width() {
    assert_eq!(css(&["border-2"]), ".border-2 { border-width: 2px; }\n");
}

#[test]
fn border_directional_n_width() {
    assert_eq!(
        css(&["border-t-4"]),
        ".border-t-4 { border-top-width: 4px; }\n"
    );
}

#[test]
fn z_auto_keyword() {
    assert_eq!(css(&["z-auto"]), ".z-auto { z-index: auto; }\n");
}

// --- Motion family (Round 2: tailwind-support `motion` track) -------------

#[test]
fn transform_keyword_and_none() {
    assert_eq!(
        css(&["transform"]),
        ".transform { transform: translate(0, 0) rotate(0) skewX(0) skewY(0) scaleX(1) scaleY(1); }\n"
    );
    assert_eq!(
        css(&["transform-none"]),
        ".transform-none { transform: none; }\n"
    );
}

#[test]
fn translate_x_uses_spacing_scale() {
    assert_eq!(
        css(&["translate-x-2"]),
        ".translate-x-2 { transform: translateX(0.5rem); }\n"
    );
}

#[test]
fn negative_translate_x_emits_negative_value() {
    assert_eq!(
        css(&["-translate-x-2"]),
        ".-translate-x-2 { transform: translateX(-0.5rem); }\n"
    );
}

#[test]
fn negative_translate_y_emits_negative_value() {
    assert_eq!(
        css(&["-translate-y-4"]),
        ".-translate-y-4 { transform: translateY(-1rem); }\n"
    );
}

#[test]
fn rotate_emits_degrees() {
    assert_eq!(
        css(&["rotate-45"]),
        ".rotate-45 { transform: rotate(45deg); }\n"
    );
}

#[test]
fn negative_rotate_emits_negative_degrees() {
    assert_eq!(
        css(&["-rotate-45"]),
        ".-rotate-45 { transform: rotate(-45deg); }\n"
    );
}

#[test]
fn scale_maps_percent_to_factor() {
    assert_eq!(
        css(&["scale-105"]),
        ".scale-105 { transform: scale(1.05); }\n"
    );
    assert_eq!(
        css(&["scale-x-50"]),
        ".scale-x-50 { transform: scaleX(0.5); }\n"
    );
    assert_eq!(
        css(&["scale-y-100"]),
        ".scale-y-100 { transform: scaleY(1); }\n"
    );
}

#[test]
fn transition_colors_emits_property_duration_timing() {
    assert_eq!(
        css(&["transition-colors"]),
        ".transition-colors { transition-property: color, background-color, border-color, text-decoration-color, fill, stroke; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }\n"
    );
}

#[test]
fn transition_none_and_transform_variants() {
    assert_eq!(
        css(&["transition-none"]),
        ".transition-none { transition-property: none; }\n"
    );
    assert!(css(&["transition-transform"]).contains("transition-property: transform;"));
    assert!(css(&["transition-opacity"]).contains("transition-property: opacity;"));
    assert!(css(&["transition-all"]).contains("transition-property: all;"));
    assert!(css(&["transition"]).contains("transition-duration: 150ms;"));
}

#[test]
fn duration_emits_milliseconds() {
    assert_eq!(
        css(&["duration-300"]),
        ".duration-300 { transition-duration: 300ms; }\n"
    );
}

#[test]
fn ease_timing_functions() {
    assert_eq!(
        css(&["ease-linear"]),
        ".ease-linear { transition-timing-function: linear; }\n"
    );
    assert!(css(&["ease-in"]).contains("cubic-bezier(0.4, 0, 1, 1)"));
    assert!(css(&["ease-out"]).contains("cubic-bezier(0, 0, 0.2, 1)"));
    assert!(css(&["ease-in-out"]).contains("cubic-bezier(0.4, 0, 0.2, 1)"));
}

#[test]
fn animate_spin_emits_animation_and_keyframes() {
    // The animation shorthand AND its hoisted @keyframes (sibling rule).
    assert_eq!(
        css(&["animate-spin"]),
        ".animate-spin { animation: spin 1s linear infinite; }\n\
         @keyframes spin { to { transform: rotate(360deg); } }\n"
    );
}

#[test]
fn animate_none_has_no_keyframes() {
    assert_eq!(
        css(&["animate-none"]),
        ".animate-none { animation: none; }\n"
    );
}

#[test]
fn animate_ping_pulse_bounce_emit_keyframes() {
    assert!(css(&["animate-ping"]).contains("@keyframes ping"));
    assert!(css(&["animate-pulse"]).contains("@keyframes pulse"));
    assert!(css(&["animate-bounce"]).contains("@keyframes bounce"));
    assert!(css(&["animate-bounce"]).contains("animation: bounce 1s infinite;"));
}
