//! `progressive.rs` — `ProgressiveFeature` trait + registry + `@supports` emitter.
//!
//! Plan 3 Task 4. A *progressive feature* is a forward-looking CSS feature
//! gated behind `@supports`, optionally with a JS runtime fallback. The engine
//! ships four built-ins (`view_transition`, `anchor`, `popover`, `text_balance`
//! — see `features/`), but the trait is open so additional features can be
//! registered.
//!
//! ## Fallback contract
//!
//! Each feature owns four facts:
//! - its **variant prefix** (`view-transition`, `anchor`, `popover`, `text-balance`)
//! - the **`@supports` condition** (or `None` = "always emit, silently ignored
//!   if unsupported" — no gate at all)
//! - the **gated CSS** it emits for a given base utility/declaration
//! - whether it dispatches a **JS fallback** (`Some(export-name)`) or is
//!   **CSS-only** (`None`)
//!
//! The emitter wraps gated CSS in `@supports (...)` when a condition is present,
//! and emits a small `/* aihu:progressive-fallback ... */` marker (read by the
//! TS layer to wire `@aihu/css-engine/runtime/progressive`) ONLY for features
//! whose `js_fallback()` is non-`None`. CSS-only features (`view-transition:`,
//! `text-balance:`) never produce a JS marker.

/// A forward-looking CSS feature gated behind `@supports`, optionally with a
/// JS runtime fallback. Each feature owns: its variant prefix, the `@supports`
/// condition, the gated CSS it emits, and whether it dispatches a JS fallback.
pub trait ProgressiveFeature {
    /// The variant prefix, e.g. "view-transition", "anchor", "popover", "text-balance".
    fn prefix(&self) -> &'static str;
    /// The `@supports(...)` condition string, or None for "always emit, silently ignored if unsupported".
    fn supports_condition(&self) -> Option<&'static str>;
    /// Emit the gated CSS for a given base utility/declaration.
    fn emit_css(&self, base: &str) -> String;
    /// Runtime fallback descriptor: which `@aihu/css-engine/runtime/progressive`
    /// export to dispatch when `@supports` fails. None = silent CSS no-op (no JS).
    fn js_fallback(&self) -> Option<&'static str>;
}

/// A registry of progressive features, keyed by variant prefix. The emitter
/// consults it when it encounters a variant prefix that names a registered
/// feature, routing to the progressive emitter instead of the standard
/// selector path.
pub struct ProgressiveRegistry {
    features: Vec<Box<dyn ProgressiveFeature + Send + Sync>>,
}

impl ProgressiveRegistry {
    /// An empty registry.
    pub fn new() -> Self {
        Self {
            features: Vec::new(),
        }
    }

    /// The default registry seeded with the four built-in features. Features are
    /// added to this constructor as they land (Tasks 5–8): `view-transition:`,
    /// `anchor:`, `popover:`, `text-balance:`.
    pub fn with_builtins() -> Self {
        let mut r = Self::new();
        crate::features::register_builtins(&mut r);
        r
    }

    /// Register a feature.
    pub fn register(&mut self, feature: Box<dyn ProgressiveFeature + Send + Sync>) {
        self.features.push(feature);
    }

    /// Look up a feature by its variant prefix.
    pub fn get(&self, prefix: &str) -> Option<&(dyn ProgressiveFeature + Send + Sync)> {
        self.features
            .iter()
            .find(|f| f.prefix() == prefix)
            .map(|f| f.as_ref())
    }

    /// True if `prefix` names a registered progressive feature.
    pub fn is_feature(&self, prefix: &str) -> bool {
        self.features.iter().any(|f| f.prefix() == prefix)
    }

    /// Emit the CSS (and optional JS-fallback marker) for a feature `prefix`
    /// applied to `base`. Returns `None` if `prefix` is not registered.
    ///
    /// Output shape:
    /// - with a `@supports` condition: `@supports (<cond>) { <css> }`
    /// - without a condition: the bare `<css>` (silently ignored if unsupported)
    /// - plus, ONLY when `js_fallback()` is `Some`, a trailing
    ///   `/* aihu:progressive-fallback <export> (when not <cond>) */` marker.
    pub fn emit(&self, prefix: &str, base: &str) -> Option<String> {
        let feature = self.get(prefix)?;
        Some(emit_feature(feature, base))
    }
}

impl Default for ProgressiveRegistry {
    fn default() -> Self {
        Self::with_builtins()
    }
}

/// Emit the `@supports`-gated CSS (+ optional JS marker) for one feature.
pub fn emit_feature(feature: &(dyn ProgressiveFeature + Send + Sync), base: &str) -> String {
    let css = feature.emit_css(base);
    let mut out = match feature.supports_condition() {
        Some(cond) => format!("@supports ({cond}) {{\n  {css}\n}}\n"),
        None => format!("{css}\n"),
    };

    // JS fallback marker — ONLY for features with a non-None fallback. The TS
    // layer scans for this marker to wire the runtime/progressive dispatch.
    if let Some(export) = feature.js_fallback() {
        let cond = feature.supports_condition().unwrap_or("");
        out.push_str(&format!(
            "/* aihu:progressive-fallback {export} (when not @supports {cond}) */\n"
        ));
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    // A dummy feature with a @supports gate AND a JS fallback.
    struct GatedWithJs;
    impl ProgressiveFeature for GatedWithJs {
        fn prefix(&self) -> &'static str {
            "gated"
        }
        fn supports_condition(&self) -> Option<&'static str> {
            Some("display: grid")
        }
        fn emit_css(&self, base: &str) -> String {
            format!(".{base} {{ display: grid; }}")
        }
        fn js_fallback(&self) -> Option<&'static str> {
            Some("gatedFallback")
        }
    }

    // A dummy CSS-only feature: no gate, no JS.
    struct CssOnly;
    impl ProgressiveFeature for CssOnly {
        fn prefix(&self) -> &'static str {
            "plain"
        }
        fn supports_condition(&self) -> Option<&'static str> {
            None
        }
        fn emit_css(&self, base: &str) -> String {
            format!(".{base} {{ color: red; }}")
        }
        fn js_fallback(&self) -> Option<&'static str> {
            None
        }
    }

    #[test]
    fn supports_gate_wraps_css() {
        let out = emit_feature(&GatedWithJs, "thing");
        assert!(out.contains("@supports (display: grid)"), "gated CSS wrapped: {out}");
        assert!(out.contains("display: grid;"));
    }

    #[test]
    fn js_fallback_feature_emits_marker() {
        let out = emit_feature(&GatedWithJs, "thing");
        assert!(
            out.contains("aihu:progressive-fallback gatedFallback"),
            "non-None fallback emits a JS marker: {out}"
        );
    }

    #[test]
    fn css_only_feature_emits_no_marker_and_no_gate() {
        let out = emit_feature(&CssOnly, "thing");
        assert!(!out.contains("@supports"), "None condition → no @supports gate: {out}");
        assert!(
            !out.contains("aihu:progressive-fallback"),
            "None fallback → no JS marker: {out}"
        );
        assert!(out.contains("color: red;"));
    }

    #[test]
    fn registry_routes_by_prefix() {
        let mut reg = ProgressiveRegistry::new();
        reg.register(Box::new(GatedWithJs));
        reg.register(Box::new(CssOnly));
        assert!(reg.is_feature("gated"));
        assert!(reg.is_feature("plain"));
        assert!(!reg.is_feature("nope"));
        let out = reg.emit("gated", "thing").unwrap();
        assert!(out.contains("@supports"));
        assert!(reg.emit("nope", "x").is_none());
    }
}
