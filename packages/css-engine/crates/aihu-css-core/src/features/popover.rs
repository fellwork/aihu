//! `popover:` — Popover API with a portal+positioning fallback (Plan 3 Task 7).
//!
//! Emits popover CSS gated behind `@supports selector(:popover-open)`.
//! `js_fallback()` returns `"popoverFallback"` — the
//! `@aihu/css-engine/runtime/progressive` shim emulates the top layer with a
//! portal and positions the panel using the SAME floating-ui shim as `anchor:`
//! (no duplication — keeps the `progressive` sub-export under its 3 KB budget).

use crate::progressive::ProgressiveFeature;

/// `popover:<name>` → popover CSS, `@supports`-gated, with a portal JS fallback.
pub struct Popover;

impl ProgressiveFeature for Popover {
    fn prefix(&self) -> &'static str {
        "popover"
    }

    fn supports_condition(&self) -> Option<&'static str> {
        Some("selector(:popover-open)")
    }

    fn emit_css(&self, base: &str) -> String {
        // The popover panel's open-state styling; native top-layer when supported.
        let class = if base.is_empty() {
            "popover".to_string()
        } else {
            format!("popover\\:{base}")
        };
        format!(
            ".{class}:popover-open {{ position: fixed; margin: 0; inset: auto; }}"
        )
    }

    fn js_fallback(&self) -> Option<&'static str> {
        // When the Popover API is unavailable, the runtime shim portals the panel
        // to the top layer and positions it with the shared floating-ui code.
        Some("popoverFallback")
    }
}
