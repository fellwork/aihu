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
    // Phase 1: parse SFC into AihuSource
    let parsed = crate::compile(source)
        .map_err(|e| JsValue::from_str(&format!("{:?}", e)))?;

    // Phase 2: compile_full produces the CompileUnit (template AST + metadata)
    let unit = crate::compile_full(&parsed)
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

    // Phase 4: emit JS + manifest + optional route sidecar
    let result = crate::emit(&unit, &tag_name);

    // Phase 5: serialize EmitResult to a JS object
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("{:?}", e)))
}

/// Diagnostic helper exposed to the playground UI: returns the build
/// version string of the compiler at compile time.
#[wasm_bindgen]
pub fn wasm_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
