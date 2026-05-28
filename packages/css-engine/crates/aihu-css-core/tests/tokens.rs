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

/// Auto-margins + named min/max width/height keyword utilities (round 7b).
/// Spot-check coverage rather than a full snapshot so the long list stays
/// readable and additions to the table don't churn the test.
#[test]
fn sizing_and_auto_margin_keywords() {
    let out = css(&[
        "mx-auto",
        "my-auto",
        "ms-auto",
        "max-w-7xl",
        "max-w-prose",
        "max-w-full",
        "min-w-fit",
        "max-h-screen",
        "min-h-min",
    ]);
    assert!(
        out.contains(".mx-auto { margin-inline: auto; }"),
        "mx-auto missing in: {out}"
    );
    assert!(
        out.contains(".my-auto { margin-block: auto; }"),
        "my-auto missing in: {out}"
    );
    assert!(
        out.contains(".ms-auto { margin-inline-start: auto; }"),
        "ms-auto missing in: {out}"
    );
    assert!(
        out.contains(".max-w-7xl { max-width: 80rem; }"),
        "max-w-7xl missing in: {out}"
    );
    assert!(
        out.contains(".max-w-prose { max-width: 65ch; }"),
        "max-w-prose missing in: {out}"
    );
    assert!(
        out.contains(".max-w-full { max-width: 100%; }"),
        "max-w-full missing in: {out}"
    );
    assert!(
        out.contains(".min-w-fit { min-width: fit-content; }"),
        "min-w-fit missing in: {out}"
    );
    assert!(
        out.contains(".max-h-screen { max-height: 100vh; }"),
        "max-h-screen missing in: {out}"
    );
    assert!(
        out.contains(".min-h-min { min-height: min-content; }"),
        "min-h-min missing in: {out}"
    );
}
