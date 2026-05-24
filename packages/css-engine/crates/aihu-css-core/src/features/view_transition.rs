//! `view-transition:` — the simplest progressive feature (Plan 3 Task 5).
//!
//! Emits `view-transition-name` gated behind `@supports (view-transition-name:
//! none)`. CSS-only: `js_fallback()` is `None`, so when the View Transitions API
//! is unsupported the browser silently skips the transition (no JS, no error,
//! no runtime cost). Per spec §6.7 this is the cheapest progressive feature.

use crate::progressive::ProgressiveFeature;

/// `view-transition:<name>` → a `view-transition-name` declaration, `@supports`-gated.
pub struct ViewTransition;

impl ProgressiveFeature for ViewTransition {
    fn prefix(&self) -> &'static str {
        "view-transition"
    }

    fn supports_condition(&self) -> Option<&'static str> {
        Some("view-transition-name: none")
    }

    fn emit_css(&self, base: &str) -> String {
        // `view-transition:hero` → `.view-transition\:hero { view-transition-name: hero; }`
        // An empty base (`view-transition:`) defaults to `auto`.
        let name = if base.is_empty() { "auto" } else { base };
        let class = if base.is_empty() {
            "view-transition".to_string()
        } else {
            format!("view-transition\\:{base}")
        };
        format!(".{class} {{ view-transition-name: {name}; }}")
    }

    fn js_fallback(&self) -> Option<&'static str> {
        // CSS-only — unsupported browsers silently skip the transition.
        None
    }
}
