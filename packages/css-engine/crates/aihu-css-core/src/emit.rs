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
use crate::progressive::ProgressiveRegistry;
use crate::scanner::{scan, ScanResult};
use crate::theme::{extract_theme_blocks, ThemeRegistry};
use crate::tokens::{animation_keyframes, utility_to_css};
use crate::variants::{split_variants, AttrMatch, Variant};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputMode {
    Flat,
    Scoped,
}

/// A recoverable error raised while emitting CSS from an SFC AST.
///
/// This is the precursor error channel (R-RESULT): `emit_sfc_scoped` /
/// `compile_sfc_scoped` / the per-SFC cache return `Result<String, CompileError>`
/// so later passes (`@apply` unknown-utility, variant validation) can hard-error
/// instead of silently dropping. The `aihu-css-compile` binary prints the
/// `Display` message to stderr and exits non-zero; the TS bridge surfaces it as
/// a thrown `Error` carrying that message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompileError {
    /// An authored `@style` block opened `@theme` with no `{ … }` body.
    MalformedTheme { detail: String },
    /// An `@apply` directive referenced a utility token whose base utility is
    /// not in the table (Task 1.4 — unknown utility hard-errors).
    UnknownApplyUtility { token: String },
    /// An `@apply` inside a `$global` `@style` block used a variant token that
    /// implies `&`/host/relational scoping (Task 1.4 — base utilities allowed in
    /// `$global`, scope-implying variants rejected).
    GlobalApplyVariant { token: String },
    /// A `@style` block failed to parse structurally (R-SHARED-PARSER).
    StyleParse { detail: String },
}

impl std::fmt::Display for CompileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CompileError::MalformedTheme { detail } => {
                write!(f, "malformed @theme block in authored @style: {detail}")
            }
            CompileError::UnknownApplyUtility { token } => {
                write!(f, "unknown utility in @apply: `{token}`")
            }
            CompileError::GlobalApplyVariant { token } => {
                write!(
                    f,
                    "@apply in a $global @style block may not use the scope-implying \
                     variant `{token}` (only base utilities are allowed in $global)"
                )
            }
            CompileError::StyleParse { detail } => {
                write!(f, "failed to parse @style block: {detail}")
            }
        }
    }
}

impl std::error::Error for CompileError {}

/// CSS-escape a class name for use in a selector (`bg-[#fff]` → `bg-\[\#fff\]`).
fn escape_class(class: &str) -> String {
    let mut out = String::with_capacity(class.len() + 4);
    for c in class.chars() {
        if matches!(
            c,
            '[' | ']' | '#' | '(' | ')' | '.' | '%' | '/' | ':' | ',' | '@' | '=' | '"'
        ) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// If `token`'s leading prefix names a registered progressive feature, return
/// its `(prefix, base)` split. `view-transition:slide` → `("view-transition",
/// "slide")`; `text-balance:` → `("text-balance", "")`.
fn progressive_split<'a>(token: &'a str, prog: &ProgressiveRegistry) -> Option<(&'a str, &'a str)> {
    let colon = token.find(':')?;
    let prefix = &token[..colon];
    if prog.is_feature(prefix) {
        Some((prefix, &token[colon + 1..]))
    } else {
        None
    }
}

/// Compile a single scanned token (which may carry variant prefixes) into a CSS
/// rule string, or `None` if the base utility is unknown.
///
/// Progressive-feature prefixes (`view-transition:`, `anchor:`, `popover:`,
/// `text-balance:`) are routed to the [`ProgressiveRegistry`] emitter (Plan 3
/// Task 4) instead of the standard selector path.
fn emit_token(token: &str, theme: &ThemeRegistry, prog: &ProgressiveRegistry) -> Option<String> {
    if let Some((prefix, base)) = progressive_split(token, prog) {
        return prog.emit(prefix, base);
    }

    let (variants, base) = split_variants(token);
    let body = utility_to_css(&base)?;
    let class_sel = format!(".{}", escape_class(token));

    // The base (innermost) selector and declaration body.
    let mut selector = class_sel;
    // Wrapping at-rule (e.g. `@media (min-width: …)` for breakpoints or
    // `@container (min-width: …)` for container queries). Generalized from the
    // old `media: Option<String>` slot so both `@media` and `@container` wrap
    // the rule uniformly: `<at-rule> { <rule> }`.
    let mut at_rule: Option<String> = None;
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
            Variant::Group(Some(state)) => {
                // `group-hover:bg-x` → `.group:hover .group-hover\:bg-x`.
                // Prepend a descendant-combinator ancestor selector: the rule
                // applies to the element bearing this class when an ancestor
                // marked `class="group"` is in `:<state>`. Within a shadow root
                // both the marker and the styled element live in the same tree,
                // so the class selectors match per spec §6.3 scoping.
                selector = format!(".group:{state} {selector}");
            }
            Variant::Peer(Some(state)) => {
                // `peer-checked:bg-x` → `.peer:checked ~ .peer-checked\:bg-x`.
                // Prepend a subsequent-sibling-combinator selector: the rule
                // applies when a PRIOR sibling marked `class="peer"` is in
                // `:<state>`. CSS can only look backward to earlier siblings,
                // so `peer` must appear before the styled element in source.
                selector = format!(".peer:{state} ~ {selector}");
            }
            // Bare `group`/`peer` never reach here (they are marker utilities,
            // not variant prefixes); a `None` state is unreachable but handled
            // defensively as a no-op so the base selector is emitted unchanged.
            Variant::Group(None) | Variant::Peer(None) => {}
            // aria-*/data-* attribute variants compile to an attribute selector
            // appended to the base: `aria-checked:` → `.cls[aria-checked="true"]`,
            // `data-[state=open]:` → `.cls[data-state="open"]`. A keyword data-*
            // (`data-active:`) emits a presence selector `[data-active]`.
            Variant::Aria(m) => selector = format!("{selector}{}", attr_selector("aria", m)),
            Variant::Data(m) => selector = format!("{selector}{}", attr_selector("data", m)),
            Variant::Breakpoint(bp) => {
                if let Some(min) = theme.breakpoint(bp) {
                    at_rule = Some(format!("@media (min-width: {min})"));
                }
            }
            // Container queries wrap the rule in an `@container` at-rule keyed on
            // the container breakpoint scale (mirrors `breakpoint()`).
            Variant::Container(bp) => {
                if let Some(min) = theme.container_breakpoint(bp) {
                    at_rule = Some(format!("@container (min-width: {min})"));
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

    let rule = match at_rule {
        Some(at) => format!("{at} {{\n{rule}}}\n"),
        None => rule,
    };

    // Hoist the @keyframes an `animate-*` utility depends on as a top-level
    // sibling rule (it cannot live nested inside the selector body). Re-emitting
    // an identical block is idempotent in CSS, so per-occurrence emission is
    // safe. `base` is the variant-stripped class (e.g. `animate-spin`).
    Some(match animation_keyframes(&base) {
        Some(kf) => format!("{rule}{kf}\n"),
        None => rule,
    })
}

/// Build an attribute-selector fragment for an `aria-*`/`data-*` variant.
///
/// `attr_selector("aria", Name{checked, true})` → `[aria-checked="true"]`;
/// `attr_selector("data", NameValue{state, open})` → `[data-state="open"]`;
/// `attr_selector("data", Name{active, false})` → `[data-active]` (presence).
pub(crate) fn attr_selector(family: &str, m: &AttrMatch) -> String {
    match m {
        AttrMatch::Name { name, imply_true } => {
            if *imply_true {
                format!("[{family}-{name}=\"true\"]")
            } else {
                format!("[{family}-{name}]")
            }
        }
        AttrMatch::NameValue { name, value } => {
            format!("[{family}-{name}=\"{value}\"]")
        }
    }
}

/// Emit CSS for a scanned utility set in the given mode.
pub fn emit(result: &ScanResult, theme: &ThemeRegistry, mode: OutputMode) -> String {
    emit_with_progressive(result, theme, &ProgressiveRegistry::with_builtins(), mode)
}

/// As [`emit`], but with an explicit [`ProgressiveRegistry`] (so callers can
/// share one registry across an SFC compile).
pub fn emit_with_progressive(
    result: &ScanResult,
    theme: &ThemeRegistry,
    prog: &ProgressiveRegistry,
    mode: OutputMode,
) -> String {
    let mut out = String::new();
    for token in &result.utilities {
        match mode {
            OutputMode::Flat => {
                // Flat back-compat: only plain utilities, no variant wrapping.
                if let Some(body) = utility_to_css(token) {
                    out.push_str(&format!(".{token} {{ {body} }}\n"));
                    if let Some(kf) = animation_keyframes(token) {
                        out.push_str(kf);
                        out.push('\n');
                    }
                }
            }
            OutputMode::Scoped => {
                if let Some(rule) = emit_token(token, theme, prog) {
                    out.push_str(&rule);
                }
            }
        }
    }
    out
}

/// Compile a full SFC AST to scoped CSS: theme tokens (`:host`-level custom
/// props) + scanned utility rules + the folded authored `@style` block.
pub fn emit_sfc_scoped(ast: &SfcAst) -> Result<String, CompileError> {
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
    let prog = ProgressiveRegistry::with_builtins();
    let mut out = String::new();

    // 1. Theme tokens at :host so var(--color-*) resolves inside the shadow.
    out.push_str(&theme.emit_host_tokens());

    // 1b. Preflight border reset (Tailwind v4 parity). Browsers default
    // `border-style: none`, so a bare `.border { border-width: 1px }` paints
    // nothing. Emit a single one-time rule so every border utility renders a
    // visible solid line. This is one rule per sheet (not per token), so the
    // size impact is negligible; the matching utility wins by specificity.
    out.push_str("*, ::before, ::after { border-style: solid; border-width: 0; }\n");

    // 2. Scanned utility rules (scoped) — progressive prefixes routed via `prog`.
    out.push_str(&emit_with_progressive(
        &result,
        &theme,
        &prog,
        OutputMode::Scoped,
    ));

    // 3. Fold the authored @style block (minus @theme directives), expanding
    //    any `@apply` directives first (Task 1.4). Base utilities inline as
    //    declarations; variant tokens lift to nested `&…` rules on the recipe's
    //    own selector. Unknown utilities / illegal `$global` variants hard-error.
    if let Some(style) = &ast.style {
        let stripped = strip_theme_blocks(&style.content)?;
        if !stripped.trim().is_empty() {
            let authored = crate::apply::expand_apply(&stripped, style.scope, &theme)?;
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
    }

    Ok(out)
}

/// Remove `@theme { ... }` blocks from style content (they become host tokens,
/// not raw CSS).
///
/// An `@theme` opener with no `{ … }` body is a malformed authored block and
/// now hard-errors via [`CompileError`] (R-RESULT) instead of silently keeping
/// the broken text verbatim — the first real error this `Result` channel
/// surfaces. Later passes (`@apply`, variant validation) add more variants.
fn strip_theme_blocks(style_content: &str) -> Result<String, CompileError> {
    let mut out = String::new();
    let mut rest = style_content;
    while let Some(at) = rest.find("@theme") {
        out.push_str(&rest[..at]);
        let after = &rest[at + "@theme".len()..];
        let Some(open) = after.find('{') else {
            // Malformed: `@theme` with no `{` body. Hard-error rather than
            // emitting the broken text verbatim.
            return Err(CompileError::MalformedTheme {
                detail: "expected `{` after `@theme`".to_string(),
            });
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
    Ok(out)
}
