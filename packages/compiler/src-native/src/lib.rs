//! @aihu/compiler native addon — napi-rs bindings for the envelope API.
//!
//! Exports one worker function to JS:
//!   - compileEnvelope(source, optionsJson) -> envelopeJson
//!
//! String-in / string-out by design: ONE boundary crossing per file. The
//! options JSON is `EnvelopeOptions` (camelCase; tag/path/targets/emits/
//! exprParser/strictTemplates) and the return value is the serialized
//! `Envelope` — the same shapes the CLI's `--envelope` flag speaks, so the JS
//! driver (packages/compiler/js/envelope.ts) treats the addon and the spawn
//! fallback as interchangeable backends.
//!
//! Compile ERRORS become JS exceptions carrying the rendered diagnostic
//! (code + message + hint/fix tail via `format_compile_error`). Compile
//! WARNINGS still print to the process stderr (`diagnostics::emit_warning`
//! writes fd 2 directly) — identical surface to the spawn path, whose child
//! stderr is inherited.

#![deny(clippy::all)]

#[macro_use]
extern crate napi_derive;

use napi::bindgen_prelude::*;

/// Single-parse, multi-target, multi-output compile.
///
/// JS contract:
///   nativeAddon.compileEnvelope(source, JSON.stringify(options))
///     -> JSON.parse(...) as Envelope
#[napi]
pub fn compile_envelope(source: String, options_json: String) -> Result<String> {
    let opts: aihu_compiler::EnvelopeOptions =
        serde_json::from_str(&options_json).map_err(|e| {
            Error::new(
                Status::InvalidArg,
                format!("invalid envelope options JSON: {e}"),
            )
        })?;
    let envelope = aihu_compiler::compile_envelope(&source, &opts)
        .map_err(|e| Error::new(Status::InvalidArg, aihu_compiler::format_compile_error(&e)))?;
    serde_json::to_string(&envelope)
        .map_err(|e| Error::new(Status::GenericFailure, format!("envelope serialize: {e}")))
}

/// The aihu-compiler crate version baked into this addon. The JS loader
/// surfaces it in diagnostics; the memo cache stamps the addon by file
/// path+mtime+size, so this is informational, not a cache key.
#[napi]
pub fn compiler_version() -> String {
    // The addon's own version tracks the platform-package release; the
    // compiler crate version is what identifies codegen behavior.
    format!(
        "aihu-compiler-native {} (aihu-compiler crate)",
        env!("CARGO_PKG_VERSION")
    )
}
