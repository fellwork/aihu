//! @aihu/server native renderer — napi-rs bindings.
//!
//! Exports two functions to JS:
//!   - render_tree(tree_json, hydratable) -> string
//!   - render_document(tree_json, head_json, hydratable) -> string
//!
//! The JS three-state loader (packages/server/src/loader.ts) calls these.
//! All other ssr.ts behavior — { toHtml() } providers, serializer state-script,
//! contextSetup hooks, renderToStream — remains JS-side.

#![deny(clippy::all)]

#[macro_use]
extern crate napi_derive;

mod escape;
mod render;

use napi::bindgen_prelude::*;

/// Render a JSON-serialized arbor tree to its inner-HTML string.
///
/// JS contract:
///   nativeAddon.renderTree(JSON.stringify(rootNode), hydratable)
///
/// Returns the same string as ssr.ts `renderNode(root, '0', hydratable)`.
#[napi]
pub fn render_tree(tree_json: String, hydratable: bool) -> Result<String> {
    render::render_tree_string(&tree_json, hydratable)
        .map_err(|e| Error::new(Status::InvalidArg, e))
}

/// Render a full HTML document.
///
/// JS contract:
///   nativeAddon.renderDocument(JSON.stringify(rootNode),
///                              JSON.stringify(opts.head),
///                              hydratable)
///
/// Returns:
///   <!DOCTYPE html><html${lang}><head>${head}</head><body>${tree}</body></html>
///
/// State-script emission (opts.serializer) is handled JS-side and is NOT
/// included in the Rust output. The JS loader injects it before </body></html>
/// when applicable.
#[napi]
pub fn render_document(
    tree_json: String,
    head_json: String,
    hydratable: bool,
) -> Result<String> {
    render::render_document_string(&tree_json, &head_json, hydratable)
        .map_err(|e| Error::new(Status::InvalidArg, e))
}
