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
        "p", "px", "py", "pt", "pr", "pb", "pl", "m", "mx", "my", "mt", "mr", "mb", "ml", "gap",
        "gap-x", "gap-y",
    ];
    for p in SPACING_PREFIXES {
        if let Some(group) = spacing_prop(p) {
            out.push((p, group));
        }
    }

    // `space-x-*` / `space-y-*` emit nested sibling-margin rules. The group
    // key is the inner declaration so `space-x-2` and `space-x-4` collide
    // (last wins), while `space-x-*` and `space-y-*` do not collide with
    // each other.
    out.push(("space-x", "space-x"));
    out.push(("space-y", "space-y"));

    // `divide-x-*` / `divide-y-*` emit nested sibling-border rules (reusing the
    // proven `space-*` nested path). The group key is the family so `divide-x-2`
    // and `divide-x-4` collide (last wins), while `divide-x-*` and `divide-y-*`
    // are independent axes that do not collide.
    out.push(("divide-x", "divide-x"));
    out.push(("divide-y", "divide-y"));

    // Grid templating prefixes — each maps to a single CSS property so the
    // `cn()` last-wins behaviour works per family.
    out.push(("grid-cols", "grid-template-columns"));
    out.push(("grid-rows", "grid-template-rows"));
    out.push(("col-span", "grid-column"));
    out.push(("row-span", "grid-row"));

    // Position-scale prefixes (top/right/bottom/left/inset[-x|-y]) — each maps
    // to the CSS property it controls so two values of the same family collide
    // (last wins), e.g. `top-4` vs `top-2`. `inset-x`/`inset-y` map to the
    // logical inline/block inset shorthands, distinct from the all-sides
    // `inset`. The negative forms (`-top-4`) share the same group as the
    // positive forms because they set the same property.
    const POSITION_PREFIXES: &[&str] =
        &["top", "right", "bottom", "left", "inset", "inset-x", "inset-y"];
    for p in POSITION_PREFIXES {
        if let Some(group) = position_prop(p) {
            out.push((p, group));
        }
    }

    // Named typography scales: `leading-*` (line-height) and `tracking-*`
    // (letter-spacing). Registering the prefix means `leading-tight` and
    // `leading-loose` collide last-wins.
    out.push(("leading", "line-height"));
    out.push(("tracking", "letter-spacing"));

    const SIZING_PREFIXES: &[&str] = &["w", "h", "min-w", "max-w", "min-h", "max-h"];
    for p in SIZING_PREFIXES {
        if let Some(group) = sizing_prop(p) {
            out.push((p, group));
        }
    }

    const COLOR_PREFIXES: &[&str] = &["bg", "text", "border", "fill", "stroke", "ring", "outline"];
    for p in COLOR_PREFIXES {
        if let Some(group) = color_prop(p) {
            out.push((p, group));
        }
    }

    // Ring WIDTH (`ring-{n}`) and ring-OFFSET width (`ring-offset-{n}`) both
    // share the `ring` class prefix (the runtime `cn()` `groupKey` splits on the
    // FIRST dash, so `ring-2`, `ring-blue-500`, and `ring-offset-2` all key to
    // prefix `ring`). The `ring` → `--tw-ring-color` entry pushed by the color
    // loop above ALREADY makes every `ring*` utility last-wins as one group, so
    // we deliberately do NOT push a second `("ring", …)` entry here — a duplicate
    // prefix key would collide in the generated `cn()` map. `ring-2` then
    // `ring-4` collapses to `ring-4`, which is the desired last-wins behaviour.

    // A handful of non-color/spacing parameterized prefixes with their own group.
    out.push(("z", "z-index"));
    out.push(("opacity", "opacity"));
    out.push(("rounded", "border-radius"));
    out.push(("shadow", "box-shadow"));
    out.push(("font", "font-weight"));

    // Motion families (Round 2: tailwind-support `motion` track). Every motion
    // transform utility emits a single `transform:` declaration, so the engine
    // resolves them via the CSS cascade (last declared wins). For `cn()`
    // last-wins we register one group key per family — translate/rotate/scale
    // dedupe within a family while leaving sibling families independent
    // (matching Tailwind's mental model). Combining families on one element
    // requires an arbitrary value (`transform-[...]`), see the docs note.
    out.push(("translate-x", "translate"));
    out.push(("translate-y", "translate"));
    out.push(("rotate", "rotate"));
    out.push(("scale", "scale"));
    out.push(("scale-x", "scale"));
    out.push(("scale-y", "scale"));
    // Transition / timing / animation each control a single property.
    out.push(("duration", "transition-duration"));

    out
}

/// Map a single (already variant-stripped) utility class name to its CSS body
/// (declarations only, no selector). Returns `None` for unknown utilities.
pub fn utility_to_css(class_name: &str) -> Option<String> {
    // 1. Arbitrary-value bracket syntax: bg-[#1a1d24], w-[34ch], text-[14px].
    if let Some(css) = parse_arbitrary(class_name) {
        return Some(css);
    }

    // 1b. Named container context: `@container/<name>` declares a *named* query
    // container so descendant `@<bp>/<name>:` variants can target it. Emits both
    // the container-type and the container-name. (The bare `@container` form is a
    // fixed utility below.)
    if let Some(name) = class_name.strip_prefix("@container/") {
        if !name.is_empty() && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
            return Some(format!("container-type: inline-size; container-name: {name};"));
        }
    }

    // 2. Fixed long-tail utilities (no value parameter).
    if let Some(css) = fixed_utility(class_name) {
        return Some(css.to_string());
    }

    // 3a. Negative motion utilities: `-translate-x-2`, `-rotate-45`. The leading
    // `-` is not part of any prefix, so we strip it, compile the positive form,
    // and negate the emitted numeric value. Only the negatable motion families
    // (`translate-*`, `rotate-*`) opt in via `negate_motion`.
    if let Some(rest) = class_name.strip_prefix('-') {
        if let Some(css) = negate_motion(rest) {
            return Some(css);
        }
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

/// Compile the negative form of a motion transform utility. `rest` is the class
/// name with its leading `-` already stripped (e.g. `translate-x-2`, `rotate-45`).
/// Returns the same `transform:` declaration with a negated value. Only
/// `translate-x/y-*` and `rotate-*` are negatable (Tailwind's `-` prefix set).
fn negate_motion(rest: &str) -> Option<String> {
    let idx = rest.rfind('-')?;
    let (prefix, value) = (&rest[..idx], &rest[idx + 1..]);
    match prefix {
        "translate-x" => {
            let len = translate_length(value)?;
            Some(format!("transform: translateX(-{len});"))
        }
        "translate-y" => {
            let len = translate_length(value)?;
            Some(format!("transform: translateY(-{len});"))
        }
        "rotate" => {
            let deg = positive_int(value)?;
            Some(format!("transform: rotate(-{deg}deg);"))
        }
        _ => None,
    }
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

        // Container-query context. `@container` (and the named `@container/<name>`
        // form, normalized in `utility_to_css`) marks an element as a query
        // container so descendant `@sm:`/`@md:`/`@lg:` variants resolve against
        // its inline size. Tailwind's default container-type is `inline-size`.
        "@container" => "container-type: inline-size;",

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

        // Border widths (fixed N values). Directional + arbitrary `border-N`
        // arms are also wired via `parameterized_utility` below.
        "border-0" => "border-width: 0;",
        "border-2" => "border-width: 2px;",
        "border-4" => "border-width: 4px;",
        "border-8" => "border-width: 8px;",
        "border-x-0" => "border-inline-width: 0;",
        "border-x-2" => "border-inline-width: 2px;",
        "border-x-4" => "border-inline-width: 4px;",
        "border-x-8" => "border-inline-width: 8px;",
        "border-y-0" => "border-block-width: 0;",
        "border-y-2" => "border-block-width: 2px;",
        "border-y-4" => "border-block-width: 4px;",
        "border-y-8" => "border-block-width: 8px;",

        // `divide-x` / `divide-y` — sibling borders between adjacent children.
        // Bare forms default to 1px (Tailwind parity). These reuse the proven
        // `space-*` nested-rule path: a `& > * + *` block survives the scoped
        // CSS-nesting emission path and minifies to `.divide-x>*+*{...}`.
        // Numeric forms (`divide-x-2`, …) and `-reverse` are handled in
        // `parameterized_utility` (split on the last `-`).
        "divide-x" => "& > * + * { border-inline-width: 1px; }",
        "divide-y" => "& > * + * { border-block-width: 1px; }",
        "border-t-0" => "border-top-width: 0;",
        "border-t-2" => "border-top-width: 2px;",
        "border-t-4" => "border-top-width: 4px;",
        "border-t-8" => "border-top-width: 8px;",
        "border-r-0" => "border-right-width: 0;",
        "border-r-2" => "border-right-width: 2px;",
        "border-r-4" => "border-right-width: 4px;",
        "border-r-8" => "border-right-width: 8px;",
        "border-b-0" => "border-bottom-width: 0;",
        "border-b-2" => "border-bottom-width: 2px;",
        "border-b-4" => "border-bottom-width: 4px;",
        "border-b-8" => "border-bottom-width: 8px;",
        "border-l-0" => "border-left-width: 0;",
        "border-l-2" => "border-left-width: 2px;",
        "border-l-4" => "border-left-width: 4px;",
        "border-l-8" => "border-left-width: 8px;",

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

        // max-width named scale (Tailwind v4 defaults).
        "max-w-none" => "max-width: none;",
        "max-w-xs" => "max-width: 20rem;",
        "max-w-sm" => "max-width: 24rem;",
        "max-w-md" => "max-width: 28rem;",
        "max-w-lg" => "max-width: 32rem;",
        "max-w-xl" => "max-width: 36rem;",
        "max-w-2xl" => "max-width: 42rem;",
        "max-w-3xl" => "max-width: 48rem;",
        "max-w-4xl" => "max-width: 56rem;",
        "max-w-5xl" => "max-width: 64rem;",
        "max-w-6xl" => "max-width: 72rem;",
        "max-w-7xl" => "max-width: 80rem;",
        "max-w-full" => "max-width: 100%;",
        "max-w-prose" => "max-width: 65ch;",
        "max-w-min" => "max-width: min-content;",
        "max-w-max" => "max-width: max-content;",
        "max-w-fit" => "max-width: fit-content;",
        "max-w-screen-sm" => "max-width: 40rem;",
        "max-w-screen-md" => "max-width: 48rem;",
        "max-w-screen-lg" => "max-width: 64rem;",
        "max-w-screen-xl" => "max-width: 80rem;",
        "max-w-screen-2xl" => "max-width: 96rem;",

        // Grid template keyword forms (numeric forms handled by
        // `parameterized_utility`).
        "grid-cols-none" => "grid-template-columns: none;",
        "grid-rows-none" => "grid-template-rows: none;",
        "col-span-full" => "grid-column: 1 / -1;",
        "row-span-full" => "grid-row: 1 / -1;",
        "col-auto" => "grid-column: auto;",
        "row-auto" => "grid-row: auto;",

        // z-index keyword (numeric forms handled by `parameterized_utility`).
        "z-auto" => "z-index: auto;",

        // Ring (box-shadow) — default width is 3px (Tailwind v4). The numeric
        // `ring-{n}` forms are handled by `parameterized_utility`; `ring-inset`
        // flips the inset slot of the composed shadow. NOTE: the bare `ring`
        // keyword must be matched HERE (fixed) so it never collides with the
        // color path — `ring-<color>` still routes through `brand_color_utility`
        // because its value (`blue-500`, `primary`, …) is not a width.
        "ring" => RING_3,
        "ring-inset" => "--tw-ring-inset: inset;",

        // --- Motion (Round 2: tailwind-support `motion` track) -------------
        //
        // Transform: this engine emits direct `transform:` declarations per
        // family (no CSS-var composition), so `transform` is the GPU-friendly
        // identity baseline and `transform-none` disables it.
        "transform" => "transform: translate(0, 0) rotate(0) skewX(0) skewY(0) scaleX(1) scaleY(1);",
        "transform-none" => "transform: none;",

        // Transition shorthands. `transition` is Tailwind's default property
        // set; the property-scoped variants narrow it. All ship the default
        // 150ms / cubic-bezier timing so a bare `transition` animates.
        "transition" => "transition-property: color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms;",
        "transition-none" => "transition-property: none;",
        "transition-all" => "transition-property: all; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms;",
        "transition-colors" => "transition-property: color, background-color, border-color, text-decoration-color, fill, stroke; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms;",
        "transition-opacity" => "transition-property: opacity; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms;",
        "transition-transform" => "transition-property: transform; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms;",

        // Timing functions (Tailwind v4 defaults).
        "ease-linear" => "transition-timing-function: linear;",
        "ease-in" => "transition-timing-function: cubic-bezier(0.4, 0, 1, 1);",
        "ease-out" => "transition-timing-function: cubic-bezier(0, 0, 0.2, 1);",
        "ease-in-out" => "transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);",

        // Animations. The `animation:` shorthand is emitted here; the matching
        // `@keyframes` block is hoisted as a sibling rule by the emitter via
        // `animation_keyframes()` (see emit.rs / lib.rs). `animate-none` clears
        // any running animation and needs no keyframes.
        "animate-none" => "animation: none;",
        "animate-spin" => "animation: spin 1s linear infinite;",
        "animate-ping" => "animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;",
        "animate-pulse" => "animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;",
        "animate-bounce" => "animation: bounce 1s infinite;",

        _ => return None,
    })
}

/// The Tailwind v4 ring recipe, parameterized on the ring width in pixels.
///
/// A ring is a `box-shadow` composed from `--tw-ring-*` custom properties so it
/// can layer with `--tw-ring-offset-*` (set by `ring-offset-{n}`) and an
/// inset flag (`ring-inset`), and still coexist with a regular `shadow-*`:
///
/// ```text
/// --tw-ring-offset-shadow: var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color);
/// --tw-ring-shadow:        var(--tw-ring-inset) 0 0 0 calc(<n>px + var(--tw-ring-offset-width)) var(--tw-ring-color);
/// box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow, 0 0 #0000);
/// ```
///
/// The ring spreads by `<n>px + offset-width`; the offset shadow paints the gap
/// between the element edge and the ring in `--tw-ring-offset-color`.
fn ring_shadow(width_px: u32) -> String {
    format!(
        "--tw-ring-offset-shadow: var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color); \
--tw-ring-shadow: var(--tw-ring-inset) 0 0 0 calc({width_px}px + var(--tw-ring-offset-width)) var(--tw-ring-color); \
box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow, 0 0 #0000);"
    )
}

/// Static body for the default `ring` (3px) so `fixed_utility` can return a
/// `&'static str`. Kept in sync with [`ring_shadow`]`(3)`.
const RING_3: &str = "--tw-ring-offset-shadow: var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color); --tw-ring-shadow: var(--tw-ring-inset) 0 0 0 calc(3px + var(--tw-ring-offset-width)) var(--tw-ring-color); box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow, 0 0 #0000);";

/// Parameterized utilities split on the last `-`: `p-4`, `text-lg`, `gap-2`,
/// `text-red-500` (handled via [`palette_color`]), `z-10`, etc.
fn parameterized_utility(prefix: &str, value: &str) -> Option<String> {
    // Spacing scale: p/px/py/pt/pr/pb/pl, m/mx/my/…, gap, space — value × 0.25rem.
    if let Some(prop) = spacing_prop(prefix) {
        if let Some(rem) = spacing_value(value) {
            return Some(format!("{prop}: {rem};"));
        }
    }

    // `space-x-*` / `space-y-*` — emit a nested sibling-margin rule (Tailwind's
    // standard recipe). Modern browsers support native CSS nesting; Vite's
    // Lightning CSS / esbuild minifier handle this in build output.
    if prefix == "space-x" {
        if let Some(rem) = spacing_value(value) {
            return Some(format!("& > * + * {{ margin-inline-start: {rem}; }}"));
        }
    }
    if prefix == "space-y" {
        if let Some(rem) = spacing_value(value) {
            return Some(format!("& > * + * {{ margin-block-start: {rem}; }}"));
        }
    }

    // `divide-x-*` / `divide-y-*` — sibling borders between adjacent children,
    // reusing the same nested `& > * + *` recipe as `space-*`. Widths are a
    // closed set (0/2/4/8 px); the `-reverse` token flips which sibling owns
    // the border via the Tailwind `--tw-divide-{x,y}-reverse` custom property
    // (kept for API parity even though the simplified `& > * + *` recipe paints
    // both inline/block edges of the trailing sibling).
    if prefix == "divide-x" {
        if value == "reverse" {
            return Some("& > * + * { --tw-divide-x-reverse: 1; }".to_string());
        }
        if let Some(px) = divide_width(value) {
            return Some(format!("& > * + * {{ border-inline-width: {px}; }}"));
        }
    }
    if prefix == "divide-y" {
        if value == "reverse" {
            return Some("& > * + * { --tw-divide-y-reverse: 1; }".to_string());
        }
        if let Some(px) = divide_width(value) {
            return Some(format!("& > * + * {{ border-block-width: {px}; }}"));
        }
    }

    // Grid templating: `grid-cols-N` / `grid-rows-N` / `col-span-N` / `row-span-N`.
    if prefix == "grid-cols" {
        if let Some(n) = positive_int(value) {
            return Some(format!(
                "grid-template-columns: repeat({n}, minmax(0, 1fr));"
            ));
        }
    }
    if prefix == "grid-rows" {
        if let Some(n) = positive_int(value) {
            return Some(format!("grid-template-rows: repeat({n}, minmax(0, 1fr));"));
        }
    }
    if prefix == "col-span" {
        if let Some(n) = positive_int(value) {
            return Some(format!("grid-column: span {n} / span {n};"));
        }
    }
    if prefix == "row-span" {
        if let Some(n) = positive_int(value) {
            return Some(format!("grid-row: span {n} / span {n};"));
        }
    }

    // Position scale: top/right/bottom/left/inset/inset-x/inset-y on the
    // spacing scale, plus `auto`. A leading `-` on the prefix (e.g. `-left-2`
    // arrives here as prefix `-left`) negates the spacing value — Tailwind's
    // negative-position syntax. `auto` is never negated.
    {
        let (neg, base_prefix) = match prefix.strip_prefix('-') {
            Some(rest) => (true, rest),
            None => (false, prefix),
        };
        if let Some(prop) = position_prop(base_prefix) {
            if let Some(v) = spacing_value(value) {
                if neg && v != "auto" && v != "0" {
                    return Some(format!("{prop}: -{v};"));
                }
                return Some(format!("{prop}: {v};"));
            }
        }
    }

    // Named line-height scale: `leading-none|tight|snug|normal|relaxed|loose`
    // (unitless multipliers) plus the numeric `leading-<n>` step which maps to
    // the spacing scale (`leading-6` → `1.5rem`), matching Tailwind v4.
    if prefix == "leading" {
        if let Some(lh) = leading_value(value) {
            return Some(format!("line-height: {lh};"));
        }
        if let Some(rem) = spacing_value(value) {
            return Some(format!("line-height: {rem};"));
        }
    }

    // Named letter-spacing scale: `tracking-tighter|tight|normal|wide|wider|
    // widest` in `em` units (Tailwind v4 defaults).
    if prefix == "tracking" {
        if let Some(ls) = tracking_value(value) {
            return Some(format!("letter-spacing: {ls};"));
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

    // Ring width: `ring-{0,1,2,4,8}` → the composed `box-shadow` recipe at the
    // given pixel width. Routed BEFORE the color path so a numeric value never
    // falls through to a color lookup; `ring-<color>` (e.g. `ring-blue-500`,
    // `ring-primary`) has a non-numeric value and is handled by
    // `brand_color_utility`, which still emits `--tw-ring-color`.
    if prefix == "ring" {
        if let Some(n) = ring_width(value) {
            return Some(ring_shadow(n));
        }
    }

    // Ring offset width: `ring-offset-{0,1,2,4,8}` → `--tw-ring-offset-width`.
    // (Color offsets like `ring-offset-blue-500` are out of scope; the width
    // value here is always numeric.)
    if prefix == "ring-offset" {
        if let Some(n) = ring_width(value) {
            return Some(format!("--tw-ring-offset-width: {n}px;"));
        }
    }

    // --- Motion (Round 2: tailwind-support `motion` track) -----------------
    //
    // Translate uses the spacing scale (`translate-x-2` → 0.5rem); negative
    // forms are routed through `negate_motion` in `utility_to_css`.
    if prefix == "translate-x" {
        if let Some(len) = translate_length(value) {
            return Some(format!("transform: translateX({len});"));
        }
    }
    if prefix == "translate-y" {
        if let Some(len) = translate_length(value) {
            return Some(format!("transform: translateY({len});"));
        }
    }
    // Rotate: integer degrees (`rotate-45` → 45deg).
    if prefix == "rotate" {
        if let Some(deg) = positive_int(value) {
            return Some(format!("transform: rotate({deg}deg);"));
        }
    }
    // Scale: percentage value mapped to a unit multiplier (`scale-105` → 1.05).
    if prefix == "scale" {
        if let Some(factor) = scale_factor(value) {
            return Some(format!("transform: scale({factor});"));
        }
    }
    if prefix == "scale-x" {
        if let Some(factor) = scale_factor(value) {
            return Some(format!("transform: scaleX({factor});"));
        }
    }
    if prefix == "scale-y" {
        if let Some(factor) = scale_factor(value) {
            return Some(format!("transform: scaleY({factor});"));
        }
    }
    // Transition duration: integer milliseconds (`duration-300` → 300ms).
    if prefix == "duration" {
        if let Some(ms) = positive_int_or_zero(value) {
            return Some(format!("transition-duration: {ms}ms;"));
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
        "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber", "yellow", "lime",
        "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia",
        "pink", "rose",
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

/// Tailwind spacing scale: numeric → `n * 0.25rem`; `px` → `1px`; `0` → `0`;
/// `auto` → `auto` (so `mx-auto`, `my-auto`, `mt-auto`, etc. work).
fn spacing_value(value: &str) -> Option<String> {
    if value == "auto" {
        return Some("auto".to_string());
    }
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

/// Map a `divide-{x,y}-N` width token to its CSS px value. Closed set matching
/// Tailwind's divide-width scale (`0/2/4/8`); the bare `divide-x`/`divide-y`
/// (1px default) is handled as a fixed utility.
fn divide_width(value: &str) -> Option<&'static str> {
    Some(match value {
        "0" => "0",
        "2" => "2px",
        "4" => "4px",
        "8" => "8px",
        _ => return None,
    })
}

/// Parse a positive integer (used by grid-cols-N, col-span-N, row-span-N).
fn positive_int(value: &str) -> Option<u32> {
    if value.is_empty() || !value.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let n: u32 = value.parse().ok()?;
    if n == 0 {
        return None;
    }
    Some(n)
}

/// Map a position-scale prefix to its CSS property. `inset` is the all-sides
/// shorthand; `inset-x`/`inset-y` are the logical inline/block shorthands.
/// (Arbitrary forms `top-[…]` etc. are handled separately by `arbitrary_prop`;
/// this is only the named/numeric spacing-scale path.)
fn position_prop(prefix: &str) -> Option<&'static str> {
    Some(match prefix {
        "top" => "top",
        "right" => "right",
        "bottom" => "bottom",
        "left" => "left",
        "inset" => "inset",
        "inset-x" => "inset-inline",
        "inset-y" => "inset-block",
        _ => return None,
    })
}

/// Named line-height scale (`leading-*`), Tailwind v4 defaults. Unitless for
/// `none`, otherwise unitless multipliers.
fn leading_value(value: &str) -> Option<&'static str> {
    Some(match value {
        "none" => "1",
        "tight" => "1.25",
        "snug" => "1.375",
        "normal" => "1.5",
        "relaxed" => "1.625",
        "loose" => "2",
        _ => return None,
    })
}

/// Named letter-spacing scale (`tracking-*`) in `em` units, Tailwind v4
/// defaults.
fn tracking_value(value: &str) -> Option<&'static str> {
    Some(match value {
        "tighter" => "-0.05em",
        "tight" => "-0.025em",
        "normal" => "0em",
        "wide" => "0.025em",
        "wider" => "0.05em",
        "widest" => "0.1em",
        _ => return None,
    })
}

/// Tailwind ring-width scale: `0`, `1`, `2`, `4`, `8` (px). Used by both
/// `ring-{n}` (ring spread) and `ring-offset-{n}` (offset width). Returns the
/// width in pixels, or `None` for any other value so non-width `ring-*` tokens
/// (colors, `inset`) fall through to their own handlers.
fn ring_width(value: &str) -> Option<u32> {
    match value {
        "0" => Some(0),
        "1" => Some(1),
        "2" => Some(2),
        "4" => Some(4),
        "8" => Some(8),
        _ => None,
    }
}

/// Parse a non-negative integer (`duration-0` is valid; `rotate-0` too).
fn positive_int_or_zero(value: &str) -> Option<u32> {
    if value.is_empty() || !value.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    value.parse().ok()
}

/// Translate length on the spacing scale, with `px` and fractional steps. Used
/// by `translate-x/y-*`. Reuses [`spacing_value`] but rejects the `auto`
/// keyword (translate has no `auto`).
fn translate_length(value: &str) -> Option<String> {
    if value == "auto" {
        return None;
    }
    spacing_value(value)
}

/// Scale percentage → unit multiplier. `scale-105` → `1.05`, `scale-0` → `0`,
/// `scale-50` → `0.5`.
fn scale_factor(value: &str) -> Option<String> {
    let n = positive_int_or_zero(value)?;
    let factor = n as f32 / 100.0;
    Some(trim_float(factor))
}

/// The `@keyframes` block a given `animate-*` utility depends on, or `None` if
/// the class is not a keyframe-backed animation (`animate-none`, non-animation
/// classes). The emitter hoists this as a sibling rule so the `animation:`
/// shorthand has a definition. Re-emitting an identical `@keyframes` is
/// idempotent in CSS, so per-occurrence emission is safe.
pub fn animation_keyframes(class_name: &str) -> Option<&'static str> {
    Some(match class_name {
        "animate-spin" => {
            "@keyframes spin { to { transform: rotate(360deg); } }"
        }
        "animate-ping" => {
            "@keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }"
        }
        "animate-pulse" => {
            "@keyframes pulse { 50% { opacity: 0.5; } }"
        }
        "animate-bounce" => {
            "@keyframes bounce { 0%, 100% { transform: translateY(-25%); animation-timing-function: cubic-bezier(0.8, 0, 1, 1); } 50% { transform: none; animation-timing-function: cubic-bezier(0, 0, 0.2, 1); } }"
        }
        _ => return None,
    })
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
