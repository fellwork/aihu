//! `apply.rs` — `@apply` expansion inside `@style` (Task 1.4, R-APPLY-PARSE).
//!
//! Consumes the structured rule tree from [`crate::style_parser`] and replaces
//! every rule's `@apply <tokens>` directives in place:
//!
//! - **Base** tokens (no variant prefix) inline the *same declarations* their
//!   utility class produces ([`utility_to_css`]) directly into the current
//!   rule's declaration list, in source order, before the rule's authored
//!   declarations? No — appended after, so authored declarations can override
//!   (last-wins, matching CSS). Actually `@apply` directives are emitted in
//!   source order relative to the rule body; we splice the inlined declarations
//!   at the point the directive appears. See [`expand_rule`].
//! - **Variant** tokens (`hover:`, `data-[state=open]:`, `group:`, `md:`,
//!   `dark:`, arbitrary `[&>x]:`, host/slotted/part, …) resolve STRUCTURALLY via
//!   [`crate::variants::resolve_variants`] against `&` (the recipe's own
//!   selector) to a *nested* rule on the current rule — `@apply hover:bg-accent`
//!   inside `.btn {}` becomes `.btn { & { … } &:hover { background: … } }`. We
//!   do NOT call `emit_token` + strip the class selector (that yields the wrong
//!   `.hover\:bg-accent:hover` output — Codex).
//!
//! Unknown base utility → [`CompileError::UnknownApplyUtility`]. In a `$global`
//! block, a variant token that implies `&`/host/relational scoping →
//! [`CompileError::GlobalApplyVariant`] (base utilities still allowed).

use crate::ast::SfcStyleScope;
use crate::emit::CompileError;
use crate::style_parser::{
    parse_style, ApplyDirective, AtRule, Declaration, StyleNode, StyleRule, StyleSheet,
};
use crate::theme::ThemeRegistry;
use crate::tokens::utility_to_css;
use crate::variants::{resolve_variants, split_variants};

/// Parse an authored `@style` body, expand every `@apply`, and render back to
/// CSS. This is the single entry the emitter calls in place of folding the raw
/// `@style` text verbatim.
pub fn expand_apply(
    style_content: &str,
    scope: SfcStyleScope,
    theme: &ThemeRegistry,
) -> Result<String, CompileError> {
    Ok(expand_apply_sheet(style_content, scope, theme)?.to_css())
}

/// As [`expand_apply`], but returns the expanded [`StyleSheet`] AST instead of
/// rendering it to a string — the light-DOM selector-rewrite pass (LDF §10
/// step 3, `light_scope.rs`) needs the AST, since it must run AFTER `@apply`
/// expansion (which synthesizes `:host(...)`/`::slotted(...)`/`::part(...)`
/// text at arbitrary nesting depth) but BEFORE rendering.
pub fn expand_apply_sheet(
    style_content: &str,
    scope: SfcStyleScope,
    theme: &ThemeRegistry,
) -> Result<StyleSheet, CompileError> {
    let mut sheet = parse_style(style_content).map_err(|e| CompileError::StyleParse {
        detail: e.to_string(),
    })?;
    expand_sheet(&mut sheet, scope, theme)?;
    Ok(sheet)
}

/// Expand `@apply` across every node in a parsed sheet, in place.
fn expand_sheet(
    sheet: &mut StyleSheet,
    scope: SfcStyleScope,
    theme: &ThemeRegistry,
) -> Result<(), CompileError> {
    for node in &mut sheet.nodes {
        expand_node(node, scope, theme)?;
    }
    Ok(())
}

fn expand_node(
    node: &mut StyleNode,
    scope: SfcStyleScope,
    theme: &ThemeRegistry,
) -> Result<(), CompileError> {
    match node {
        StyleNode::Rule(rule) => expand_rule(rule, scope, theme),
        StyleNode::AtRule(at) => expand_at_rule(at, scope, theme),
        StyleNode::AtStatement(_) => Ok(()),
    }
}

fn expand_at_rule(
    at: &mut AtRule,
    scope: SfcStyleScope,
    theme: &ThemeRegistry,
) -> Result<(), CompileError> {
    for node in &mut at.body {
        expand_node(node, scope, theme)?;
    }
    Ok(())
}

/// Expand a single rule: inline base-utility declarations, lift variant tokens
/// into nested rules, recurse into already-nested rules, then drop the consumed
/// `@apply` directives.
fn expand_rule(
    rule: &mut StyleRule,
    scope: SfcStyleScope,
    theme: &ThemeRegistry,
) -> Result<(), CompileError> {
    // Take the directives out; we re-classify their tokens into inline
    // declarations (base) and nested rules (variant).
    let applies = std::mem::take(&mut rule.applies);
    let mut inlined: Vec<Declaration> = Vec::new();
    let mut nested_from_apply: Vec<StyleNode> = Vec::new();

    for ApplyDirective { tokens } in &applies {
        for token in tokens {
            let (variants, base) = split_variants(token);
            let body = utility_to_css(&base).ok_or_else(|| CompileError::UnknownApplyUtility {
                token: token.clone(),
            })?;

            if variants.is_empty() {
                // Base utility: inline its declarations into the current rule.
                inlined.extend(parse_declarations(&body));
                continue;
            }

            // Variant token → structural nested rule on `&`.
            let resolved = resolve_variants(&variants, "&", theme);

            // `$global` blocks have no `&`/host scope: reject scope-implying
            // variants; a bare breakpoint/container/dark variant has no
            // host/relational implication and is allowed.
            if matches!(scope, SfcStyleScope::Global) && resolved.needs_scope {
                return Err(CompileError::GlobalApplyVariant {
                    token: token.clone(),
                });
            }

            let decls = parse_declarations(&body);
            let nested_rule = StyleRule {
                selector: resolved.selector,
                declarations: decls,
                applies: Vec::new(),
                nested: Vec::new(),
            };

            // Wrap in dark-cascade and/or at-rule layers as needed. The dark
            // cascade rewrites the selector to the Firefox-safe gate; the
            // at-rule (media/container) wraps the whole thing.
            let mut node = if resolved.dark_cascade {
                dark_cascade_node(nested_rule)
            } else {
                StyleNode::Rule(nested_rule)
            };
            if let Some(at) = resolved.at_rule {
                let (name, prelude) = split_at_prelude(&at);
                node = StyleNode::AtRule(AtRule {
                    name,
                    prelude,
                    body: vec![node],
                });
            }
            nested_from_apply.push(node);
        }
    }

    // Inlined base declarations come first (so the rule's own authored
    // declarations, appended after, win on conflict — CSS last-declaration
    // wins). Prepend to preserve that ordering.
    if !inlined.is_empty() {
        let mut decls = inlined;
        decls.append(&mut rule.declarations);
        rule.declarations = decls;
    }

    // Variant-derived nested rules go before any authored nested nodes so the
    // expanded output reads `&:hover {…}` right after the base declarations.
    if !nested_from_apply.is_empty() {
        nested_from_apply.append(&mut rule.nested);
        rule.nested = nested_from_apply;
    }

    // Recurse into nested rules (authored or expanded — expanded ones carry no
    // further `@apply`, so this is a no-op for them but keeps the walk uniform).
    for node in &mut rule.nested {
        expand_node(node, scope, theme)?;
    }

    Ok(())
}

/// Build the Firefox-safe dark-cascade node for a resolved variant rule. Mirrors
/// the gate the emitter uses (`emit_token`): the rule applies only under
/// `:host([data-theme="dark"])` or `:root.dark`. The nested `&` in the resolved
/// selector is expanded against each gate prefix.
fn dark_cascade_node(rule: StyleRule) -> StyleNode {
    // `rule.selector` is the resolved selector starting from `&` (e.g. `&` for a
    // bare `dark:`, or `&:hover` for `dark:hover:`). Compose the two gated
    // selectors by substituting the host/root prefix for the leading `&`.
    let sel = rule.selector;
    let host = sel.replacen('&', ":host([data-theme=\"dark\"]) &", 1);
    let root = sel.replacen('&', ":root.dark &", 1);
    StyleNode::Rule(StyleRule {
        selector: format!("{host}, {root}"),
        declarations: rule.declarations,
        applies: Vec::new(),
        nested: Vec::new(),
    })
}

/// Split a wrapping at-rule string (`@media (min-width: 600px)`) into its name
/// (`@media`) and prelude (`(min-width: 600px)`).
fn split_at_prelude(at: &str) -> (String, String) {
    let at = at.trim();
    match at.find(char::is_whitespace) {
        Some(i) => (at[..i].to_string(), at[i..].trim().to_string()),
        None => (at.to_string(), String::new()),
    }
}

/// Split a utility's emitted CSS body (`"display: flex; align-items: center;"`)
/// into individual [`Declaration`]s. The bodies the token table produces are
/// simple `prop: value;` lists, but values can contain `:` (e.g.
/// `cubic-bezier(...)`) and `;` inside parens — so split on top-level `;`/`:`
/// honouring parens/brackets/strings (reusing the same discipline as the parser).
fn parse_declarations(body: &str) -> Vec<Declaration> {
    let mut out = Vec::new();
    for chunk in split_top_level_semicolons(body) {
        let chunk = chunk.trim();
        if chunk.is_empty() {
            continue;
        }
        if let Some((prop, value)) = split_first_colon(chunk) {
            out.push(Declaration {
                prop: prop.trim().to_string(),
                value: value.trim().to_string(),
            });
        }
        // A chunk with no top-level `:` (e.g. a nested `& > * + * { … }` body
        // from `divide-*`/`space-*`) is not a flat declaration; those utilities
        // are not used via `@apply` in the current recipes, and emitting them as
        // a raw declaration would be wrong. We drop such non-declaration chunks
        // here rather than mis-emit; if a recipe needs them, they should be
        // authored directly (R-NO-PREMIGRATION-BREAK regression guards this).
    }
    out
}

/// Split on top-level `;` (not inside `(...)`, `[...]`, or strings).
fn split_top_level_semicolons(body: &str) -> Vec<&str> {
    let bytes = body.as_bytes();
    let mut out = Vec::new();
    let mut start = 0usize;
    let mut paren = 0u32;
    let mut bracket = 0u32;
    let mut i = 0usize;
    while i < bytes.len() {
        match bytes[i] {
            b'"' | b'\'' => {
                let q = bytes[i];
                i += 1;
                while i < bytes.len() {
                    if bytes[i] == b'\\' {
                        i += 2;
                        continue;
                    }
                    if bytes[i] == q {
                        i += 1;
                        break;
                    }
                    i += 1;
                }
                continue;
            }
            b'(' => paren += 1,
            b')' => paren = paren.saturating_sub(1),
            b'[' => bracket += 1,
            b']' => bracket = bracket.saturating_sub(1),
            b';' if paren == 0 && bracket == 0 => {
                out.push(&body[start..i]);
                start = i + 1;
            }
            _ => {}
        }
        i += 1;
    }
    if start < body.len() {
        out.push(&body[start..]);
    }
    out
}

/// Split a declaration chunk on its first top-level `:` (none inside
/// `(...)`/`[...]`/strings).
fn split_first_colon(chunk: &str) -> Option<(&str, &str)> {
    let bytes = chunk.as_bytes();
    let mut paren = 0u32;
    let mut bracket = 0u32;
    let mut i = 0usize;
    while i < bytes.len() {
        match bytes[i] {
            b'"' | b'\'' => {
                let q = bytes[i];
                i += 1;
                while i < bytes.len() {
                    if bytes[i] == b'\\' {
                        i += 2;
                        continue;
                    }
                    if bytes[i] == q {
                        i += 1;
                        break;
                    }
                    i += 1;
                }
                continue;
            }
            b'(' => paren += 1,
            b')' => paren = paren.saturating_sub(1),
            b'[' => bracket += 1,
            b']' => bracket = bracket.saturating_sub(1),
            b':' if paren == 0 && bracket == 0 => {
                return Some((&chunk[..i], &chunk[i + 1..]));
            }
            _ => {}
        }
        i += 1;
    }
    None
}
