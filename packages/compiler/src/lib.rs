pub mod ast_export;
pub mod codegen;
pub mod diagnostics;
// W2 (advanced-js-template-expressions): oxc-backed expression validation
// behind `--expr-parser <legacy|ast>`. ALL oxc types are contained in this
// module (plan §Risks 1 — oxc AST churn stays localized).
pub mod expr;
pub mod parser;
// Component-tag naming (O1a): PascalCase→kebab normalization + C450 validation.
pub mod tags;
pub mod types;

// WASM bindings — only compiled for the wasm32 target. The module is declared
// unconditionally so `cargo check` is consistent across native + wasm builds;
// item-level `#[cfg]` gates the actual exports.
pub mod wasm;

pub use ast_export::{
    build_owned_ast, compile_to_ast, SfcAstOwned, SfcAttrOwned, SfcIfBranch, SfcMacroValueOwned,
    SfcMetaOwned, SfcNodeOwned, SfcStyleBlockOwned, SfcStyleScope, AST_VERSION,
};
pub use codegen::{emit, resolve_signals, EmitResult, SignalMap};
pub use expr::ExprParserMode;
pub use parser::sfc;
pub use parser::stream_macros;
pub use parser::state_macros::{is_magna_origin, parse_state_macros};
pub use parser::template::parse_template;
pub use types::{
    ActionDecl, AgentBlock, AgentMacroDecl, AihuSource, Attr, AuthMacroKind, BuildTarget,
    CollectionEntry,
    CollectionKind, CompileError, CompileUnit, InputDecl, InputKind, MacroValue, RouteBlock,
    ScriptMeta, SfcMeta, StateDecl, StateMacro, StreamBlock, StyleBlock, StyleMacro, StyleScope,
    TemplateNode,
};

pub fn compile(source: &str) -> Result<AihuSource<'_>, CompileError> {
    parser::sfc::parse(source)
}

pub fn compile_with_path<'a>(source: &'a str, file_path: Option<&str>) -> Result<AihuSource<'a>, CompileError> {
    parser::sfc::parse_with_path(source, file_path)
}

pub fn compile_full<'a>(source: &'a AihuSource<'a>) -> Result<CompileUnit<'a>, CompileError> {
    compile_full_with_target(source, BuildTarget::Universal)
}

pub fn compile_full_with_target<'a>(
    source: &'a AihuSource<'a>,
    target: BuildTarget,
) -> Result<CompileUnit<'a>, CompileError> {
    compile_full_with_options(source, target, ExprParserMode::Legacy)
}

/// W2/W3 (advanced-js-template-expressions): `compile_full_with_target` plus
/// the `--expr-parser` mode. `ExprParserMode::Legacy` (the default everywhere)
/// is byte-identical to `compile_full_with_target`. `ExprParserMode::Ast`
/// VALIDATES every captured template expression with oxc (parse failure →
/// C320/C321) and — W3 — routes the emitter's signal-read rewrite through the
/// scope-aware AST rewrite (`expr::rewrite_signal_reads`) instead of the
/// legacy token scanner, fixing the plan's silent-miscompile classes (spread,
/// template-literal `${…}` holes, dotted-base arrow bodies, `{#each}` alias
/// shadowing).
pub fn compile_full_with_options<'a>(
    source: &'a AihuSource<'a>,
    target: BuildTarget,
    expr_parser: ExprParserMode,
) -> Result<CompileUnit<'a>, CompileError> {
    let template_ast = match source.template {
        Some(tmpl) => Some(parser::template::parse_template(tmpl)?),
        None => None,
    };

    // W2 validate-only hook: the captured expression strings live on the
    // template AST nodes, DOWNSTREAM of the (W1-owned) capture sites in
    // parser/template.rs. Once W1 threads `.aihu` byte offsets onto these
    // nodes, expr::validate_template gains exact file line/col mapping.
    if expr_parser == ExprParserMode::Ast {
        if let Some(ref ast) = template_ast {
            expr::validate_template(ast)?;
        }
    }

    // O1a (tag naming): every component tag reference must normalize to a
    // valid custom-element name (hyphen required). Single-word PascalCase
    // (`<Comment>`) can never satisfy that, so it is a hard C450 error for
    // ALL builds — not gated on ExprParserMode. Plain HTML/SVG tags are not
    // component tags and are never checked.
    if let Some(ref ast) = template_ast {
        validate_component_tags(ast)?;
    }

    // #433 (FEL-270): `$ref` co-located with a `$if`/`$each` directive on the
    // SAME element is a silent-blank trap. `$ref` lowers to an `onMount(...)`
    // wrapped IN the element node; `$if`/`$each` wrap that node again inside a
    // `createIfBoundary(...)` / `each(...)` FACTORY. Those factories run with no
    // component-setup owner, so the ref's `onMount` throws 'no owner' — and
    // because the throw unwinds inside the boundary, the element and its whole
    // subtree render blank with nothing surfaced (a live reading column went
    // blank in the web app). Emitting the ownerless `onMount` at setup level is
    // not clean here: the node is created CONDITIONALLY inside the boundary
    // factory and does not exist at setup time, and arbor's boundary factories
    // are owner-agnostic by construction (see `createLinkBoundary`, which wraps
    // its own `onMount` in try/catch for exactly this reason). So this is a hard
    // compile-time diagnostic that steers the author to a supported pattern,
    // per the issue's own suggestion — turning a silent blank into an obvious
    // error at build time.
    if let Some(ref ast) = template_ast {
        validate_ref_gating(ast)?;
    }

    // v2 (B6.3): validate `@state` macro grammar at compile time so v1
    // syntax surfaces as a hard error (C440 / C441 / C442 / C443 / C444)
    // rather than being silently elided by the downstream emit pass. The
    // parsed AST is discarded here — emit re-parses for codegen — but
    // any error short-circuits the pipeline at compile_full boundary.
    if let Some(script) = source.script {
        let macros = parser::state_macros::parse_state_macros(script)?;

        // CO1: `$prop` write diagnostics. These run HERE rather than in emit
        // because emit's lowering chain returns `String`, not `Result` — this
        // is the pipeline's error boundary, and it runs before any codegen.
        validate_prop_writes(&macros)?;

        // NOTE (issue #424): the former C205 hard error — which rejected a plain
        // `@state` const/let whose initializer reads a `$prop:` name — has been
        // retired. It was premised on the prop shadow (`const <name> =
        // ctx.props.<name>`) being emitted AFTER the plain @state body, which
        // would TDZ-throw at runtime. Issue #279 hoisted those prop bindings
        // ABOVE the plain body (emit.rs, `emit_prop_bindings` precedes
        // `plain_body` in the function-form assembly), so the prop getter is now
        // declared before any synchronously-running @state statement reads it.
        // The construct C205 rejected therefore compiles correctly today, so the
        // diagnostic was rejecting valid code and is removed. Props read inside a
        // `$action`/`$computed`/effect thunk were already lazy (never C205), and
        // remain safe. No genuinely TDZ-unsafe construct depended on this guard.
    }

    // DA4 phase 1 (#437) — W472: a route (page-level) component that does not
    // pin its shadow mode with `$shadow` changes behavior at the ratified DA4
    // default flip (next MAJOR): pages default to shadowMode 'none' (light
    // DOM) so server-rendered page content is reachable by non-JS crawlers.
    // This runs AFTER the script-macro validation block above so a hard parse
    // error in `@state` wins over the advisory warning, and it is non-fatal by
    // construction — it flows through `diagnostics::emit_warning` (stderr),
    // never the `Result` channel, so the build cannot fail on it.
    if let Some(w) = route_shadow_flip_warning(source) {
        crate::diagnostics::emit_warning(&w);
    }

    Ok(CompileUnit {
        source: source.clone(),
        template_ast,
        target,
        expr_parser,
    })
}

/// DA4 phase 1 (#437) — the W472 decision, as a pure function so the
/// precedence triple is directly testable (emission itself goes to stderr and
/// cannot be asserted from an integration test).
///
/// Classifier (founder-ratified, `docs/architecture/thesis.md` §DA4):
/// `$shadow` always wins; else an `@route` block makes the component a PAGE
/// (future default `shadowMode: 'none'`); else it is a LEAF (stays `'open'`).
/// The flip is semver-major and is preceded by exactly this warning release —
/// this function only WARNS about the upcoming page default; it changes no
/// emitted output.
///
/// Returns `Some(warning)` iff the unit has an `@route` block and no `$shadow`
/// macro. Any `$shadow` mode (`open`/`closed`/`none`) suppresses it — the
/// author has pinned the mode, so the flip cannot change their behavior. A
/// script that fails to parse is treated as "no `$shadow`", which is fine
/// because `compile_full_with_options` surfaces the hard parse error first and
/// never reaches the warning.
pub fn route_shadow_flip_warning(source: &AihuSource) -> Option<CompileError> {
    source.route.as_ref()?;
    let has_shadow = source.script.is_some_and(|script| {
        parser::state_macros::parse_state_macros(script).is_ok_and(|macros| {
            macros
                .iter()
                .any(|m| matches!(m, StateMacro::Shadow { .. }))
        })
    });
    if has_shadow {
        return None;
    }
    Some(CompileError {
        message: "this page-level component will default to shadowMode 'none' (light DOM) in the \
                  next major; write `$shadow open` to keep shadow DOM, or `$shadow none` to adopt \
                  light DOM now"
            .to_string(),
        line: 0,
        col: 0,
        code: Some("W472".to_string()),
        hint: Some(
            "DA4: components with an `@route` block are pages, and pages become light DOM by \
             default so server-rendered content is reachable by non-JS crawlers; leaf components \
             keep shadow DOM"
                .to_string(),
        ),
        fix: Some(
            "pin the mode in `@state`: `$shadow: 'open'` keeps today's behavior, `$shadow: 'none'` \
             adopts the future default now and silences this warning"
                .to_string(),
        ),
        from: Some("@state {".to_string()),
        to: Some("@state {\n  $shadow: 'open'".to_string()),
        ..Default::default()
    })
}

/// O1a (tag naming): walk the template AST and reject any component tag that
/// cannot normalize to a valid custom-element name (C450). The traversal shape
/// mirrors `collect_component_tags` in codegen/emit.rs: recurse into
/// Element/MacroElement children, `{#if}` branches, and `{#each}` bodies.
/// `<$macro>` elements are compiler intrinsics — their own names are never
/// component tags — but their children may contain components.
fn validate_component_tags(nodes: &[TemplateNode]) -> Result<(), CompileError> {
    for node in nodes {
        match node {
            TemplateNode::Element { tag, children, .. } => {
                if tags::is_component_tag(tag) {
                    if let Err(msg) = tags::validate_component_tag(tag) {
                        return Err(CompileError {
                            message: msg,
                            line: 0,
                            col: 0,
                            code: Some("C450".to_string()),
                            hint: Some(format!(
                                "custom-element names require a hyphen; the single word '{tag}' can never satisfy that"
                            )),
                            fix: Some(format!(
                                "use a hyphenated tag (e.g. '<x-{}>') or set an explicit hyphenated `@meta name` on the component",
                                tags::kebab_component_tag(tag)
                            )),
                            ..Default::default()
                        });
                    }
                }
                validate_component_tags(children)?;
            }
            TemplateNode::MacroElement { children, .. } => {
                validate_component_tags(children)?;
            }
            TemplateNode::IfBlock { branches } => {
                for (_, body) in branches {
                    validate_component_tags(body)?;
                }
            }
            TemplateNode::EachBlock {
                body, empty_body, ..
            } => {
                validate_component_tags(body)?;
                if let Some(empty) = empty_body {
                    validate_component_tags(empty)?;
                }
            }
            TemplateNode::Text(_)
            | TemplateNode::Interpolation(_)
            | TemplateNode::HtmlBlock { .. } => {}
        }
    }
    Ok(())
}

/// #433 (FEL-270) — reject `$ref` co-located with a `$if`/`$each` directive on
/// the SAME element (C562).
///
/// `$ref` lowers to an `onMount(...)` wrapped around the element node; `$if` and
/// `$each` wrap that node again inside a `createIfBoundary(...)` / `each(...)`
/// FACTORY. Those factories run with no component-setup owner, so the ref's
/// `onMount` throws 'no owner' — and because the throw unwinds inside the
/// boundary, the element and its whole subtree render blank with nothing
/// surfaced. This diagnostic converts that silent blank into a build error that
/// names the fix. Only the DIRECTIVE co-occurrence on one element is rejected;
/// an UNGATED `$ref` still lowers to its existing setup-level `onMount`.
fn validate_ref_gating(nodes: &[TemplateNode]) -> Result<(), CompileError> {
    /// The name of the first gating directive (`if`/`each`) on `attrs`, if the
    /// element ALSO carries a `$ref` directive; `None` otherwise.
    fn ref_gate_conflict(attrs: &[Attr]) -> Option<&'static str> {
        let has_ref = attrs
            .iter()
            .any(|a| matches!(a, Attr::Macro { name, .. } if name == "ref"));
        if !has_ref {
            return None;
        }
        attrs.iter().find_map(|a| match a {
            Attr::Macro { name, .. } if name == "if" => Some("if"),
            Attr::Macro { name, .. } if name == "each" => Some("each"),
            _ => None,
        })
    }

    fn ref_gating_error(gate: &str, tag: &str) -> CompileError {
        CompileError {
            message: format!(
                "C562: `$ref` cannot be combined with `${gate}` on the same element \
                 (`<{tag}>`). The ref's `onMount` is emitted INSIDE the `${gate}` boundary \
                 factory, which runs with no component-setup owner, so it throws 'no owner' \
                 at runtime and the element and its whole subtree render blank — silently."
            ),
            line: 0,
            col: 0,
            code: Some("C562".to_string()),
            hint: Some(format!(
                "a `${gate}` boundary factory is owner-agnostic by construction; an `onMount` \
                 registered inside it throws, and because the throw unwinds inside the boundary \
                 the subtree blanks with nothing surfaced"
            )),
            fix: Some(format!(
                "move `$ref` to an always-present ancestor (e.g. the `@template` root or a \
                 wrapping element) so its `onMount` runs at setup-owner level, then read the \
                 `${gate}`-gated element from that ref"
            )),
            from: Some(format!("<{tag} $ref={{…}} ${gate}=…>")),
            to: Some(format!("<{tag} ${gate}=…> inside an ancestor that carries `$ref`")),
        }
    }

    for node in nodes {
        match node {
            TemplateNode::Element { tag, attrs, children } => {
                if let Some(gate) = ref_gate_conflict(attrs) {
                    return Err(ref_gating_error(gate, tag));
                }
                validate_ref_gating(children)?;
            }
            TemplateNode::MacroElement { name, attrs, children } => {
                if let Some(gate) = ref_gate_conflict(attrs) {
                    return Err(ref_gating_error(gate, &format!("${name}")));
                }
                validate_ref_gating(children)?;
            }
            TemplateNode::IfBlock { branches } => {
                for (_, body) in branches {
                    validate_ref_gating(body)?;
                }
            }
            TemplateNode::EachBlock { body, empty_body, .. } => {
                validate_ref_gating(body)?;
                if let Some(empty) = empty_body {
                    validate_ref_gating(empty)?;
                }
            }
            TemplateNode::Text(_)
            | TemplateNode::Interpolation(_)
            | TemplateNode::HtmlBlock { .. } => {}
        }
    }
    Ok(())
}


/// CO1 — `$prop` write diagnostics (C560 / C561).
///
/// The rewrite itself lives in `expr::prop_write` and is applied during emit.
/// The two hard errors are raised here, at the `compile_full` boundary, so a
/// bad write fails the build with a code and a fix hint rather than reaching
/// codegen and emitting the exact defect CO1 exists to repair.
///
/// * **C560** — a destructuring / `for-of` / `for-in` target is a `$prop`. This
///   is the one shape that cannot be rewritten soundly: a correct desugar needs
///   a temporary (`arr` may be any iterable, so `arr[0]` is not equivalent) and
///   a block statement, which cannot be spliced into expression position.
/// * **C561** — a write to a `$prop` inside `$computed` / `$resource`. Those are
///   DECLARED-DERIVATION positions; a write there is a category error. Without
///   this, the same authored line would mean different things in different
///   macros. C561 moves today's runtime `TypeError` to compile time.
fn validate_prop_writes(macros: &[StateMacro]) -> Result<(), CompileError> {
    use parser::state_macros::{arrow_args, arrow_body, arrow_is_async, running_code};
    use std::collections::{HashMap, HashSet};

    // Key set = `$prop` names only. NOT the SignalMap, which also holds
    // `$computed` entries and lifted `signal()` bindings.
    let mut prop_names: HashSet<String> = HashSet::new();
    for m in macros {
        if let StateMacro::Collection { kind: CollectionKind::Prop, entries } = m {
            for e in entries {
                prop_names.insert(e.name.clone());
            }
        }
    }
    if prop_names.is_empty() {
        return Ok(());
    }
    let props: HashMap<String, bool> = prop_names.iter().map(|n| (n.clone(), false)).collect();
    let targets = expr::PropWriteTargets { props: &props };

    for m in macros {
        let StateMacro::Collection { kind, entries } = m else { continue };
        for entry in entries {
            let Some(arrow) = running_code(entry) else { continue };
            let body = arrow_body(arrow).unwrap_or_else(|| arrow.to_string());
            let args = arrow_args(arrow).unwrap_or_default();
            let is_async = arrow_is_async(arrow);

            match kind {
                // Imperative positions: the rewrite applies, so only the
                // unsound destructuring shape is an error.
                CollectionKind::Action | CollectionKind::Lifecycle | CollectionKind::Effect => {
                    expr::rewrite_prop_writes(&body, &args, is_async, &targets)?;
                }
                // Declared-derivation positions: ANY write is C561.
                CollectionKind::Computed | CollectionKind::Resource => {
                    let macro_name = if *kind == CollectionKind::Computed {
                        "$computed"
                    } else {
                        "$resource"
                    };
                    if let Some(name) =
                        expr::detect_prop_writes(&body, &args, is_async, &prop_names).first()
                    {
                        return Err(CompileError {
                            message: format!(
                                "C561: `{macro_name}` bodies are derivations and must not write \
                                 `$prop` `{name}` (in `{entry_name}`). Move the write to an \
                                 `$action`, or read with `{name}()`.",
                                entry_name = entry.name,
                            ),
                            line: 0,
                            col: 0,
                            code: Some("C561".to_string()),
                            hint: Some(format!(
                                "a `{macro_name}` entry declares how a value is DERIVED; writing \
                                 state from it would make a derivation silently mutate the \
                                 component"
                            )),
                            fix: Some(format!(
                                "read the prop instead (`{name}()`), and move the write into an \
                                 `$action` entry"
                            )),
                            from: Some(format!("{name} = …")),
                            to: Some(format!("$action: {{ set{name}: (v) => {{ {name}.set(v) }} }}")),
                            ..Default::default()
                        });
                    }
                }
                _ => {}
            }
        }
    }
    Ok(())
}
