//! `anchor:` — CSS anchor positioning with a JS fallback (Plan 3 Task 6).
//!
//! Emits `anchor-name` / `position-anchor` CSS gated behind `@supports
//! (anchor-name: --a)`. `js_fallback()` returns `"anchorFallback"` — the
//! `@aihu/css-engine/runtime/progressive` shim positions the element with a
//! tiny hand-written floating-ui-style shim when native CSS anchor positioning
//! is unsupported. The shim (~2 KB) is SHARED with `popover:` (Task 7).

use crate::progressive::ProgressiveFeature;

/// `anchor:<name>` → CSS anchor-positioning, `@supports`-gated, with a JS shim.
pub struct Anchor;

impl ProgressiveFeature for Anchor {
    fn prefix(&self) -> &'static str {
        "anchor"
    }

    fn supports_condition(&self) -> Option<&'static str> {
        Some("anchor-name: --a")
    }

    fn emit_css(&self, base: &str) -> String {
        // `anchor:tooltip` declares an anchor name + binds positioning to it.
        let name = if base.is_empty() { "anchor" } else { base };
        let class = if base.is_empty() {
            "anchor".to_string()
        } else {
            format!("anchor\\:{base}")
        };
        format!(
            ".{class} {{ anchor-name: --{name}; position-anchor: --{name}; }}"
        )
    }

    fn js_fallback(&self) -> Option<&'static str> {
        // Native anchor positioning is gated; when absent, the runtime shim
        // (`anchorFallback`) positions the element with JS.
        Some("anchorFallback")
    }
}
