//! `text-balance:` — the simplest possible progressive feature (Plan 3 Task 8).
//!
//! Emits a single `text-wrap: balance` declaration. `supports_condition()` is
//! `None` (no `@supports` gate) and `js_fallback()` is `None` (no JS): browsers
//! that don't understand the `balance` value silently ignore it — standard CSS
//! forward-compatibility. One declaration, no gate, no runtime cost.

use crate::progressive::ProgressiveFeature;

/// `text-balance:` → `text-wrap: balance`. No gate, no JS.
pub struct TextBalance;

impl ProgressiveFeature for TextBalance {
    fn prefix(&self) -> &'static str {
        "text-balance"
    }

    fn supports_condition(&self) -> Option<&'static str> {
        // No gate — unsupported browsers silently ignore the unknown value.
        None
    }

    fn emit_css(&self, base: &str) -> String {
        let class = if base.is_empty() {
            "text-balance".to_string()
        } else {
            format!("text-balance\\:{base}")
        };
        format!(".{class} {{ text-wrap: balance; }}")
    }

    fn js_fallback(&self) -> Option<&'static str> {
        // CSS-only — no runtime fallback.
        None
    }
}
