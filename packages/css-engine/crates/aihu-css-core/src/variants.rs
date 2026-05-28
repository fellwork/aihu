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
        _ => {
            if let Some(tag) = prefix.strip_prefix("slotted-") {
                Variant::SlottedTag(tag.to_string())
            } else if let Some(name) = prefix.strip_prefix("part-") {
                Variant::Part(name.to_string())
            } else if let Some(state) = group_state(prefix) {
                Variant::Group(state)
            } else if let Some(state) = peer_state(prefix) {
                Variant::Peer(state)
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
