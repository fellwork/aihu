//! `variants.rs` — variant-prefix parser + selector/wrapper resolver.
//!
//! A utility token may carry one or more `variant:` prefixes
//! (`host:bg-primary`, `md:hover:bg-primary`, `slotted-img:rounded-lg`,
//! `part-thumb:bg-accent`, `[&>div]:text-primary`). The scanner stores the
//! FULL prefixed token; the emitter splits prefixes here at emit time.
//!
//! Variants come in two flavours:
//! - **Selector variants** wrap/append to the base selector (`host:` → `:host`,
//!   `hover:` → `&:hover`, `slotted:` → `::slotted(*)`, `part-x:` → `::part(x)`,
//!   `[&>div]:` → `& > div`).
//! - **Wrapping variants** wrap the whole rule (`md:` → `@media (...)`).
//! - **Cascade variants** (`dark:`, `host-context-dark:`) do NOT emit a
//!   `:host-context()` selector (unsupported in Firefox per
//!   `decision-firefox-host-context-workaround`); instead the dark value is
//!   placed behind an inherited custom property the consumer toggles in
//!   `:root`/`.dark`. See [`Variant::is_dark_cascade`].

/// One parsed variant prefix.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Variant {
    // ── WC-native ──────────────────────────────────────────────────────────
    /// `host:` → `:host`.
    Host,
    /// `slotted:` → `::slotted(*)`.
    Slotted,
    /// `slotted-img:` → `::slotted(img)`.
    SlottedTag(String),
    /// `part-<name>:` → `::part(<name>)`.
    Part(String),
    /// `host-context-dark:` — dark cascade (NOT `:host-context()`).
    HostContextDark,

    // ── standard ─────────────────────────────────────────────────────────────
    /// `hover:`, `focus:`, `focus-visible:`, `active:`, `disabled:` → `&:<pc>`.
    Pseudo(String),
    /// `dark:` — dark cascade (NOT `:host-context()`).
    Dark,
    /// `sm:`/`md:`/`lg:`/`xl:`/`2xl:` → `@media (min-width: …)`.
    Breakpoint(String),
    /// `[&>div]:` arbitrary selector → native nesting (`& > div`).
    ArbitrarySelector(String),

    // ── attribute / container (round 2) ───────────────────────────────────────
    /// `aria-checked:` → `&[aria-checked="true"]` (keyword form, implicit
    /// `="true"`). `aria-[expanded=false]:` carries an explicit `name=value`
    /// payload → `&[aria-expanded="false"]`.
    Aria(AttrMatch),
    /// `data-[state=open]:` → `&[data-state="open"]` (bracket payload
    /// `name=value`). `data-active:` (keyword) → `&[data-active]` (presence).
    Data(AttrMatch),
    /// Container-query breakpoint variant: `@sm:`/`@md:`/`@lg:`/`@xl:`/`@2xl:`
    /// → `@container (min-width: …)`. Wraps the rule like `Breakpoint`, but in
    /// an `@container` at-rule instead of `@media`.
    Container(String),
}

/// An attribute-selector match payload for `aria-*` / `data-*` variants.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AttrMatch {
    /// `aria-checked` → `[aria-checked="true"]` (aria) or `[data-active]`
    /// presence (data). The bool records whether to imply `="true"`.
    Name { name: String, imply_true: bool },
    /// Explicit `name=value` → `[<full>-name="value"]`.
    NameValue { name: String, value: String },
}

impl Variant {
    /// True for the Firefox-safe dark-mode cascade variants. Their value is
    /// emitted behind a custom property the consumer toggles, never a
    /// `:host-context(.dark)` selector.
    pub fn is_dark_cascade(&self) -> bool {
        matches!(self, Variant::Dark | Variant::HostContextDark)
    }
}

/// Split a (possibly multi-prefixed) class token into its ordered variants and
/// the bare base utility. Unknown prefixes are treated as part of the base
/// (so an ordinary `bg-red-500` is never mis-split).
///
/// `md:hover:bg-primary` → (`[Breakpoint(md), Pseudo(hover)]`, `"bg-primary"`).
pub fn split_variants(token: &str) -> (Vec<Variant>, String) {
    let mut variants = Vec::new();
    let mut rest = token;

    loop {
        // Arbitrary-selector prefix `[...]:` — find the matching `]:`.
        if rest.starts_with('[') {
            if let Some(close) = rest.find("]:") {
                let sel = &rest[1..close];
                variants.push(Variant::ArbitrarySelector(sel.to_string()));
                rest = &rest[close + 2..];
                continue;
            }
        }

        // Find the next `:` that is NOT inside brackets and is a known prefix.
        let Some(colon) = next_prefix_colon(rest) else {
            break;
        };
        let prefix = &rest[..colon];
        match parse_prefix(prefix) {
            Some(v) => {
                variants.push(v);
                rest = &rest[colon + 1..];
            }
            None => break, // not a recognized variant — the rest is the base.
        }
    }

    (variants, rest.to_string())
}

/// Find the index of the next top-level `:` (not inside `[...]`).
fn next_prefix_colon(s: &str) -> Option<usize> {
    let mut depth = 0u32;
    for (i, c) in s.char_indices() {
        match c {
            '[' => depth += 1,
            ']' => depth = depth.saturating_sub(1),
            ':' if depth == 0 => return Some(i),
            _ => {}
        }
    }
    None
}

fn parse_prefix(prefix: &str) -> Option<Variant> {
    Some(match prefix {
        "host" => Variant::Host,
        "host-context-dark" => Variant::HostContextDark,
        "slotted" => Variant::Slotted,
        "dark" => Variant::Dark,
        "hover" | "focus" | "focus-visible" | "active" | "disabled" | "visited"
        | "checked" => Variant::Pseudo(prefix.to_string()),
        "sm" | "md" | "lg" | "xl" | "2xl" => Variant::Breakpoint(prefix.to_string()),
        // Container-query breakpoints: `@sm`/`@md`/`@lg`/`@xl`/`@2xl`.
        "@sm" | "@md" | "@lg" | "@xl" | "@2xl" => {
            Variant::Container(prefix[1..].to_string())
        }
        _ => {
            if let Some(tag) = prefix.strip_prefix("slotted-") {
                Variant::SlottedTag(tag.to_string())
            } else if let Some(name) = prefix.strip_prefix("part-") {
                Variant::Part(name.to_string())
            } else if let Some(payload) = prefix.strip_prefix("aria-") {
                Variant::Aria(parse_attr_match(payload, true))
            } else if let Some(payload) = prefix.strip_prefix("data-") {
                // data-* never implies `="true"`: bare `data-active` is a
                // presence selector `[data-active]`.
                Variant::Data(parse_attr_match(payload, false))
            } else {
                return None;
            }
        }
    })
}

/// Parse the payload after `aria-`/`data-` into an [`AttrMatch`].
///
/// Two shapes:
/// - `checked` (keyword) → `Name { name: "checked", imply_true }`.
/// - `[state=open]` (bracket, from `data-[state=open]`) → `NameValue`. The
///   bracket-aware splitter in [`split_variants`] keeps the `[...]` attached to
///   the prefix, so the payload arrives here as `[state=open]`.
fn parse_attr_match(payload: &str, imply_true: bool) -> AttrMatch {
    // Strip an outer `[...]` if present (arbitrary form).
    let inner = payload
        .strip_prefix('[')
        .and_then(|s| s.strip_suffix(']'))
        .unwrap_or(payload);
    if let Some((name, value)) = inner.split_once('=') {
        AttrMatch::NameValue {
            name: name.trim().to_string(),
            value: value.trim().trim_matches('"').to_string(),
        }
    } else {
        AttrMatch::Name {
            name: inner.trim().to_string(),
            imply_true,
        }
    }
}
