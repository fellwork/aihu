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
fn d4_semantic_state_tokens_resolve() {
    // D4 §3.4 (E1 + E2, founder-ratified) — info/success/warning/neutral
    // brand tokens resolve through the same bg-/text-/border- utility path
    // as the original terracotta contract.
    insta::assert_snapshot!(css(&[
        "bg-info",
        "text-info-foreground",
        "bg-success",
        "text-success-foreground",
        "bg-warning",
        "text-warning-foreground",
        "bg-neutral",
        "text-neutral-foreground",
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
fn relational_marker_classes() {
    // `group` / `peer` are marker utilities: they emit an empty-body rule (no
    // declarations) so the class survives into the sheet for `group-*:` /
    // `peer-*:` relational selectors to target. (Variant emission itself is
    // covered in tests/emit.rs, which uses the scoped pipeline.)
    let out = css(&["group", "peer"]);
    assert!(out.contains(".group {  }"), "bare group marker: {out}");
    assert!(out.contains(".peer {  }"), "bare peer marker: {out}");
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

// --- Round 2: divide-x / divide-y sibling borders -------------------------
//
// Reuses the proven `space-*` nested `& > * + *` recipe. Exact-string
// assertions pin every family: bare (1px default), numeric widths, reverse.

#[test]
fn divide_x_bare_defaults_to_1px() {
    assert_eq!(
        css(&["divide-x"]),
        ".divide-x { & > * + * { border-inline-width: 1px; } }\n"
    );
}

// --- New utility families (Round 2: tailwind-support — named scales) -------
//
// Position scale (top/right/bottom/left/inset/inset-x/inset-y) on the spacing
// scale + `auto` + negative forms; named leading-* / numeric leading-<n>;
// named tracking-*. Exact-string assertions pin the emitted declarations.

#[test]
fn position_top_scale() {
    assert_eq!(css(&["top-4"]), ".top-4 { top: 1rem; }\n");
}

#[test]
fn position_right_scale() {
    assert_eq!(css(&["right-4"]), ".right-4 { right: 1rem; }\n");
}

#[test]
fn position_bottom_left_scale() {
    assert_eq!(css(&["bottom-2"]), ".bottom-2 { bottom: 0.5rem; }\n");
    assert_eq!(css(&["left-8"]), ".left-8 { left: 2rem; }\n");
}

#[test]
fn position_inset_all_sides() {
    assert_eq!(css(&["inset-0"]), ".inset-0 { inset: 0; }\n");
    assert_eq!(css(&["inset-4"]), ".inset-4 { inset: 1rem; }\n");
}

#[test]
fn position_inset_logical_axes() {
    assert_eq!(css(&["inset-x-2"]), ".inset-x-2 { inset-inline: 0.5rem; }\n");
    assert_eq!(css(&["inset-y-4"]), ".inset-y-4 { inset-block: 1rem; }\n");
}

#[test]
fn position_auto() {
    assert_eq!(css(&["top-auto"]), ".top-auto { top: auto; }\n");
}

#[test]
fn position_negative() {
    assert_eq!(css(&["-left-2"]), ".-left-2 { left: -0.5rem; }\n");
    assert_eq!(css(&["-top-4"]), ".-top-4 { top: -1rem; }\n");
    assert_eq!(css(&["-inset-x-2"]), ".-inset-x-2 { inset-inline: -0.5rem; }\n");
}

#[test]
fn leading_named_scale() {
    assert_eq!(css(&["leading-none"]), ".leading-none { line-height: 1; }\n");
    assert_eq!(css(&["leading-tight"]), ".leading-tight { line-height: 1.25; }\n");
    assert_eq!(css(&["leading-snug"]), ".leading-snug { line-height: 1.375; }\n");
    assert_eq!(css(&["leading-normal"]), ".leading-normal { line-height: 1.5; }\n");
    assert_eq!(
        css(&["leading-relaxed"]),
        ".leading-relaxed { line-height: 1.625; }\n"
    );
    assert_eq!(css(&["leading-loose"]), ".leading-loose { line-height: 2; }\n");
}

#[test]
fn leading_numeric_step() {
    // Numeric leading-<n> maps to the spacing scale (Tailwind v4).
    assert_eq!(css(&["leading-6"]), ".leading-6 { line-height: 1.5rem; }\n");
}

#[test]
fn tracking_named_scale() {
    assert_eq!(
        css(&["tracking-tighter"]),
        ".tracking-tighter { letter-spacing: -0.05em; }\n"
    );
    assert_eq!(
        css(&["tracking-tight"]),
        ".tracking-tight { letter-spacing: -0.025em; }\n"
    );
    assert_eq!(
        css(&["tracking-normal"]),
        ".tracking-normal { letter-spacing: 0em; }\n"
    );
    assert_eq!(
        css(&["tracking-wide"]),
        ".tracking-wide { letter-spacing: 0.025em; }\n"
    );
    assert_eq!(
        css(&["tracking-wider"]),
        ".tracking-wider { letter-spacing: 0.05em; }\n"
    );
    assert_eq!(
        css(&["tracking-widest"]),
        ".tracking-widest { letter-spacing: 0.1em; }\n"
    );
}

// --- New utility families (Round 2: ring widths + ring-offset) -------------
//
// `ring-{n}` emits the Tailwind v4 box-shadow ring composed from `--tw-ring-*`
// custom properties; `ring-offset-{n}` sets `--tw-ring-offset-width`;
// `ring-inset` flips the inset slot; bare `ring` is the 3px default. CRITICAL
// regression guard: `ring-<color>` must STILL route to `--tw-ring-color`.

#[test]
fn ring_n_emits_box_shadow_ring() {
    assert_eq!(
        css(&["ring-2"]),
        ".ring-2 { --tw-ring-offset-shadow: var(--tw-ring-inset) 0 0 0 \
var(--tw-ring-offset-width) var(--tw-ring-offset-color); \
--tw-ring-shadow: var(--tw-ring-inset) 0 0 0 calc(2px + var(--tw-ring-offset-width)) \
var(--tw-ring-color); box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow), \
var(--tw-shadow, 0 0 #0000); }\n"
    );
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

// --- Round 2: container-query marker utilities (aria-data-container) -------
//
// The `@container` marker and its named `@container/<name>` form are base
// utilities (the `@sm:`/`@md:`/`@lg:` query variants live in variants.rs /
// emit.rs and are exercised in tests/emit.rs).

#[test]
fn container_marker_emits_inline_size() {
    assert_eq!(
        css(&["@container"]),
        ".@container { container-type: inline-size; }\n"
    );
}

#[test]
fn divide_y_bare_defaults_to_1px() {
    assert_eq!(
        css(&["divide-y"]),
        ".divide-y { & > * + * { border-block-width: 1px; } }\n"
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
fn ring_default_is_3px() {
    // The bare `ring` keyword is the 3px default and must match BEFORE the
    // color path (it never collides with `ring-<color>`).
    assert!(css(&["ring"]).contains("calc(3px + var(--tw-ring-offset-width))"));
    assert!(css(&["ring"]).starts_with(".ring {"));
}

#[test]
fn ring_zero_emits_zero_width_ring() {
    assert!(css(&["ring-0"]).contains("calc(0px + var(--tw-ring-offset-width))"));
}

#[test]
fn ring_inset_flips_inset_slot() {
    assert_eq!(css(&["ring-inset"]), ".ring-inset { --tw-ring-inset: inset; }\n");
}

#[test]
fn ring_offset_n_sets_offset_width() {
    assert_eq!(
        css(&["ring-offset-2"]),
        ".ring-offset-2 { --tw-ring-offset-width: 2px; }\n"
    );
    assert_eq!(
        css(&["ring-offset-8"]),
        ".ring-offset-8 { --tw-ring-offset-width: 8px; }\n"
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
fn divide_y_2_emits_border_block_width() {
    assert_eq!(
        css(&["divide-y-2"]),
        ".divide-y-2 { & > * + * { border-block-width: 2px; } }\n"
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
fn divide_x_4_emits_border_inline_width() {
    assert_eq!(
        css(&["divide-x-4"]),
        ".divide-x-4 { & > * + * { border-inline-width: 4px; } }\n"
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
fn divide_x_0_emits_zero_width() {
    assert_eq!(
        css(&["divide-x-0"]),
        ".divide-x-0 { & > * + * { border-inline-width: 0; } }\n"
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
fn divide_x_8_emits_border_inline_width() {
    assert_eq!(
        css(&["divide-x-8"]),
        ".divide-x-8 { & > * + * { border-inline-width: 8px; } }\n"
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
fn divide_reverse_sets_custom_property() {
    assert_eq!(
        css(&["divide-x-reverse"]),
        ".divide-x-reverse { & > * + * { --tw-divide-x-reverse: 1; } }\n"
    );
    assert_eq!(
        css(&["divide-y-reverse"]),
        ".divide-y-reverse { & > * + * { --tw-divide-y-reverse: 1; } }\n"
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
fn arbitrary_position_and_leading_still_work() {
    // Regression: arbitrary forms (arbitrary_prop) untouched by the named scale.
    assert_eq!(css(&["top-[1rem]"]), ".top-[1rem] { top: 1rem; }\n");
    assert_eq!(css(&["leading-[2]"]), ".leading-[2] { line-height: 2; }\n");
}

#[test]
fn ring_color_still_routes_to_ring_color_var() {
    // Regression: adding the WIDTH side must NOT break the existing COLOR path.
    assert_eq!(
        css(&["ring-blue-500"]),
        ".ring-blue-500 { --tw-ring-color: var(--color-blue-500); }\n"
    );
    // Brand ring token too.
    assert_eq!(
        css(&["ring-primary"]),
        ".ring-primary { --tw-ring-color: var(--color-primary); }\n"
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

#[test]
fn animate_delay_and_duration_emit_milliseconds() {
    assert_eq!(
        css(&["animate-delay-200"]),
        ".animate-delay-200 { animation-delay: 200ms; }\n"
    );
    assert_eq!(
        css(&["animate-duration-750"]),
        ".animate-duration-750 { animation-duration: 750ms; }\n"
    );
}

#[test]
fn animate_iteration_count_emits_number_or_infinite() {
    assert_eq!(
        css(&["animate-iteration-count-3"]),
        ".animate-iteration-count-3 { animation-iteration-count: 3; }\n"
    );
    assert_eq!(
        css(&["animate-iteration-count-infinite"]),
        ".animate-iteration-count-infinite { animation-iteration-count: infinite; }\n"
    );
}

#[test]
fn animate_fill_mode_emits_all_four_keywords() {
    for (class, value) in [
        ("animate-fill-mode-none", "none"),
        ("animate-fill-mode-forwards", "forwards"),
        ("animate-fill-mode-backwards", "backwards"),
        ("animate-fill-mode-both", "both"),
    ] {
        assert_eq!(
            css(&[class]),
            format!(".{class} {{ animation-fill-mode: {value}; }}\n")
        );
    }
}

#[test]
fn animate_direction_emits_all_four_keywords() {
    for (class, value) in [
        ("animate-direction-normal", "normal"),
        ("animate-direction-reverse", "reverse"),
        ("animate-direction-alternate", "alternate"),
        ("animate-direction-alternate-reverse", "alternate-reverse"),
    ] {
        assert_eq!(
            css(&[class]),
            format!(".{class} {{ animation-direction: {value}; }}\n")
        );
    }
}

#[test]
fn animate_play_state_emits_running_and_paused() {
    assert_eq!(
        css(&["animate-play-running"]),
        ".animate-play-running { animation-play-state: running; }\n"
    );
    assert_eq!(
        css(&["animate-play-paused"]),
        ".animate-play-paused { animation-play-state: paused; }\n"
    );
}

#[test]
fn animate_ease_family_emits_animation_timing_function() {
    // Distinct from the existing ease-*/ease-linear utilities, which target
    // transition-timing-function.
    assert_eq!(
        css(&["animate-ease"]),
        ".animate-ease { animation-timing-function: ease; }\n"
    );
    assert_eq!(
        css(&["animate-ease-in"]),
        ".animate-ease-in { animation-timing-function: ease-in; }\n"
    );
    assert_eq!(
        css(&["animate-ease-out"]),
        ".animate-ease-out { animation-timing-function: ease-out; }\n"
    );
    assert_eq!(
        css(&["animate-ease-in-out"]),
        ".animate-ease-in-out { animation-timing-function: ease-in-out; }\n"
    );
    assert_eq!(
        css(&["animate-linear"]),
        ".animate-linear { animation-timing-function: linear; }\n"
    );
}

#[test]
fn animate_steps_emits_steps_function() {
    assert_eq!(
        css(&["animate-steps-4"]),
        ".animate-steps-4 { animation-timing-function: steps(4); }\n"
    );
}

#[test]
fn animate_bezier_arbitrary_value_emits_animation_timing_function() {
    assert_eq!(
        css(&["animate-bezier-[.4,0,.2,1]"]),
        ".animate-bezier-[.4,0,.2,1] { animation-timing-function: .4,0,.2,1; }\n"
    );
}

#[test]
fn animate_slide_distance_arbitrary_value_sets_custom_property() {
    // tailwind-animations port, Slice 5 — sets the custom property the ported
    // slide-* keyframes read via var(--aihu-anim-slide-distance, 20px).
    assert_eq!(
        css(&["animate-slide-distance-[32px]"]),
        ".animate-slide-distance-[32px] { --aihu-anim-slide-distance: 32px; }\n"
    );
}

#[test]
fn named_container_marker_emits_type_and_name() {
    assert_eq!(
        css(&["@container/sidebar"]),
        ".@container/sidebar { container-type: inline-size; container-name: sidebar; }\n"
    );
}

// ── Issue #280: dictionary misses, grid arbitrary, opacity modifiers ─────────

#[test]
fn font_family_utilities_emit() {
    assert_eq!(css(&["font-mono"]), ".font-mono { font-family: var(--font-mono); }\n");
    assert_eq!(css(&["font-sans"]), ".font-sans { font-family: var(--font-sans); }\n");
}

#[test]
fn bare_directional_borders_emit_1px() {
    assert_eq!(css(&["border-t"]), ".border-t { border-top-width: 1px; }\n");
    assert_eq!(css(&["border-r"]), ".border-r { border-right-width: 1px; }\n");
    assert_eq!(css(&["border-b"]), ".border-b { border-bottom-width: 1px; }\n");
    assert_eq!(css(&["border-l"]), ".border-l { border-left-width: 1px; }\n");
    assert_eq!(css(&["border-x"]), ".border-x { border-inline-width: 1px; }\n");
    assert_eq!(css(&["border-y"]), ".border-y { border-block-width: 1px; }\n");
}

#[test]
fn grid_arbitrary_template_columns_emits() {
    assert_eq!(
        css(&["grid-cols-[2fr_1fr_1fr_1.5fr_1.5fr]"]),
        ".grid-cols-[2fr_1fr_1fr_1.5fr_1.5fr] { grid-template-columns: 2fr 1fr 1fr 1.5fr 1.5fr; }\n"
    );
    assert_eq!(
        css(&["grid-rows-[auto_1fr]"]),
        ".grid-rows-[auto_1fr] { grid-template-rows: auto 1fr; }\n"
    );
}

#[test]
fn color_opacity_modifier_emits_color_mix() {
    assert_eq!(
        css(&["bg-accent/15"]),
        ".bg-accent/15 { background-color: color-mix(in oklab, var(--color-accent) 15%, transparent); }\n"
    );
    assert_eq!(
        css(&["bg-primary/50"]),
        ".bg-primary/50 { background-color: color-mix(in oklab, var(--color-primary) 50%, transparent); }\n"
    );
    assert_eq!(
        css(&["text-red-500/30"]),
        ".text-red-500/30 { color: color-mix(in oklab, var(--color-red-500) 30%, transparent); }\n"
    );
}

#[test]
fn sizing_fraction_not_treated_as_opacity() {
    // `w-1/2` is a width fraction, not a color opacity — must stay 50%.
    assert_eq!(css(&["w-1/2"]), ".w-1/2 { width: 50%; }\n");
}
