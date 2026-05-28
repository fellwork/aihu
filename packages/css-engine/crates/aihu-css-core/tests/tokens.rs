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

#[test]
fn divide_y_bare_defaults_to_1px() {
    assert_eq!(
        css(&["divide-y"]),
        ".divide-y { & > * + * { border-block-width: 1px; } }\n"
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
fn divide_x_4_emits_border_inline_width() {
    assert_eq!(
        css(&["divide-x-4"]),
        ".divide-x-4 { & > * + * { border-inline-width: 4px; } }\n"
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
fn divide_x_8_emits_border_inline_width() {
    assert_eq!(
        css(&["divide-x-8"]),
        ".divide-x-8 { & > * + * { border-inline-width: 8px; } }\n"
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
