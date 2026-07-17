//! WASM bindings for `aihu-compiler`.
//!
//! Exposes a single `wasm_compile(source)` function for use in browser
//! playgrounds — most prominently the homepage interactive playground
//! (Directive 1, arch-4 §4.6). Compiled only for the `wasm32` target.

#![cfg(target_arch = "wasm32")]

use wasm_bindgen::prelude::*;

/// One-shot compile: parse → compile_full → emit. Returns an `EmitResult`
/// serialized as a plain JS object: `{ js, manifest_json, route_json }`.
///
/// Tag name resolution mirrors the native CLI binary (`src/bin/main.rs`):
/// 1. `@state { name: "..." }` → component name
/// 2. `@route { name: "..." }` → route name
/// 3. fallback to `"aihu-component"`
#[wasm_bindgen]
pub fn wasm_compile(source: &str) -> Result<JsValue, JsValue> {
    compile_impl(source, crate::ExprParserMode::Legacy)
}

/// W2/W3 (advanced-js-template-expressions): `wasm_compile` with the
/// `--expr-parser` mode exposed to the playground. `expr_parser` is
/// `"legacy"` (default pipeline, identical to `wasm_compile`) or `"ast"`
/// (every captured template expression is VALIDATED by oxc — parse errors
/// surface as C320/C321 diagnostics — and, since W3, the signal-read rewrite
/// runs scope-aware on the oxc AST: spread, template-literal `${…}` holes,
/// arrow bodies, and `{#each}` alias shadowing all emit correctly).
/// Unrecognized values fall back to `"legacy"` so playground callers can pass
/// a feature-flag string straight through.
#[wasm_bindgen]
pub fn wasm_compile_with_expr_parser(source: &str, expr_parser: &str) -> Result<JsValue, JsValue> {
    let mode = crate::ExprParserMode::parse(expr_parser).unwrap_or_default();
    compile_impl(source, mode)
}

fn compile_impl(source: &str, expr_parser: crate::ExprParserMode) -> Result<JsValue, JsValue> {
    // Phase 1: parse SFC into AihuSource
    let parsed = crate::compile(source).map_err(|e| JsValue::from_str(&format!("{:?}", e)))?;

    // Phase 2: compile_full produces the CompileUnit (template AST + metadata)
    let unit =
        crate::compile_full_with_options(&parsed, crate::BuildTarget::Universal, expr_parser)
            .map_err(|e| JsValue::from_str(&format!("{:?}", e)))?;

    // Phase 3: resolve tag name (mirrors src/bin/main.rs logic).
    // Note: AihuSource.script is `Option<&str>` (raw script body); the parsed
    // `name: "..."` lives on `unit.source.meta`, which is a `ScriptMeta`
    // (not Optional). Earlier draft of this file walked through `script` —
    // that was wrong and would never have compiled for wasm32.
    let tag_name = unit
        .source
        .meta
        .name
        .clone()
        .or_else(|| unit.source.route.as_ref().and_then(|r| r.name.clone()))
        .unwrap_or_else(|| "aihu-component".to_string());

    // O1a (tag naming): mirror the native CLI (`src/bin/main.rs`) — normalize
    // the resolved define-name (PascalCase→kebab), and reject (C450) a
    // component-shaped name that cannot carry a hyphen (e.g. `@meta name`
    // set to the single word `Comment`).
    let raw_tag = tag_name;
    let tag_name = crate::tags::kebab_component_tag(&raw_tag);
    if crate::tags::is_component_tag(&raw_tag) && !tag_name.contains('-') {
        let msg = crate::tags::validate_component_tag(&raw_tag)
            .expect_err("hyphen-less normalization must fail validation");
        return Err(JsValue::from_str(&msg));
    }

    // Phase 4: emit JS + manifest + optional route sidecar
    let result = crate::emit(&unit, &tag_name);

    // Phase 5: serialize EmitResult to a JS object
    serde_wasm_bindgen::to_value(&result).map_err(|e| JsValue::from_str(&format!("{:?}", e)))
}

/// Diagnostic helper exposed to the playground UI: returns the build
/// version string of the compiler at compile time.
#[wasm_bindgen]
pub fn wasm_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
