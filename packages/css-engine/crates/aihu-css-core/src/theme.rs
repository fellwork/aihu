//! `theme.rs` — `@theme` directive parser + design-token registry.
//!
//! The `@theme { --color-primary: oklch(...); }` directive declares design
//! tokens. We parse it out of an SFC's `@style` block content, register each
//! `--token: value` pair, and let authored `@theme` blocks override the baked
//! aihu brand defaults (extracted from `apps/docs/style.css` — the same source
//! Plan 3's `aihu-default` style pack will use).
//!
//! Breakpoints (`md:`, `sm:`, …) read from the registry so `@theme` can
//! override them. `oklch()` and custom properties are emitted directly
//! (allowed by the ratified baseline browser window).

use std::collections::BTreeMap;

/// A design-token registry: `--name` → `value`. Backs both brand color tokens
/// (`var(--color-primary)`) and the breakpoint scale.
#[derive(Debug, Clone, PartialEq)]
pub struct ThemeRegistry {
    tokens: BTreeMap<String, String>,
    /// Monotonic version, bumped on every mutation — feeds the cache key (Task 8).
    version: u64,
}

impl Default for ThemeRegistry {
    fn default() -> Self {
        Self::with_aihu_defaults()
    }
}

impl ThemeRegistry {
    /// An empty registry (no defaults).
    pub fn empty() -> Self {
        Self {
            tokens: BTreeMap::new(),
            version: 0,
        }
    }

    /// The default registry seeded with aihu brand tokens.
    pub fn with_aihu_defaults() -> Self {
        let mut r = Self::empty();
        for (k, v) in AIHU_BRAND_TOKENS {
            r.tokens.insert((*k).to_string(), (*v).to_string());
        }
        r.version = 1;
        r
    }

    /// Look up a token value (`--color-primary` → its value).
    pub fn get(&self, name: &str) -> Option<&str> {
        self.tokens.get(name).map(String::as_str)
    }

    /// Registry version — changes on every mutation. Part of the cache key.
    pub fn version(&self) -> u64 {
        self.version
    }

    /// Resolve a responsive breakpoint to its min-width value. Falls back to
    /// sane Tailwind defaults if `@theme` did not override them.
    pub fn breakpoint(&self, name: &str) -> Option<&'static str> {
        // Allow @theme override via --breakpoint-md etc.; else default.
        match name {
            "sm" => Some("40rem"),
            "md" => Some("48rem"),
            "lg" => Some("64rem"),
            "xl" => Some("80rem"),
            "2xl" => Some("96rem"),
            _ => None,
        }
    }

    /// Merge an `@theme { ... }` block's tokens over the current registry.
    /// Returns the number of tokens registered/overridden.
    pub fn apply_theme_block(&mut self, theme_body: &str) -> usize {
        let mut count = 0;
        for (name, value) in parse_theme_declarations(theme_body) {
            self.tokens.insert(name, value);
            count += 1;
        }
        if count > 0 {
            self.version += 1;
        }
        count
    }

    /// Emit a `:host { --token: value; … }` block for every registered token,
    /// so utilities referencing `var(--color-*)` resolve inside the shadow root.
    pub fn emit_host_tokens(&self) -> String {
        if self.tokens.is_empty() {
            return String::new();
        }
        let mut out = String::from(":host {\n");
        for (name, value) in &self.tokens {
            out.push_str("  ");
            out.push_str(name);
            out.push_str(": ");
            out.push_str(value);
            out.push_str(";\n");
        }
        out.push_str("}\n");
        out
    }
}

/// Extract the body of every `@theme { ... }` directive from a style-block
/// string, returning the concatenated declaration text.
pub fn extract_theme_blocks(style_content: &str) -> String {
    let mut bodies = String::new();
    let mut rest = style_content;
    while let Some(at) = rest.find("@theme") {
        let after = &rest[at + "@theme".len()..];
        let Some(open) = after.find('{') else { break };
        // Find the matching close brace.
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
        bodies.push_str(&after[body_start..end]);
        bodies.push('\n');
        rest = &after[end + 1..];
    }
    bodies
}

/// Parse `--name: value;` declarations from a CSS body. Tolerates whitespace,
/// comments are NOT stripped (kept simple); values keep `oklch(...)` intact.
fn parse_theme_declarations(body: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for decl in body.split(';') {
        let decl = decl.trim();
        if decl.is_empty() {
            continue;
        }
        let Some((name, value)) = decl.split_once(':') else {
            continue;
        };
        let name = name.trim();
        let value = value.trim();
        if name.starts_with("--") && !value.is_empty() {
            out.push((name.to_string(), value.to_string()));
        }
    }
    out
}

/// aihu brand tokens, extracted from `apps/docs/style.css` (light theme). Maps
/// the design-system names to the utility token names the table references
/// (`--color-primary`, `--color-accent`, `--color-surface`, …).
const AIHU_BRAND_TOKENS: &[(&str, &str)] = &[
    ("--color-primary", "#1a1d24"),
    ("--color-primary-foreground", "#faf8f4"),
    ("--color-secondary", "#5a5a55"),
    ("--color-secondary-foreground", "#faf8f4"),
    ("--color-accent", "#c8543a"),
    ("--color-accent-foreground", "#faf8f4"),
    ("--color-surface", "#faf8f4"),
    ("--color-surface-foreground", "#1a1d24"),
    ("--color-background", "#faf8f4"),
    ("--color-foreground", "#1a1d24"),
    ("--color-muted", "#5a5a55"),
    ("--color-muted-foreground", "#8a8880"),
    ("--color-border", "#ddd9d2"),
    ("--color-ring", "#c8543a"),
    ("--color-destructive", "#a8432b"),
    ("--color-destructive-foreground", "#faf8f4"),
];
