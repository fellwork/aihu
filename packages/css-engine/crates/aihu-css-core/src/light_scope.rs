//! `light_scope.rs` — light-DOM selector-rewrite pass (LDF §10 step 3).
//!
//! A light-DOM component has no shadow root, so a shadow-scoped selector
//! (`:host`, `::slotted()`, `::part()`) matches nothing, and a plain class
//! selector (`.card`) is no longer naturally isolated from every other
//! component's markup in the light tree. This pass lowers a parsed, already
//! `@apply`-expanded authored `@style` sheet into text that works under
//! light-DOM attribute scoping instead:
//!
//! 1. **Root scoping** — wrap the whole sheet in a native `@scope
//!    ([data-a="<id>"]) to ([data-a])` block. `@scope` stops descending as
//!    soon as it crosses another `data-a`-bearing element (the next
//!    component's root, since `data-a` is stamped ONLY on component roots),
//!    so this reproduces shadow-boundary non-leaking without touching a
//!    single selector's text.
//! 2. **`:host`/`:host()`/`:host-context()`/`::slotted()`/`::part()`
//!    lowering** — these pseudo-classes/elements only mean something inside a
//!    real shadow tree; see [`lower_shadow_pseudos`] for the per-form table.
//! 3. **`@keyframes` hash-suffixing** — light-DOM CSS is no longer isolated by
//!    a shadow boundary, so two components each authoring `@keyframes
//!    fade-in` would collide globally; see [`hash_keyframe_defs`].
//!
//! MUST run after [`crate::apply::expand_apply_sheet`], never before —
//! `@apply`'s `host:`/`slotted:`/`part-x:`/`dark:` variant resolution
//! (`variants.rs`) synthesizes `:host(...)`/`::slotted(...)`/`::part(...)`/
//! `:host([data-theme="dark"])` text at arbitrary nesting depth, and this
//! pass has to catch those too, not just directly-authored occurrences.
//!
//! Reuses `style_parser.rs`'s existing AST types — no parallel representation.

use std::collections::BTreeMap;

use crate::style_parser::{StyleNode, StyleSheet};

/// A component's light-DOM scope id — the 8-hex-char value the compiler
/// stamps as `data-a="<id>"` on the component's root element (LDF §10
/// step 1/3; `SfcAst.light_scope_id` on the wire).
#[derive(Debug, Clone, Copy)]
pub struct ScopeId<'a>(pub &'a str);

/// At-rules that are inherently document-global regardless of any scoping
/// mechanism (name-addressed, not tree-addressed) and are hoisted OUT of the
/// `@scope` wrapper before emission — `@scope`'s "nested rule" grammar is
/// designed around style rules and conditional at-rules; whether a browser
/// accepts a bare `@keyframes` inside it is implementation-sensitive, and
/// these three gain nothing from being inside it (`@keyframes` is exactly
/// what [`hash_keyframe_defs`] already collision-proofs by name, making
/// `@scope` placement pure risk with no benefit).
const GLOBAL_ONLY_AT_RULES: [&str; 3] = ["@keyframes", "@property", "@font-face"];

/// Lower a parsed, `@apply`-expanded authored `@style` sheet for light-DOM
/// emission, returning the final CSS text (hoisted global at-rules first,
/// then the `@scope`-wrapped remainder).
///
/// `sheet` is taken by value — lowering is destructive (keyframe renaming
/// rewrites declaration values in place; there is no reason to keep the
/// pre-lowering tree around after this returns).
pub fn scope_authored_sheet(mut sheet: StyleSheet, scope: ScopeId) -> String {
    let renames = hash_keyframe_defs(&mut sheet, scope);
    if !renames.is_empty() {
        rewrite_animation_refs(&mut sheet, &renames);
    }
    lower_shadow_pseudos_in_sheet(&mut sheet);

    let mut hoisted = Vec::new();
    hoist_global_at_rules(&mut sheet.nodes, &mut hoisted);
    let hoisted_css = StyleSheet { nodes: hoisted }.to_css();

    let body = sheet.to_css();
    if body.trim().is_empty() {
        return hoisted_css;
    }
    format!(
        "{hoisted_css}@scope ([data-a=\"{}\"]) to ([data-a]) {{\n{body}}}\n",
        scope.0
    )
}

/// Remove every top-level (or nested-inside-`@media`/`@supports`/`@container`)
/// [`GLOBAL_ONLY_AT_RULES`] node from `nodes`, appending each to `hoisted` in
/// source order. Never descends into `rule.nested` — none of these three
/// at-rules can be CSS-nested inside a normal style rule.
fn hoist_global_at_rules(nodes: &mut Vec<StyleNode>, hoisted: &mut Vec<StyleNode>) {
    let mut i = 0;
    while i < nodes.len() {
        let is_global_only = matches!(
            &nodes[i],
            StyleNode::AtRule(at) if GLOBAL_ONLY_AT_RULES.contains(&at.name.as_str())
        );
        if is_global_only {
            hoisted.push(nodes.remove(i));
            continue;
        }
        if let StyleNode::AtRule(at) = &mut nodes[i] {
            hoist_global_at_rules(&mut at.body, hoisted);
        }
        i += 1;
    }
}

/// Strip a leading `$global ` marker from every `@keyframes` prelude in the
/// sheet, WITHOUT hash-suffixing or renaming anything. Used on the paths that
/// never run the full light-DOM lowering — shadow mode (today's default for
/// every leaf) and `$global` `@style` blocks in either mode — so the
/// escape-hatch marker never leaks into emitted CSS as literal invalid text.
/// `@keyframes $global fade-in { ... }` is not valid CSS; left unstripped, a
/// browser drops the whole at-rule and the animation silently dies.
pub fn strip_global_keyframe_markers(sheet: &mut StyleSheet) {
    strip_global_keyframe_markers_in_nodes(&mut sheet.nodes);
}

fn strip_global_keyframe_markers_in_nodes(nodes: &mut [StyleNode]) {
    for node in nodes {
        match node {
            StyleNode::AtRule(at) if at.name == "@keyframes" => {
                if let Some(name) = at.prelude.trim().strip_prefix("$global") {
                    at.prelude = name.trim().to_string();
                }
            }
            StyleNode::AtRule(at) => strip_global_keyframe_markers_in_nodes(&mut at.body),
            StyleNode::Rule(rule) => strip_global_keyframe_markers_in_nodes(&mut rule.nested),
            StyleNode::AtStatement(_) => {}
        }
    }
}

// ── @keyframes hash-suffixing ────────────────────────────────────────────

/// Collect `(original_name -> suffixed_name)` for every non-`$global`
/// `@keyframes` at-rule found anywhere in the sheet (top level, or nested one
/// level inside `@media`/`@supports`/`@container` — `@keyframes` cannot be
/// CSS-nested inside a normal style rule, so `rule.nested` never needs
/// scanning for definitions), renaming `at.prelude` in place.
///
/// Escape hatch, mirroring the existing `@style { $global ... }` convention
/// (`ast.rs`'s `SfcStyleScope::Global`): `@keyframes $global fade-in { ... }`
/// keeps the bare name and is excluded from the rename map, so a genuinely
/// shared cross-component animation still resolves by its authored name.
fn hash_keyframe_defs(sheet: &mut StyleSheet, scope: ScopeId) -> BTreeMap<String, String> {
    let mut renames = BTreeMap::new();
    hash_keyframe_defs_in_nodes(&mut sheet.nodes, scope, &mut renames);
    renames
}

fn hash_keyframe_defs_in_nodes(
    nodes: &mut [StyleNode],
    scope: ScopeId,
    renames: &mut BTreeMap<String, String>,
) {
    for node in nodes {
        match node {
            StyleNode::AtRule(at) if at.name == "@keyframes" => {
                let prelude = at.prelude.trim();
                if let Some(name) = prelude.strip_prefix("$global") {
                    at.prelude = name.trim().to_string();
                } else if !prelude.is_empty() {
                    let renamed = format!("{prelude}-{}", scope.0);
                    renames.insert(prelude.to_string(), renamed.clone());
                    at.prelude = renamed;
                }
            }
            StyleNode::AtRule(at) => hash_keyframe_defs_in_nodes(&mut at.body, scope, renames),
            StyleNode::Rule(rule) => hash_keyframe_defs_in_nodes(&mut rule.nested, scope, renames),
            StyleNode::AtStatement(_) => {}
        }
    }
}

/// Walk every declaration in the whole tree (top level, at-rule bodies, and
/// rule-nested) and rewrite `animation-name`/`animation` references for any
/// name present in `renames`.
fn rewrite_animation_refs(sheet: &mut StyleSheet, renames: &BTreeMap<String, String>) {
    rewrite_animation_refs_in_nodes(&mut sheet.nodes, renames);
}

fn rewrite_animation_refs_in_nodes(nodes: &mut [StyleNode], renames: &BTreeMap<String, String>) {
    for node in nodes {
        match node {
            StyleNode::Rule(rule) => {
                for decl in &mut rule.declarations {
                    if decl.prop == "animation-name" || decl.prop == "animation" {
                        decl.value = rewrite_animation_value(&decl.value, renames);
                    }
                }
                rewrite_animation_refs_in_nodes(&mut rule.nested, renames);
            }
            StyleNode::AtRule(at) => rewrite_animation_refs_in_nodes(&mut at.body, renames),
            StyleNode::AtStatement(_) => {}
        }
    }
}

/// Rewrite whole comma/whitespace-delimited identifier tokens matching a key
/// in `renames`. Never rewrites a token that merely CONTAINS a renamed name
/// as a substring (renaming `fade` must not corrupt `fade-in`). Paren-aware
/// on both splits so `animation: fade-in 1s cubic-bezier(0.4, 0, 0.2, 1);`
/// doesn't get split on the timing function's internal commas.
fn rewrite_animation_value(value: &str, renames: &BTreeMap<String, String>) -> String {
    split_top_level(value, ',')
        .into_iter()
        .map(|segment| {
            split_top_level_whitespace(segment)
                .into_iter()
                .map(|tok| renames.get(tok).map(String::as_str).unwrap_or(tok))
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect::<Vec<_>>()
        .join(", ")
}

// ── :host / :host() / :host-context() / ::slotted() / ::part() lowering ──

/// Lowering targets, in the priority order used to break same-position ties
/// (a parenthesized form always wins over the bare `:host` prefix it starts
/// with — `:host(`/`:host-context(` both begin with the literal `:host`).
#[derive(Clone, Copy)]
enum Pseudo {
    HostContext,
    Host,
    Slotted,
    Part,
    BareHost,
}

fn lower_shadow_pseudos_in_sheet(sheet: &mut StyleSheet) {
    lower_shadow_pseudos_in_nodes(&mut sheet.nodes);
}

fn lower_shadow_pseudos_in_nodes(nodes: &mut [StyleNode]) {
    for node in nodes {
        match node {
            StyleNode::Rule(rule) => {
                rule.selector = lower_shadow_pseudos(&rule.selector);
                lower_shadow_pseudos_in_nodes(&mut rule.nested);
            }
            StyleNode::AtRule(at) => lower_shadow_pseudos_in_nodes(&mut at.body),
            StyleNode::AtStatement(_) => {}
        }
    }
}

/// Lower every shadow-only pseudo in a (possibly comma-separated) selector
/// list. Splits on top-level commas first — `:host(.a, .b)`'s internal comma
/// must not be treated as a selector-list separator. No scope id is needed
/// here — every lowered form (`:scope`, `[data-aihu-slotted]`, `[part=...]`)
/// is a fixed string; the scope id only appears in the `@scope(...)` wrapper
/// ([`scope_authored_sheet`]).
fn lower_shadow_pseudos(selector: &str) -> String {
    split_top_level(selector, ',')
        .into_iter()
        .map(lower_shadow_pseudos_single)
        .collect::<Vec<_>>()
        .join(", ")
}

/// Lowering table:
///
/// | Authored (shadow)   | Lowered (light)              | Why |
/// |---|---|---|
/// | `:host`              | `:scope`                     | the host IS the `@scope` root itself |
/// | `:host(X)`            | `:scope:is(X)`               | host AND it also matches X — `:is()` because X may be a selector LIST (`:host(.a, .b)`) or a bare type selector (`:host(my-el)`, which fused directly onto `:scope` would parse as one broken pseudo-class) |
/// | `:host-context(X)`    | `:is(X) :scope`              | light DOM has real ancestors — simpler than the shadow original |
/// | `::slotted(*)`        | `[data-aihu-slotted]`        | needs the runtime companion marker, LDF §10 step 4 |
/// | `::slotted(X)`         | `:is(X)[data-aihu-slotted]` | ditto, compounded with X |
/// | `::part(name)`         | `[part~="name"]`            | `part` is a space-separated token list per spec, same as `class` |
fn lower_shadow_pseudos_single(selector: &str) -> String {
    let patterns: [(&str, Pseudo); 4] = [
        (":host-context(", Pseudo::HostContext),
        (":host(", Pseudo::Host),
        ("::slotted(", Pseudo::Slotted),
        ("::part(", Pseudo::Part),
    ];

    let mut out = String::new();
    let mut rest = selector;
    loop {
        let mut best: Option<(usize, Pseudo, usize)> = None;
        for (needle, kind) in patterns {
            if let Some(pos) = rest.find(needle) {
                if best.is_none_or(|(bp, ..)| pos < bp) {
                    best = Some((pos, kind, needle.len()));
                }
            }
        }
        // Bare `:host` only wins the tie when no parenthesized form starts at
        // the SAME position (`:host(`/`:host-context(` both begin with the
        // substring `:host`, so they'd otherwise be shadowed by this check).
        if let Some(pos) = rest.find(":host") {
            let covered_by_paren_form = best.is_some_and(|(bp, ..)| bp == pos);
            if !covered_by_paren_form && best.is_none_or(|(bp, ..)| pos < bp) {
                best = Some((pos, Pseudo::BareHost, ":host".len()));
            }
        }

        let Some((pos, kind, needle_len)) = best else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..pos]);
        let after_kw = &rest[pos + needle_len..];

        match kind {
            Pseudo::BareHost => {
                out.push_str(":scope");
                rest = after_kw;
            }
            Pseudo::Host => {
                let Some((inner, tail)) = split_matching_paren(after_kw) else {
                    out.push_str(&rest[pos..]);
                    break;
                };
                // `:is(...)`, not a fused/space-joined compound: X may be a
                // selector LIST (`:host(.a, .b)` is valid — matches either)
                // or a bare type selector (`:host(my-el)`, which concatenated
                // directly onto `:scope` would parse as the single broken
                // pseudo-class `:scopemy-el`).
                out.push_str(":scope:is(");
                out.push_str(inner.trim());
                out.push(')');
                rest = tail;
            }
            Pseudo::HostContext => {
                let Some((inner, tail)) = split_matching_paren(after_kw) else {
                    out.push_str(&rest[pos..]);
                    break;
                };
                out.push_str(":is(");
                out.push_str(inner.trim());
                out.push_str(") :scope");
                rest = tail;
            }
            Pseudo::Slotted => {
                let Some((inner, tail)) = split_matching_paren(after_kw) else {
                    out.push_str(&rest[pos..]);
                    break;
                };
                let inner = inner.trim();
                if inner != "*" {
                    out.push_str(":is(");
                    out.push_str(inner);
                    out.push(')');
                }
                out.push_str("[data-aihu-slotted]");
                rest = tail;
            }
            Pseudo::Part => {
                let Some((inner, tail)) = split_matching_paren(after_kw) else {
                    out.push_str(&rest[pos..]);
                    break;
                };
                // `~=`, not `=` — `part` is a space-separated token list per
                // spec (like `class`), so a multi-part `part="thumb track"`
                // must still match `::part(thumb)`.
                out.push_str("[part~=\"");
                out.push_str(inner.trim());
                out.push_str("\"]");
                rest = tail;
            }
        }
    }
    out
}

// ── shared text-splitting helpers (paren-aware) ──────────────────────────

/// `StyleRule.selector` is raw, unescaped author text (`style_parser.rs`'s
/// own docs: "may... contain `:is(...)`, attribute selectors" — e.g.
/// `[title="a, b"] .x`), and `Declaration.value` can likewise carry quoted
/// strings. None of the helpers below may split inside `(...)`, `[...]`, or a
/// `"..."`/`'...'` string — matching the discipline `apply.rs`'s
/// `split_top_level_semicolons`/`split_first_colon` already use for the same
/// reason.

/// Tracks paren/bracket depth and quote state while scanning one byte at a
/// time. `advance` returns `true` while inside a quoted string or a
/// bracketed/parenthesized region — i.e. NOT at top level.
#[derive(Default)]
struct ScanState {
    paren: u32,
    bracket: u32,
    quote: Option<u8>,
}

impl ScanState {
    fn advance(&mut self, b: u8) -> bool {
        if let Some(q) = self.quote {
            if b == q {
                self.quote = None;
            }
            return true;
        }
        match b {
            b'"' | b'\'' => {
                self.quote = Some(b);
                true
            }
            b'(' => {
                self.paren += 1;
                true
            }
            b')' => {
                self.paren = self.paren.saturating_sub(1);
                true
            }
            b'[' => {
                self.bracket += 1;
                true
            }
            b']' => {
                self.bracket = self.bracket.saturating_sub(1);
                true
            }
            _ => self.paren > 0 || self.bracket > 0,
        }
    }
}

/// Given text starting immediately AFTER an opening `(`, find the matching
/// `)` (honoring nesting, brackets, and quoted strings) and return
/// `(inner, rest_after_close_paren)`.
fn split_matching_paren(s: &str) -> Option<(&str, &str)> {
    let bytes = s.as_bytes();
    let mut state = ScanState {
        paren: 1,
        ..Default::default()
    };
    for (i, &b) in bytes.iter().enumerate() {
        if state.quote.is_some() {
            state.advance(b);
            continue;
        }
        match b {
            b'(' => state.paren += 1,
            b')' => {
                state.paren -= 1;
                if state.paren == 0 {
                    return Some((&s[..i], &s[i + 1..]));
                }
            }
            b'"' | b'\'' => {
                state.quote = Some(b);
            }
            _ => {}
        }
    }
    None
}

/// Split on top-level occurrences of `sep` (not inside `(...)`, `[...]`, or a
/// quoted string). Trims each segment.
fn split_top_level(s: &str, sep: char) -> Vec<&str> {
    let bytes = s.as_bytes();
    let mut out = Vec::new();
    let mut start = 0usize;
    let mut state = ScanState::default();
    let sep = sep as u8;
    for (i, &b) in bytes.iter().enumerate() {
        let protected = state.advance(b);
        if b == sep && !protected {
            out.push(s[start..i].trim());
            start = i + 1;
        }
    }
    out.push(s[start..].trim());
    out
}

/// Split on top-level whitespace (not inside `(...)`, `[...]`, or a quoted
/// string) — keeps `cubic-bezier(0.4, 0, 0.2, 1)` as one token.
fn split_top_level_whitespace(s: &str) -> Vec<&str> {
    let bytes = s.as_bytes();
    let mut out = Vec::new();
    let mut start: Option<usize> = None;
    let mut state = ScanState::default();
    for (i, &b) in bytes.iter().enumerate() {
        let protected = state.advance(b);
        if b.is_ascii_whitespace() && !protected {
            if let Some(s0) = start.take() {
                out.push(&s[s0..i]);
            }
        } else if start.is_none() {
            start = Some(i);
        }
    }
    if let Some(s0) = start {
        out.push(&s[s0..]);
    }
    out
}
