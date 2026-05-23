//! v1.0.10a — Compiler AST-export hook.
//!
//! Purely-additive serialization layer that exposes the parsed `.aihu` SFC
//! AST as a stable, owned, `serde::Serialize` shape. Consumed by the CSS
//! engine's AST scanner (`css-2-ast-scanner`) which branches on the three
//! `Attr` class-forms (Static / Binding / Macro).
//!
//! Design note: `docs/superpowers/specs/compiler-ast-export-hook.md`.
//!
//! Per spec §6 Q1, the public AST shape is an **owned mirror** (`String`-backed)
//! built from the existing `compile_with_path` → `compile_full` pipeline via a
//! `From<&CompileUnit>` conversion. We deliberately do NOT derive `Serialize`
//! on the borrowed internal `AihuSource<'a>` / `TemplateNode` / `Attr` types:
//! the export is a v1.0 stability contract and the internal parser
//! representation must stay free to evolve. Adding `serde` here couples only
//! the mirror, not the parser.
//!
//! The export is additive: it reuses `compile_with_path` + `compile_full` and
//! does NOT alter the grammar, parser logic, or any existing public function.

use serde::Serialize;

use crate::types::{
    Attr, CompileError, CompileUnit, MacroValue, StyleScope, TemplateNode,
};

/// AST schema version. Bumped on any BREAKING shape change (semver-tied to
/// `@aihu/compiler`). Additive fields (new `SfcNode` kind, new optional field)
/// keep this at `1`; field removal / variant collapse / rename bumps to `2`
/// and is a major-version event (spec §6 Q3).
pub const AST_VERSION: u32 = 1;

/// Top-level AST export — one per `.aihu` SFC. Mirrors the TS `SfcAst`
/// interface in the spec §4.1.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SfcAstOwned {
    /// Resolved custom-element tag name (meta.name → route.name → file stem).
    pub tag: String,
    /// AST schema version — always `1` for v1.0.
    #[serde(rename = "astVersion")]
    pub ast_version: u32,
    /// The `@style` block, if the SFC declared one.
    pub style: Option<SfcStyleBlockOwned>,
    /// Parsed template tree. `None` (JSON `null`) when the SFC has no
    /// `@template` block.
    pub template: Option<Vec<SfcNodeOwned>>,
    /// SFC-level metadata.
    pub meta: SfcMetaOwned,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SfcStyleBlockOwned {
    /// Verbatim CSS body of the `@style` block (braces stripped, `$global`
    /// token removed — `sfc.rs` already normalizes this).
    pub content: String,
    /// `"scoped"` (default) or `"global"` (`@style { $global ... }`).
    pub scope: SfcStyleScope,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SfcStyleScope {
    Scoped,
    Global,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SfcMetaOwned {
    /// From `@meta { name }` / `@route { name }` / file stem — never empty
    /// after resolution.
    pub name: String,
}

/// Discriminated union mirroring Rust `TemplateNode`. Serializes with a
/// `kind` tag (spec §4.1 `SfcNode`).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SfcNodeOwned {
    Element {
        tag: String,
        attrs: Vec<SfcAttrOwned>,
        children: Vec<SfcNodeOwned>,
    },
    MacroElement {
        name: String,
        attrs: Vec<SfcAttrOwned>,
        children: Vec<SfcNodeOwned>,
    },
    Text {
        value: String,
    },
    Interpolation {
        expr: String,
    },
    IfBlock {
        branches: Vec<SfcIfBranch>,
    },
    #[serde(rename_all = "camelCase")]
    EachBlock {
        list: String,
        item: String,
        idx: Option<String>,
        key: Option<String>,
        body: Vec<SfcNodeOwned>,
        empty_body: Option<Vec<SfcNodeOwned>>,
    },
    HtmlBlock {
        expr: String,
    },
}

/// One `{#if}` / `{:else if}` / `{:else}` branch. An empty `cond` denotes the
/// `{:else}` branch (mirrors the internal convention in `TemplateNode::IfBlock`).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SfcIfBranch {
    pub cond: String,
    pub body: Vec<SfcNodeOwned>,
}

/// Discriminated union mirroring Rust `Attr` — the three class-forms key on
/// `kind`. This three-variant distinction is frozen as part of the v1.0
/// stability contract (spec §3 edge #1).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SfcAttrOwned {
    /// Form A — `class="btn primary"`.
    Static { name: String, value: String },
    /// Form B — `$class={expr}` (and array `$class={[a, b]}`).
    Binding { name: String, expr: String },
    /// Form C — `$class:active={cond}` (and `on:`/`bind:`/`emit:`/`if`/`each`/…).
    Macro { name: String, value: SfcMacroValueOwned },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "form", rename_all = "lowercase")]
pub enum SfcMacroValueOwned {
    Quoted { value: String },
    Curly { expr: String },
    Boolean,
}

// ─── Conversions from the borrowed internal AST ──────────────────────────────

impl From<&MacroValue> for SfcMacroValueOwned {
    fn from(v: &MacroValue) -> Self {
        match v {
            MacroValue::Quoted(s) => SfcMacroValueOwned::Quoted { value: s.clone() },
            MacroValue::Curly(s) => SfcMacroValueOwned::Curly { expr: s.clone() },
            MacroValue::Boolean => SfcMacroValueOwned::Boolean,
        }
    }
}

impl From<&Attr> for SfcAttrOwned {
    fn from(a: &Attr) -> Self {
        match a {
            Attr::Static { name, value } => SfcAttrOwned::Static {
                name: name.clone(),
                value: value.clone(),
            },
            Attr::Binding { name, expr } => SfcAttrOwned::Binding {
                name: name.clone(),
                expr: expr.clone(),
            },
            Attr::Macro { name, value } => SfcAttrOwned::Macro {
                name: name.clone(),
                value: SfcMacroValueOwned::from(value),
            },
        }
    }
}

fn attrs_to_owned(attrs: &[Attr]) -> Vec<SfcAttrOwned> {
    attrs.iter().map(SfcAttrOwned::from).collect()
}

fn nodes_to_owned(nodes: &[TemplateNode]) -> Vec<SfcNodeOwned> {
    nodes.iter().map(SfcNodeOwned::from).collect()
}

impl From<&TemplateNode> for SfcNodeOwned {
    fn from(n: &TemplateNode) -> Self {
        match n {
            TemplateNode::Element {
                tag,
                attrs,
                children,
            } => SfcNodeOwned::Element {
                tag: tag.clone(),
                attrs: attrs_to_owned(attrs),
                children: nodes_to_owned(children),
            },
            TemplateNode::MacroElement {
                name,
                attrs,
                children,
            } => SfcNodeOwned::MacroElement {
                name: name.clone(),
                attrs: attrs_to_owned(attrs),
                children: nodes_to_owned(children),
            },
            TemplateNode::Text(t) => SfcNodeOwned::Text { value: t.clone() },
            TemplateNode::Interpolation(e) => SfcNodeOwned::Interpolation { expr: e.clone() },
            TemplateNode::IfBlock { branches } => SfcNodeOwned::IfBlock {
                branches: branches
                    .iter()
                    .map(|(cond, body)| SfcIfBranch {
                        cond: cond.clone(),
                        body: nodes_to_owned(body),
                    })
                    .collect(),
            },
            TemplateNode::EachBlock {
                list_expr,
                item_alias,
                idx_alias,
                key_expr,
                body,
                empty_body,
            } => SfcNodeOwned::EachBlock {
                list: list_expr.clone(),
                item: item_alias.clone(),
                idx: idx_alias.clone(),
                key: key_expr.clone(),
                body: nodes_to_owned(body),
                empty_body: empty_body.as_deref().map(nodes_to_owned),
            },
            TemplateNode::HtmlBlock { expr } => SfcNodeOwned::HtmlBlock { expr: expr.clone() },
        }
    }
}

/// Resolve the custom-element tag name from a `CompileUnit`, mirroring
/// `bin/main.rs`'s OQ-C6 priority: `@meta { name }` → `@route { name }` →
/// file stem.
fn resolve_tag(unit: &CompileUnit, file_path: Option<&str>) -> String {
    if let Some(name) = unit.source.meta.name.clone() {
        return name;
    }
    if let Some(name) = unit.source.route.as_ref().and_then(|r| r.name.clone()) {
        return name;
    }
    file_stem(file_path).unwrap_or_else(|| "Component".to_string())
}

/// Derive a file stem (basename without extension) from an optional path,
/// matching `std::path::Path::file_stem` behavior used by the CLI.
fn file_stem(file_path: Option<&str>) -> Option<String> {
    file_path.and_then(|p| {
        std::path::Path::new(p)
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string())
    })
}

/// Build the owned, serializable AST mirror from a fully-parsed `CompileUnit`.
///
/// This is the in-crate conversion; `compile_to_ast` wires it to the parse
/// pipeline. The `tag` is resolved with the supplied `file_path` (used only
/// when neither `@meta { name }` nor `@route { name }` is present).
pub fn build_owned_ast(unit: &CompileUnit, file_path: Option<&str>) -> SfcAstOwned {
    let tag = resolve_tag(unit, file_path);

    let style = unit.source.style.as_ref().map(|s| SfcStyleBlockOwned {
        content: s.content.to_string(),
        scope: match s.scope {
            StyleScope::Scoped => SfcStyleScope::Scoped,
            StyleScope::Global => SfcStyleScope::Global,
        },
    });

    let template = unit
        .template_ast
        .as_ref()
        .map(|nodes| nodes_to_owned(nodes));

    SfcAstOwned {
        tag,
        ast_version: AST_VERSION,
        style,
        template,
        meta: SfcMetaOwned {
            name: unit
                .source
                .meta
                .name
                .clone()
                .or_else(|| unit.source.route.as_ref().and_then(|r| r.name.clone()))
                .unwrap_or_else(|| {
                    file_stem(file_path).unwrap_or_else(|| "Component".to_string())
                }),
        },
    }
}

/// v1.0.10a — parse a `.aihu` source string to its structured, owned AST.
///
/// Purely additive: reuses the existing `compile_with_path` → `compile_full`
/// pipeline (no new parsing), then copies the borrowed `&str` slices into
/// owned `String`s so the result outlives the source buffer and serializes
/// cleanly. Returns the same `CompileError` shape on parse failure as
/// `compile()` / `compile_full()`.
pub fn compile_to_ast(
    source: &str,
    file_path: Option<&str>,
) -> Result<SfcAstOwned, CompileError> {
    let parsed = crate::parser::sfc::parse_with_path(source, file_path)?;
    let unit = crate::compile_full(&parsed)?;
    Ok(build_owned_ast(&unit, file_path))
}
