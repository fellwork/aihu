//! `ast.rs` — serde `Deserialize` mirror of the compiler's `--ast-json` output.
//!
//! This is the wire-format contract the scanner consumes. It mirrors the
//! `SfcAst` shape emitted by `@aihu/compiler`'s `compile_to_ast` /
//! `aihu-compile --ast-json` (see `docs/superpowers/specs/compiler-ast-export-hook.md`
//! §4.1 / §4.3, CSS-engine spec `22d3a66e` §3 edge #1).
//!
//! The three `SfcAttr` variants (Static / Binding / Macro) are frozen as part
//! of the v1.0 stability contract — the scanner's class-extraction correctness
//! depends entirely on them staying distinct. `ast_version` is asserted on
//! entry (§6 Q3 evolution policy): additive changes keep `1`; a breaking shape
//! change bumps it and is rejected here with a clear error.

use serde::Deserialize;

/// The AST schema version this scanner understands. A mismatch is rejected by
/// [`parse_ast`].
pub const SUPPORTED_AST_VERSION: u32 = 1;

/// Top-level AST export — one per `.aihu` SFC. Mirrors the compiler's
/// `SfcAstOwned` / the TS `SfcAst` interface (spec §4.1).
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct SfcAst {
    /// Resolved custom-element tag name (`meta.name` → `route.name` → file stem).
    pub tag: String,
    /// The `@style` block, if the SFC declared one.
    #[serde(default)]
    pub style: Option<SfcStyleBlock>,
    /// Parsed template tree. `None` when the SFC has no `@template` block.
    #[serde(default)]
    pub template: Option<Vec<SfcNode>>,
    /// SFC-level metadata.
    pub meta: SfcMeta,
    /// AST schema version — bumped on any breaking shape change.
    #[serde(rename = "astVersion")]
    pub ast_version: u32,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct SfcStyleBlock {
    /// Verbatim CSS body of the `@style` block (braces stripped, `$global`
    /// token removed by the compiler).
    pub content: String,
    /// `Scoped` (default) or `Global` (`@style { $global ... }`).
    pub scope: SfcStyleScope,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SfcStyleScope {
    Scoped,
    Global,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct SfcMeta {
    /// From `@meta { name }` / `@route { name }` / file stem.
    pub name: String,
}

/// Discriminated union mirroring the compiler's `SfcNodeOwned` (spec §4.1).
/// Serialized with a `kind` tag (camelCase: `element`, `macroElement`, …).
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SfcNode {
    Element {
        tag: String,
        #[serde(default)]
        attrs: Vec<SfcAttr>,
        #[serde(default)]
        children: Vec<SfcNode>,
    },
    MacroElement {
        name: String,
        #[serde(default)]
        attrs: Vec<SfcAttr>,
        #[serde(default)]
        children: Vec<SfcNode>,
    },
    Text {
        value: String,
    },
    Interpolation {
        expr: String,
    },
    IfBlock {
        #[serde(default)]
        branches: Vec<SfcIfBranch>,
    },
    #[serde(rename_all = "camelCase")]
    EachBlock {
        list: String,
        item: String,
        idx: Option<String>,
        key: Option<String>,
        #[serde(default)]
        body: Vec<SfcNode>,
        empty_body: Option<Vec<SfcNode>>,
    },
    HtmlBlock {
        expr: String,
    },
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct SfcIfBranch {
    pub cond: String,
    #[serde(default)]
    pub body: Vec<SfcNode>,
}

/// Discriminated union mirroring the compiler's `SfcAttrOwned` `Attr` — the
/// three class-forms key on `kind` (lowercase: `static` / `binding` / `macro`).
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SfcAttr {
    /// Form A — `class="btn primary"`.
    Static { name: String, value: String },
    /// Form B — `$class={expr}` (and array `$class={[a, b]}`).
    Binding { name: String, expr: String },
    /// Form C — `$class:active={cond}` (and `on:`/`bind:`/`emit:`/`if`/…).
    Macro {
        name: String,
        #[allow(dead_code)]
        value: SfcMacroValue,
    },
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "form", rename_all = "lowercase")]
pub enum SfcMacroValue {
    Quoted { value: String },
    Curly { expr: String },
    Boolean,
}

/// Parse a `--ast-json` payload into the typed [`SfcAst`], validating the
/// schema version (spec §6 Q3). A version mismatch returns a descriptive
/// error rather than silently mis-scanning a future shape.
pub fn parse_ast(json: &str) -> Result<SfcAst, AstError> {
    let ast: SfcAst = serde_json::from_str(json).map_err(AstError::Deserialize)?;
    if ast.ast_version != SUPPORTED_AST_VERSION {
        return Err(AstError::Version {
            found: ast.ast_version,
            supported: SUPPORTED_AST_VERSION,
        });
    }
    Ok(ast)
}

/// Errors from [`parse_ast`].
#[derive(Debug)]
pub enum AstError {
    /// JSON did not match the `SfcAst` wire shape.
    Deserialize(serde_json::Error),
    /// `astVersion` is not the version this scanner supports.
    Version { found: u32, supported: u32 },
}

impl std::fmt::Display for AstError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AstError::Deserialize(e) => write!(f, "failed to deserialize SfcAst: {e}"),
            AstError::Version { found, supported } => write!(
                f,
                "unsupported astVersion {found} (this engine supports {supported}); \
                 rebuild @aihu/compiler and @aihu/css-engine to matching versions"
            ),
        }
    }
}

impl std::error::Error for AstError {}
