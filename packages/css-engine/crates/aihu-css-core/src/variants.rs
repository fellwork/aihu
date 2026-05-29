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

    // ── relational (group / peer) ────────────────────────────────────────────
    /// `group-hover:`, `group-focus:`, `group-focus-visible:`, `group-active:`,
    /// `group-disabled:` → ancestor-state selector
    /// (`.group:<state> <base>`). The `Option<String>` is the ancestor state
    /// pseudo-class. A bare `group` (no state) is NOT a variant prefix — it is a
    /// marker utility (see `tokens::fixed_utility`) applied directly to the
    /// ancestor element; this arm only ever carries `Some(state)`.
    Group(Option<String>),
    /// `peer-hover:`, `peer-focus:`, `peer-focus-visible:`, `peer-checked:`,
    /// `peer-disabled:` → previous-sibling-state selector
    /// (`.peer:<state> ~ <base>`). As with [`Variant::Group`], the bare `peer`
    /// marker is a utility, not a prefix; this arm only carries `Some(state)`.
    Peer(Option<String>),

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
            } else if let Some(state) = group_state(prefix) {
                Variant::Group(state)
            } else if let Some(state) = peer_state(prefix) {
                Variant::Peer(state)
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

/// States a `group-*:` prefix may carry. Returns `Some(Some(state))` when
/// `prefix` is a recognized `group-<state>` form. (`group` alone is a marker
/// utility, not a variant — so it is NOT matched here.)
fn group_state(prefix: &str) -> Option<Option<String>> {
    let state = prefix.strip_prefix("group-")?;
    relational_state(state).map(Some)
}

/// States a `peer-*:` prefix may carry. See [`group_state`].
fn peer_state(prefix: &str) -> Option<Option<String>> {
    let state = prefix.strip_prefix("peer-")?;
    relational_state(state).map(Some)
}

/// The closed set of states `group-*:` / `peer-*:` accept. They map 1:1 to a
/// pseudo-class on the ancestor / previous-sibling marker element.
fn relational_state(state: &str) -> Option<String> {
    matches!(
        state,
        "hover" | "focus" | "focus-visible" | "active" | "disabled" | "checked"
    )
    .then(|| state.to_string())
}

/// How a (possibly empty) variant list resolves against a base selector for the
/// `@apply` expansion path (`apply.rs`). This is the SHARED structural resolver
/// (R-APPLY-PARSE): `@apply hover:bg-accent` inside a `.btn { … }` rule must map
/// to a nested `&:hover { … }` block on the *recipe's own* selector — NOT to a
/// `.hover\:bg-accent:hover` class rule (Codex confirmed `emit_token` +
/// string-strip produces wrong output).
///
/// The emitter ([`emit_token`](crate::emit)) starts from a class selector
/// (`.token`); the `@apply` path starts from `&` (the parent rule). Both walk the
/// same variant arms, so the per-variant selector transforms live here as
/// [`apply_variant_to_selector`] and the wrapping/cascade decisions in
/// [`ResolvedVariants`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedVariants {
    /// The selector the declarations attach to, with each variant applied
    /// against the starting base (`&` for `@apply`). E.g. `&:hover`,
    /// `&[data-state="open"]`, `.group:hover &`.
    pub selector: String,
    /// A wrapping at-rule (`@media (min-width: …)` / `@container (…)`) the rule
    /// nests inside, if a breakpoint/container variant was present.
    pub at_rule: Option<String>,
    /// True when a dark-cascade variant (`dark:`/`host-context-dark:`) was
    /// present — the caller emits the Firefox-safe dark gate instead of a plain
    /// rule.
    pub dark_cascade: bool,
    /// True when any variant implies host/`&`/relational scoping. Used to reject
    /// such variants inside a `$global` `@apply` (Task 1.4 — variants that imply
    /// `&`/host scoping are rejected in `$global`; base utilities allowed).
    pub needs_scope: bool,
}

/// Apply one [`Variant`] to a running selector, mirroring the emitter's arms but
/// starting from an arbitrary base (`&` for the `@apply` path). Returns the new
/// selector, plus optional `(at_rule)` / `dark_cascade` / `needs_scope` signals
/// via the accumulator the caller threads.
fn apply_variant_to_selector(
    v: &Variant,
    selector: String,
    theme: &crate::theme::ThemeRegistry,
    acc: &mut ResolvedVariants,
) -> String {
    match v {
        Variant::Host => {
            acc.needs_scope = true;
            format!(":host({selector})")
        }
        Variant::Slotted => {
            acc.needs_scope = true;
            format!("::slotted({selector})")
        }
        Variant::SlottedTag(tag) => {
            acc.needs_scope = true;
            format!("::slotted({tag}{selector})")
        }
        Variant::Part(name) => {
            acc.needs_scope = true;
            format!("::part({name})")
        }
        Variant::Pseudo(pc) => {
            acc.needs_scope = true;
            format!("{selector}:{pc}")
        }
        Variant::ArbitrarySelector(sel) => {
            acc.needs_scope = true;
            sel.replace('&', &selector)
        }
        Variant::Group(Some(state)) => {
            acc.needs_scope = true;
            format!(".group:{state} {selector}")
        }
        Variant::Peer(Some(state)) => {
            acc.needs_scope = true;
            format!(".peer:{state} ~ {selector}")
        }
        Variant::Group(None) | Variant::Peer(None) => selector,
        Variant::Aria(m) => {
            acc.needs_scope = true;
            format!("{selector}{}", crate::emit::attr_selector("aria", m))
        }
        Variant::Data(m) => {
            acc.needs_scope = true;
            format!("{selector}{}", crate::emit::attr_selector("data", m))
        }
        Variant::Breakpoint(bp) => {
            if let Some(min) = theme.breakpoint(bp) {
                acc.at_rule = Some(format!("@media (min-width: {min})"));
            }
            selector
        }
        Variant::Container(bp) => {
            if let Some(min) = theme.container_breakpoint(bp) {
                acc.at_rule = Some(format!("@container (min-width: {min})"));
            }
            selector
        }
        Variant::Dark | Variant::HostContextDark => {
            // The dark cascade rewrites `&` to a `:host([data-theme])`/`:root.dark`
            // gate — host/root scope that a `$global` `@apply` cannot express.
            acc.dark_cascade = true;
            acc.needs_scope = true;
            selector
        }
    }
}

/// Resolve a variant list against `base` (`&` for `@apply`) into the structural
/// selector + wrapping decisions shared by `@apply` expansion.
pub fn resolve_variants(
    variants: &[Variant],
    base: &str,
    theme: &crate::theme::ThemeRegistry,
) -> ResolvedVariants {
    let mut acc = ResolvedVariants {
        selector: base.to_string(),
        at_rule: None,
        dark_cascade: false,
        needs_scope: false,
    };
    let mut selector = base.to_string();
    for v in variants {
        selector = apply_variant_to_selector(v, selector, theme, &mut acc);
    }
    acc.selector = selector;
    acc
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
