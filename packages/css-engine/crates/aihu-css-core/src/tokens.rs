//! Tailwind v4 utility-class → CSS mapping.
//!
//! Strategy (Plan 2 Task 3, decision `decision-css-hard-fork-vs-upstream`):
//! we take *inspiration* from Tailwind v4, not a source merge. The table is a
//! hybrid:
//!
//! - **Regular grids** (spacing, the standard color palette, font-size, etc.)
//!   are generated algorithmically from compact data tables — no wall of
//!   literals, and the spacing scale derives from a single `* 0.25rem` rule.
//! - **The long tail** (display, flex, position, text-align, …) is a
//!   hand-written `match` of fixed property/value pairs.
//! - **Arbitrary values** (`bg-[#1a1d24]`, `w-[34ch]`, `text-[14px]`) are
//!   parsed by [`parse_arbitrary`] and emitted verbatim.
//!
//! Brand color tokens (`bg-primary`, `text-accent`, …) resolve to
//! `var(--color-*)` custom properties registered by the `@theme` registry
//! (`theme.rs`) so authored `@theme` overrides cascade through.

/// Emit the **conflict-group map**: `(class-prefix, group-key)` pairs derived
/// directly from the utility registry's own property maps (`spacing_prop`,
/// `sizing_prop`, `color_prop`, `arbitrary_prop`). Two utilities conflict (last
/// wins) when they share a group key — the group key is the CSS property the
/// prefix controls, so `p-2`/`p-4` (both `padding`) conflict, while `p-2`/`mx-4`
/// (`padding` vs `margin-inline`) do not.
///
/// This is the single source of truth the engine's build step serializes into
/// the TS `cn()` conflict map (Plan 3 Task 9) — so the runtime merge map NEVER
/// drifts from the compile-time utility table. Plus a few fixed-utility groups
/// (display, position) whose whole-class names share a property.
pub fn conflict_groups() -> Vec<(&'static str, &'static str)> {
    let mut out: Vec<(&'static str, &'static str)> = Vec::new();

    // Prefix-based utilities: prefix → its controlled CSS property (the group).
    const SPACING_PREFIXES: &[&str] = &[
        "p", "px", "py", "pt", "pr", "pb", "pl", "m", "mx", "my", "mt", "mr",
        "mb", "ml", "gap", "gap-x", "gap-y",
    ];
    for p in SPACING_PREFIXES {
        if let Some(group) = spacing_prop(p) {
            out.push((p, group));
        }
    }

    const SIZING_PREFIXES: &[&str] = &["w", "h", "min-w", "max-w", "min-h", "max-h"];
    for p in SIZING_PREFIXES {
        if let Some(group) = sizing_prop(p) {
            out.push((p, group));
        }
    }

    const COLOR_PREFIXES: &[&str] =
        &["bg", "text", "border", "fill", "stroke", "ring", "outline"];
    for p in COLOR_PREFIXES {
        if let Some(group) = color_prop(p) {
            out.push((p, group));
        }
    }

    // A handful of non-color/spacing parameterized prefixes with their own group.
    out.push(("z", "z-index"));
    out.push(("opacity", "opacity"));
    out.push(("rounded", "border-radius"));
    out.push(("shadow", "box-shadow"));
    out.push(("font", "font-weight"));

    out
}

/// Map a single (already variant-stripped) utility class name to its CSS body
/// (declarations only, no selector). Returns `None` for unknown utilities.
pub fn utility_to_css(class_name: &str) -> Option<String> {
    // 1. Arbitrary-value bracket syntax: bg-[#1a1d24], w-[34ch], text-[14px].
    if let Some(css) = parse_arbitrary(class_name) {
        return Some(css);
    }

    // 2. Fixed long-tail utilities (no value parameter).
    if let Some(css) = fixed_utility(class_name) {
        return Some(css.to_string());
    }

    // 3. Parameterized utilities split on the LAST `-` (prefix + value).
    if let Some(idx) = class_name.rfind('-') {
        let (prefix, value) = (&class_name[..idx], &class_name[idx + 1..]);
        if let Some(css) = parameterized_utility(prefix, value) {
            return Some(css);
        }
    }
    // Whole-token color utilities like `bg-primary` (value = brand token).
    if let Some(css) = brand_color_utility(class_name) {
        return Some(css);
    }

    None
}

/// Parse `prefix-[value]` arbitrary-value syntax. The bracket content is
/// emitted verbatim into the mapped CSS property (edge E7).
pub fn parse_arbitrary(class_name: &str) -> Option<String> {
    let open = class_name.find("-[")?;
    if !class_name.ends_with(']') {
        return None;
    }
    let prefix = &class_name[..open];
    let value = &class_name[open + 2..class_name.len() - 1];
    let prop = arbitrary_prop(prefix)?;
    // Underscores in arbitrary values stand for spaces (Tailwind convention).
    let value = value.replace('_', " ");
    Some(format!("{prop}: {value};"))
}

/// Map an arbitrary-value prefix to its CSS property.
fn arbitrary_prop(prefix: &str) -> Option<&'static str> {
    Some(match prefix {
        "bg" => "background-color",
        "text" => "color",
        "w" => "width",
        "h" => "height",
        "min-w" => "min-width",
        "max-w" => "max-width",
        "min-h" => "min-height",
        "max-h" => "max-height",
        "p" => "padding",
        "px" => "padding-inline",
        "py" => "padding-block",
        "m" => "margin",
        "mx" => "margin-inline",
        "my" => "margin-block",
        "gap" => "gap",
        "rounded" => "border-radius",
        "border" => "border-width",
        "leading" => "line-height",
        "tracking" => "letter-spacing",
        "z" => "z-index",
        "top" => "top",
        "right" => "right",
        "bottom" => "bottom",
        "left" => "left",
        "inset" => "inset",
        "fill" => "fill",
        "stroke" => "stroke",
        "shadow" => "box-shadow",
        _ => return None,
    })
}

/// Fixed long-tail utilities (display, flex, position, alignment, etc.).
fn fixed_utility(class_name: &str) -> Option<&'static str> {
    Some(match class_name {
        // Display
        "block" => "display: block;",
        "inline-block" => "display: inline-block;",
        "inline" => "display: inline;",
        "flex" => "display: flex;",
        "inline-flex" => "display: inline-flex;",
        "grid" => "display: grid;",
        "inline-grid" => "display: inline-grid;",
        "hidden" => "display: none;",
        "contents" => "display: contents;",

        // Flexbox / grid alignment
        "flex-row" => "flex-direction: row;",
        "flex-col" => "flex-direction: column;",
        "flex-wrap" => "flex-wrap: wrap;",
        "flex-nowrap" => "flex-wrap: nowrap;",
        "flex-1" => "flex: 1 1 0%;",
        "flex-auto" => "flex: 1 1 auto;",
        "flex-none" => "flex: none;",
        "items-start" => "align-items: flex-start;",
        "items-center" => "align-items: center;",
        "items-end" => "align-items: flex-end;",
        "items-stretch" => "align-items: stretch;",
        "items-baseline" => "align-items: baseline;",
        "justify-start" => "justify-content: flex-start;",
        "justify-center" => "justify-content: center;",
        "justify-end" => "justify-content: flex-end;",
        "justify-between" => "justify-content: space-between;",
        "justify-around" => "justify-content: space-around;",
        "justify-evenly" => "justify-content: space-evenly;",

        // Position
        "static" => "position: static;",
        "relative" => "position: relative;",
        "absolute" => "position: absolute;",
        "fixed" => "position: fixed;",
        "sticky" => "position: sticky;",

        // Overflow
        "overflow-hidden" => "overflow: hidden;",
        "overflow-auto" => "overflow: auto;",
        "overflow-scroll" => "overflow: scroll;",
        "overflow-visible" => "overflow: visible;",

        // Typography
        "text-left" => "text-align: left;",
        "text-center" => "text-align: center;",
        "text-right" => "text-align: right;",
        "text-justify" => "text-align: justify;",
        "italic" => "font-style: italic;",
        "not-italic" => "font-style: normal;",
        "underline" => "text-decoration-line: underline;",
        "line-through" => "text-decoration-line: line-through;",
        "no-underline" => "text-decoration-line: none;",
        "uppercase" => "text-transform: uppercase;",
        "lowercase" => "text-transform: lowercase;",
        "capitalize" => "text-transform: capitalize;",
        "truncate" => "overflow: hidden; text-overflow: ellipsis; white-space: nowrap;",
        "font-thin" => "font-weight: 100;",
        "font-normal" => "font-weight: 400;",
        "font-medium" => "font-weight: 500;",
        "font-semibold" => "font-weight: 600;",
        "font-bold" => "font-weight: 700;",
        "font-black" => "font-weight: 900;",

        // Borders / effects
        "border" => "border-width: 1px;",
        "rounded" => "border-radius: 0.25rem;",
        "rounded-none" => "border-radius: 0;",
        "rounded-sm" => "border-radius: 0.125rem;",
        "rounded-md" => "border-radius: 0.375rem;",
        "rounded-lg" => "border-radius: 0.5rem;",
        "rounded-xl" => "border-radius: 0.75rem;",
        "rounded-2xl" => "border-radius: 1rem;",
        "rounded-full" => "border-radius: 9999px;",
        "shadow" => "box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);",
        "shadow-sm" => "box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);",
        "shadow-md" => "box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);",
        "shadow-lg" => "box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);",
        "shadow-none" => "box-shadow: none;",

        // Relational marker classes. `group` / `peer` carry no styles of their
        // own — they mark an ancestor / previous-sibling so that `group-*:` /
        // `peer-*:` variant rules on other elements can target their state. We
        // emit an EMPTY-body rule (`.group {  }`) rather than returning `None`
        // so the scanner keeps the class in the utility set and the marker
        // survives into the shadow `<style>` (a dropped class would break the
        // relational selectors that reference `.group` / `.peer`).
        "group" => "",
        "peer" => "",

        // Width / height keywords
        "w-full" => "width: 100%;",
        "w-screen" => "width: 100vw;",
        "w-auto" => "width: auto;",
        "h-full" => "height: 100%;",
        "h-screen" => "height: 100vh;",
        "h-auto" => "height: auto;",

        _ => return None,
    })
}

/// Parameterized utilities split on the last `-`: `p-4`, `text-lg`, `gap-2`,
/// `text-red-500` (handled via [`palette_color`]), `z-10`, etc.
fn parameterized_utility(prefix: &str, value: &str) -> Option<String> {
    // Spacing scale: p/px/py/pt/pr/pb/pl, m/mx/my/…, gap, space — value × 0.25rem.
    if let Some(prop) = spacing_prop(prefix) {
        if let Some(rem) = spacing_value(value) {
            return Some(format!("{prop}: {rem};"));
        }
    }

    // Sizing: w-/h-/min-w-/max-w- with the spacing scale or fractions.
    if let Some(prop) = sizing_prop(prefix) {
        if let Some(v) = sizing_value(value) {
            return Some(format!("{prop}: {v};"));
        }
    }

    // Font size (with paired line-height, Tailwind defaults).
    if prefix == "text" {
        if let Some(css) = font_size(value) {
            return Some(css.to_string());
        }
        // text-<color>-<shade> falls through to the color path below.
    }

    // Border radius scale already covered by fixed_utility for named sizes.

    // z-index.
    if prefix == "z" {
        if value.chars().all(|c| c.is_ascii_digit()) {
            return Some(format!("z-index: {value};"));
        }
    }

    // opacity.
    if prefix == "opacity" {
        if let Ok(n) = value.parse::<f32>() {
            return Some(format!("opacity: {};", n / 100.0));
        }
    }

    // Palette colors: bg-red-500, text-slate-700, border-emerald-300.
    if let Some(prop) = color_prop(prefix) {
        // prefix already stripped to the color path; value is the shade only
        // when the full name was `prefix-color-shade`. We handle that in the
        // caller via the full-string brand path; here handle `prefix-keyword`.
        if let Some(color) = named_keyword_color(value) {
            return Some(format!("{prop}: {color};"));
        }
    }

    None
}

/// Whole-token brand + palette color utilities: `bg-primary`, `text-accent`,
/// `bg-red-500`. Brand tokens resolve to `var(--color-*)`; palette tokens to
/// concrete oklch values.
fn brand_color_utility(class_name: &str) -> Option<String> {
    // Split into <prefix>-<rest> where rest is the color name (may contain `-`).
    let idx = class_name.find('-')?;
    let (prefix, rest) = (&class_name[..idx], &class_name[idx + 1..]);
    let prop = color_prop(prefix)?;

    // Brand tokens: primary, secondary, accent, surface, muted, foreground, …
    if is_brand_token(rest) {
        return Some(format!("{prop}: var(--color-{rest});"));
    }
    // Palette: red-500, slate-700 → var(--color-red-500) (registered by theme).
    if is_palette_token(rest) {
        return Some(format!("{prop}: var(--color-{rest});"));
    }
    // Bare keyword colors: white/black/transparent/current.
    if let Some(color) = named_keyword_color(rest) {
        return Some(format!("{prop}: {color};"));
    }
    None
}

fn color_prop(prefix: &str) -> Option<&'static str> {
    Some(match prefix {
        "bg" => "background-color",
        "text" => "color",
        "border" => "border-color",
        "fill" => "fill",
        "stroke" => "stroke",
        "ring" => "--tw-ring-color",
        "outline" => "outline-color",
        _ => return None,
    })
}

fn is_brand_token(name: &str) -> bool {
    matches!(
        name,
        "primary"
            | "primary-foreground"
            | "secondary"
            | "secondary-foreground"
            | "accent"
            | "accent-foreground"
            | "surface"
            | "surface-foreground"
            | "background"
            | "foreground"
            | "muted"
            | "muted-foreground"
            | "border"
            | "ring"
            | "destructive"
            | "destructive-foreground"
    )
}

/// `red-500`, `slate-700`, etc. — palette family + numeric shade.
fn is_palette_token(name: &str) -> bool {
    let Some((family, shade)) = name.rsplit_once('-') else {
        return false;
    };
    const FAMILIES: &[&str] = &[
        "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber",
        "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue",
        "indigo", "violet", "purple", "fuchsia", "pink", "rose",
    ];
    FAMILIES.contains(&family)
        && matches!(
            shade,
            "50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "950"
        )
}

fn named_keyword_color(name: &str) -> Option<&'static str> {
    Some(match name {
        "white" => "#fff",
        "black" => "#000",
        "transparent" => "transparent",
        "current" => "currentColor",
        "inherit" => "inherit",
        _ => return None,
    })
}

fn spacing_prop(prefix: &str) -> Option<&'static str> {
    Some(match prefix {
        "p" => "padding",
        "px" => "padding-inline",
        "py" => "padding-block",
        "pt" => "padding-top",
        "pr" => "padding-right",
        "pb" => "padding-bottom",
        "pl" => "padding-left",
        "m" => "margin",
        "mx" => "margin-inline",
        "my" => "margin-block",
        "mt" => "margin-top",
        "mr" => "margin-right",
        "mb" => "margin-bottom",
        "ml" => "margin-left",
        "gap" => "gap",
        "gap-x" => "column-gap",
        "gap-y" => "row-gap",
        _ => return None,
    })
}

/// Tailwind spacing scale: numeric → `n * 0.25rem`; `px` → `1px`; `0` → `0`.
fn spacing_value(value: &str) -> Option<String> {
    if value == "px" {
        return Some("1px".to_string());
    }
    if value == "0" {
        return Some("0".to_string());
    }
    // Fractional steps like `0.5`, `1.5`, `2.5`.
    let n: f32 = value.parse().ok()?;
    let rem = n * 0.25;
    Some(format!("{}rem", trim_float(rem)))
}

fn sizing_prop(prefix: &str) -> Option<&'static str> {
    Some(match prefix {
        "w" => "width",
        "h" => "height",
        "min-w" => "min-width",
        "max-w" => "max-width",
        "min-h" => "min-height",
        "max-h" => "max-height",
        _ => return None,
    })
}

fn sizing_value(value: &str) -> Option<String> {
    // Fractions: w-1/2 → 50%.
    if let Some((num, den)) = value.split_once('/') {
        let n: f32 = num.parse().ok()?;
        let d: f32 = den.parse().ok()?;
        if d != 0.0 {
            return Some(format!("{}%", trim_float(n / d * 100.0)));
        }
    }
    // Numeric spacing scale.
    spacing_value(value)
}

/// Font-size scale (size + matched line-height), Tailwind defaults.
fn font_size(value: &str) -> Option<&'static str> {
    Some(match value {
        "xs" => "font-size: 0.75rem; line-height: 1rem;",
        "sm" => "font-size: 0.875rem; line-height: 1.25rem;",
        "base" => "font-size: 1rem; line-height: 1.5rem;",
        "lg" => "font-size: 1.125rem; line-height: 1.75rem;",
        "xl" => "font-size: 1.25rem; line-height: 1.75rem;",
        "2xl" => "font-size: 1.5rem; line-height: 2rem;",
        "3xl" => "font-size: 1.875rem; line-height: 2.25rem;",
        "4xl" => "font-size: 2.25rem; line-height: 2.5rem;",
        "5xl" => "font-size: 3rem; line-height: 1;",
        _ => return None,
    })
}

/// Trim trailing `.0` from a float for clean CSS (`1.0rem` → `1rem`).
fn trim_float(n: f32) -> String {
    if n.fract() == 0.0 {
        format!("{}", n as i64)
    } else {
        let s = format!("{n}");
        s
    }
}
