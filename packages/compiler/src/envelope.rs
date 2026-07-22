//! Envelope API — single-parse, multi-target, multi-output compile.
//!
//! The build path historically paid one full parse+validate+lower per OUTPUT:
//! `transform()` spawned the CLI for the JS, css-engine's `compileSfc`
//! re-spawned it for the AST (`--ast-json`), and the router's route scan
//! re-spawned it for the route sidecar (`--route-json`) — three parses of the
//! same source per file, each behind ~3-6ms of process-spawn overhead.
//!
//! [`compile_envelope`] collapses that: parse → `compile_full_with_options`
//! ONCE (all validation is target-independent — `BuildTarget` only branches
//! inside `codegen/emit.rs`), then run `emit` per requested target and
//! serialize every requested artifact into one [`Envelope`].
//!
//! Two front-ends share this function:
//!   * the CLI's `--envelope <options-json>` flag (`src/bin/main.rs`) — the
//!     universal fallback, so even the spawn path gets single-parse benefits;
//!   * the napi addon (`packages/compiler/src-native`), which calls it
//!     in-process and eliminates the spawn entirely.
//!
//! **Byte-identity contract:** for any (source, target), `Envelope.targets
//! [t].js` is the exact string the legacy single-target CLI prints — both are
//! `EmitResult.js` verbatim. `tests/envelope.rs` pins this differentially.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::expr::ExprParserMode;
use crate::types::{BuildTarget, CompileError};

/// Options for [`compile_envelope`]. Deserialized from the JSON the CLI's
/// `--envelope` flag / the napi addon's `compileEnvelope(source, optionsJson)`
/// receive — camelCase on the wire, all fields optional.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct EnvelopeOptions {
    /// File-stem fallback for tag resolution — the `--tag` value in the CLI's
    /// stdin mode. Lowest-priority after `@meta name` / `@route name`.
    pub tag: Option<String>,
    /// Source file path. Threads `@route` C500 checks (`parse_with_path`) and
    /// the AST export's path-derived fields, exactly like `--path`.
    pub path: Option<String>,
    /// Build targets to emit, each `"client" | "server" | "universal"`.
    /// Empty/omitted → `["universal"]` (the CLI default).
    pub targets: Vec<String>,
    /// Artifacts to include, each `"js" | "ast" | "route" | "manifest"`.
    /// Empty/omitted → `["js"]`.
    pub emits: Vec<String>,
    /// #486 `--strict-templates`. Affects only the sidecar type surface (not
    /// emitted in the envelope today); accepted so option fingerprints can
    /// round-trip losslessly.
    pub strict_templates: bool,
    /// Expression front-end override: `"legacy" | "ast"`. Omitted → the
    /// `AIHU_EXPR_PARSER` env var, then the compiled-in default — identical
    /// to the CLI's resolution order.
    pub expr_parser: Option<String>,
}

/// Per-target artifacts. `js` is byte-identical to the legacy single-target
/// CLI stdout for the same (source, target).
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetEmit {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub js: Option<String>,
    /// Agent manifest JSON. `None` when not requested, elided (client
    /// target), or empty.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest: Option<String>,
}

/// A machine-readable diagnostic row. Reserved: compile WARNINGS currently
/// still flow to stderr (`diagnostics::emit_warning`) for channel parity with
/// the legacy CLI; hard errors travel the `Result` channel. The field exists
/// so a future capture refactor is not a wire-format break.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvelopeDiagnostic {
    pub severity: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    pub message: String,
}

/// The single-parse, multi-target, multi-output compile result.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Envelope {
    /// Envelope schema discriminant + version. Lets a caller that spawned an
    /// UNKNOWN binary distinguish an envelope reply from legacy output (old
    /// binaries ignore `--envelope` and print their normal artifact, which is
    /// never a JSON object carrying `"envelope"`).
    pub envelope: u32,
    /// Per-target artifacts, keyed `"client" | "server" | "universal"`.
    pub targets: BTreeMap<String, TargetEmit>,
    /// `--ast-json`-equivalent export (the serialized `SfcAstOwned`).
    /// Present iff `"ast"` was requested.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ast_json: Option<String>,
    /// `--route-json`-equivalent sidecar. Present iff `"route"` was requested
    /// AND the SFC declares an `@route` block (callers that requested it
    /// treat absence as the legacy `null`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route_json: Option<String>,
    pub diagnostics: Vec<EnvelopeDiagnostic>,
}

/// Current envelope schema version.
pub const ENVELOPE_VERSION: u32 = 1;

/// O1a (tag naming) — normalize a resolved define-name (PascalCase→kebab) so
/// the registered element matches emitted `branch(...)` references and the
/// manifest. Infallible; shared by the CLI (`src/bin/main.rs`), the wasm
/// binding, and the envelope so the three cannot drift.
pub fn resolve_define_tag(raw: &str) -> String {
    if crate::tags::is_component_tag(raw) {
        crate::tags::kebab_component_tag(raw)
    } else {
        raw.to_string()
    }
}

/// Render a `CompileError` into a single displayable string (message + code +
/// hint/fix/rewrite tail). Used by the napi addon, whose error channel is a JS
/// exception rather than a formatted stderr stream.
pub fn format_compile_error(e: &CompileError) -> String {
    let mut out = String::new();
    match e.code.as_deref() {
        Some(code) if !e.message.starts_with(code) => {
            out.push_str(&format!("{}: {}", code, e.message));
        }
        _ => out.push_str(&e.message),
    }
    let mut tail: Vec<u8> = Vec::new();
    crate::diagnostics::write_tail(&mut tail, e);
    if !tail.is_empty() {
        out.push('\n');
        out.push_str(String::from_utf8_lossy(&tail).trim_end());
    }
    out
}

fn bad_option(message: String) -> CompileError {
    CompileError {
        message,
        line: 0,
        col: 0,
        code: Some("C900".to_string()),
        ..Default::default()
    }
}

fn parse_target(s: &str) -> Result<BuildTarget, CompileError> {
    match s {
        "client" => Ok(BuildTarget::Client),
        "server" => Ok(BuildTarget::Server),
        "universal" => Ok(BuildTarget::Universal),
        other => Err(bad_option(format!(
            "C900: unknown envelope target '{other}' (expected: client|server|universal)"
        ))),
    }
}

fn target_key(t: BuildTarget) -> &'static str {
    match t {
        BuildTarget::Client => "client",
        BuildTarget::Server => "server",
        BuildTarget::Universal => "universal",
    }
}

/// Parse + validate + lower ONCE; emit per requested target; serialize every
/// requested artifact into one [`Envelope`].
///
/// Tag resolution mirrors the CLI exactly (OQ-C6): `@meta name` → `@route
/// name` → `opts.tag` (the stdin `--tag` stem) → the `opts.path` basename →
/// `"Component"`, then the O1a kebab normalization.
pub fn compile_envelope(source: &str, opts: &EnvelopeOptions) -> Result<Envelope, CompileError> {
    // ── Resolve options ─────────────────────────────────────────────────────
    let expr_parser = match opts.expr_parser.as_deref() {
        Some(v) => ExprParserMode::parse(v).ok_or_else(|| {
            bad_option(format!(
                "C900: unknown envelope exprParser '{v}' (expected: legacy|ast)"
            ))
        })?,
        None => ExprParserMode::from_env().unwrap_or_default(),
    };
    let targets: Vec<BuildTarget> = if opts.targets.is_empty() {
        vec![BuildTarget::Universal]
    } else {
        opts.targets
            .iter()
            .map(|s| parse_target(s))
            .collect::<Result<Vec<_>, _>>()?
    };
    let emits: Vec<&str> = if opts.emits.is_empty() {
        vec!["js"]
    } else {
        opts.emits.iter().map(String::as_str).collect()
    };
    for e in &emits {
        if !matches!(*e, "js" | "ast" | "route" | "manifest") {
            return Err(bad_option(format!(
                "C900: unknown envelope emit '{e}' (expected: js|ast|route|manifest)"
            )));
        }
    }
    let want = |kind: &str| emits.iter().any(|e| *e == kind);

    // ── Parse + validate + lower ONCE ───────────────────────────────────────
    let parsed = crate::parser::sfc::parse_with_path(source, opts.path.as_deref())?;
    // `compile_full_with_options` is target-independent (the target is merely
    // STORED on the unit; only emit branches on it), so one call covers every
    // requested target — that is the whole point of the envelope.
    let mut unit = crate::compile_full_with_options(&parsed, targets[0], expr_parser)?;

    // ── Tag resolution (mirrors src/bin/main.rs) ────────────────────────────
    let stem = opts
        .tag
        .clone()
        .or_else(|| {
            opts.path.as_deref().and_then(|p| {
                std::path::Path::new(p)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .map(|s| s.to_string())
            })
        })
        .unwrap_or_else(|| "Component".to_string());
    let tag_name = unit
        .source
        .meta
        .name
        .clone()
        .or_else(|| unit.source.route.as_ref().and_then(|r| r.name.clone()))
        .unwrap_or_else(|| stem.clone());
    let tag_name = resolve_define_tag(&tag_name);

    // ── Emit per target ─────────────────────────────────────────────────────
    let mut envelope = Envelope {
        envelope: ENVELOPE_VERSION,
        targets: BTreeMap::new(),
        ast_json: None,
        route_json: None,
        diagnostics: Vec::new(),
    };

    let needs_emit = want("js") || want("manifest") || want("route");
    if needs_emit {
        for t in &targets {
            unit.target = *t;
            let result = crate::emit_with_options(&unit, &tag_name, opts.strict_templates);
            // `route_json` is target-independent (emit_route_json reads the
            // @route block + component tags + resolved extract, none of which
            // branch on target) — capture it from the first emit that has it.
            if want("route") && envelope.route_json.is_none() {
                envelope.route_json.clone_from(&result.route_json);
            }
            if want("js") || want("manifest") {
                let te = TargetEmit {
                    js: if want("js") { Some(result.js) } else { None },
                    manifest: if want("manifest") && !result.manifest_json.is_empty() {
                        Some(result.manifest_json)
                    } else {
                        None
                    },
                };
                envelope.targets.insert(target_key(*t).to_string(), te);
            }
        }
    }

    // ── AST export (mirrors the CLI's --ast-json stem override) ─────────────
    if want("ast") {
        let mut ast = crate::build_owned_ast(&unit, opts.path.as_deref());
        let stem_fallback = unit
            .source
            .meta
            .name
            .clone()
            .or_else(|| unit.source.route.as_ref().and_then(|r| r.name.clone()))
            .unwrap_or_else(|| stem.clone());
        let stem_fallback = resolve_define_tag(&stem_fallback);
        ast.tag = stem_fallback.clone();
        ast.meta.name = stem_fallback;
        envelope.ast_json = Some(serde_json::to_string(&ast).map_err(|e| CompileError {
            message: format!("error serializing AST: {e}"),
            line: 0,
            col: 0,
            ..Default::default()
        })?);
    }

    Ok(envelope)
}
