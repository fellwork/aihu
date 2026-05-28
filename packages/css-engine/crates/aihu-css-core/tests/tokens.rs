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
