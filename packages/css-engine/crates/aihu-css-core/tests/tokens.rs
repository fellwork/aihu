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
    insta::assert_snapshot!(css(&["p-4", "px-2", "py-8", "m-0", "mt-1", "gap-2", "p-0.5"]));
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
    insta::assert_snapshot!(css(&[
        "border",
        "rounded",
        "rounded-lg",
        "rounded-full",
    ]));
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
