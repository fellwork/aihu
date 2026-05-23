//! `emit.rs` — scoped-output emitter (Plan 2 Tasks 4, 5, 6).
//!
//! Turns a scanned utility set into CSS. Two modes:
//!
//! - [`OutputMode::Flat`] — Plan 1 back-compat: `.class { … }` global-ish rules.
//! - [`OutputMode::Scoped`] — the new default for `compile_sfc`. Every rule
//!   lives inside the SFC's shadow root (the compiler folds the output into the
//!   component's `<style>`), so there is NO global utility stylesheet. Class
//!   selectors inside a shadow `<style>` only match that shadow tree — that IS
//!   the scoping mechanism (per spec §6.3). We also fold the authored `@style`
//!   block (scoped folded in; `$global` passed through) and the theme tokens.
//!
//! Variant resolution (Tasks 5/6) happens here: each scanned token is split via
//! `variants::split_variants`, the base utility is compiled via `tokens`, then
//! the variants wrap/append to the selector. Dark-mode variants (`dark:`,
//! `host-context-dark:`) emit a custom-property cascade — NEVER
//! `:host-context()` (Firefox workaround, `decision-firefox-host-context-workaround`).

use crate::ast::{SfcAst, SfcStyleScope};
use crate::scanner::{scan, ScanResult};
use crate::theme::{extract_theme_blocks, ThemeRegistry};
use crate::tokens::utility_to_css;
use crate::variants::{split_variants, Variant};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputMode {
    Flat,
    Scoped,
}

/// CSS-escape a class name for use in a selector (`bg-[#fff]` → `bg-\[\#fff\]`).
fn escape_class(class: &str) -> String {
    let mut out = String::with_capacity(class.len() + 4);
    for c in class.chars() {
        if matches!(c, '[' | ']' | '#' | '(' | ')' | '.' | '%' | '/' | ':' | ',') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// Compile a single scanned token (which may carry variant prefixes) into a CSS
/// rule string, or `None` if the base utility is unknown.
fn emit_token(token: &str, theme: &ThemeRegistry) -> Option<String> {
    let (variants, base) = split_variants(token);
    let body = utility_to_css(&base)?;
    let class_sel = format!(".{}", escape_class(token));

    // The base (innermost) selector and declaration body.
    let mut selector = class_sel;
    let mut media: Option<String> = None;
    let mut dark_cascade = false;

    for v in &variants {
        match v {
            Variant::Host => selector = format!(":host({selector})"),
            Variant::Slotted => selector = format!("::slotted({selector})"),
            Variant::SlottedTag(tag) => selector = format!("::slotted({tag}{selector})"),
            Variant::Part(name) => selector = format!("::part({name})"),
            Variant::Pseudo(pc) => selector = format!("{selector}:{pc}"),
            Variant::ArbitrarySelector(sel) => {
                // `[&>div]:` → substitute `&` for the base selector.
                selector = sel.replace('&', &selector);
            }
            Variant::Breakpoint(bp) => {
                if let Some(min) = theme.breakpoint(bp) {
                    media = Some(format!("(min-width: {min})"));
                }
            }
            Variant::Dark | Variant::HostContextDark => {
                dark_cascade = true;
            }
        }
    }

    let rule = if dark_cascade {
        // Firefox-safe dark cascade: gate the rule on the consumer's dark flag
        // (a `data-theme="dark"` host attr or a `.dark` root class) rather than
        // the host-context pseudo (unsupported in Firefox). Consumer contract:
        // set `data-theme="dark"` on the host element OR add `.dark` to :root,
        // and define the dark token values there. The dark variant's rule then
        // only applies under those scopes.
        format!(
            "/* dark cascade (Firefox-safe; see decision-firefox-host-context-workaround) */\n\
             :host([data-theme=\"dark\"]) {selector}, \
             :root.dark {selector} {{ {body} }}\n"
        )
    } else {
        format!("{selector} {{ {body} }}\n")
    };

    Some(match media {
        Some(q) => format!("@media {q} {{\n{rule}}}\n"),
        None => rule,
    })
}

/// Emit CSS for a scanned utility set in the given mode.
pub fn emit(result: &ScanResult, theme: &ThemeRegistry, mode: OutputMode) -> String {
    let mut out = String::new();
    for token in &result.utilities {
        match mode {
            OutputMode::Flat => {
                // Flat back-compat: only plain utilities, no variant wrapping.
                if let Some(body) = utility_to_css(token) {
                    out.push_str(&format!(".{token} {{ {body} }}\n"));
                }
            }
            OutputMode::Scoped => {
                if let Some(rule) = emit_token(token, theme) {
                    out.push_str(&rule);
                }
            }
        }
    }
    out
}

/// Compile a full SFC AST to scoped CSS: theme tokens (`:host`-level custom
/// props) + scanned utility rules + the folded authored `@style` block.
pub fn emit_sfc_scoped(ast: &SfcAst) -> String {
    let mut theme = ThemeRegistry::with_aihu_defaults();

    // Parse @theme directives from the authored style block first so utilities
    // and breakpoints see overrides.
    if let Some(style) = &ast.style {
        let theme_bodies = extract_theme_blocks(&style.content);
        if !theme_bodies.is_empty() {
            theme.apply_theme_block(&theme_bodies);
        }
    }

    let result = scan(ast);
    let mut out = String::new();

    // 1. Theme tokens at :host so var(--color-*) resolves inside the shadow.
    out.push_str(&theme.emit_host_tokens());

    // 2. Scanned utility rules (scoped).
    out.push_str(&emit(&result, &theme, OutputMode::Scoped));

    // 3. Fold the authored @style block (minus @theme directives).
    if let Some(style) = &ast.style {
        let authored = strip_theme_blocks(&style.content);
        let authored = authored.trim();
        if !authored.is_empty() {
            match style.scope {
                // Scoped: it already lives in the shadow <style>; pass through.
                SfcStyleScope::Scoped => {
                    out.push_str("/* authored @style (scoped) */\n");
                    out.push_str(authored);
                    out.push('\n');
                }
                // Global ($global): passed through unscoped (edge E6). The
                // compiler hoists this out of the shadow root.
                SfcStyleScope::Global => {
                    out.push_str("/* authored @style ($global — unscoped) */\n");
                    out.push_str(authored);
                    out.push('\n');
                }
            }
        }
    }

    out
}

/// Remove `@theme { ... }` blocks from style content (they become host tokens,
/// not raw CSS).
fn strip_theme_blocks(style_content: &str) -> String {
    let mut out = String::new();
    let mut rest = style_content;
    while let Some(at) = rest.find("@theme") {
        out.push_str(&rest[..at]);
        let after = &rest[at + "@theme".len()..];
        let Some(open) = after.find('{') else {
            // Malformed — keep the rest verbatim and stop.
            out.push_str(&rest[at..]);
            return out;
        };
        let body_start = open + 1;
        let mut depth = 1u32;
        let mut end = body_start;
        for (i, c) in after[body_start..].char_indices() {
            match c {
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        end = body_start + i;
                        break;
                    }
                }
                _ => {}
            }
        }
        rest = &after[end + 1..];
    }
    out.push_str(rest);
    out
}
