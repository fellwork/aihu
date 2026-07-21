//! DA4 (#437) — the light-DOM default flip: an `@route` (page-level) unit
//! with no `$shadow` pin emits the DISTINCT default-marker token
//! `// @aihu:shadow-default none`, which the Vite plugin ranks BELOW an
//! explicit plugin-global `shadowMode` config (pin > plugin-global >
//! page/layout default 'none' > leaf default 'open').
//!
//! The classifier precedence triple (thesis §DA4, founder-ratified) survives
//! W472's retirement — it now selects the EMISSION instead of a warning:
//!   (a) `$shadow` present → the pin marker `// @aihu:shadow <mode>`, never
//!       the default marker — the macro always wins.
//!   (b) `@route` block, no `$shadow` → the default marker (pages are light
//!       DOM by default so non-JS crawlers can read server-rendered content).
//!   (c) no `@route`, no `$shadow` → leaf component → NO marker of either
//!       kind; the runtime's `options?.shadowMode ?? 'open'` keeps shadow DOM.
//!
//! W472 itself (the phase-1 advisory that predicted this default) is retired
//! outright: the behavior it warned about is now the behavior, and there are
//! no external consumers to migrate.

use aihu_compiler::{compile, compile_full, compile_with_path, AihuSource};

/// Parse a page fixture under a `src/pages/` path (an `@route` block anywhere
/// else is a C500 hard error, which is not what these tests measure).
fn parse_page(src: &str) -> AihuSource<'_> {
    compile_with_path(src, Some("src/pages/index.aihu")).unwrap()
}

fn emit_js(source: &AihuSource) -> String {
    let unit = compile_full(source).unwrap();
    aihu_compiler::emit(&unit, "home-page").js
}

const PAGE_NO_SHADOW: &str = r#"@state {
  $prop: {
    name: { default: 'world', type: "string" }
  }
}

@template {
  <div>Hello {name}</div>
}

@route {
  path: /
  name: home
}
"#;

const PAGE_SHADOW_OPEN: &str = r#"@state {
  $shadow: 'open'
}

@template {
  <div>Hello</div>
}

@route {
  path: /
  name: home
}
"#;

const PAGE_SHADOW_NONE: &str = r#"@state {
  $shadow: 'none'
}

@template {
  <div>Hello</div>
}

@route {
  path: /
  name: home
}
"#;

const LEAF_NO_SHADOW: &str = r#"@state {
  $prop: {
    label: { default: 'ok', type: "string" }
  }
}

@template {
  <button>{label}</button>
}
"#;

/// (b) The flip itself: an `@route` unit with no `$shadow` pin emits the
/// leading default-marker token — the exact token the Vite plugin's
/// `perFileShadowDefault` regex (`^// @aihu:shadow-default (open|closed|none)`)
/// consumes at the page/layout-default tier of the precedence chain.
#[test]
fn route_without_shadow_emits_default_marker() {
    let source = parse_page(PAGE_NO_SHADOW);
    let js = emit_js(&source);
    assert!(
        js.starts_with("// @aihu:shadow-default none\n"),
        "a defaulted @route page must lead with the default-marker token; got:\n{}",
        &js[..js.len().min(120)]
    );
}

/// (b, distinctness) The default marker must NOT be readable as the pin
/// marker: the plugin's pin regex is `^// @aihu:shadow (open|closed|none)`
/// (a SPACE after `shadow`), and the pin tier outranks the plugin-global
/// config while the default tier ranks below it. A default marker that
/// matched the pin shape would silently promote the implicit default over an
/// explicit plugin-global `shadowMode` — the precedence inversion the
/// distinct token exists to prevent.
#[test]
fn default_marker_is_not_the_pin_marker() {
    let source = parse_page(PAGE_NO_SHADOW);
    let js = emit_js(&source);
    for mode in ["open", "closed", "none"] {
        assert!(
            !js.contains(&format!("// @aihu:shadow {mode}")),
            "a defaulted page must not emit the PIN marker shape (`// @aihu:shadow {mode}`)"
        );
    }
}

/// (a) `$shadow` always wins: a pinned page emits the pin marker as the
/// leading line and never the default marker — the pin suppresses it.
#[test]
fn route_with_shadow_macro_emits_pin_marker_only() {
    for (mode, src) in [("open", PAGE_SHADOW_OPEN), ("none", PAGE_SHADOW_NONE)] {
        let source = parse_page(src);
        let js = emit_js(&source);
        assert!(
            js.starts_with(&format!("// @aihu:shadow {mode}\n")),
            "`$shadow: '{mode}'` must emit its leading pin marker; got:\n{}",
            &js[..js.len().min(120)]
        );
        assert!(
            !js.contains("@aihu:shadow-default"),
            "a `$shadow`-pinned page must not also emit the default marker"
        );
    }
}

/// (c) A leaf (no `@route`, no `$shadow`) emits NO shadow marker of either
/// kind: the plugin injects nothing, and the runtime's
/// `options?.shadowMode ?? 'open'` (define-element.ts) keeps leaves in
/// shadow DOM — the flip is pages and layouts only.
#[test]
fn leaf_without_shadow_emits_no_marker() {
    let source = compile(LEAF_NO_SHADOW).unwrap();
    let js = emit_js(&source);
    assert!(
        !js.contains("@aihu:shadow"),
        "a leaf must carry neither the pin nor the default marker; got:\n{}",
        &js[..js.len().min(200)]
    );
}
