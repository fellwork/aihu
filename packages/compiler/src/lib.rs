pub mod ast_export;
pub mod codegen;
// GX Phase 4 (#466): the `data:` governed-resource declaration — shared value
// parser (C485/C487) + `.route.json` / withheld-type rendering.
pub mod data;
pub mod diagnostics;
// GX Phase 1 (#437-GX): the `extract:` two-axis vocabulary — shared value
// parser + declaration→derivation→default resolution.
pub mod extract;
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
pub use data::parse_data_literal;
pub use extract::{resolve_extract, ExtractOrigin, ResolvedExtract};
pub use types::{
    ActionDecl, AgentBlock, AgentMacroDecl, AihuSource, Attr, AuthMacroKind, BuildTarget,
    CollectionEntry,
    CollectionKind, CompileError, CompileUnit, DataDecl, ExtractCall, ExtractDecl, ExtractRead,
    InputDecl,
    InputKind, MacroValue, RouteBlock,
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

    // GX Phase 1 (#437-GX) — `extract:` composition checks (spec §3). Hard
    // errors first (C484 one-declaration-per-surface, C481 closed-call
    // contradiction), then the advisory warnings (W480/W481). These run at the
    // compile_full boundary — the pipeline's error channel — like CO1's
    // C560/C561, so the contradiction rows exist before any artifact does.
    validate_extract_composition(source)?;

    // GX Phase 4 (#466) — `data:` composition check: the `$gx` discriminant
    // namespace is generated, never authored (70-governed-data-access §4.5).
    // The declaration's own names are checked at parse time (`data.rs`); this
    // catches the remaining authored surface — a governed route whose declared
    // `route` prop type carries its own `$gx` member.
    validate_data_composition(source)?;

    // DA4 (#437) — the light-DOM default flip LANDED: pages (`@route` block,
    // no `$shadow` pin) now default to shadowMode 'none' via the
    // `// @aihu:shadow-default none` marker emitted in codegen (emit.rs).
    // The phase-1 advisory W472 that warned about this flip is retired — the
    // behavior it predicted is now the behavior.

    Ok(CompileUnit {
        source: source.clone(),
        template_ast,
        target,
        expr_parser,
    })
}

/// GX Phase 1 (#437-GX) — `extract:` composition checks (spec §3 rows 3, 8,
/// 11, 12). Pure over the parsed source; raises the hard errors through the
/// `Result` channel and emits the advisory warnings to stderr via
/// `diagnostics::emit_warning` (the W472 pattern — non-fatal by construction).
///
/// * **C484** — `@route { extract: ... }` ∧ `$extract` in the same file: one
///   declaration per surface (row 8). (Two `$extract` lines in one `@state`
///   are C484'd by `parse_state_macros` itself, like C441.)
/// * **C481** — a declared-closed call axis (`call: 'none'`) with any
///   `expose:`d member on the surface is a contradiction: one declaration
///   promises what another forbids (row 3 — narrowed per critique A-3 to fire
///   only when the CALL axis is closed, never when content is).
/// * **W480** — a component-level `$scope` plus an explicit public-tier
///   `extract.read`: the author overrode the fail-closed derivation; both
///   statements are visible, so this informs rather than errors (row 12).
/// * **W481** — `call: { scope }` with no exposed member anywhere: a
///   declaration with nothing to govern (row 11).
fn validate_extract_composition(source: &AihuSource) -> Result<(), CompileError> {
    let route_decl = source.route.as_ref().and_then(|r| r.extract.as_ref());
    let state_decl = extract::state_extract_decl(source);

    // C484 — one declaration per surface (row 8).
    if route_decl.is_some() && state_decl.is_some() {
        return Err(extract::c484(
            0,
            "this file declares BOTH `@route { extract: ... }` and `$extract` in `@state`; \
             a route surface declares its policy in the `@route` block only",
        ));
    }

    let resolved = extract::resolve_extract(source);
    let has_exposed = source
        .script
        .is_some_and(codegen::has_exposed_agent_members);

    // C481 — `call: 'none'` ∧ any `expose:` member (row 3). Fires only on the
    // DECLARED value: the default/derived call axis is never 'none'.
    if resolved.call == ExtractCall::None && has_exposed {
        return Err(CompileError {
            message: "C481: this surface declares `call: 'none'` (no agent surface) but carries \
                      `expose:`d members — one declaration promises what the other forbids"
                .to_string(),
            line: 0,
            col: 0,
            code: Some("C481".to_string()),
            hint: Some(
                "`extract.call` is a ceiling over the member-level `expose:` grants, never a \
                 grant itself; a closed call axis and an exposed member cannot both hold"
                    .to_string(),
            ),
            fix: Some(
                "either remove the `expose:` keys from the `@state` entries, or declare a call \
                 value that admits an agent surface ('anonymous' | 'verified' | { scope: '<name>' })"
                    .to_string(),
            ),
            from: Some("call: 'none'".to_string()),
            to: Some("call: 'anonymous'".to_string()),
        });
    }

    // W480/W481 — advisory only; computed by the pure decision function (the
    // W472 pattern: emission goes to stderr and cannot be asserted from an
    // integration test, so the DECISION is a testable pure function).
    for w in extract_policy_warnings(source) {
        diagnostics::emit_warning(&w);
    }

    Ok(())
}

/// GX Phase 4 (#466) — `data:` ∧ authored-`$gx` contradiction (C487, spec
/// §4.5). The `Withheld<T>`/`Entitled<T>` union the framework generates is
/// discriminated on `route.data.$gx.entitled`; a governed route whose declared
/// `route` prop `type:` carries its own `$gx` member would collide with that
/// generated discriminant, so it fails the build. Pure text containment over
/// the declared type literal — `$gx` has no legitimate authored use in a
/// governed route's prop type, so containment is exact enough and cannot
/// false-negative. Ungoverned routes are untouched (no `data:` → no check).
fn validate_data_composition(source: &AihuSource) -> Result<(), CompileError> {
    let governed = source.route.as_ref().and_then(|r| r.data.as_ref()).is_some();
    if !governed {
        return Ok(());
    }
    let Some(script) = source.script else { return Ok(()) };
    let Ok(macros) = parser::state_macros::parse_state_macros(script) else {
        // A hard @state parse error is surfaced by the macro-validation block
        // above; nothing to check here.
        return Ok(());
    };
    for m in &macros {
        let StateMacro::Collection { kind: CollectionKind::Prop, entries } = m else {
            continue;
        };
        for e in entries {
            if e.name != "route" {
                continue;
            }
            let declared_type = e
                .meta
                .iter()
                .find(|(k, _)| k == "type")
                .map(|(_, v)| v.as_str())
                .unwrap_or("");
            if declared_type.contains("$gx") {
                return Err(data::c487(
                    0,
                    "this governed route's `$prop route` declares a type carrying `$gx`; \
                     the discriminated `Entitled<T> | Withheld<T>` shape of `route.data` is \
                     generated from the `data:` declaration — remove the authored `$gx` member",
                ));
            }
        }
    }
    Ok(())
}

/// GX Phase 1 (#437-GX) — the W480/W481 decisions, as a pure function so the
/// warning rows of the spec-§3 composition table are directly testable.
/// Returns the (possibly empty) list of advisory warnings for a source file;
/// `validate_extract_composition` emits them to stderr, never the `Result`
/// channel — the build cannot fail on them.
pub fn extract_policy_warnings(source: &AihuSource) -> Vec<CompileError> {
    let mut warnings = Vec::new();
    let route_decl = source.route.as_ref().and_then(|r| r.extract.as_ref());
    let state_decl = extract::state_extract_decl(source);
    let resolved = extract::resolve_extract(source);
    let has_exposed = source
        .script
        .is_some_and(codegen::has_exposed_agent_members);

    // W480 — explicit public-tier read over a component-$scope derivation (row 12).
    let declared_read = route_decl
        .and_then(|d| d.read.clone())
        .or_else(|| state_decl.as_ref().and_then(|d| d.read.clone()));
    if let (Some(read), Some(scope)) = (&declared_read, extract::component_scope(source)) {
        if read.is_compliance_tier() {
            warnings.push(CompileError {
                message: format!(
                    "this component carries `$scope \"{}\"` but declares the public-tier \
                     `read: '{}'` — the explicit value wins over the fail-closed \
                     `read: {{ scope: '{}' }}` derivation",
                    scope,
                    read.marker_value(),
                    scope
                ),
                line: 0,
                col: 0,
                code: Some("W480".to_string()),
                hint: Some(
                    "a component-level $scope normally derives a fail-closed read default so a \
                     surface gated at the tool gate does not leak at SSR; declaring a public read \
                     re-opens the content surface — both statements are visible in source, so \
                     this is informational"
                        .to_string(),
                ),
                ..Default::default()
            });
        }
    }

    // W481 — a surface-level call scope with nothing to govern (row 11).
    if matches!(resolved.call, ExtractCall::Scope(_)) && !has_exposed {
        warnings.push(CompileError {
            message: "`call: { scope: ... }` is declared but no member on this surface is \
                      `expose:`d — the declaration governs nothing"
                .to_string(),
            line: 0,
            col: 0,
            code: Some("W481".to_string()),
            hint: Some(
                "`expose:` on a `@state` entry is the only member-level grant; a surface-level \
                 call scope is a ceiling over those grants"
                    .to_string(),
            ),
            ..Default::default()
        });
    }

    warnings
}

// DA4 (#437) — `route_shadow_flip_warning` (W472) lived here through the
// phase-1 warning release and was retired when the flip landed: pages now
// GET the light-DOM default (emit.rs prepends `// @aihu:shadow-default none`
// for an unpinned `@route` unit) instead of being warned about it. The
// page-vs-leaf classifier it encoded (`$shadow` pin wins; `@route` block =
// page → 'none'; otherwise leaf → 'open') moved into the emission itself and
// is pinned by `tests/route_shadow_warning.rs`.

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
