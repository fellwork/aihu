use crate::codegen::signals::{SignalMap, StateNames};
use crate::expr::ExprParserMode;
use std::collections::BTreeMap;
use crate::parser::style_macros::{emit_style_macros, extract_global_reactives};
use crate::types::{
    AgentBlock, AgentMacroDecl, Attr, BuildTarget, CollectionKind, CompileUnit, InputKind,
    MacroValue, RouteBlock, StyleBlock, StyleMacro, StyleScope, TemplateNode,
};
// Note: $html macro emits innerHTML assignments — these are intentionally unsafe
// and documented as requiring consumer-side sanitization (see spec).

/// Imports needed due to `@state` macro declarations.
#[derive(Default)]
struct StateImports {
    needs_computed: bool,
    needs_batch: bool,
    needs_on_mount: bool,
    needs_on_cleanup: bool,
    // R2 (Director r6 §3): four-callback $lifecycle extension.
    needs_on_adopt: bool,
    needs_on_attribute_change: bool,
    needs_effect_for_macros: bool,
    needs_create_resource: bool,
    // arch-3 M2 (RFC-003) — `$query` and magna-origin `$resource` lower to
    // `createMagnaResource(inject(MagnaFetchToken), ...)`. When set, the
    // imports `createMagnaResource`/`MagnaFetchToken` (`@aihu/magna`) and
    // `inject` (`@aihu/context`) are emitted.
    needs_create_magna_resource: bool,
    // arch-3 M2 / A3 G2 (RFC-001) — `$auth.session()`/`$auth.currentUser()`
    // lower to `const <name> = useCurrentUser()`. When set, the
    // `import { useCurrentUser } from '@aihu/auth'` import is emitted.
    needs_use_current_user: bool,
    // v0.4.0 — `$stream` lowers to `createStream()` in `@aihu/runtime`.
    needs_create_stream: bool,
    // arch-5 M1 — `$route`, `$beforeNavigate`, `$afterNavigate` lower to
    // calls into `@aihu/router`. When set, the namespace import is emitted.
    needs_aihu_router: bool,
    // B5 — `$controller` requires onMount+onCleanup for lifecycle wiring.
    needs_controller: bool,
    // B5/O2 — `$context` lowers to `provide`/`inject`/`contextKey` calls from
    // `@aihu/context` (prototype-chain hierarchical DI). When set, that import
    // is emitted.
    needs_context: bool,
}

#[derive(Debug, Default, serde::Serialize)]
pub struct EmitResult {
    pub js: String,
    pub manifest_json: String,
    /// v0.6.2: Serialized `.route.json` sidecar. Some when @route block is present.
    pub route_json: Option<String>,
    /// B3 — Per-SFC TypeScript sidecar. Contains `@state` declarations in
    /// scope plus every `@template` curly expression as a typed body statement.
    /// `tsc --noEmit` over `**/*.aihu.ts` enforces type-safety end-to-end per
    /// Architect spec §7 path (i). None when no template/state is present.
    pub sidecar_ts: Option<String>,
}

fn emit_style_block(style: &StyleBlock) -> (String, String) {
    // Amendment 02: when the style block is global and the content contains
    // `$reactive(expr)` call patterns, extract them and emit JS effects targeting
    // `document.documentElement`. The CSS content has the calls replaced with
    // `var(--reactive-global-N)` references, and the corresponding `:root` declarations
    // are prepended.
    let (css_content, global_reactive_effects) = if style.scope == StyleScope::Global
        && style.content.contains("$reactive(")
    {
        let (cleaned_css, reactives) = extract_global_reactives(style.content);
        // Build GlobalReactive StyleMacro list for emission
        let macros: Vec<StyleMacro> = reactives
            .into_iter()
            .map(|(index, expr)| StyleMacro::GlobalReactive { index, expr })
            .collect();
        let (macro_css, macro_js) = emit_style_macros(&macros);
        // Prepend the :root declarations to the cleaned CSS
        let full_css = if macro_css.is_empty() {
            cleaned_css
        } else {
            format!("{}\n{}", macro_css, cleaned_css)
        };
        (full_css, macro_js)
    } else {
        (style.content.to_string(), String::new())
    };

    // The CSS is interpolated into a JS template literal, so any backtick,
    // `${`, or backslash in the source CSS (e.g. inside a `/* ... */` comment
    // that mentions a `.foo` selector) would otherwise terminate the literal
    // early — throwing at runtime and aborting `customElements.define`. Escape
    // backslashes first, then backticks and `${` interpolation starts.
    let escaped_css = css_content
        .replace('\\', "\\\\")
        .replace('`', "\\`")
        .replace("${", "\\${");
    let module_decl = format!(
        "const __style__ = new CSSStyleSheet();\n__style__.replaceSync(`{}`);\n",
        escaped_css
    );
    let mut setup_injection = match style.scope {
        StyleScope::Scoped => {
            "(ctx.host as ShadowRoot).adoptedStyleSheets = [__style__];".to_string()
        }
        StyleScope::Global => {
            "document.adoptedStyleSheets = [...document.adoptedStyleSheets, __style__];".to_string()
        }
    };
    // Append any document.documentElement effects after the style injection
    if !global_reactive_effects.is_empty() {
        setup_injection.push('\n');
        setup_injection.push_str("  ");
        setup_injection.push_str(&global_reactive_effects);
    }
    (module_decl, setup_injection)
}

pub fn emit(unit: &CompileUnit, tag_name: &str) -> EmitResult {
    if !tag_name.contains('-') {
        eprintln!(
            "warning: tag '{}' does not contain a hyphen; custom element names must include '-'",
            tag_name
        );
    }

    let target = unit.target;

    // GX Phase 1 (#437-GX) — resolve the ONE effective extract policy
    // (declaration → component-$scope derivation → the ratified default
    // `{ read: 'agents', call: 'anonymous' }`) exactly ONCE per compile. All
    // three emitted artifacts — the code marker, the `.route.json` sidecar,
    // and the agent-meta manifest — render from THIS value, so they agree by
    // construction (spec §2.4 / DA-f2: the fan-out cannot drift).
    let extract = crate::extract::resolve_extract(&unit.source);

    // A component is agent-enabled when it EXPOSES anything — an `@agent` block
    // is not required.
    //
    // Previously every agent artifact was gated on `unit.source.agent.is_some()`,
    // which contradicted the documented contract
    // (docs/site/authoring-agents.md: "No `@agent` block needed") and, more
    // concretely, meant `aihu create`'s scaffold and `cookbook/agent-weather.aihu`
    // — both of which write `expose:` + `describe:` and NO `@agent` block —
    // compiled to zero agent artifacts. The scaffold's own comment that
    // "`$action` is the single source of truth for the agent surface" was false
    // at the compiler level.
    //
    // This does not widen the exposed surface: `expose: { read: true }` is
    // already an explicit, per-member author opt-in, and unexposed members are
    // still excluded by `collect_agent_members`. Requiring a SECOND opt-in
    // (`@agent`) only made the first one silently inert.
    //
    // `@agent` retains its v2 job: carrying policy (`$scope`, `$rate-limit`).
    let has_exposed_members = {
        let members = collect_agent_members(unit.source.script.unwrap_or(""));
        !members.actions.is_empty() || !members.reads.is_empty() || !members.writes.is_empty()
    };
    let is_agent_component = unit.source.agent.is_some() || has_exposed_members;

    // v0.6.6: Server-artifact emission gates.
    // When target == Client, check for @agent block or $server macro references.
    let elide_agent = target == BuildTarget::Client && is_agent_component;
    let elide_server_macro = target == BuildTarget::Client
        && unit.source.script.map_or(false, |s| s.contains("$server"));
    // v0.4.0: @stream block is server-only. Elide in client builds.
    let elide_stream = target == BuildTarget::Client && unit.source.stream.is_some();

    // GX P3 (server emission, keystone slice) — a `--target server` build of a
    // NON-agent component emits a standalone SSR entry: setup is hoisted to a
    // named module const, the `defineElement(...)` registration is gated behind
    // a DOM-globals check, and `export default __ssr` exposes a host-less
    // arbor-tree factory that `@aihu/server`'s `renderToString` and
    // `@aihu/app`'s `resolveComponent` (`mod.default`) consume directly.
    //
    // Agent components are EXCLUDED for now: their server artifact is consumed
    // by the `@aihu/agent-service` headless mount path, whose string-surgery
    // injectors (`inject_server_binding_registration`) anchor on the
    // `defineComponent((_ctx) => {` shape — restructuring it would silently
    // drop the LiveBinding registration. That lane gets its SSR entry when the
    // stubbed server SetupContext grows attr/prop signal support (full P3).
    let emit_ssr_entry = target == BuildTarget::Server && !is_agent_component;

    let js = {
        // Unified lowering engine. `emit_function_form` runs `process_state_body`
        // (full $prop/$action/$computed/magna/$auth/... lowering) for EVERY
        // component, including @agent ones — both client (`elide_agent`) and
        // server builds. The @agent block is passed so the function form can emit
        // the agent `input` coercions (number/boolean/enum → computed) regardless
        // of build target. Server-only `__agentBinding`/registration are appended
        // below; client-only opaque-ID dispatcher likewise.
        let mut base_js = emit_function_form(
            unit,
            tag_name,
            unit.source.agent.as_ref(),
            &extract,
            emit_ssr_entry,
        );
        // v0.4.0: append __streamBinding export for server artifacts.
        if let Some(stream_block) = &unit.source.stream {
            if elide_stream {
                // Client build: prepend elision comment.
                base_js = format!("// [client build] @stream block elided\n{}", base_js);
            } else {
                // Server build: append __streamBinding export.
                let stream_binding = emit_stream_binding(tag_name, stream_block);
                base_js.push('\n');
                base_js.push_str(&stream_binding);
            }
        }
        if elide_agent {
            eprintln!("WARNING: @agent block elided — client-only build");
            // T1 (go-public): the raw `__agentBinding` (actions + scope/rateLimit)
            // stays server-only — still fully elided here. But the client must
            // remain drivable by the capability bridge, so we append a NARROW,
            // policy-free opaque-ID dispatcher (`__agentDispatcher`). It carries
            // only opaque-ID → invoker maps; no scope, no rateLimit.
            let raw_script = unit.source.script.unwrap_or("");
            let dispatcher = emit_agent_client_dispatcher(tag_name, raw_script);
            // T6 (go-public demo) — per-instance dispatcher wiring.
            //
            // The module-scope `export const __agentDispatcher` is a structural
            // template: its invoker bodies (`(args) => increment(args)`, etc.)
            // reference setup-closure locals that DO NOT exist at module scope,
            // so calling them there throws ReferenceError. The capability bridge
            // needs invokers bound to a SPECIFIC mounted instance's signals.
            //
            // So, in addition to the (introspection-only) module-scope export, we
            // inject a `_registerAgentDispatcher(ctx.element, { … })` call INSIDE
            // the setup body — where the real `increment`/`reset`/`count`
            // closures resolve. The runtime keys it by the mounted element so the
            // browser bridge can take the instance-bound dispatcher after mount.
            // No policy is carried (same opaque-ID-only shape as the export).
            let with_reg = inject_dispatcher_registration(&base_js, tag_name, raw_script);
            // Prepend elision comment to the emitted JS, append the dispatcher.
            format!(
                "// [client build] @agent block elided\n{}\n{}",
                with_reg, dispatcher
            )
        } else if is_agent_component {
            // A component with exposed members but no `@agent` block carries no
            // policy, so an empty AgentBlock is the correct stand-in: `$scope`
            // and `$rate-limit` are absent, which the runtime reads as
            // "unscoped, unthrottled" — exactly what declaring nothing means.
            let empty_agent = AgentBlock::default();
            let agent = unit.source.agent.as_ref().unwrap_or(&empty_agent);
            // SERVER build of an @agent component. Unified path (fix:
            // server-agent-macro-lowering): `emit_function_form` already lowered
            // EVERY @state macro ($prop/$action/$computed/magna/$auth/...) and
            // emitted the agent input coercions, so the setup body is valid JS —
            // unlike the legacy `emit_options_form` which left them semi-raw.
            //
            // Two remaining server-only additions:
            //  (1) the module-scope `export const __agentBinding` (introspection +
            //      the shape `@aihu/arbor` mount() consumes); and
            //  (2) an in-setup `_registerAgentServerBinding(ctx.element, { … })`
            //      so a server-mounted instance lands a LiveBinding in arbor's
            //      componentInstanceRegistry — the headless `@aihu/agent-service`
            //      gate path. This mirrors the client T6 `_registerAgentDispatcher`
            //      but carries the FULL named binding + policy (server-only).
            //  (3) the module-scope `registerAgentMetadata({ … })` that populates
            //      the `@aihu/agent` registry. This is what `@aihu/agent-server`
            //      reads to build MCP tool definitions — without it the registry
            //      is empty and every tool ships undescribed. Pure data, so it is
            //      safe at module scope (unlike `__agentBinding`, whose invoker
            //      bodies close over setup locals).
            let raw_script = unit.source.script.unwrap_or("");
            let with_reg = inject_server_binding_registration(&base_js, tag_name, agent, raw_script);
            let agent_binding_export = emit_agent_binding_export(tag_name, agent, raw_script);
            let agent_metadata = emit_agent_metadata_registration(tag_name, raw_script, &extract);
            let with_metadata = if agent_metadata.is_empty() {
                with_reg
            } else {
                format!(
                    "import {{ registerAgentMetadata }} from '@aihu/agent'\n{}\n{}",
                    with_reg, agent_metadata
                )
            };
            format!("{}\n{}\n", with_metadata, agent_binding_export)
        } else if elide_server_macro {
            eprintln!("WARNING: $server macro reference elided — client-only build");
            format!("// [client build] $server macro reference elided\n{}", base_js)
        } else {
            base_js
        }
    };

    // v0.6.6: Do NOT emit manifest_json for client-only builds.
    let manifest_json = if elide_agent {
        String::new()
    } else if is_agent_component {
        let empty_agent = AgentBlock::default();
        let agent = unit.source.agent.as_ref().unwrap_or(&empty_agent);
        emit_manifest(tag_name, agent, unit.source.script.unwrap_or(""), &extract)
    } else {
        String::new()
    };

    // v0.6.2: Emit route_json sidecar when @route block is present.
    // The `components` member (added for route-scoped registration) lists the
    // custom-element tags this page's template references, so the router can
    // import + register exactly this route's component graph instead of the app
    // eagerly importing every component at boot.
    let mut component_tags = std::collections::BTreeSet::new();
    if let Some(nodes) = unit.template_ast.as_ref() {
        collect_component_tags(nodes, &mut component_tags);
    }
    let route_json = unit
        .source
        .route
        .as_ref()
        .map(|r| emit_route_json(r, &component_tags, &extract));

    // B3 — Per-SFC `.aihu.ts` sidecar (Architect spec §7 path (i)). Generates
    // a typed function body containing the template expressions so `tsc
    // --noEmit` over `**/*.aihu.ts` checks template type-safety end-to-end.
    let sidecar_ts = emit_sidecar_ts(unit, tag_name);

    EmitResult { js, manifest_json, route_json, sidecar_ts }
}

/// B3 — Emit a TypeScript sidecar containing the SFC's template expressions
/// as typed body statements. Per Architect spec §7 path (i):
///
/// ```ts
/// // foo.aihu.ts (generated)
/// declare function __template(): void {
///   // expressions lifted from @template:
///   ;(view === 'week') satisfies boolean
///   ;(day.toISOString()) satisfies string
///   // ...
/// }
/// ```
///
/// The sidecar is intentionally minimal — it captures the curly-binding
/// expressions, $on handler bodies, $bind LHS identifiers, and {#if}/{#each}
/// header conditions/list expressions. `tsc --noEmit` flags type errors;
/// concrete type-checking depth grows in later rounds.
fn emit_sidecar_ts(unit: &CompileUnit, tag_name: &str) -> Option<String> {
    let nodes = unit.template_ast.as_ref()?;
    let mut exprs: Vec<SidecarExpr> = Vec::new();
    collect_template_exprs(nodes, &mut exprs);
    // Always emit a sidecar when a template is present so tsc has a per-SFC
    // surface to check, even if the @template happens to contain only static
    // markup at this moment.

    let script = unit.source.script.unwrap_or("").trim();
    // Preamble re-declares typical SFC globals so tsc has a permissive type
    // scope. We type these as `any` because precise typing requires deeper
    // SFC -> TS lowering (B3+ sidecar refinement is a watched item).
    // B3b — derive a typed `$emit` interface from the SFC's `$event:` collection
    // entries (if any). Each `$event: { name: { payload: T } }` entry contributes
    // a strongly-typed dispatcher: `dayjump: (payload: { day: Date }) => void`.
    // Falls back to the permissive `unknown` shape when no $event collection
    // is declared so existing fixtures continue to type-check.
    let macros = crate::parser::state_macros::parse_state_macros(script).unwrap_or_default();
    let event_entries: Vec<(&str, Option<&str>)> = macros
        .iter()
        .flat_map(|m| {
            if let crate::types::StateMacro::Collection {
                kind: crate::types::CollectionKind::Event,
                entries,
            } = m
            {
                entries
                    .iter()
                    .map(|e| {
                        let payload = e
                            .meta
                            .iter()
                            .find(|(k, _)| k == "payload")
                            .map(|(_, v)| v.trim());
                        (e.name.as_str(), payload)
                    })
                    .collect::<Vec<_>>()
            } else {
                Vec::new()
            }
        })
        .collect();
    let (emit_decl, event_decl) = if event_entries.is_empty() {
        (
            "declare const $emit: { [name: string]: (payload?: unknown) => void };".to_string(),
            "declare const $event: { [name: string]: { payload: unknown } };".to_string(),
        )
    } else {
        let emit_lines: Vec<String> = event_entries
            .iter()
            .map(|(n, p)| {
                let p_ts = p.unwrap_or("unknown");
                format!("  {}: (payload: {}) => void;", n, p_ts)
            })
            .collect();
        let event_lines: Vec<String> = event_entries
            .iter()
            .map(|(n, p)| {
                let p_ts = p.unwrap_or("unknown");
                format!("  {}: {{ payload: {} }};", n, p_ts)
            })
            .collect();
        (
            format!("declare const $emit: {{\n{}\n}};", emit_lines.join("\n")),
            format!("declare const $event: {{\n{}\n}};", event_lines.join("\n")),
        )
    };
    // COMPACT one-line preamble. All framework-global decls + the derived
    // `$emit`/`$event` decls live on a SINGLE physical line, and the function
    // opener on the next. That two-line prefix is what makes the line-preserving
    // layout below work: every lifted template expression at or after source
    // line 3 can be placed on its exact `.aihu` line, so `tsc` diagnostics cite
    // the real source line instead of a bunched-up projection region.
    //
    // A framework global is declared only when the script does NOT already bind
    // that name. Now that the @state body is inlined verbatim, a component that
    // imports `signal` from '@aihu/signals' brings its own — and an ambient
    // re-declaration beside the import is a hard TS2440 conflict.
    const FRAMEWORK_GLOBALS: &[(&str, &str)] = &[
        ("signal", "declare const signal: <T>(initial: T) => readonly [() => T, (v: T) => void];"),
        ("computed", "declare const computed: <T>(fn: () => T) => () => T;"),
        ("onMount", "declare const onMount: (fn: () => void | (() => void)) => void;"),
        ("onCleanup", "declare const onCleanup: (fn: () => void) => void;"),
        ("onAdopt", "declare const onAdopt: (fn: () => void) => void;"),
        (
            "onAttributeChange",
            "declare const onAttributeChange: (fn: (name: string, oldVal: string | null, newVal: string | null) => void) => void;",
        ),
    ];
    let script_bound = script_bound_names(script);
    let globals: String = FRAMEWORK_GLOBALS
        .iter()
        .filter(|(name, _)| !script_bound.contains(*name))
        .map(|(_, decl)| *decl)
        .collect::<Vec<_>>()
        .join(" ");
    // GX Phase 4 (#466, 70-governed-data-access §4.5) — the generated
    // withheld-type contract for a `data:`-declared route. One authored type
    // (the `$prop route` declared `data` member) derives the discriminated
    // union the template sees: `route.data : __GxEntitled<T> | __GxWithheld<T, P>`,
    // discriminated on `$gx.entitled`, with `__GxWithheld` carrying NO key of
    // `T` beyond the declared `preview:` subset. `__gxEntitled` is the
    // narrowing predicate the lifted template expressions are rewritten onto
    // (TS does not narrow through the nested `$gx.entitled` discriminant
    // itself — a checked fact, not a guess). G7g: unguarded `route.data` field
    // access fails `tsc`; guarded access passes. `None` for every ungoverned
    // route — their sidecars are byte-identical to before Phase 4.
    let governed_data = unit.source.route.as_ref().and_then(|r| r.data.as_ref());
    let gx_type_decls = match governed_data {
        Some(_) => {
            "type __GxEntitled<T> = T & { readonly $gx: { readonly entitled: true } }; \
             type __GxWithheld<T, P extends PropertyKey = never> = { readonly $gx: { readonly \
             entitled: false; readonly reason: 'auth' | 'scope' | 'entitlement' | 'unavailable' \
             }; readonly preview?: { readonly [K in P & keyof T]?: T[K] } }; \
             type __GxData<T, P extends PropertyKey = never> = __GxEntitled<T> | __GxWithheld<T, P>; \
             type __GxRoute<R, P extends PropertyKey = never> = Omit<R, 'data'> & { readonly \
             data: __GxData<R extends { data: infer D } ? D : unknown, P> }; \
             declare function __gxEntitled<T, P extends PropertyKey>(d: __GxData<T, P>): d is __GxEntitled<T>; "
        }
        None => "",
    };
    let preamble_line = format!(
        "{} declare function __handler(h: (...args: any[]) => any): void; {} {} {}{} \
         // {}.aihu type-check sidecar (generated, line-preserving)",
        globals,
        to_single_line(&emit_decl),
        to_single_line(&event_decl),
        gx_type_decls,
        macro_binding_decls(script, governed_data),
        tag_name
    );

    // Declare each REFERENCED in-scope name as an `any` PARAMETER of
    // __aihu_template (precise typing is a watched B3+ item). Parameters, not
    // module-scope `declare const`, because a name may shadow a DOM global
    // (`open`, `close`, `name`, `status`, `location`, …): an ambient
    // `declare const open` collides with lib.dom's `open` (`TS2451`), whereas a
    // parameter cleanly shadows it. Only names actually referenced by a template
    // expression are emitted, so there are no unused params. The in-scope set
    // spans @state binding names, signal setters, @state imports, and
    // `$each`/`{#each}` loop aliases (see collect_sidecar_scope_names).
    let scope_names = collect_sidecar_scope_names(script, nodes);
    // W4 (advanced-js-template-expressions) — the referenced-ident harvest
    // reads the oxc AST (`expr::referenced_idents`): every identifier READ a
    // template expression makes, post-scope-model — reads inside
    // template-literal `${…}` holes and after `...` spread now count (the
    // token scan was blind to both, so valid components false-TS2304'd),
    // while expression-internal shadows (arrow params, block `const`s),
    // member properties, object keys, and TS type names never do. Always-on,
    // not `--expr-parser`-gated: harvesting is type-check-side only (it
    // changes which `any` params the sidecar declares, never the emitted
    // JS). Captures that don't parse as a TS expression (possible under
    // `--expr-parser legacy`) fall back to the token scan per-expression, so
    // the sidecar never loses the coverage it had.
    let mut referenced_names: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    for e in &exprs {
        match crate::expr::referenced_idents(&e.expr) {
            Some(reads) => referenced_names.extend(reads),
            None => {
                for name in &scope_names {
                    if expr_references_ident(&e.expr, name) {
                        referenced_names.insert(name.clone());
                    }
                }
            }
        }
    }
    let referenced: Vec<String> = scope_names
        .into_iter()
        .filter(|name| referenced_names.contains(name))
        .collect();
    // The @state body is INLINED verbatim below (at its real lines), so every
    // name it binds — bindings, setters, imports — carries its true type. Only
    // the loop aliases remain `any`: `{#each xs as m}` binds `m` in the TEMPLATE,
    // so no declaration for it exists in the script to borrow a type from.
    // (Deriving the element type from the iterable is the next step; until then
    // an honest `any` beats a wrong type.)
    //
    // Everything else used to be an `any` param too, which is why a `@state` type
    // error could never be caught: the script was never handed to tsc at all.
    let loop_aliases: std::collections::BTreeSet<String> = {
        let mut a = std::collections::BTreeSet::new();
        collect_loop_aliases(nodes, &mut a);
        a
    };
    let params = referenced
        .iter()
        .filter(|n| loop_aliases.contains(n.as_str()))
        .map(|n| format!("{}: any", n))
        .collect::<Vec<_>>()
        .join(", ");

    // Line-preserving body. `lines[i]` is sidecar line i+1: line 1 = preamble,
    // then the @state body verbatim at its own source lines, then the template
    // function whose lifted expressions each sit on their real `.aihu` line
    // (recovered by a forward-cursor search of the @template text; exprs are
    // collected in source order, so the cursor disambiguates repeats).
    // Expressions are collapsed to a single physical line, so a multi-line source
    // expression is reported at its START line, and several expressions sharing a
    // source line share a sidecar line.
    //
    // @state precedes @template in every ordinary SFC, so the script's lines and
    // the template's lines never collide and both keep their true numbers. When a
    // file inverts that order the script still lands on its real lines and the
    // template function stacks after it — diagnostics inside @state stay exact,
    // and the template's may shift. `script_opener_line` is the last line we may
    // not write into.
    let template_text = unit.source.template.unwrap_or("");
    let tmpl_first_line = unit.source.template_line; // 1-based; 0 if no @template
    let mut lines: Vec<String> = vec![preamble_line];

    // The @state body, on its real lines, at module scope — so the template
    // function below closes over every binding with its TRUE type.
    //
    // Plain JS/TS lines (imports, `const`s, functions — the bulk of a @state
    // block) go through verbatim and are fully checked, each on its own source
    // line. Macro lines are blanked: `$prop: { … }` and friends are aihu syntax,
    // not TypeScript (`type: { params: { ref: string } }` uses `string` in value
    // position), so feeding them to tsc raises syntax errors on code the author
    // never wrote. What the macros BIND is declared instead, on the preamble line
    // — with the prop's real declared type where `type:` gives one.
    let macro_lines = macro_line_set(script);
    let script_first_line = unit.source.script_line; // 1-based; 0 if no @state
    if script_first_line > 0 && !script.is_empty() {
        for (n, text) in script.lines().enumerate() {
            let idx = script_first_line - 1 + n;
            if idx >= lines.len() {
                lines.resize(idx + 1, String::new());
            }
            // `transform_bare_declaration` is the SAME lowering the runtime emit
            // applies: `@state` accepts a bare typed declaration with no keyword —
            // `intervalId: number | null = null`, `rates: Record<…, number> = {…}` —
            // and that is aihu syntax, not TypeScript. Inlined verbatim it reads as
            // a labelled statement, so tsc reports `'number' only refers to a type,
            // but is being used as a value here` on a line the author wrote
            // correctly, and the name never gets declared (every template reference
            // to it then false-errors as undefined). Lowering it to `let name: T = …`
            // keeps the line — and its length, so the mapping still holds.
            let text = if macro_lines.contains(&n) {
                String::new()
            } else {
                transform_bare_declaration(text)
            };
            // Line 1 is the preamble and must not be overwritten. A @state body
            // cannot start there in practice (the `@state {` opener occupies a
            // line above it), so this only guards the pathological case.
            if idx > 0 {
                lines[idx] = text;
            }
        }
    }

    // Open the template function on the first free line after the script.
    let opener_line = lines.len().max(1) + 1;
    lines.resize(opener_line - 1, String::new());
    lines.push(format!("function __aihu_template({}): void {{", params));
    let mut cursor = 0usize;
    for e in &exprs {
        // Recover the expression's 1-based `.aihu` file line (0 = unknown).
        let file_line = if tmpl_first_line == 0 {
            0
        } else if let Some(off) = template_text.get(cursor..).and_then(|s| s.find(e.expr.as_str())) {
            let abs = cursor + off;
            cursor = abs + e.expr.len();
            tmpl_first_line + newlines_before(template_text, abs)
        } else {
            0 // expr not found verbatim (normalized/rewritten) — stack after body
        };
        // GX Phase 4 (#466) — governed-route rewrite (checked-in-tsc design):
        // TypeScript does not narrow the `Entitled | Withheld` union through
        // the nested `$gx.entitled` discriminant, so on a `data:` route every
        // occurrence of the authored guard `route.data.$gx.entitled` is
        // rewritten to the declared predicate `__gxEntitled(route.data)` —
        // inside ternaries/`&&` chains this narrows in place. `{#if}`-guarded
        // expressions additionally get their enclosing conditions prepended
        // (`void (guard && (expr));`) so a branch body checks under its
        // branch's narrowing, statement-flat layout preserved. Only guards
        // that carry the entitlement discriminant are rendered — other
        // conditions provide no narrowing and would only perturb output. The
        // ORIGINAL `e.expr` (above) is what the line-recovery cursor searches,
        // so line mapping is unaffected by the rewrite. Ungoverned routes:
        // both transforms are identity.
        const GX_GUARD: &str = "route.data.$gx.entitled";
        const GX_PRED: &str = "__gxEntitled(route.data)";
        let expr_text = if governed_data.is_some() {
            e.expr.replace(GX_GUARD, GX_PRED)
        } else {
            e.expr.clone()
        };
        let guard_prefix: String = if governed_data.is_some() {
            e.guards
                .iter()
                .filter(|g| g.contains(GX_GUARD))
                .map(|g| format!("{} && ", to_single_line(&g.replace(GX_GUARD, GX_PRED))))
                .collect()
        } else {
            String::new()
        };
        let stmt = if e.is_handler {
            // Handlers are functions — pass in CALL position so inline arrow
            // params get a contextual `any` (a bare `void ((e) => …)` would leave
            // `e` implicit-any → TS7006). A non-function handler still errors here.
            if guard_prefix.is_empty() {
                format!("__handler({});", to_single_line(&expr_text))
            } else {
                format!("void ({}__handler({}));", guard_prefix, to_single_line(&expr_text))
            }
        } else {
            // `void (...)` so the result type isn't checked beyond validity; tsc
            // still flags undefined identifiers and most type errors.
            if guard_prefix.is_empty() {
                format!("void ({});", to_single_line(&expr_text))
            } else {
                format!("void ({}({}));", guard_prefix, to_single_line(&expr_text))
            }
        };
        // Target line: the real source line when it sits below the function opener
        // (and so cannot collide with the preamble or the inlined script);
        // otherwise stack after the current body.
        let target = if file_line > opener_line {
            file_line
        } else {
            lines.len().max(opener_line) + 1
        };
        let idx = target - 1;
        if idx >= lines.len() {
            lines.resize(idx + 1, String::new()); // pad blank body lines
            lines[idx] = stmt;
        } else if lines[idx].is_empty() {
            lines[idx] = stmt;
        } else {
            lines[idx].push(' '); // another expr shares this source line
            lines[idx].push_str(&stmt);
        }
    }
    lines.push("}".to_string());
    Some(format!("{}\n", lines.join("\n")))
}

/// Top-level names the `@state` body itself binds — imports and `const`/`let`
/// declarations. The sidecar's preamble skips any framework global already bound
/// here: with the script inlined verbatim, `import { signal } from '@aihu/signals'`
/// beside an ambient `declare const signal` is a TS2440 conflict.
fn script_bound_names(script: &str) -> std::collections::BTreeSet<String> {
    let mut names = std::collections::BTreeSet::new();
    collect_imported_names(script, &mut names);
    names.extend(crate::codegen::signals::collect_state_decls(script).all);
    names
}

/// The 0-based line indices (within the `@state` body) occupied by a `$macro`
/// and its body. The sidecar blanks these so tsc never parses aihu macro syntax
/// as TypeScript, while the surrounding real code keeps its line numbers.
///
/// Mirrors the macro-region skip in `codegen::signals::collect_state_decls`.
fn macro_line_set(script: &str) -> std::collections::BTreeSet<usize> {
    let mut out = std::collections::BTreeSet::new();
    let bytes = script.as_bytes();
    let mut i = 0usize;
    while i < script.len() {
        let nl = script[i..].find('\n').map(|r| i + r).unwrap_or(script.len());
        let line = script[i..nl].trim();
        if line.starts_with('$') {
            // Find the macro's end: the close of its `{ … }` or `( … )` payload,
            // else just this line.
            let mut end = nl;
            if let Some(colon_rel) = script[i..].find(|c| c == '{' || c == '(') {
                let p = i + colon_rel;
                // Only treat it as a payload when it opens on the macro's own line
                // or the next (a `$macro` never opens its body further away).
                if script[i..p].bytes().filter(|&b| b == b'\n').count() <= 1 {
                    let close = if bytes[p] == b'{' {
                        crate::parser::state_macros::find_brace_close_js(script, p + 1)
                    } else {
                        crate::parser::state_macros::find_paren_close(script, p + 1)
                    };
                    if let Some(c) = close {
                        end = c;
                    }
                }
            }
            let first = newlines_before(script, i);
            let last = newlines_before(script, end.min(script.len()));
            for l in first..=last {
                out.insert(l);
            }
            i = script[end.min(script.len())..]
                .find('\n')
                .map(|r| end + r + 1)
                .unwrap_or(script.len());
            continue;
        }
        i = nl + 1;
    }
    out
}

/// Declarations for every binding a `$macro` introduces, as a single physical
/// line appended to the preamble (the macro's own lines are blanked — see
/// `macro_line_set`).
///
/// `$prop` entries carry a declared `type:`, so they get their REAL type — props
/// are what templates touch most, and a wrong prop type is exactly the bug the
/// sidecar exists to catch. They are typed as ACCESSORS (`() => T`), not values:
/// at runtime `ctx.props.<name>` is a `Signal`, read via the getter call
/// (`props.title()`), so a template reads a prop as `language()`. Typing the
/// binding as a plain `T` made every such call a `TS2349` "not callable".
///
/// The other collections bind functions whose types would have to be inferred
/// from macro bodies that aren't yet lowered to TS, so they are honestly `any`
/// for now rather than confidently wrong.
///
/// Module-scope `let`/`const` (not `declare const`): a binding may shadow a DOM
/// global (`name`, `open`, `status`, `close`), and an ambient re-declaration of
/// one collides with lib.dom (TS2451) where a module-scope binding shadows it.
///
/// GX Phase 4 (#466): on a governed (`data:`-declared) route the `route` prop
/// is typed through the generated `__GxRoute` wrapper (§4.5) — its declared
/// `data` member becomes the `__GxEntitled<T> | __GxWithheld<T, P>` union, so
/// unguarded `route.data` field access is a type error (G7g). It is declared
/// as a VALUE (not the accessor form): the lifted template expressions read
/// the RAW authored `route.data.…` member chains (the `route()` call rewrite
/// is a JS-emit concern), so the value typing is what makes them checkable.
fn macro_binding_decls(script: &str, governed: Option<&crate::types::DataDecl>) -> String {
    let macros = crate::parser::state_macros::parse_state_macros(script).unwrap_or_default();
    let mut decls: Vec<String> = Vec::new();
    let mut declared_route = false;
    for m in &macros {
        let crate::types::StateMacro::Collection { kind, entries } = m else {
            continue;
        };
        for e in entries {
            let name = &e.name;
            match kind {
                crate::types::CollectionKind::Prop => {
                    // `type:` is a TS type, but may be written as a quoted string
                    // (`type: "number"`) or bare (`type: { params: { ref: string } }`).
                    let ty = e
                        .meta
                        .iter()
                        .find(|(k, _)| k == "type")
                        .map(|(_, v)| unquote_ts_type(v.trim()))
                        .unwrap_or_else(|| "any".to_string());
                    if let (Some(data), "route") = (governed, name.as_str()) {
                        declared_route = true;
                        decls.push(format!(
                            "let route: __GxRoute<{}, {}> = null as any;",
                            ty,
                            data.preview_keys_ts()
                        ));
                        continue;
                    }
                    // Accessor, not value: a prop is a Signal getter (`props.name()`).
                    decls.push(format!("let {}: () => {} = null as any;", name, ty));
                }
                // Event dispatchers are already typed by the $emit/$event decls.
                crate::types::CollectionKind::Event => {}
                // B5/O2 — `$context` entries are named "provide"/"consume"; the
                // template-referenceable bindings are the context KEYS in each
                // entry's meta (`theme`, `locale`, …). The runtime lowering is
                // `const key = inject(contextKey('key'))` / `provide(...)`; the
                // macro line itself is blanked in the sidecar, so declare each
                // key here (as `any` — the injected value's type is a watched
                // B3+ refinement) instead of the entry names.
                crate::types::CollectionKind::Context => {
                    for (ctx_key, _) in &e.meta {
                        let decl = format!("let {}: any = null as any;", ctx_key);
                        if !decls.contains(&decl) {
                            decls.push(decl);
                        }
                    }
                }
                _ => decls.push(format!("let {}: any = null as any;", name)),
            }
        }
    }
    // A governed route with no `$prop route` declaration still receives the
    // generated loader's payload as `route.data`; declare the wrapper over the
    // minimal route shape so the template contract holds (unguarded access
    // still errors, `$gx` and declared previews are reachable).
    if let Some(data) = governed {
        if !declared_route {
            decls.push(format!(
                "let route: __GxRoute<{{ params: Record<string, string> }}, {}> = null as any;",
                data.preview_keys_ts()
            ));
        }
    }
    decls.join(" ")
}

/// A `type:` meta value is a TS type. Accept both the quoted (`"number"`) and
/// bare (`{ params: { ref: string } }`) spellings authors use.
fn unquote_ts_type(v: &str) -> String {
    let t = v.trim();
    let unq = t
        .strip_prefix('"')
        .and_then(|s| s.strip_suffix('"'))
        .or_else(|| t.strip_prefix('\'').and_then(|s| s.strip_suffix('\'')));
    to_single_line(unq.unwrap_or(t)).trim().to_string()
}

/// Replace newlines with spaces so a value fits on one physical line — used to
/// keep each lifted template expression (and the compact preamble decls) on a
/// single sidecar line for the line-preserving layout. String-literal interior
/// whitespace is otherwise untouched.
fn to_single_line(s: &str) -> String {
    s.replace(['\r', '\n'], " ")
}

/// Number of `\n` in `text[..offset]` (line breaks before `offset`).
fn newlines_before(text: &str, offset: usize) -> usize {
    text[..offset].bytes().filter(|&b| b == b'\n').count()
}

/// Every name a `@template` expression could reference and that must therefore
/// be in scope in the type-check sidecar — MINUS the framework globals the
/// preamble already declares (re-declaring them would duplicate-identifier).
/// Sources: @state binding names, signal setters, `@state` imports, and
/// `$each`/`{#each}` loop aliases. Deduplicated and sorted for deterministic
/// output.
fn collect_sidecar_scope_names(script: &str, nodes: &[TemplateNode]) -> Vec<String> {
    const PREAMBLE_GLOBALS: &[&str] = &[
        "signal",
        "computed",
        "onMount",
        "onCleanup",
        "onAdopt",
        "onAttributeChange",
    ];
    let mut names: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();

    // 1. @state binding names (getters, computeds, consts, $prop/$computed/… ).
    for n in crate::codegen::signals::collect_state_decls(script).all {
        names.insert(n);
    }
    // 2. Signal setters — `resolve_signals` maps getter -> setter; the values
    //    are the setter names (empty for computeds, skipped).
    for setter in crate::codegen::signals::resolve_signals(script).0.into_values() {
        if !setter.is_empty() {
            names.insert(setter);
        }
    }
    // 3. Names imported into @state and usable directly in the template.
    collect_imported_names(script, &mut names);
    // 4. Loop aliases from $each attrs and {#each} blocks.
    collect_loop_aliases(nodes, &mut names);

    names
        .into_iter()
        .filter(|n| !PREAMBLE_GLOBALS.contains(&n.as_str()))
        .collect()
}

/// True for a non-empty `[A-Za-z_$][A-Za-z0-9_$]*` token.
fn is_js_ident(s: &str) -> bool {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' || c == '$' => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
}

/// Collect the bound names from `import` statements in the @state script:
/// `import { a, b as c } from '…'` → a, c; `import D from '…'` → D;
/// `import * as N from '…'` → N. Type-only imports contribute names too —
/// harmless as `any` params. Handles MULTI-LINE imports (named lists split
/// across lines), which the previous line-at-a-time scan missed — that miss is
/// why imported handlers like `closeNav` still TS2304'd.
fn collect_imported_names(script: &str, out: &mut std::collections::BTreeSet<String>) {
    // Reassemble each `import …` statement (it may span several lines) up to and
    // including its `from '…'` tail, then parse that single logical statement.
    let mut buf = String::new();
    let mut in_import = false;
    for line in script.lines() {
        let t = line.trim();
        if !in_import {
            if t.starts_with("import ") {
                in_import = true;
                buf.clear();
                buf.push_str(t);
            }
        } else {
            buf.push(' ');
            buf.push_str(t);
        }
        // A statement is complete once it carries its `from` clause (named/
        // default/namespace imports). Side-effect imports (`import './x'`,
        // no `from`) bind nothing — terminate them on the trailing quote.
        let done = in_import
            && (buf.contains(" from ")
                || buf.trim_end().ends_with('\'')
                || buf.trim_end().ends_with('"')
                || buf.trim_end().ends_with(';'));
        if done {
            parse_import_statement(&buf, out);
            in_import = false;
            buf.clear();
        }
    }
}

/// Parse one assembled `import …` statement for its bound names.
fn parse_import_statement(stmt: &str, out: &mut std::collections::BTreeSet<String>) {
    let Some(rest) = stmt.trim().strip_prefix("import ") else {
        return;
    };
    if let (Some(lb), Some(rb)) = (rest.find('{'), rest.find('}')) {
        if lb < rb {
            for part in rest[lb + 1..rb].split(',') {
                // `name` or `name as alias` (the alias is the local binding).
                let bound = part.trim().rsplit(" as ").next().unwrap_or("").trim();
                if is_js_ident(bound) {
                    out.insert(bound.to_string());
                }
            }
            // Default import preceding the brace: `import D, { … } from …`.
            let head = rest[..lb].trim().trim_end_matches(',').trim();
            if is_js_ident(head) {
                out.insert(head.to_string());
            }
            return;
        }
    }
    if let Some(star) = rest.strip_prefix("* as ") {
        if let Some(n) = star.split_whitespace().next() {
            if is_js_ident(n) {
                out.insert(n.to_string());
            }
        }
        return;
    }
    // Default import: `import D from '…'`.
    if let Some(n) = rest.split_whitespace().next() {
        if is_js_ident(n) {
            out.insert(n.to_string());
        }
    }
}

/// Split `s` on TOP-LEVEL commas, respecting `[]`/`{}`/`()` nesting so a
/// destructuring alias like `[a, b]` isn't torn apart. Minimal by design — a
/// loop-clause alias list carries no string/template literals.
fn split_top_level_commas_pat(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut depth = 0i32;
    let mut start = 0usize;
    for (i, c) in s.char_indices() {
        match c {
            '[' | '{' | '(' => depth += 1,
            ']' | '}' | ')' => depth = (depth - 1).max(0),
            ',' if depth == 0 => {
                out.push(s[start..i].to_string());
                start = i + 1;
            }
            _ => {}
        }
    }
    out.push(s[start..].to_string());
    out
}

/// Extract every bound identifier from a single loop-alias part: a bare ident
/// (`item`), array destructuring (`[a, b]`, `[a, ...r]`, holes skipped), or
/// object destructuring (`{a, b}`, `{a: b}` → local `b`, `{a, ...r}`). Nested
/// patterns recurse; default initializers (`a = expr`) are stripped. Non-ident
/// tokens are skipped. Without this, `$each="… as [name, desc]"` bound nothing
/// (the whole `[name, desc]` failed `is_js_ident`) → template refs TS2304'd.
fn extract_pattern_idents(part: &str, out: &mut std::collections::BTreeSet<String>) {
    let p = part.trim();
    let (inner, is_object) = if p.starts_with('[') && p.ends_with(']') {
        (&p[1..p.len() - 1], false)
    } else if p.starts_with('{') && p.ends_with('}') {
        (&p[1..p.len() - 1], true)
    } else {
        if is_js_ident(p) {
            out.insert(p.to_string());
        }
        return;
    };
    for sub in split_top_level_commas_pat(inner) {
        let s = sub.trim().trim_start_matches("...").trim();
        if s.is_empty() {
            continue; // array hole or trailing comma
        }
        // Object rename/shorthand: `key` or `key: local` — the LOCAL binding is
        // after the top-level colon.
        let token = if is_object {
            s.split_once(':').map(|(_, v)| v.trim()).unwrap_or(s)
        } else {
            s
        };
        // Strip a default-value initializer (`a = expr`).
        let token = token.split('=').next().map(str::trim).unwrap_or(token);
        if token.starts_with('[') || token.starts_with('{') {
            extract_pattern_idents(token, out);
        } else if is_js_ident(token) {
            out.insert(token.to_string());
        }
    }
}

/// The alias-side source text of an each head, rejoined from the parser's
/// (possibly torn) `item_alias`/`idx_alias` fields: `parse_each_header` splits
/// the alias list on the FIRST comma (template.rs — W5 turns it into a parsed
/// BindingPattern), so `as [k, v], i` arrives as `[k` + `v], i`. Rejoining
/// with a comma reconstructs the exact alias list for a real parse.
fn rejoin_alias_list(item_alias: &str, idx_alias: Option<&str>) -> String {
    match idx_alias {
        Some(idx) => format!("{}, {}", item_alias, idx),
        None => item_alias.to_string(),
    }
}

/// Bind the identifiers of one each-head alias list into `out` — via a real
/// parse of the (rejoined) alias list (W4, `expr::alias_bound_idents`), so
/// destructuring patterns torn by the header split bind every contained
/// identifier instead of nothing; the token extractor stays as the fallback
/// for alias text that doesn't parse as a parameter list.
fn push_alias_bindings(
    item_alias: &str,
    idx_alias: Option<&str>,
    out: &mut std::collections::BTreeSet<String>,
) {
    let alias_list = rejoin_alias_list(item_alias, idx_alias);
    match crate::expr::alias_bound_idents(&alias_list) {
        Some(bound) => out.extend(bound),
        None => {
            extract_pattern_idents(item_alias, out);
            if let Some(idx) = idx_alias {
                if is_js_ident(idx) {
                    out.insert(idx.to_string());
                }
            }
        }
    }
}

/// Walk the template AST collecting `$each`/`{#each}` loop aliases (`item` and
/// optional `index` from `<list> as item[, index]`), which are in scope inside
/// the loop body the sidecar flattens into `__aihu_template`. Destructuring
/// aliases (`as [k, v]`, `as {a, b}`) bind each contained identifier.
fn collect_loop_aliases(nodes: &[TemplateNode], out: &mut std::collections::BTreeSet<String>) {
    fn push_clause(clause: &str, out: &mut std::collections::BTreeSet<String>) {
        // Grammar v2: the head is `<binder> [, <index>] of <list-expr>` —
        // split with the parser's scanner-aware `of`-head split (an ` of `
        // inside a string/parens in the LIST never mis-splits), then bind
        // the binder side from a real parse.
        if let Ok(head) = crate::parser::directives::parse_each_of_head(clause) {
            push_alias_bindings(&head.item, head.idx.as_deref(), out);
        }
    }
    for node in nodes {
        match node {
            TemplateNode::Element { attrs, children, .. }
            | TemplateNode::MacroElement { attrs, children, .. } => {
                for a in attrs {
                    if let Attr::Macro { name, value } = a {
                        if name == "each" {
                            push_clause(&macro_value_expr(value), out);
                        }
                    }
                }
                collect_loop_aliases(children, out);
            }
            TemplateNode::EachBlock {
                item_alias,
                idx_alias,
                body,
                empty_body,
                ..
            } => {
                // item_alias may be a destructuring pattern (`{#each xs as
                // [k, v]}`) — and until W5 the header split tears it across
                // item/idx (`[k` + `v], i`), so the token extractor bound
                // NOTHING and every body reference TS2304'd. W4 rejoins the
                // alias list and really parses it.
                push_alias_bindings(item_alias, idx_alias.as_deref(), out);
                collect_loop_aliases(body, out);
                if let Some(eb) = empty_body {
                    collect_loop_aliases(eb, out);
                }
            }
            TemplateNode::IfBlock { branches } => {
                for (_, body) in branches {
                    collect_loop_aliases(body, out);
                }
            }
            _ => {}
        }
    }
}

/// True iff `name` appears as a standalone identifier token in `expr` (not a
/// member access `obj.name`, not inside a string literal). Mirrors the scan in
/// `expr_references_state`, specialized to one name.
fn expr_references_ident(expr: &str, name: &str) -> bool {
    let bytes = expr.as_bytes();
    let mut i = 0usize;
    let mut prev_significant: u8 = 0;
    while i < bytes.len() {
        let c = bytes[i];
        if c == b'\'' || c == b'"' || c == b'`' {
            let quote = c;
            i += 1;
            while i < bytes.len() {
                if bytes[i] == b'\\' && i + 1 < bytes.len() {
                    i += 2;
                    continue;
                }
                if bytes[i] == quote {
                    i += 1;
                    break;
                }
                i += 1;
            }
            prev_significant = quote;
            continue;
        }
        if c.is_ascii_alphabetic() || c == b'_' || c == b'$' {
            let start = i;
            while i < bytes.len()
                && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_' || bytes[i] == b'$')
            {
                i += 1;
            }
            // Member-access property (`.name`) is not a reference to the binding.
            if prev_significant != b'.' && &expr[start..i] == name {
                return true;
            }
            prev_significant = bytes[i - 1];
            continue;
        }
        if !c.is_ascii_whitespace() {
            prev_significant = c;
        }
        i += 1;
    }
    false
}

/// A template expression collected for the type-check sidecar, tagged by
/// whether it's an event-handler value (a function — emitted in call position
/// so its inline arrow params get a contextual type) vs a plain value.
///
/// `guards` (GX Phase 4, #466) is the stack of `{#if}` conditions lexically
/// enclosing the expression — branch conditions verbatim, prior same-block
/// branch conditions negated (`!(cond)`) for `{:else}`/`{:else if}` bodies.
/// Collected for EVERY template, rendered ONLY for governed routes (the
/// `data:`-declared `route.data` narrowing, `emit_sidecar_ts`); ungoverned
/// sidecar output is byte-identical to before the field existed.
struct SidecarExpr {
    expr: String,
    is_handler: bool,
    guards: Vec<String>,
}

/// Walk the template AST and collect every JS expression appearing in a
/// curly-binding, $on handler, $bind expr, {#if cond}, {#each list as item},
/// {@html expr}, or text interpolation.
fn collect_template_exprs(nodes: &[TemplateNode], out: &mut Vec<SidecarExpr>) {
    collect_template_exprs_guarded(nodes, out, &[])
}

fn collect_template_exprs_guarded(
    nodes: &[TemplateNode],
    out: &mut Vec<SidecarExpr>,
    guards: &[String],
) {
    // Shared attribute handling for Element + MacroElement.
    fn push_attrs(attrs: &[Attr], out: &mut Vec<SidecarExpr>, guards: &[String]) {
        for a in attrs {
            match a {
                // `$each="list as item"` — collect the LIST expression (mirrors
                // the {#each} block arm's `list_expr` push) so its reads are
                // type-checked and an OUTER loop alias used only inside an inner
                // each's iterable (`s` in `s.books as b`) still counts as
                // referenced.
                Attr::Macro { name, value } if name == "each" => {
                    let clause = macro_value_expr(value);
                    // Grammar v2: split the `of`-head with the scanner-aware
                    // splitter so an ` of ` inside a string/parens in the LIST
                    // doesn't tear it; fall back to the whole clause when the
                    // head is malformed (the parser rejects those anyway).
                    let list = match crate::parser::directives::parse_each_of_head(&clause) {
                        Ok(head) => head.list,
                        Err(_) => clause.trim().to_string(),
                    };
                    out.push(SidecarExpr { expr: list, is_handler: false, guards: guards.to_vec() });
                }
                // `$on.*={handler}` normalizes to an `on:<event>` attr — the
                // value is a function, emitted in call position so inline arrow
                // params (`(e) => …`) get a contextual `any` type (else TS7006).
                Attr::Macro { name, value } if name.starts_with("on:") => {
                    out.push(SidecarExpr {
                        expr: macro_value_expr(value),
                        is_handler: true,
                        guards: guards.to_vec(),
                    });
                }
                Attr::Binding { expr, .. } => {
                    out.push(SidecarExpr {
                        expr: expr.clone(),
                        is_handler: false,
                        guards: guards.to_vec(),
                    });
                }
                Attr::Macro { value: MacroValue::Curly(s), .. } => {
                    out.push(SidecarExpr {
                        expr: s.clone(),
                        is_handler: false,
                        guards: guards.to_vec(),
                    });
                }
                _ => {}
            }
        }
    }
    for node in nodes {
        match node {
            TemplateNode::Element { attrs, children, .. }
            | TemplateNode::MacroElement { attrs, children, .. } => {
                push_attrs(attrs, out, guards);
                collect_template_exprs_guarded(children, out, guards);
            }
            TemplateNode::Interpolation(s) => out.push(SidecarExpr {
                expr: s.clone(),
                is_handler: false,
                guards: guards.to_vec(),
            }),
            TemplateNode::IfBlock { branches } => {
                // GX Phase 4 guard threading: branch N's body is guarded by its
                // own condition plus the negation of every PRIOR branch's
                // condition in the same block ({:else if} / {:else} semantics).
                let mut prior: Vec<String> = Vec::new();
                for (cond, body) in branches {
                    let mut branch_guards: Vec<String> = guards.to_vec();
                    branch_guards.extend(prior.iter().map(|c| format!("!({})", c)));
                    if !cond.is_empty() {
                        // The condition itself evaluates under the OUTER guards
                        // only (it runs to decide the branch).
                        out.push(SidecarExpr {
                            expr: cond.clone(),
                            is_handler: false,
                            guards: guards.to_vec(),
                        });
                        branch_guards.push(cond.clone());
                        prior.push(cond.clone());
                    }
                    collect_template_exprs_guarded(body, out, &branch_guards);
                }
            }
            TemplateNode::EachBlock {
                list_expr,
                key_expr,
                body,
                empty_body,
                ..
            } => {
                out.push(SidecarExpr {
                    expr: list_expr.clone(),
                    is_handler: false,
                    guards: guards.to_vec(),
                });
                if let Some(k) = key_expr {
                    out.push(SidecarExpr {
                        expr: k.clone(),
                        is_handler: false,
                        guards: guards.to_vec(),
                    });
                }
                collect_template_exprs_guarded(body, out, guards);
                if let Some(eb) = empty_body {
                    collect_template_exprs_guarded(eb, out, guards);
                }
            }
            TemplateNode::HtmlBlock { expr } => out.push(SidecarExpr {
                expr: expr.clone(),
                is_handler: false,
                guards: guards.to_vec(),
            }),
            TemplateNode::Text(_) => {}
        }
    }
}

// ─── v0.6.2 — Route JSON sidecar ─────────────────────────────────────────────

fn emit_route_json(
    route: &RouteBlock,
    component_tags: &std::collections::BTreeSet<String>,
    extract: &crate::extract::ResolvedExtract,
) -> String {
    let pattern = route.path.as_deref().unwrap_or("");
    let name = route.name.as_deref().unwrap_or("");
    let ssr = route.ssr.unwrap_or(false);
    let layout = route.layout.as_deref().unwrap_or("");

    let middleware_json = if route.middleware.is_empty() {
        "[]".to_string()
    } else {
        let items: Vec<String> = route.middleware.iter().map(|m| format!("\"{}\"", m)).collect();
        format!("[{}]", items.join(", "))
    };

    // B1 (SEO arc) — optional `head` member. Absent entirely when no `head:` key,
    // keeping the sidecar backward-compatible with existing consumers.
    let head_member = match route.head.as_ref() {
        Some(head) => format!(",\n  \"head\": {}", emit_head_json(head)),
        None => String::new(),
    };

    // `components` — the custom-element tags this page uses. Absent (not `[]`)
    // when the page references no components, so existing consumers and the
    // common no-component page stay byte-identical.
    let components_member = if component_tags.is_empty() {
        String::new()
    } else {
        let items: Vec<String> = component_tags.iter().map(|t| json_string(t)).collect();
        format!(",\n  \"components\": [{}]", items.join(", "))
    };

    // GX Phase 1 (#437-GX) — artifact 2 of the fan-out (spec §2.4): the
    // resolved policy (default included) rides the `.route.json` sidecar,
    // rendered from the SAME `ResolvedExtract` as the code marker and the
    // agent-meta manifest. Always present, so a consumer never has to encode
    // "absent means default" — the recorded posture is explicit.
    let extract_member = format!(",\n  \"extract\": {}", extract.json_object());

    // GX Phase 4 (#466) — the `data:` governed-resource declaration rides
    // beside `extract` (70-governed-data-access §5: same three-artifact
    // machinery). Absent entirely when the route declares no `data:`, so
    // ungoverned routes stay byte-identical. Consumed by the server runtime's
    // registry boot validation (§2.3) and generated-loader binding (§3), and
    // by the router Vite layer's C486 sibling-loader conflict check (§4.7).
    let data_member = match route.data.as_ref() {
        Some(d) => format!(",\n  \"data\": {}", d.json_object()),
        None => String::new(),
    };

    format!(
        "{{\n  \"pattern\": \"{}\",\n  \"name\": \"{}\",\n  \"middleware\": {},\n  \"ssr\": {},\n  \"layout\": \"{}\"{}{}{}{}\n}}",
        pattern, name, middleware_json, ssr, layout, extract_member, data_member, head_member,
        components_member
    )
}

/// Collect the custom-element tags a template references — the page's component
/// dependency list, for route-scoped registration.
///
/// A tag is a component reference when it is not a plain HTML/SVG element:
/// either it contains a hyphen (`my-widget`, a custom-element name) or it starts
/// with an uppercase letter (`Comment`, the PascalCase component form). Plain
/// lowercase tags (`div`, `p`) are the platform's own and never need
/// registration. `<$macro>` boundary elements (slot/suspense/link/...) are
/// compiler intrinsics, not user components, so they are excluded.
fn collect_component_tags(nodes: &[TemplateNode], out: &mut std::collections::BTreeSet<String>) {
    for node in nodes {
        match node {
            TemplateNode::Element { tag, children, .. } => {
                if crate::tags::is_component_tag(tag) {
                    // O1a (tag naming): the manifest carries the NORMALIZED
                    // custom-element name so `route.json` `components` agrees
                    // with reference emission and the define-name.
                    out.insert(crate::tags::kebab_component_tag(tag));
                }
                collect_component_tags(children, out);
            }
            // MacroElement is a compiler intrinsic (`<$slot>`, `<$link>`, …) — not
            // a user component — but its children may still contain components.
            TemplateNode::MacroElement { children, .. } => {
                collect_component_tags(children, out);
            }
            TemplateNode::IfBlock { branches } => {
                for (_, body) in branches {
                    collect_component_tags(body, out);
                }
            }
            TemplateNode::EachBlock { body, empty_body, .. } => {
                collect_component_tags(body, out);
                if let Some(empty) = empty_body {
                    collect_component_tags(empty, out);
                }
            }
            TemplateNode::Text(_)
            | TemplateNode::Interpolation(_)
            | TemplateNode::HtmlBlock { .. } => {}
        }
    }
}

// ─── B1 (SEO arc) — head JSON serialization ──────────────────────────────────

/// Serialize a `RouteHead` to a JSON object. Only present fields are emitted;
/// `og`/`twitter` become nested objects; `jsonld` is spliced VERBATIM (it is a
/// raw JSON literal captured from source). Downstream Builders (B2/B3) align to
/// this exact shape.
fn emit_head_json(head: &crate::types::RouteHead) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(v) = &head.title {
        parts.push(format!("\"title\": {}", json_string(v)));
    }
    if let Some(v) = &head.description {
        parts.push(format!("\"description\": {}", json_string(v)));
    }
    if let Some(v) = &head.canonical {
        parts.push(format!("\"canonical\": {}", json_string(v)));
    }
    if let Some(og) = &head.og {
        let mut og_parts: Vec<String> = Vec::new();
        if let Some(v) = &og.title {
            og_parts.push(format!("\"title\": {}", json_string(v)));
        }
        if let Some(v) = &og.description {
            og_parts.push(format!("\"description\": {}", json_string(v)));
        }
        if let Some(v) = &og.image {
            og_parts.push(format!("\"image\": {}", json_string(v)));
        }
        if let Some(v) = &og.r#type {
            og_parts.push(format!("\"type\": {}", json_string(v)));
        }
        if let Some(v) = &og.url {
            og_parts.push(format!("\"url\": {}", json_string(v)));
        }
        parts.push(format!("\"og\": {{{}}}", og_parts.join(", ")));
    }
    if let Some(tw) = &head.twitter {
        let mut tw_parts: Vec<String> = Vec::new();
        if let Some(v) = &tw.card {
            tw_parts.push(format!("\"card\": {}", json_string(v)));
        }
        if let Some(v) = &tw.title {
            tw_parts.push(format!("\"title\": {}", json_string(v)));
        }
        if let Some(v) = &tw.description {
            tw_parts.push(format!("\"description\": {}", json_string(v)));
        }
        if let Some(v) = &tw.image {
            tw_parts.push(format!("\"image\": {}", json_string(v)));
        }
        if let Some(v) = &tw.site {
            tw_parts.push(format!("\"site\": {}", json_string(v)));
        }
        parts.push(format!("\"twitter\": {{{}}}", tw_parts.join(", ")));
    }
    if let Some(jsonld) = &head.jsonld {
        // Verbatim raw JSON object literal. The SFC author writes valid JSON
        // (quoted keys per spec). We splice it as-is rather than re-serializing.
        parts.push(format!("\"jsonld\": {}", jsonld));
    }
    format!("{{{}}}", parts.join(", "))
}

/// Minimal JSON string escaper for scalar head values (quotes/backslashes/
/// control chars). Sufficient for the title/description/url/etc. value space.
fn json_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

// ─── v0.4.0 — @stream block binding export ───────────────────────────────────

fn emit_stream_binding(tag_name: &str, stream: &crate::types::StreamBlock) -> String {
    let scope_val = match &stream.scope {
        Some(s) => format!("'{}'", s),
        None => "undefined".to_string(),
    };
    let mime_val = stream
        .mime
        .as_deref()
        .unwrap_or("text/plain; charset=utf-8");
    format!(
        "export const __streamBinding = {{\n  tag: '{}',\n  output: '{}',\n  scope: {},\n  mime: '{}',\n}};",
        tag_name, stream.output, scope_val, mime_val
    )
}

// ─── Inline boundary helpers ─────────────────────────────────────────────────

/// Which SFC-internal helper consts are needed for the compiled template.
#[derive(Default)]
struct NeededHelpers {
    if_boundary: bool,
    once_boundary: bool,
    memo_boundary: bool,
    each_boundary: bool,
    slot_boundary: bool,
    suspense_boundary: bool,
    shield_boundary: bool,
    guard_boundary: bool,
    /// v0.3.0 — true when `<$guard scope="...">` (scope form) is used.
    /// Triggers `when()` import (from arbor) and `getScopeSignal` call.
    guard_scope_boundary: bool,
    warp_boundary: bool,
    /// True when $html or $show directives are used (they emit `effect()` calls).
    needs_effect: bool,
    /// True when $html or $show are used on child elements — they need `onMount`
    /// to access `node.el` after the arbor runtime mounts the descriptor.
    needs_on_mount_for_directives: bool,
    /// B3 — true when `class={[...]}` array form appears. Emits `__aihu_cls`.
    needs_class_helper: bool,
    /// B3 / R4 — true when `$bind.value={signal}` (non-checked) is used and a
    /// typed-conversion helper is needed at the write-back site.
    needs_bind_conv_helper: bool,
    // ── arch-5 M1 a11y (RFC-A5-017..021) ─────────────────────────────────────
    /// True when `<$focusTrap>` appears in the template — needs `createFocusTrap` from runtime.
    a11y_focus_trap: bool,
    /// True when `<$skipLink>` or `<$visuallyHidden>` appears — needs sr-only/skip CSS injected.
    a11y_styles: bool,
    /// True when `$announce(...)` is called from any `@state` action body.
    a11y_announce: bool,
    // arch-5 M1 — routing macro elements (RFC-A5-011..014).
    /// `<$router>` macro element used in the template.
    router_element: bool,
    /// `<$link>` macro element used in the template.
    link_element: bool,
    /// `<$outlet>` macro element used in the template.
    outlet_element: bool,
    /// `<$navigate>` macro element used in the template.
    navigate_element: bool,
}

fn collect_needed_helpers(nodes: &[TemplateNode]) -> NeededHelpers {
    let mut h = NeededHelpers::default();
    collect_helpers_recursive(nodes, &mut h);
    h
}

/// Scan an element's attributes for macro directives that require an inlined
/// boundary helper or runtime import, and set the corresponding flags on `h`.
/// Shared by the `Element` and `MacroElement` arms of
/// `collect_helpers_recursive` — both lower the same directives via
/// `emit_macro_effects`, so both must contribute to helper collection (FEL-230).
fn scan_attr_helpers(attrs: &[Attr], h: &mut NeededHelpers) {
    for attr in attrs {
        if let Attr::Macro { name, .. } = attr {
            match name.as_str() {
                "if" => h.if_boundary = true,
                "once" => h.once_boundary = true,
                "memo" => h.memo_boundary = true,
                "each" => h.each_boundary = true,
                // $html and $show emit effect() calls — ensure effect is imported.
                // They also need onMount to access node.el after arbor mounts
                // the branch descriptor.
                "html" | "show" => {
                    h.needs_effect = true;
                    h.needs_on_mount_for_directives = true;
                }
                // B3 — $ref also uses onMount to capture node.el.
                "ref" => {
                    h.needs_on_mount_for_directives = true;
                }
                // $class:NAME also uses onMount+effect in its IIFE.
                n if n.starts_with("class:") => {
                    h.needs_effect = true;
                    h.needs_on_mount_for_directives = true;
                }
                _ => {}
            }
        }
        // B3 — `class={[...]}` array form needs the __aihu_cls helper.
        if let Attr::Binding { name, expr } = attr {
            if name == "class" && expr.trim_start().starts_with('[') {
                h.needs_class_helper = true;
            }
        }
        // B3 / R4 — any `$bind.<non-checked>` needs the conv helper.
        if let Attr::Macro { name, .. } = attr {
            if let Some(prop) = name.strip_prefix("bind:") {
                if prop != "checked" {
                    h.needs_bind_conv_helper = true;
                }
            }
        }
    }
}

fn collect_helpers_recursive(nodes: &[TemplateNode], h: &mut NeededHelpers) {
    for node in nodes {
        match node {
            TemplateNode::MacroElement { name, attrs, children, .. } => {
                match name.as_str() {
                    "slot" => h.slot_boundary = true,
                    "suspense" => h.suspense_boundary = true,
                    "shield" => h.shield_boundary = true,
                    "guard" => {
                        // v0.3.0: detect scope-form vs check-form.
                        let has_scope = attrs.iter().any(|a| matches!(
                            a,
                            Attr::Static { name, .. } if name == "scope"
                        ));
                        if has_scope {
                            h.guard_scope_boundary = true;
                            h.if_boundary = true; // needs `when()` from arbor
                        } else {
                            h.guard_boundary = true;
                        }
                    }
                    "warp" => h.warp_boundary = true,
                    // arch-5 M1 a11y primitives — RFC-A5-017..020.
                    // <$liveRegion> lowers to a plain branch + ARIA attrs and needs no
                    // runtime helper. <$focusTrap> needs `createFocusTrap`. <$skipLink>
                    // and <$visuallyHidden> are CSS-only but rely on a one-time style
                    // injector at runtime mount.
                    "focusTrap" => h.a11y_focus_trap = true,
                    "skipLink" | "visuallyHidden" => h.a11y_styles = true,
                    "liveRegion" => {}
                    // arch-5 M1 routing macro elements
                    "router" => h.router_element = true,
                    "link" => {
                        h.link_element = true;
                        h.needs_effect = true; // aria-current is reactive
                    }
                    "outlet" => {
                        h.outlet_element = true;
                        h.needs_effect = true; // outlet content reacts to route signal
                    }
                    "navigate" => h.navigate_element = true,
                    _ => {}
                }
                // FEL-230: structural/effect directives placed ON a macro element
                // (e.g. `<$link $each=...>`) emit their boundary call site in
                // `emit_macro_effects`, so the matching helper definition must be
                // collected here too. Without this scan, a module whose only
                // `$each` sits on `<$link>` emitted `createEachBoundary(...)` with
                // no inlined definition → ReferenceError, blank page.
                scan_attr_helpers(attrs, h);
                collect_helpers_recursive(children, h);
            }
            TemplateNode::Element { tag, attrs, children, .. } => {
                // §2.6 — an enhanced <a> emits createLinkBoundary at its call
                // site, so the helper (and the router namespace import) must
                // be collected exactly as for the retired <$link>.
                if tag == "a" && anchor_is_enhanced(attrs) {
                    h.link_element = true;
                    h.needs_effect = true; // aria-current is reactive
                }
                scan_attr_helpers(attrs, h);
                collect_helpers_recursive(children, h);
            }
            // B3 — Variant B block-tag forms reuse the same boundary helpers
            // as their attribute-directive counterparts (same runtime contract).
            TemplateNode::IfBlock { branches } => {
                h.if_boundary = true;
                for (_, body) in branches {
                    collect_helpers_recursive(body, h);
                }
            }
            TemplateNode::EachBlock { body, empty_body, .. } => {
                h.each_boundary = true;
                collect_helpers_recursive(body, h);
                if let Some(eb) = empty_body {
                    collect_helpers_recursive(eb, h);
                }
            }
            TemplateNode::HtmlBlock { .. } => {
                h.needs_effect = true;
                h.needs_on_mount_for_directives = true;
            }
            _ => {}
        }
    }
}

/// Emit inline const definitions for boundary helpers used in this SFC.
/// These are SFC-internal — not imported from any package.
fn emit_boundary_helpers(h: &NeededHelpers) -> String {
    let mut lines: Vec<&str> = Vec::new();
    if h.if_boundary {
        // R5 (Defect E): reactive $if. Delegate to arbor's `when()` rather
        // than synthesizing the structural node literally — the arbor bundle
        // mangles property names (`structuralKind` → `sk`, `condition` → `cn`)
        // via oxc-minify, so a literal would mismatch the reconciler's reads.
        // `when()` constructs the node internally and the property names match
        // because both producer and reader live in the same minified bundle.
        lines.push("const createIfBoundary = (cond, grow) => when(cond, grow);");
    }
    if h.once_boundary {
        lines.push("const createOnceBoundary = (b) => b();");
    }
    if h.memo_boundary {
        lines.push("const createMemoBoundary = (deps, b) => b();");
    }
    if h.each_boundary {
        // R5 (Defect E): reactive $each fallback. Delegate to arbor's `each()`
        // rather than synthesizing the structural node literally (same
        // property-mangling concern as `when()`).
        lines.push("const createEachBoundary = (items, key, itemFn) => each(items, key, itemFn);");
    }
    if h.slot_boundary {
        lines.push("const createSlotBoundary = (o, b) => slot(o?.name ?? undefined);");
    }
    if h.suspense_boundary {
        lines.push("const createSuspenseBoundary = (src, b, fb) => b();");
    }
    if h.shield_boundary {
        lines.push("const createShieldBoundary = (b, fb) => { try { return b() } catch(e) { return fb({error: e, retry: () => {}}) } };");
    }
    if h.guard_boundary {
        lines.push("const createGuardBoundary = (chk, b, fb) => b();");
    }
    if h.warp_boundary {
        lines.push("const createWarpBoundary = (tgt, b) => b();");
    }
    // arch-5 M1 — routing boundary helpers emitted only when used.
    // These delegate to `@aihu/router` runtime; the full module import is
    // added to `build_function_imports` when any of these flags is set.
    if h.router_element {
        // `<$router>` — provide route context with reactive signal; render children.
        lines.push("const createRouterBoundary = (router, vt, b) => {\n  const sig = __aihuRouter.createRouteSignal(router);\n  const ctx = { router, current: sig.read, viewTransitions: !!vt };\n  __aihuRouter.bindRouteSignalWriter(ctx, sig.write);\n  __aihuRouter.provideRouteContext(ctx);\n  onCleanup(() => sig.dispose());\n  return b();\n};");
    }
    if h.link_element {
        // enhanced `<a>` — intercept clicks for SPA nav, set aria-current via effect.
        lines.push("const createLinkBoundary = (href, prefetch, replace, attrs, children) => {\n  // Compose any author `on:click` with SPA navigation. Click is wired as an\n  // arbor event attr (owner-agnostic) so enhanced <a> works inside each/if item\n  // factories, where there is no component-setup owner for onMount/effect.\n  // href may be a reactive thunk (dynamic `href={expr}`) or a static string.\n  // hrefVal() yields the current string for imperative reads (navigation,\n  // aria-current); the rendered <a> binds the thunk-array form so its href\n  // attribute tracks signal changes, mirroring a plain `<a $href={…}>`.\n  const hrefVal = typeof href === 'function' ? href : () => href;\n  const _userClick = attrs && typeof attrs.onClick === 'function' ? attrs.onClick : null;\n  const onClick = (e) => {\n    if (_userClick) _userClick(e);\n    if (e.defaultPrevented || e.button !== 0) return;\n    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;\n    // Auto-opt-out (grammar v2 \u{a7}2.6): an external origin or a non-http(s)\n    // scheme is a plain full-document navigation \u{2014} never SPA-intercepted.\n    let _u; try { _u = new URL(hrefVal(), location.href); } catch { return; }\n    if (_u.origin !== location.origin || (_u.protocol !== 'http:' && _u.protocol !== 'https:')) return;\n    // No reactive <router> context (e.g. createApp): let the click bubble to\n    // @aihu/app's document-level delegation (or the browser) instead of a hard\n    // location.assign. With context present, navigate() does SPA nav here.\n    if (!__aihuRouter.useRouter()) return;\n    e.preventDefault();\n    void __aihuRouter.navigate(hrefVal(), { replace: !!replace });\n  };\n  const node = branch('a', { ...(attrs || {}), href: typeof href === 'function' ? [() => href()] : href, 'data-aihu-link': '', onClick }, children);\n  // Prefetch + aria-current need the live <a> at mount and use onMount, which\n  // requires a component-setup owner. Inside an each/if factory there is none,\n  // so guard the registration: looped links still navigate (onClick above) —\n  // they just skip prefetch + aria-current rather than throwing 'no owner'.\n  try {\n    onMount(() => {\n      const el = (typeof node === 'object' && node && 'el' in node ? node.el : null) || null;\n      const a = el && (el.tagName === 'A' ? el : el.querySelector?.('a')) || null;\n      if (!a) return () => {};\n      const ariaCompute = () => {\n        const r = __aihuRouter.useRoute();\n        return r && r.pathname === hrefVal() ? 'page' : null;\n      };\n      const pf = __aihuRouter.createPrefetcher(prefetch || 'none');\n      pf.attach(a, ariaCompute);\n      const stop = effect(() => {\n        const v = ariaCompute();\n        if (v) a.setAttribute('aria-current', v);\n        else a.removeAttribute('aria-current');\n      });\n      return () => { pf.detach(a); stop && stop(); };\n    });\n  } catch {}\n  return node;\n};");
    }
    if h.outlet_element {
        // `<$outlet>` — render the matched route component as a child custom element.
        // Replaces children via DOM methods (no innerHTML). The matched component
        // reads `route` JSON via the standard $prop pattern.
        lines.push("const createOutletBoundary = () => {\n  const host = branch('div', { 'data-aihu-outlet': '' }, []);\n  onMount(() => {\n    const el = host && host.el;\n    if (!el) return () => {};\n    let cleanup = null;\n    const stop = effect(() => {\n      const m = __aihuRouter.useRoute();\n      if (cleanup) { cleanup(); cleanup = null; }\n      while (el.firstChild) el.removeChild(el.firstChild);\n      if (!m) return;\n      Promise.all([m.route.module(), ...(globalThis.__aihuRegisterRouteComponents?.(m.route) ?? [])]).then(async ([mod]) => {\n        const Component = mod.default;\n        const loaderData = mod.loader ? await mod.loader(m.params) : undefined;\n        const inst = (typeof Component === 'function') ? new Component() : null;\n        if (inst && inst.setAttribute) {\n          inst.setAttribute('route', JSON.stringify({ params: m.params, pathname: m.pathname, data: loaderData }));\n          el.appendChild(inst);\n          cleanup = () => { try { el.removeChild(inst); } catch {} };\n        }\n      });\n    });\n    return () => { if (cleanup) cleanup(); stop && stop(); };\n  });\n  return host;\n};");
    }
    if h.navigate_element {
        // `<$navigate>` — programmatic redirect on mount.
        lines.push("const createNavigateBoundary = (to, replace) => {\n  onMount(() => { void __aihuRouter.navigate(to, { replace: !!replace }); });\n  return branch('span', { hidden: '', 'aria-hidden': 'true', 'data-aihu-navigate': to }, []);\n};");
    }
    if h.needs_class_helper {
        // B3 — `class={[a, b && 'c']}` array-form helper. Joins truthy strings
        // with spaces; null/undefined/false/0 filtered out (clsx-shaped).
        lines.push("const __aihu_cls = (a) => Array.isArray(a) ? a.filter(v => typeof v === 'string' && v).join(' ') : (a == null ? '' : String(a));");
    }
    if h.needs_bind_conv_helper {
        // B3 / R4 — typed-conversion at $bind.value write-back site. Inspects
        // the current signal value's type and converts the input string to
        // match. Mirror of R1's `_convert` direction at the write side.
        // Numbers parse via Number(); booleans via String === 'true' (rare for
        // input fields but correct for `<input value="…"> + signal(true)`);
        // strings pass through; unknown types return the raw string.
        lines.push("const __aihu_conv = (cur, raw) => { if (typeof cur === 'number') { const n = Number(raw); return Number.isFinite(n) ? n : cur; } if (typeof cur === 'boolean') return raw === 'true'; return raw; };");
    }
    if lines.is_empty() {
        String::new()
    } else {
        lines.join("\n") + "\n\n"
    }
}

// ─── State macro processing ───────────────────────────────────────────────────

fn process_state_body(
    raw_script: &str,
    signal_map: &mut SignalMap,
) -> (StateImports, Vec<crate::types::StateMacro>, String, Vec<String>, StateNames) {
    use crate::parser::state_macros::parse_state_macros;
    use crate::types::StateMacro;

    let macros = parse_state_macros(raw_script).unwrap_or_default();
    let mut si = StateImports::default();

    // R2 (Defect B): collect every identifier declared in `@state`. Includes
    // signals + computed + bare class-property declarations + $prop entries +
    // $resource entries + $action function names + $route bindings. The
    // template emitter consults this set in `emit_attrs` to decide whether
    // a binding expression references state and must therefore be lowered
    // to a `[() => (expr)]` thunk array.
    let mut state_names = StateNames::default();

    // Seed from any bindings already in signal_map (signals lifted by
    // `resolve_signals` from authored `const [g, s] = signal(...)` forms).
    for k in signal_map.0.keys() {
        state_names.insert(k);
    }

    for mac in &macros {
        match mac {
            StateMacro::Collection { kind, entries } => match kind {
                CollectionKind::Computed => {
                    si.needs_computed = true;
                    for e in entries {
                        signal_map.insert_computed(&e.name);
                        state_names.insert(&e.name);
                    }
                }
                CollectionKind::Prop => {
                    // R1 — register prop names as computed-style signals so
                    // template binding sites (`{name}`) lower through the
                    // reactive `signal_map.is_reactive` path. The body-side
                    // declaration `const <name> = ctx.props.<name>` is emitted
                    // as a callable signal-getter by `emit_state_macro_code`.
                    for e in entries {
                        signal_map.insert_computed(&e.name);
                        state_names.insert(&e.name);
                    }
                }
                CollectionKind::Action => {
                    si.needs_batch = true;
                    for e in entries {
                        state_names.insert(&e.name);
                    }
                }
                CollectionKind::Resource => {
                    use crate::parser::state_macros::{arrow_body, is_magna_origin, running_code};
                    for e in entries {
                        // arch-3 M2 (RFC-003): a `$resource` whose running-code
                        // thunk body is a magna client call (`data.X.query(...)`)
                        // lowers to `createMagnaResource`; any other `$resource`
                        // keeps the plain `createResource` lowering (no regression).
                        let is_magna = running_code(e)
                            .map(|thunk| {
                                let body =
                                    arrow_body(thunk).unwrap_or_else(|| thunk.to_string());
                                is_magna_origin(&body)
                            })
                            .unwrap_or(false);
                        if is_magna {
                            si.needs_create_magna_resource = true;
                        } else {
                            si.needs_create_resource = true;
                        }
                        state_names.insert(&e.name);
                    }
                }
                CollectionKind::Stream => {
                    si.needs_create_stream = true;
                    si.needs_on_cleanup = true; // onCleanup registered by createStream
                    for e in entries {
                        state_names.insert(&e.name);
                    }
                }
                CollectionKind::Effect => {
                    si.needs_effect_for_macros = true;
                    // $effect entries don't declare bindings; nothing to track.
                }
                CollectionKind::Lifecycle => {
                    for e in entries {
                        match e.name.as_str() {
                            "mount" => si.needs_on_mount = true,
                            "dispose" => si.needs_on_cleanup = true,
                            // R2: adopt + attributeChange callbacks.
                            "adopt" => si.needs_on_adopt = true,
                            "attributeChange" => si.needs_on_attribute_change = true,
                            _ => {}
                        }
                    }
                }
                CollectionKind::Event => {
                    // B3b — $event declarations are compile-time-only.
                    // They surface to the sidecar typer + $emit resolution; no
                    // runtime signal/binding side-effects.
                }
                CollectionKind::Aria => {
                    // B4 — $aria declarations are handled by emit_aria_wiring()
                    // at SFC-body level. No signal/binding side-effects here.
                }
                CollectionKind::Controller => {
                    // B5 — $controller entries lower to IIFE-factories with
                    // onMount/onCleanup lifecycle wiring. Mark needs_controller
                    // so the runtime imports are included.
                    si.needs_controller = true;
                    si.needs_on_mount = true;
                    si.needs_on_cleanup = true;
                    for e in entries {
                        state_names.insert(&e.name);
                    }
                }
                CollectionKind::Context => {
                    // B5/O2 — $context provide/consume entries lower to
                    // synchronous provide()/inject() setup-body calls (see
                    // CollectionKind::Context in the lowering below). Mark
                    // needs_context so the @aihu/context import is emitted.
                    // No onMount: provide/inject must run DURING setup so the
                    // prototype-chain scope entered at connect captures them.
                    si.needs_context = true;
                }
                CollectionKind::Form => {
                    // D5 — $form wiring is handled by emit_form_wiring() at
                    // SFC-body level. No signal/binding side-effects here.
                }
            },
            StateMacro::EffectAnon { .. }
            | StateMacro::EffectOn { .. }
            | StateMacro::Watch { .. } => {
                si.needs_effect_for_macros = true;
            }
            StateMacro::Route { name } => {
                si.needs_aihu_router = true;
                si.needs_computed = true;
                signal_map.insert_computed(name);
                state_names.insert(name);
            }
            StateMacro::BeforeNavigate { .. } | StateMacro::AfterNavigate { .. } => {
                si.needs_aihu_router = true;
            }
            StateMacro::Query { name, .. } => {
                // arch-3 M2 (RFC-003): `$query` always lowers to
                // `createMagnaResource(inject(MagnaFetchToken), <expr>)`.
                si.needs_create_magna_resource = true;
                state_names.insert(name);
            }
            StateMacro::Auth { name, .. } => {
                // arch-3 M2 / A3 G2 (RFC-001): `$auth.*` lowers to
                // `const <name> = useCurrentUser()` from `@aihu/auth`.
                si.needs_use_current_user = true;
                state_names.insert(name);
            }
            // §9.4 / GX Phase 1 — declaration-only macros consumed at the
            // defineComponent assembly layer (or, for $extract, resolved into
            // the artifact fan-out); they introduce no state binding here.
            StateMacro::Extends { .. } | StateMacro::Shadow { .. } | StateMacro::Extract { .. } => {}
        }
    }

    let mut plain_lines: Vec<String> = Vec::new();
    let mut user_imports: Vec<String> = Vec::new();
    let mut i = 0usize;
    let mut in_import = false;
    let mut current_import: Vec<String> = Vec::new();
    // Scratch buffer reused across iterations to own an `export `-stripped line
    // (the borrow checker needs a binding outliving the per-iteration `&str`).
    let mut stripped_export_line = String::new();
    let bytes = raw_script.as_bytes();
    while i < bytes.len() {
        let nl = raw_script[i..].find('\n').map(|r| i + r).unwrap_or(raw_script.len());
        let line_raw = &raw_script[i..nl];
        let line = line_raw.trim();

        // Collect import lines from @state and lift them to module scope.
        if line.starts_with("import ") || line.starts_with("import\t") {
            // Skip type-only imports — they are erased at runtime.
            if line.starts_with("import type ") || line.starts_with("import type\t") {
                i = nl + 1;
                continue;
            }
            let opens_block = line.contains('{') && !line.contains('}');
            current_import.push(line_raw.to_string());
            if opens_block {
                in_import = true;
            } else {
                user_imports.push(current_import.join("\n"));
                current_import.clear();
            }
            i = nl + 1;
            continue;
        }
        if in_import {
            current_import.push(line_raw.to_string());
            if line.contains(" from ") || line.ends_with(';') {
                in_import = false;
                user_imports.push(current_import.join("\n"));
                current_import.clear();
            }
            i = nl + 1;
            continue;
        }

        // Skip $macro lines (and their multi-line bodies).
        //
        // v2 collection-form: `$<keyword>: { ... }` — skip past the matching
        // `}`. Anonymous `$effect: () => { ... }` — skip past the matching
        // `}` of the arrow body. Preserved-from-v1 `$effect.on(...)`,
        // `$watch <name> { ... }` — skip past the matching `}`.
        if line.starts_with('$') {
            let stripped = line.trim_start_matches('$');
            let macro_keyword = stripped.split_ascii_whitespace().next();
            let is_collection_macro = matches!(
                macro_keyword.map(|k| {
                    // Strip trailing `:` for keyword comparison.
                    k.trim_end_matches(':')
                }),
                Some("prop")
                    | Some("computed")
                    | Some("action")
                    | Some("resource")
                    | Some("effect")
                    | Some("lifecycle")
                    | Some("event")
                    | Some("aria")
                    // B5
                    | Some("controller")
                    | Some("context")
                    // v0.4.0
                    | Some("stream")
                    // D5 — `$form` entries are lowered by emit_form_wiring() at
                    // the SFC-body level, not per-entry. It still has to be
                    // SKIPPED here: without this arm its body leaked into
                    // plain_body, where the `name: type` declaration scanner
                    // rewrote `value: () => value,` into
                    // `let value: () => value,` and left a dangling `}`.
                    // Every other CollectionKind variant is listed above; keep
                    // this arm in sync when adding one.
                    | Some("form")
            ) && stripped.contains(':');
            let is_preserved_macro = stripped.starts_with("effect.on(")
                || matches!(macro_keyword, Some("watch"));
            // arch-5 M1 router call-macros: `$beforeNavigate(fn)` / `$afterNavigate(fn)`.
            // These are the call form (`$name(...)`), not the collection form
            // (`$name: {...}`) nor the preserved `{...}`-body form — so neither
            // branch above matches them, and without this one only the macro's
            // FIRST line is skipped while the rest of a multi-line callback body
            // (and its closing `})`) leaks into plain_body as dangling JS (#426).
            // They are lowered from `macros` at the `StateMacro::AfterNavigate`
            // emit branch; here we only need to skip their full source span.
            let is_router_call_macro = stripped.starts_with("beforeNavigate(")
                || stripped.starts_with("afterNavigate(");

            if is_collection_macro {
                // For v2 collection-form, the body opens with `:` followed by
                // `{` (named-collection) or `(` (anonymous `$effect`). Find
                // the colon, skip whitespace, then jump past the matching
                // closing brace / paren.
                if let Some(colon_rel) = raw_script[i..].find(':') {
                    let mut p = i + colon_rel + 1;
                    while p < raw_script.len()
                        && matches!(bytes[p], b' ' | b'\t' | b'\n' | b'\r')
                    {
                        p += 1;
                    }
                    if p < raw_script.len() {
                        if bytes[p] == b'{' {
                            if let Some(close) = crate::parser::state_macros::find_brace_close_js(
                                raw_script,
                                p + 1,
                            ) {
                                i = close + 1;
                                if i < bytes.len() && bytes[i] == b'\n' {
                                    i += 1;
                                }
                                continue;
                            }
                        } else if bytes[p] == b'(' {
                            // Anonymous `$effect: () => { ... }` — skip past
                            // the closing `)`, then `=>`, then the body.
                            if let Some(close_paren) =
                                crate::parser::state_macros::find_paren_close(raw_script, p + 1)
                            {
                                let mut q = close_paren + 1;
                                while q < raw_script.len()
                                    && matches!(bytes[q], b' ' | b'\t')
                                {
                                    q += 1;
                                }
                                if q + 1 < raw_script.len()
                                    && bytes[q] == b'='
                                    && bytes[q + 1] == b'>'
                                {
                                    q += 2;
                                    while q < raw_script.len()
                                        && matches!(
                                            bytes[q],
                                            b' ' | b'\t' | b'\n' | b'\r'
                                        )
                                    {
                                        q += 1;
                                    }
                                    if q < raw_script.len() && bytes[q] == b'{' {
                                        if let Some(close) =
                                            crate::parser::state_macros::find_brace_close_js(
                                                raw_script,
                                                q + 1,
                                            )
                                        {
                                            i = close + 1;
                                            if i < bytes.len() && bytes[i] == b'\n' {
                                                i += 1;
                                            }
                                            continue;
                                        }
                                    } else {
                                        // Expression body — skip to end of line.
                                        let nl2 = raw_script[q..]
                                            .find('\n')
                                            .map(|r| q + r)
                                            .unwrap_or(raw_script.len());
                                        i = nl2 + 1;
                                        continue;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if is_preserved_macro {
                // Find the body `{`. For `$effect.on(dep) { body }`, the `{`
                // is after the closing `)`; for `$watch name { body }` the
                // `{` is the next one on the line.
                let has_brace = raw_script[i..].find('{').map(|r| i + r);
                let has_nl_first = raw_script[i..].find('\n').map(|r| i + r);
                let brace_start_opt =
                    has_brace.filter(|&b| has_nl_first.map_or(true, |nl2| b < nl2));
                if let Some(brace_start) = brace_start_opt {
                    if let Some(close) = crate::parser::state_macros::find_brace_close_js(
                        raw_script,
                        brace_start + 1,
                    ) {
                        i = close + 1;
                        if i < bytes.len() && bytes[i] == b'\n' {
                            i += 1;
                        }
                        continue;
                    }
                }
            }

            if is_router_call_macro {
                // The call-macro opens with `(` right after the keyword; skip
                // past the matching `)` (which spans any multi-line callback),
                // then an optional trailing `;` and newline. Mirrors the span
                // skip the collection/preserved forms already perform, so no
                // fragment of the callback body reaches plain_body.
                if let Some(paren_rel) = raw_script[i..].find('(') {
                    let open = i + paren_rel;
                    if let Some(close) =
                        crate::parser::state_macros::find_paren_close(raw_script, open + 1)
                    {
                        let mut j = close + 1;
                        if j < bytes.len() && bytes[j] == b';' {
                            j += 1;
                        }
                        if j < bytes.len() && bytes[j] == b'\n' {
                            j += 1;
                        }
                        i = j;
                        continue;
                    }
                }
            }

            i = nl + 1;
            continue;
        }

        // Strip a leading top-level `export ` keyword: when the user writes
        // `export function quote() { … }` in <script setup>, the body is injected
        // inside `setup(ctx)` where `export` is a syntax error. Preserve leading
        // indentation. (Previously handled by the now-removed `extract_script_body`
        // in the legacy options form; folded into the unified path.)
        let line_for_body: &str = {
            let lead_len = line_raw.len() - line_raw.trim_start().len();
            let (lead, rest) = line_raw.split_at(lead_len);
            if let Some(after) = rest.strip_prefix("export ") {
                // Re-leak the stripped string into an owned line below.
                stripped_export_line = format!("{}{}", lead, after);
                stripped_export_line.as_str()
            } else {
                line_raw
            }
        };
        let transformed = transform_bare_declaration(line_for_body);
        // R2 (Defect B): when a bare class-property declaration becomes a
        // `let <name>: <type> = ...`, capture <name> as a state identifier so
        // the template emitter wraps references in `[() => expr]` thunks.
        if let Some(name) = extract_state_decl_name(&transformed) {
            state_names.insert(&name);
        }
        plain_lines.push(transformed);
        i = nl + 1;
    }

    // Trim leading/trailing blank lines and add 2-space indent
    let trimmed: Vec<_> = plain_lines
        .iter()
        .skip_while(|l| l.trim().is_empty())
        .cloned()
        .collect();
    let mut trimmed: Vec<_> = trimmed
        .iter()
        .rev()
        .skip_while(|l| l.trim().is_empty())
        .cloned()
        .collect();
    trimmed.reverse();

    let plain_body = if trimmed.is_empty() {
        String::new()
    } else {
        trimmed
            .iter()
            .map(|l| {
                if l.trim().is_empty() {
                    String::new()
                } else {
                    format!("  {}", l)
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    (si, macros, plain_body, user_imports, state_names)
}

/// Extract the binding name from a `let <name>...` / `const <name>...` line
/// produced by `transform_bare_declaration`. Returns `None` for any line that
/// is not a simple top-level declaration (e.g. destructuring patterns, arrow
/// fn bodies, control-flow). R2 (Defect B): used to populate `StateNames`.
fn extract_state_decl_name(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let rest = trimmed
        .strip_prefix("let ")
        .or_else(|| trimmed.strip_prefix("const ")) ?;
    let head = rest.trim_start();
    // Must start with a simple identifier (not `[`, `{`, etc.).
    let first = head.chars().next()?;
    if !(first.is_ascii_alphabetic() || first == '_' || first == '$') {
        return None;
    }
    // Walk while the char is a valid identifier continuation.
    let mut end = 0usize;
    for (i, c) in head.char_indices() {
        if c.is_ascii_alphanumeric() || c == '_' || c == '$' {
            end = i + c.len_utf8();
        } else {
            break;
        }
    }
    if end == 0 {
        return None;
    }
    Some(head[..end].to_string())
}

/// Transform a bare TypeScript class-property declaration to a `let` declaration.
///
/// R2 (Defect A): emit `let`, not `const`. State declarations in `@state` are
/// frequently reassigned from action / effect / lifecycle bodies (e.g.
/// `loading = false` after a fetch resolves). Emitting `const` causes
/// `Assignment to constant variable` at runtime; `let` is universally safe and
/// the bundle-size delta is trivial.
fn transform_bare_declaration(line: &str) -> String {
    let trimmed = line.trim();

    if trimmed.is_empty()
        || trimmed.starts_with("const ")
        || trimmed.starts_with("let ")
        || trimmed.starts_with("var ")
        || trimmed.starts_with("function ")
        || trimmed.starts_with("class ")
        || trimmed.starts_with("return ")
        || trimmed.starts_with("if ")
        || trimmed.starts_with("else")
        || trimmed.starts_with("for ")
        || trimmed.starts_with("while ")
        || trimmed.starts_with("//")
        || trimmed.starts_with("/*")
        || trimmed.starts_with('*')
        || trimmed.starts_with('}')
        || trimmed.starts_with('{')
        || trimmed.starts_with('$')
        || trimmed.starts_with('@')
    {
        return line.to_string();
    }

    let first_char = trimmed.chars().next().unwrap_or(' ');
    if !(first_char.is_ascii_alphabetic() || first_char == '_') {
        return line.to_string();
    }

    let colon_pos = find_top_level_colon(trimmed);
    let has_eq = trimmed.contains('=');

    if colon_pos.is_none() || !has_eq {
        return line.to_string();
    }

    let colon_pos = colon_pos.unwrap();
    let name_part = trimmed[..colon_pos].trim();
    if name_part.is_empty() || name_part.chars().any(|c| c.is_whitespace() || c == '.' || c == '[') {
        return line.to_string();
    }

    let leading_ws: String = line.chars().take_while(|c| c.is_whitespace()).collect();
    format!("{}let {}", leading_ws, trimmed)
}

/// Find the position of the first `:` at depth 0 (not inside `<>`, `{}`, `[]`, `()`).
fn find_top_level_colon(s: &str) -> Option<usize> {
    let mut depth_angle = 0i32;
    let mut depth_brace = 0i32;
    let mut depth_paren = 0i32;
    let mut depth_bracket = 0i32;
    for (i, c) in s.char_indices() {
        match c {
            '<' => depth_angle += 1,
            '>' if depth_angle > 0 => depth_angle -= 1,
            '{' => depth_brace += 1,
            '}' => depth_brace = (depth_brace - 1).max(0),
            '(' => depth_paren += 1,
            ')' => depth_paren = (depth_paren - 1).max(0),
            '[' => depth_bracket += 1,
            ']' => depth_bracket = (depth_bracket - 1).max(0),
            ':' if depth_angle == 0 && depth_brace == 0 && depth_paren == 0 && depth_bracket == 0 => {
                return Some(i);
            }
            _ => {}
        }
    }
    None
}

/// CO1: `$prop` name -> "the entry's `default:` is a numeric literal".
///
/// The key set is `collect_prop_entries`, NOT the `SignalMap` (spec §6.1):
/// `process_state_body` registers prop names into `signal_map` alongside real
/// `$computed` entries and lifted `signal()` bindings, so keying the write
/// rewrite off it would rewrite a plain writable `let` and break working code.
///
/// The bool proves `ToNumeric` is identity for that prop, which is one of the
/// two conditions for the `++`/`--` inline fast path.
fn collect_prop_write_targets(
    macros: &[crate::types::StateMacro],
) -> std::collections::HashMap<String, bool> {
    use crate::parser::state_macros::meta_get;
    let mut out = std::collections::HashMap::new();
    for entry in collect_prop_entries(macros) {
        let numeric_default = meta_get(entry, "default")
            .map(|d| d.trim().parse::<f64>().is_ok())
            .unwrap_or(false);
        out.insert(entry.name.clone(), numeric_default);
    }
    out
}

/// CO1: rewrite `$prop` writes inside one macro body, or return it unchanged.
///
/// Infallible by design. C560 (destructuring into a prop) is raised as a hard
/// error by `validate_prop_writes` in `lib.rs`, which runs BEFORE emit and can
/// return `Result`; by the time emit runs, such a body has already been
/// rejected. Here an error can only mean the two passes disagreed, so the
/// non-regressive move is to splice the body exactly as authored.
fn rewrite_prop_writes_in(
    body: &str,
    params: &str,
    is_async: bool,
    props: &std::collections::HashMap<String, bool>,
    needs_helper: &mut bool,
) -> String {
    let targets = crate::expr::PropWriteTargets { props };
    match crate::expr::rewrite_prop_writes(body, params, is_async, &targets) {
        Ok(Some(res)) => {
            if res.needs_update_helper {
                *needs_helper = true;
            }
            res.source
        }
        _ => body.to_string(),
    }
}

/// Returns the emitted `@state` macro code and whether it needs the lazily
/// declared `__aihu_prop_upd` helper (spec §4.5).
fn emit_state_macro_code(
    macros: &[crate::types::StateMacro],
    signal_map: &SignalMap,
) -> (String, bool) {
    use crate::parser::state_macros::{
        arrow_args, arrow_async_prefix, arrow_body, arrow_body_spliceable, meta_get, running_code,
    };
    use crate::types::{CollectionKind, StateMacro};
    let mut lines: Vec<String> = Vec::new();
    let indent = "  ";
    // CO1: collected once for the whole component, threaded into every
    // imperative-position macro body below.
    let prop_targets = collect_prop_write_targets(macros);
    let mut needs_prop_upd_helper = false;
    for mac in macros {
        match mac {
            StateMacro::Collection { kind, entries } => {
                for entry in entries {
                    match kind {
                        CollectionKind::Prop => {
                            // R1 (template-syntax-v2 round 5, Builder B1): $prop
                            // entries lower to a callable signal getter exposed via
                            // `ctx.props.<name>`. The runtime allocates the signal,
                            // wires `observedAttributes` + `attributeChangedCallback`,
                            // and (when `reflect: true`) writes the signal value back
                            // to the attribute. See packages/runtime/src/define-component.ts.
                            //
                            // The body-side declaration `const <name> = ctx.props.<name>`
                            // makes `<name>` a function that returns the current value.
                            // Template binding sites (e.g. `{name}`) lower through the
                            // `signal_map` reactive path because we register the prop
                            // name as a "computed" entry in `process_state_body`.
                            //
                            // NOTE (issue #279): the body-side prop binding is NOT
                            // emitted here anymore. It is hoisted ahead of `plain_body`
                            // via `emit_prop_bindings` (see the body-assembly block) so
                            // a synchronously-running `effect()` / const initializer in
                            // @state that reads the prop getter does not hit the
                            // temporal dead zone. Emitting it here (after `plain_body`)
                            // was the root cause of the TDZ ReferenceError.
                        }
                        CollectionKind::Computed => {
                            let thunk = match running_code(entry) {
                                Some(t) => t,
                                None => continue,
                            };
                            let body = arrow_body_spliceable(thunk)
                                .unwrap_or_else(|| thunk.to_string());
                            let am = arrow_async_prefix(thunk);
                            lines.push(format!(
                                "{indent}const {} = computed({am}() => {body});",
                                entry.name
                            ));
                        }
                        CollectionKind::Resource => {
                            let thunk = match running_code(entry) {
                                Some(t) => t,
                                None => continue,
                            };
                            let am = arrow_async_prefix(thunk);
                            let body = arrow_body_spliceable(thunk)
                                .unwrap_or_else(|| thunk.to_string());
                            // arch-3 M2 (RFC-003): magna-origin `$resource`
                            // (body is `data.X.query(...)`) lowers to
                            // `createMagnaResource`; everything else keeps the
                            // plain `createResource` lowering (no regression).
                            if crate::parser::state_macros::is_magna_origin(&body) {
                                lines.push(format!(
                                    "{indent}const {} = createMagnaResource(inject(MagnaFetchToken), {body});",
                                    entry.name
                                ));
                            } else {
                                lines.push(format!(
                                    "{indent}const {} = createResource({am}() => {body});",
                                    entry.name
                                ));
                            }
                        }
                        CollectionKind::Stream => {
                            // v0.4.0 — emit `const <name> = createStream(<source_factory>)`
                            // The source factory is the verbatim value from the `source:` key.
                            let source_factory = entry
                                .meta
                                .iter()
                                .find(|(k, _)| k == "source")
                                .map(|(_, v)| v.trim())
                                .unwrap_or("() => null");
                            lines.push(format!(
                                "{indent}const {} = createStream({source_factory});",
                                entry.name
                            ));
                        }
                        CollectionKind::Action => {
                            let arrow = match running_code(entry) {
                                Some(t) => t,
                                None => continue,
                            };
                            let args = arrow_args(arrow).unwrap_or_default();
                            let body = arrow_body(arrow).unwrap_or_default();
                            let is_async = crate::parser::state_macros::arrow_is_async(arrow);
                            // CO1: rewrite `$prop` writes FIRST (spec §4.11).
                            // The `$announce(` replace below is a raw string
                            // substitution that invalidates byte offsets, so it
                            // MUST run after the span-based splice. `args` is
                            // passed so the action's own params shadow
                            // correctly — that shadow lives outside the body
                            // text, and missing it silently corrupts
                            // `(count) => { count = 5 }`.
                            let body = rewrite_prop_writes_in(
                                &body,
                                &args,
                                is_async,
                                &prop_targets,
                                &mut needs_prop_upd_helper,
                            );
                            // arch-5 M1: rewrite $announce(...) call sites in
                            // action bodies to the runtime-imported alias.
                            let body = body.replace("$announce(", "__a11y_announce(");
                            if is_async {
                                // Async handlers are NOT wrapped in `batch`.
                                // Two reasons, both correctness rather than
                                // preference:
                                //  1. `batch` takes a plain arrow, so an
                                //     `await` in the body is a syntax error.
                                //  2. `batch` flushes synchronously, so even if
                                //     it accepted an async callback it would
                                //     cover only the prefix before the first
                                //     `await` — the later writes would escape
                                //     it silently. A partial batch is worse
                                //     than none, because it looks atomic.
                                // The return contract still holds: an async
                                // function returns a promise, so `$action`
                                // callers awaiting the result get the body's
                                // value as before.
                                lines.push(format!(
                                    "{indent}async function {}({args}) {{ {body} }}",
                                    entry.name
                                ));
                            } else {
                                lines.push(format!(
                                    "{indent}function {}({args}) {{ return batch(() => {{ {body} }}) }}",
                                    entry.name
                                ));
                            }
                        }
                        CollectionKind::Effect => {
                            let thunk = match running_code(entry) {
                                Some(t) => t,
                                None => continue,
                            };
                            let body =
                                arrow_body(thunk).unwrap_or_else(|| thunk.to_string());
                            // CO1: `$effect` is an imperative position, so a
                            // `$prop` write there is legitimate and rewritten.
                            let body = rewrite_prop_writes_in(
                                &body,
                                arrow_args(thunk).unwrap_or_default().as_str(),
                                crate::parser::state_macros::arrow_is_async(thunk),
                                &prop_targets,
                                &mut needs_prop_upd_helper,
                            );
                            // Async effects track dependencies only up to the
                            // first `await` (the signals graph collects reads
                            // synchronously). That is a real caveat, but it is
                            // the author's to make — emitting a non-async arrow
                            // around an awaiting body is just a syntax error.
                            let am = arrow_async_prefix(thunk);
                            if let Some(deps_raw) = meta_get(entry, "on") {
                                let deps_inner = deps_raw
                                    .trim()
                                    .strip_prefix('[')
                                    .and_then(|s| s.strip_suffix(']'))
                                    .unwrap_or(deps_raw);
                                lines.push(format!(
                                    "{indent}effect({am}() => {{ {dep}; {body} }});",
                                    dep = deps_inner.trim()
                                ));
                            } else {
                                lines.push(format!("{indent}effect({am}() => {{ {body} }});"));
                            }
                        }
                        CollectionKind::Lifecycle => {
                            // R2 (Director r6 §3): four-callback extension.
                            // mount → onMount, dispose → onCleanup,
                            // adopt → onAdopt, attributeChange → onAttributeChange.
                            // The two new callbacks are forwarded to the host
                            // element's adoptedCallback / attributeChangedCallback
                            // by the runtime; userland's attributeChange runs
                            // AFTER R1's $prop signal-update (Director r6 §3.R2).
                            let arrow = match running_code(entry) {
                                Some(t) => t,
                                None => continue,
                            };
                            let body =
                                arrow_body(arrow).unwrap_or_else(|| arrow.to_string());
                            // CO1: `$lifecycle` callbacks are imperative
                            // positions too — `cookbook/ssr-hydration.aihu`
                            // writes `greeting`/`name` from `mount`. The
                            // callback's own params are passed so
                            // `attributeChange(name, old, new)` shadows a
                            // like-named prop correctly.
                            let body = rewrite_prop_writes_in(
                                &body,
                                arrow_args(arrow).unwrap_or_default().as_str(),
                                crate::parser::state_macros::arrow_is_async(arrow),
                                &prop_targets,
                                &mut needs_prop_upd_helper,
                            );
                            let am = arrow_async_prefix(arrow);
                            match entry.name.as_str() {
                                "mount" => lines
                                    .push(format!("{indent}onMount({am}() => {{ {body} }});")),
                                "dispose" => lines
                                    .push(format!("{indent}onCleanup({am}() => {{ {body} }});")),
                                "adopt" => lines
                                    .push(format!("{indent}onAdopt({am}() => {{ {body} }});")),
                                "attributeChange" => {
                                    // Preserve the user-supplied param list so
                                    // names match what the user authored.
                                    let args = crate::parser::state_macros::arrow_args(arrow)
                                        .unwrap_or_else(|| {
                                            "_name, _oldValue, _newValue, _ctx".to_string()
                                        });
                                    lines.push(format!(
                                        "{indent}onAttributeChange(({args}) => {{ {body} }});"
                                    ));
                                }
                                _ => {}
                            }
                        }
                        CollectionKind::Event => {
                            // B3b — $event entries don't emit runtime code.
                            // Event names are surfaced for sidecar typing
                            // and validated against $emit.<name> call sites
                            // separately (see collect_event_names + emit_node).
                        }
                        CollectionKind::Aria => {
                            // B4 — $aria wiring is emitted by emit_aria_wiring()
                            // at the SFC-body level (called from emit_function_form).
                            // Individual entries are not lowered here.
                        }
                        CollectionKind::Controller => {
                            // B5 — $controller: each entry's `value:` factory is
                            // called once; if the returned object has
                            // `hostConnected`/`hostDisconnected` methods they are
                            // wired into onMount/onCleanup respectively.
                            let factory = match crate::parser::state_macros::meta_get(entry, "value") {
                                Some(f) => f.trim(),
                                None => continue,
                            };
                            let name = &entry.name;
                            lines.push(format!(
                                "{indent}const {name} = (() => {{\n\
                                 {indent}  const _ctrl = ({factory})()\n\
                                 {indent}  if (typeof _ctrl.hostConnected === 'function') onMount(() => _ctrl.hostConnected())\n\
                                 {indent}  if (typeof _ctrl.hostDisconnected === 'function') onCleanup(() => _ctrl.hostDisconnected())\n\
                                 {indent}  return _ctrl\n\
                                 {indent}}})()",
                                indent = indent,
                                name = name,
                                factory = factory,
                            ));
                        }
                        CollectionKind::Form => {
                            // D5 — $form wiring is emitted by emit_form_wiring()
                            // at the SFC-body level (called from emit_function_form).
                            // Individual entries are not lowered here.
                        }
                        CollectionKind::Context => {
                            // B5/O2 — $context entries are `provide` or `consume`.
                            // Each is a wrapped entry whose `meta` pairs hold
                            // the context keys and their sub-metadata objects.
                            //
                            // Example:
                            //   provide entry → meta: [("theme", "{ value: () => themeSignal }")]
                            //   consume entry → meta: [("locale", "{ type: 'Locale' }")]
                            //
                            // Lowering (O2): synchronous setup-body calls onto the
                            // prototype-chain DI in @aihu/context — NOT wrapped in
                            // onMount, because the runtime enters the component's
                            // context scope for the duration of setup (a parent
                            // provides during its setup; a child injects during its
                            // own, after connect-time parent resolution).
                            // `contextKey` interns one shared token per string key
                            // so separately compiled SFCs meet. Works under SSR too
                            // (flat-map fallback), unlike the removed client-only
                            // CustomEvent path.
                            for (ctx_key, ctx_val) in &entry.meta {
                                let v_trimmed = ctx_val.trim();
                                if entry.name == "provide" {
                                    // Parse the sub-object { value: () => expr } to extract factory.
                                    let inner = match crate::parser::state_macros::strip_outer_braces_pub(v_trimmed) {
                                        Some(s) => s,
                                        None => continue,
                                    };
                                    let sub_meta = match crate::parser::state_macros::parse_meta_pairs_pub(&inner) {
                                        Ok(p) => p,
                                        Err(_) => continue,
                                    };
                                    let val_factory = match sub_meta.iter().find(|(mk, _)| mk == "value").map(|(_, mv)| mv.trim().to_string()) {
                                        Some(f) => f,
                                        None => continue,
                                    };
                                    // Function-shaped values are factories:
                                    // wrap-and-call. Static values
                                    // (`value: 'light'`, `value: themeSignal`)
                                    // are provided verbatim — calling them
                                    // would TypeError at runtime.
                                    if crate::parser::state_macros::is_fn_expr(&val_factory) {
                                        lines.push(format!(
                                            "{indent}provide(contextKey('{key}'), ({factory})())",
                                            indent = indent,
                                            key = ctx_key,
                                            factory = val_factory,
                                        ));
                                    } else {
                                        lines.push(format!(
                                            "{indent}provide(contextKey('{key}'), {value})",
                                            indent = indent,
                                            key = ctx_key,
                                            value = val_factory,
                                        ));
                                    }
                                } else {
                                    // consume: ctx_key -> { type: 'T' }. The
                                    // injected value is whatever was provided
                                    // (typically a signal), so template reads
                                    // like `{key()}` keep working identically.
                                    lines.push(format!(
                                        "{indent}const {key} = inject(contextKey('{key}'))",
                                        indent = indent,
                                        key = ctx_key,
                                    ));
                                }
                            }
                        }
                    }
                }
            }
            StateMacro::EffectAnon { body } => {
                lines.push(format!("{indent}effect(() => {{ {body} }});"));
            }
            StateMacro::EffectOn { dep, body } => {
                // R5c: if dep is a simple signal identifier, call the getter
                // so the effect actually subscribes (`name;` would just read
                // the function reference and not track).
                let trimmed = dep.trim();
                let is_simple_ident = !trimmed.is_empty()
                    && trimmed
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
                let dep_expr = if is_simple_ident && signal_map.is_reactive(trimmed) {
                    format!("{}()", trimmed)
                } else {
                    dep.to_string()
                };
                lines.push(format!("{indent}effect(() => {{ {dep_expr}; {body} }});"));
            }
            StateMacro::Watch { name, body } => {
                let is_simple_ident = !name.is_empty()
                    && name
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
                let dep_expr = if is_simple_ident && signal_map.is_reactive(name) {
                    format!("{}()", name)
                } else {
                    name.to_string()
                };
                lines.push(format!("{indent}effect(() => {{ {dep_expr}; {body} }});"));
            }
            // arch-5 M1 — routing macros.
            StateMacro::Route { name } => {
                lines.push(format!(
                    "{indent}const {name} = computed(() => __aihuRouter.useRoute());"
                ));
            }
            StateMacro::BeforeNavigate { expr } => {
                lines.push(format!(
                    "{indent}__aihuRouter.__router_registerBeforeGuard({expr});"
                ));
            }
            StateMacro::AfterNavigate { expr } => {
                lines.push(format!(
                    "{indent}__aihuRouter.__router_registerAfterGuard({expr});"
                ));
            }
            // arch-3 M2 (RFC-003) — magna `$query` shorthand.
            StateMacro::Query { name, expr } => {
                lines.push(format!(
                    "{indent}const {name} = createMagnaResource(inject(MagnaFetchToken), {expr});"
                ));
            }
            // arch-3 M2 / A3 G2 (RFC-001) — auth `$auth.*` shorthand.
            StateMacro::Auth { name, method } => {
                lines.push(format!(
                    "{indent}const {name} = useCurrentUser();{}",
                    crate::parser::state_macros::auth_session_todo(*method)
                ));
            }
            // §9.4 / GX — consumed at the assembly/fan-out layer; no body JS.
            StateMacro::Extends { .. } | StateMacro::Shadow { .. } | StateMacro::Extract { .. } => {}
        }
    }
    let code = if lines.is_empty() {
        String::new()
    } else {
        lines.join("\n") + "\n"
    };
    (code, needs_prop_upd_helper)
}

// ─── R1 — $prop options-form lowering helpers ───────────────────────────────

/// Collect the entries of all `$prop` collections across the SFC's @state
/// macros. R1 (template-syntax-v2 round 5, Builder B1): when this is
/// non-empty, the function-form switches to the options-form
/// `defineComponent({ props: { … }, setup: (ctx) => { … } })` shape so the
/// runtime can synthesize observedAttributes + attributeChangedCallback.
fn collect_prop_entries(macros: &[crate::types::StateMacro]) -> Vec<&crate::types::CollectionEntry> {
    let mut out = Vec::new();
    for m in macros {
        if let crate::types::StateMacro::Collection {
            kind: crate::types::CollectionKind::Prop,
            entries,
        } = m
        {
            for e in entries {
                out.push(e);
            }
        }
    }
    out
}

/// Emit the `props: { name: { value, attribute, reflect, converter }, ... }`
/// object literal passed to `defineComponent({ props, setup })`. Per-prop
/// keys are pulled verbatim from the metadata-bag (`default:` is renamed to
/// `value:` so the runtime side reads the same key universally).
///
/// Indent is applied to each top-level prop entry; the surrounding `props: {`
/// + `}` are emitted by the caller.
fn emit_props_config(prop_entries: &[&crate::types::CollectionEntry], indent: &str) -> String {
    use crate::parser::state_macros::meta_get;
    let mut lines: Vec<String> = Vec::new();
    for entry in prop_entries {
        let name = &entry.name;
        // Build the inner `{ value: ..., attribute: ..., reflect: ..., converter: ... }`
        // bag. Order matters only for snapshot stability; this canonical order
        // mirrors the spec sketch in §3.6 of the platform audit.
        let mut bag: Vec<String> = Vec::new();
        // value: comes from `default:` (existing key) per spec §3.6 + the
        // existing $prop entries in the wild (see examples/weather-card.aihu).
        if let Some(default_raw) = meta_get(entry, "default") {
            bag.push(format!("value: {}", default_raw.trim()));
        }
        if let Some(attr_raw) = meta_get(entry, "attribute") {
            bag.push(format!("attribute: {}", attr_raw.trim()));
        }
        if let Some(reflect_raw) = meta_get(entry, "reflect") {
            bag.push(format!("reflect: {}", reflect_raw.trim()));
        }
        if let Some(conv_raw) = meta_get(entry, "converter") {
            bag.push(format!("converter: {}", conv_raw.trim()));
        }
        let bag_str = if bag.is_empty() {
            "{}".to_string()
        } else {
            format!("{{ {} }}", bag.join(", "))
        };
        lines.push(format!("{indent}{name}: {bag_str}"));
    }
    lines.join(",\n")
}

/// Emit the body-side `$prop` shadow declarations
/// (`const <name> = ctx.props.<name>`), hoisted out of `macro_code` so they
/// precede the user's plain @state statements. These are PURE reads of
/// `ctx.props.<name>` — `ctx` is the setup arrow parameter, always in scope at
/// the top of the body — so they have no dependency on `plain_body` or any
/// other `macro_code` line. Hoisting them resolves the temporal-dead-zone
/// (TDZ) crash where a synchronously-running `effect()` (or a const
/// initializer) in @state reads a `$prop` getter before its declaration was
/// emitted. See issue #279 and the Defect-A note at the body-assembly block.
fn emit_prop_bindings(prop_entries: &[&crate::types::CollectionEntry], indent: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    for entry in prop_entries {
        let name = &entry.name;
        lines.push(format!("{indent}const {name} = ctx.props.{name}"));
    }
    if lines.is_empty() {
        String::new()
    } else {
        lines.join("\n") + "\n"
    }
}

// ─── B4 — $aria collection wiring (R5) ───────────────────────────────────────
//
// Lazy-attach: only emitted when the SFC declares `$aria`. Zero overhead for
// SFCs that don't use ARIA. Per spec §3.2: `attachInternals()` is called once,
// then per-key mountEffect calls wire the reactive ARIA properties.

/// ARIA key → ElementInternals IDL property name. Static string values
/// are written once at connect; thunks are wrapped in `mountEffect`.
fn aria_idl_prop(key: &str) -> &'static str {
    match key {
        "role" => "role",
        "label" => "ariaLabel",
        "pressed" => "ariaPressed",
        "expanded" => "ariaExpanded",
        "disabled" => "ariaDisabled",
        "hidden" => "ariaHidden",
        "selected" => "ariaSelected",
        "checked" => "ariaChecked",
        "invalid" => "ariaInvalid",
        "required" => "ariaRequired",
        "level" => "ariaLevel",
        "live" => "ariaLive",
        "controls" => "ariaControls",
        "current" => "ariaCurrent",
        "keyShortcuts" => "ariaKeyShortcuts",
        "modal" => "ariaModal",
        "multiline" => "ariaMultiline",
        "multiSelectable" => "ariaMultiSelectable",
        "orientation" => "ariaOrientation",
        "placeholder" => "ariaPlaceholder",
        "posInSet" => "ariaPosInSet",
        "readOnly" => "ariaReadOnly",
        "roleDescription" => "ariaRoleDescription",
        "setSize" => "ariaSetSize",
        "sort" => "ariaSort",
        "valueMax" => "ariaValueMax",
        "valueMin" => "ariaValueMin",
        "valueNow" => "ariaValueNow",
        "valueText" => "ariaValueText",
        // Any unrecognized key is passed through with "aria" prefix + capitalize.
        _ => "",
    }
}

/// Returns true when `value_raw` looks like a thunk (arrow function `() => ...`
/// or `(args) => ...`). Static string literals like `'button'` are not thunks.
fn is_thunk(value_raw: &str) -> bool {
    let v = value_raw.trim();
    // Starts with `(` followed by `)` => ...  OR starts with a direct `=>`
    // after possibly a param. Common patterns: `() => expr`, `(x) => expr`, `x => expr`.
    v.contains("=>")
}

/// Roles that get auto-keyboard-promotion (Enter+Space activation) per spec §3.2.
const KEYBOARD_ROLES: &[&str] = &["button", "link", "menuitem", "tab"];

/// Roles that require tabindex="0" injection unless already declared.
const FOCUSABLE_ROLES: &[&str] = &[
    "button", "link", "menuitem", "tab",
    "menuitemcheckbox", "menuitemradio", "option", "switch",
    "checkbox", "radio", "slider", "spinbutton", "textbox",
];

/// Native HTML tags that already handle keyboard interaction natively — the
/// auto-keyboard handler is suppressed when the root element is one of these.
const NATIVE_INTERACTIVE_TAGS: &[&str] = &["button", "a", "input", "select", "textarea"];

/// Emit the $aria wiring code for the SFC setup body.
/// Returns (setup_code, needs_mount_effect, tabindex_to_inject_on_root).
/// `needs_mount_effect` indicates whether `mountEffect` must be imported.
/// `tabindex_to_inject` is `Some("0")` when the compiler should add tabindex
/// to the root template element.
fn emit_aria_wiring(
    macros: &[crate::types::StateMacro],
    template_nodes: &[TemplateNode],
) -> (String, bool, bool) {
    use crate::parser::state_macros::running_code;
    use crate::types::{CollectionKind, StateMacro};

    // Find the $aria collection. Distinguish "not present" from "present but empty".
    let has_aria_collection = macros.iter().any(|m| {
        matches!(m, StateMacro::Collection { kind: CollectionKind::Aria, .. })
    });
    if !has_aria_collection {
        return (String::new(), false, false);
    }

    let aria_entries: Vec<&crate::types::CollectionEntry> = macros
        .iter()
        .flat_map(|m| {
            if let StateMacro::Collection { kind: CollectionKind::Aria, entries } = m {
                entries.iter().collect::<Vec<_>>()
            } else {
                Vec::new()
            }
        })
        .collect();

    // Warn on empty collection (spec §3.2: "Empty $aria: {} is a parse warning").
    if aria_entries.is_empty() {
        eprintln!("warning: `$aria: {{}}` is empty — at least one ARIA property should be declared (role, label, etc.)");
        return (String::new(), false, false);
    }

    // Extract the role (static string, stripped of quotes).
    let role_entry = aria_entries.iter().find(|e| e.name == "role");
    let role_raw = role_entry.map(|e| {
        let v = if e.is_wrapped {
            running_code(e).unwrap_or("").to_string()
        } else {
            e.value_raw.clone()
        };
        // Strip surrounding quotes from static string literals.
        v.trim()
            .trim_matches(|c| c == '\'' || c == '"')
            .to_string()
    });
    let role_str = role_raw.as_deref().unwrap_or("");

    // Determine root template element tag and whether tabindex is already declared.
    let (root_tag, root_has_tabindex, root_has_click) = if let Some(first) = template_nodes.first() {
        match first {
            TemplateNode::Element { tag, attrs, .. } => {
                let has_tabindex = attrs.iter().any(|a| match a {
                    Attr::Static { name, .. } => name == "tabindex",
                    Attr::Binding { name, .. } => name == "tabindex",
                    _ => false,
                });
                let has_click = attrs.iter().any(|a| match a {
                    Attr::Macro { name, .. } => {
                        // $on.click={fn} is normalized to Macro { name: "on:click" } by the parser.
                        name == "on:click" || name.starts_with("on:click")
                    }
                    _ => false,
                });
                (tag.clone(), has_tabindex, has_click)
            }
            _ => (String::new(), false, false),
        }
    } else {
        (String::new(), false, false)
    };

    // Determine keyboard promotion eligibility per spec §3.2:
    // - Role must be a keyboard-interactive role (button/link/menuitem/tab).
    // - Root element must NOT be a native interactive element (browser handles keyboard).
    // - The template must declare a $on.click handler (otherwise there's nothing to promote).
    let is_keyboard_role = KEYBOARD_ROLES.contains(&role_str);
    let is_native_interactive = NATIVE_INTERACTIVE_TAGS.contains(&root_tag.to_lowercase().as_str());
    let should_promote_keyboard = is_keyboard_role && !is_native_interactive && root_has_click;

    // Determine tabindex injection.
    let should_inject_tabindex = FOCUSABLE_ROLES.contains(&role_str)
        && !root_has_tabindex
        && !root_tag.is_empty();

    let indent = "  ";
    let mut lines: Vec<String> = Vec::new();
    let mut needs_effect = false;

    // attachInternals — lazy-attach guard (only emitted when $aria is declared).
    lines.push(format!("{indent}if (!this._internals) this._internals = this.attachInternals();"));

    // Emit per-key ARIA wiring.
    for entry in &aria_entries {
        let key = entry.name.as_str();
        // Skip `describedBy` — special case handled below.
        if key == "describedBy" {
            let value = if entry.is_wrapped {
                running_code(entry).unwrap_or("").to_string()
            } else {
                entry.value_raw.clone()
            };
            if is_thunk(value.trim()) {
                needs_effect = true;
                lines.push(format!(
                    "{indent}effect(() => {{ this._internals.ariaDescribedByElements = [this.getRootNode().getElementById(({value})())]; }});",
                    indent = indent, value = value.trim()
                ));
            } else {
                // Static id string.
                let id_str = value.trim().trim_matches(|c| c == '\'' || c == '"');
                lines.push(format!(
                    "{indent}this._internals.ariaDescribedByElements = [this.getRootNode().getElementById('{id_str}')];",
                    indent = indent, id_str = id_str
                ));
            }
            continue;
        }

        let idl_prop = aria_idl_prop(key);
        let idl_prop_name = if idl_prop.is_empty() {
            // Unknown key: capitalize first letter and prefix with "aria".
            let mut chars = key.chars();
            match chars.next() {
                Some(c) => format!("aria{}{}", c.to_uppercase(), chars.as_str()),
                None => format!("aria{}", key),
            }
        } else {
            idl_prop.to_string()
        };

        let value = if entry.is_wrapped {
            running_code(entry).unwrap_or("").to_string()
        } else {
            entry.value_raw.clone()
        };
        let value_trimmed = value.trim();

        // Determine if this is a boolean-cast ARIA property.
        let is_bool_cast = matches!(
            key,
            "pressed" | "expanded" | "disabled" | "hidden" | "selected"
            | "checked" | "invalid" | "required" | "modal" | "multiline"
            | "multiSelectable" | "readOnly"
        );
        let is_number_cast = matches!(key, "level" | "posInSet" | "setSize" | "valueMax" | "valueMin" | "valueNow");

        if is_thunk(value_trimmed) {
            needs_effect = true;
            if is_bool_cast || is_number_cast {
                lines.push(format!(
                    "{indent}effect(() => {{ this._internals.{prop} = String(({value})()); }});",
                    indent = indent, prop = idl_prop_name, value = value_trimmed
                ));
            } else {
                lines.push(format!(
                    "{indent}effect(() => {{ this._internals.{prop} = ({value})(); }});",
                    indent = indent, prop = idl_prop_name, value = value_trimmed
                ));
            }
        } else {
            // Static value — write once at connect.
            let static_val = value_trimmed.to_string();
            lines.push(format!(
                "{indent}this._internals.{prop} = {val};",
                indent = indent, prop = idl_prop_name, val = static_val
            ));
        }
    }

    // Auto-keyboard-promotion (only when role is a keyboard role and root is not native interactive).
    if should_promote_keyboard {
        lines.push(format!(
            "{indent}this.addEventListener('keydown', (e) => {{ if (e.key === 'Enter' || e.key === ' ') {{ e.preventDefault(); this.click(); }} }});",
            indent = indent
        ));
    }

    // root_has_click is used in should_promote_keyboard above.

    (lines.join("\n"), needs_effect, should_inject_tabindex)
}

// ─── D5 — $form collection wiring ────────────────────────────────────────────
//
// Lazy-attach: only emitted when the SFC declares `$form`. Zero overhead for
// SFCs that don't use form-associated APIs. Shares the `attachInternals()`
// singleton guard with `$aria` — when both are declared, only one
// `attachInternals()` call is emitted (the guard pattern handles this).
//
// `static formAssociated = true` is emitted as a class field via the returned
// boolean flag. The setup-body wiring (effects) is returned as a string.

/// Emit the $form wiring code for the SFC setup body.
/// Returns (setup_code, has_form) where `has_form` indicates whether
/// `static formAssociated = true` must be emitted as a class field.
fn emit_form_wiring(macros: &[crate::types::StateMacro]) -> (String, bool) {
    use crate::types::{CollectionKind, StateMacro};

    // Find $form entries. Distinguish "not present" from "present but empty".
    let has_form_collection = macros.iter().any(|m| {
        matches!(m, StateMacro::Collection { kind: CollectionKind::Form, .. })
    });
    if !has_form_collection {
        return (String::new(), false);
    }

    let form_entries: Vec<&crate::types::CollectionEntry> = macros
        .iter()
        .filter_map(|m| {
            if let StateMacro::Collection { kind: CollectionKind::Form, entries } = m {
                Some(entries.iter())
            } else {
                None
            }
        })
        .flatten()
        .collect();

    if form_entries.is_empty() {
        return (String::new(), true);
    }

    let indent = "  ";
    let mut lines: Vec<String> = Vec::new();

    // attachInternals guard — lazy-attach (shared with $aria).
    lines.push(format!("{indent}if (!this._internals) this._internals = this.attachInternals();"));

    // Emit per-entry wiring.
    for entry in &form_entries {
        let value = if entry.is_wrapped {
            crate::parser::state_macros::running_code(entry)
                .unwrap_or("")
                .to_string()
        } else {
            entry.value_raw.clone()
        };
        let expr = value.trim();

        match entry.name.as_str() {
            "value" => {
                if is_thunk(expr) {
                    lines.push(format!(
                        "{indent}effect(() => {{ this._internals.setFormValue(({expr})()); }});",
                        indent = indent, expr = expr
                    ));
                } else {
                    lines.push(format!(
                        "{indent}effect(() => {{ this._internals.setFormValue({expr}); }});",
                        indent = indent, expr = expr
                    ));
                }
            }
            "validity" => {
                lines.push(format!(
                    "{indent}effect(() => {{ const _fv = {expr}; const _fk = _fv && Object.keys(_fv); this._internals.setValidity(_fk && _fk.length ? _fv : {{}}); }});",
                    indent = indent, expr = expr
                ));
            }
            _ => {} // already rejected in parse
        }
    }

    (lines.join("\n"), true)
}

// ─── Function form (no agent block) ──────────────────────────────────────────

fn emit_function_form(
    unit: &CompileUnit,
    tag_name: &str,
    agent: Option<&AgentBlock>,
    extract: &crate::extract::ResolvedExtract,
    // GX P3 — when true (server build, non-agent component) the plain function
    // form emits the standalone-SSR shape: hoisted setup const, DOM-gated
    // registration, `export default __ssr`. See the caller in `emit()`.
    ssr_entry: bool,
) -> String {
    let raw_script = unit.source.script.unwrap_or("");

    // @agent `input` declarations lower to per-instance coercion bindings over
    // `ctx.attrs.<name>` (number/boolean/enum → `computed(...)`; string →
    // destructure). They are emitted from the legacy `emit_agent_bindings` so the
    // unified path keeps byte-identical input semantics. `agent_inputs` is empty
    // for non-@agent components (zero overhead).
    let agent_input_bindings = agent.map(emit_agent_bindings).unwrap_or_default();
    let agent_attrs: Vec<String> = agent
        .map(|a| a.inputs.iter().map(|i| format!("'{}'", i.name)).collect())
        .unwrap_or_default();
    let agent_needs_computed = agent.is_some_and(|a| {
        a.inputs.iter().any(|i| {
            matches!(
                i.kind,
                InputKind::Number | InputKind::Boolean | InputKind::Enum(_)
            )
        })
    });

    // Process state macros first (updates signal_map with computed names)
    let mut signal_map = crate::codegen::signals::resolve_signals(raw_script);
    let (mut si, macros, plain_body, user_imports, state_names) =
        process_state_body(raw_script, &mut signal_map);
    // @agent number/boolean/enum inputs lower to `computed(...)` coercions, so
    // ensure `computed` is imported even when no $computed macro requested it.
    if agent_needs_computed {
        si.needs_computed = true;
    }

    // B3b — rewrite `$emit.<name>(payload)` → `dispatchEvent(new CustomEvent(...))`
    // before any downstream emit walks the template AST. Operates on a
    // working clone of the AST so the immutable `unit` reference is preserved.
    let event_names = collect_event_names(&macros);
    let mut template_owned: Vec<TemplateNode> = unit
        .template_ast
        .as_deref()
        .map(|n| {
            let mut cloned: Vec<TemplateNode> = n.to_vec();
            apply_emit_lowering_nodes(&mut cloned, &event_names);
            cloned
        })
        .unwrap_or_default();

    // B4 — $aria wiring. Collect entries and determine tabindex injection before
    // template_nodes is borrowed for emit_nodes.
    let (aria_wiring, _aria_needs_effect, aria_inject_tabindex) =
        emit_aria_wiring(&macros, &template_owned);

    // D5 — $form wiring. Lazy: only emitted when $form is declared.
    let (form_wiring_raw, has_form) = emit_form_wiring(&macros);
    // If $aria is already declared, it emits the attachInternals guard; suppress
    // the duplicate guard from $form by stripping it when both are present.
    let form_wiring = if has_form && !aria_wiring.is_empty() {
        // The aria wiring already emitted the guard; strip the guard line from form_wiring.
        let guard = "  if (!this._internals) this._internals = this.attachInternals();";
        form_wiring_raw
            .lines()
            .filter(|l| l.trim() != guard.trim())
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        form_wiring_raw
    };

    // B4 — tabindex injection: if $aria says we need tabindex="0" on the root
    // element and it's not already declared, inject it into the first element node.
    if aria_inject_tabindex {
        if let Some(TemplateNode::Element { attrs, .. }) = template_owned.first_mut() {
            attrs.push(Attr::Static {
                name: "tabindex".to_string(),
                value: "0".to_string(),
            });
        }
    }

    let template_nodes: &[TemplateNode] = &template_owned;
    let helpers_needed = collect_needed_helpers(template_nodes);

    // arch-5 M1: scan action bodies for $announce(...) so we can request
    // the runtime import alias and rewrite call sites in emit_state_macro_code.
    let a11y_announce_used = macros.iter().any(|m| match m {
        crate::types::StateMacro::Collection {
            kind: crate::types::CollectionKind::Action,
            entries,
        } => entries.iter().any(|e| {
            crate::parser::state_macros::running_code(e)
                .map(|s| s.contains("$announce("))
                .unwrap_or(false)
        }),
        _ => false,
    });
    let mut helpers_needed = helpers_needed;
    helpers_needed.a11y_announce = a11y_announce_used;

    // D5 — $form wiring always uses `effect`; include in the effect flag.
    let form_needs_effect = has_form && !form_wiring.is_empty();

    let imports = build_function_imports(
        &signal_map,
        // B4 — OR in aria's effect requirement so `effect` is imported when
        // $aria thunks are declared (even if no other effect is needed).
        // D5 — OR in form's effect requirement similarly.
        helpers_needed.needs_effect || _aria_needs_effect || form_needs_effect,
        raw_script,
        &si,
        helpers_needed.each_boundary,
        &helpers_needed,
    );
    // W3: the emitter's rewrite front-end follows the unit's `--expr-parser`
    // mode (Legacy = byte-identical token pipeline; Ast = scope-aware oxc
    // rewrite).
    let return_expr = emit_nodes(
        template_nodes,
        &signal_map,
        &state_names,
        "    ",
        unit.expr_parser,
    );

    // R1 — when `$prop` entries exist, switch to the options-form
    // `defineComponent({ props, setup })` so the runtime can synthesize
    // observedAttributes + attributeChangedCallback. Otherwise stay in the
    // bare-arrow function form (smaller emit; no behavioral diff).
    //
    // (GX P3: computed BEFORE the style block below so `ssr_standalone` can
    // gate the style emission — the ordering is data-independent; style code
    // reads only `unit.source.style`.)
    let prop_entries = collect_prop_entries(&macros);
    // @agent inputs require the options-form shape too (they read `ctx.attrs`),
    // so an @agent component with inputs but no $prop still switches to options
    // form and declares an `attrs: [...]` array.
    let has_agent_inputs = !agent_attrs.is_empty();
    let uses_props = !prop_entries.is_empty();
    // §9.4 recipe class-extension: `$extends: Ident` → `base: Ident` in the
    // options-form; `$shadow: mode` → a `// @aihu:shadow <mode>` marker the
    // Vite plugin reads. A `$extends` recipe always carries `$prop`s, but force
    // the options-form regardless so `base` has somewhere to live.
    let extends_base: Option<&str> = macros.iter().find_map(|m| match m {
        crate::types::StateMacro::Extends { base } => Some(base.as_str()),
        _ => None,
    });
    let shadow_mode: Option<&str> = macros.iter().find_map(|m| match m {
        crate::types::StateMacro::Shadow { mode } => Some(mode.as_str()),
        _ => None,
    });
    let uses_options_form = uses_props || has_agent_inputs || extends_base.is_some();
    let uses_ctx = uses_options_form;

    // GX P3 — the standalone-SSR shape applies only to the plain function form
    // (no $prop/attrs config, no form-associated suffix). $form components
    // keep today's server emission until the stubbed server SetupContext grows
    // form-internals support.
    let ssr_standalone = ssr_entry && !uses_options_form && !has_form;

    // GX P4 (#466, P3 item 2) — the options-form standalone-SSR shape: a
    // non-agent `$prop` component (the loader-route case — `$prop route` is
    // how a page receives `route.data`) also emits a hoisted setup + gated
    // registration + `__ssr` entry, with the DECLARED props threaded through
    // a host-less SetupContext (`__ssr(props)` wraps each value as an inert
    // PropSignal-shaped getter). Exclusions, deliberately narrow:
    //   - `$form` — form-internals have no server stub;
    //   - `$extends` — evaluating a custom base class touches HTMLElement at
    //     module scope in the BASE module, which this gate cannot reach;
    //   - agent inputs — agent components are excluded from `ssr_entry`
    //     already (their `inject_server_binding_registration` string-surgery
    //     anchors on the legacy shape); the `!has_agent_inputs` term is a
    //     belt-and-suspenders restatement of that exclusion.
    let ssr_options = ssr_entry
        && uses_options_form
        && !has_form
        && extends_base.is_none()
        && !has_agent_inputs;
    let ssr_no_dom = ssr_standalone || ssr_options;

    // Styles never reach server HTML (`renderToString` walks the arbor tree
    // only), and the style block is the module-scope DOM dependency that makes
    // a compiled artifact un-importable in plain Node/Bun (`new
    // CSSStyleSheet()` + `document.adoptedStyleSheets`). Gate it OUT of the
    // standalone-SSR artifacts entirely.
    let (module_decl, style_injection) = if ssr_no_dom {
        (String::new(), String::new())
    } else if let Some(style) = &unit.source.style {
        let (decl, injection) = emit_style_block(style);
        (decl, format!("  {}\n", injection))
    } else {
        (String::new(), String::new())
    };

    // `ctx` is only needed for the style injection (`ctx.host`) or the
    // options-form config reads; the SSR artifact drops the style injection,
    // so it falls back to `_ctx` when nothing else needs the context.
    let ctx_param = if uses_ctx || (!ssr_no_dom && unit.source.style.is_some()) {
        "ctx"
    } else {
        "_ctx"
    };

    let (macro_code, needs_prop_upd_helper) = emit_state_macro_code(&macros, &signal_map);
    let helpers_decl = emit_boundary_helpers(&helpers_needed);
    // CO1 §4.5: the `++`/`--` ToNumeric helper, declared once per component and
    // ONLY when some emitted form actually calls it. `cookbook/aihu-counter`
    // takes the inline fast path, so it never loads this.
    let prop_upd_decl = if needs_prop_upd_helper {
        format!("  {}\n", crate::expr::UPDATE_HELPER_DECL)
    } else {
        String::new()
    };

    let body = {
        let mut b = String::new();
        b.push_str(&style_injection);
        // arch-5 M1: inject sr-only / skip-link CSS once when the template uses
        // <$visuallyHidden> or <$skipLink>. Idempotent; cost is trivially small.
        if helpers_needed.a11y_styles {
            b.push_str("  _ensureA11yStyles()\n");
        }
        // issue #279: $prop body bindings (`const <name> = ctx.props.<name>`) are
        // hoisted ABOVE plain_body. They are pure reads of the already-bound
        // `ctx.props.<name>` (ctx is the setup arrow parameter, always in scope at
        // the top of the body) and have ZERO dependency on plain_body or any
        // macro_code line, so hoisting them cannot break the Defect-A capture
        // invariant below. Hoisting fixes both the raw `effect(() => f(prop()))`
        // case (#279) and the Bug 8 const-initializer TDZ, because the prop getter
        // is now declared before any synchronously-running @state statement reads
        // it. The binding is no longer emitted from emit_state_macro_code.
        // CO1: declared above the prop bindings that its call sites close
        // over. `const` in the same body scope; every caller is a function
        // invoked later, so there is no TDZ hazard.
        b.push_str(&prop_upd_decl);
        let prop_bindings = emit_prop_bindings(&prop_entries, "  ");
        if !prop_bindings.is_empty() {
            b.push_str(&prop_bindings);
            b.push('\n');
        }
        // @agent input coercions (`const mode = computed(() => ...)`) are hoisted
        // alongside prop bindings — pure reads of `ctx.attrs.<name>`, declared
        // before any synchronously-running @state statement that references them.
        // `emit_agent_bindings` emits 4-space indent (legacy options-form);
        // re-indent to the 2-space function-form body.
        if !agent_input_bindings.is_empty() {
            for line in agent_input_bindings.lines() {
                if line.trim().is_empty() {
                    b.push('\n');
                } else {
                    b.push_str(&format!("  {}\n", line.trim_start()));
                }
            }
        }
        // R2 (Defect A): state declarations (plain_body) MUST precede the rest of
        // macro_code because `effect(...)` / `onMount(...)` / `onCleanup(...)`
        // registrations capture state variables by lexical reference. effect()
        // runs its callback synchronously once at registration time to track
        // dependencies; if the referenced state has not been declared yet
        // (whether `const` or `let`), the access hits the temporal dead zone and
        // throws ReferenceError. Action functions are also emitted from
        // macro_code; while `function` declarations are hoisted, calls to them
        // from inside effect/onMount closures still trip TDZ when reaching the
        // captured state vars. (Prop bindings are exempt — see the hoist above.)
        if !plain_body.is_empty() {
            b.push_str(&plain_body);
            b.push_str("\n\n");
        }
        if !macro_code.is_empty() {
            b.push_str(&macro_code);
        }
        // B4 — $aria wiring (lazy: only emitted when $aria is declared).
        if !aria_wiring.is_empty() {
            b.push_str(&aria_wiring);
            b.push('\n');
        }
        // D5 — $form wiring (lazy: only emitted when $form is declared).
        if !form_wiring.is_empty() {
            b.push_str(&form_wiring);
            b.push('\n');
        }
        b.push_str(&format!("  return {}\n", return_expr));
        b
    };

    // Merge user-lifted imports into the framework imports block, deduping
    // against framework-emitted bindings from the same source. ES modules forbid
    // re-binding an identifier (`import { signal } from 'x'` twice is a
    // SyntaxError), so we union named-import sets per source.
    let mut merged_imports = merge_imports(&imports, &user_imports);

    // GX Phase 1 (#437-GX) — the shadow-adjacent extract marker, artifact 1 of
    // the three-way fan-out (spec §2.4). Emitted for every server/universal
    // build (the resolved default included) so the recorded posture is
    // explicit in every artifact, never implied by absence. Read by the Vite
    // plugin's per-file seam — Phase 1 uses it only for the build census;
    // Phase 4 (E2) will use it for governed chunk routing.
    //
    // NOT emitted for `BuildTarget::Client`: the marker is POLICY (a scope
    // name is a `$scope` value in another position), and policy never reaches
    // client artifacts — the same gate that elides `__agentBinding` and the
    // manifest (T1-b: client output must contain no scope/rateLimit bytes).
    //
    // Prepended FIRST so the `$shadow` marker (when present) keeps its
    // documented position as the file's leading line.
    if unit.target != BuildTarget::Client {
        merged_imports = format!("{}\n{}", extract.marker_line(), merged_imports);
    }

    // §9.4 per-file shadow mode: prepend a `// @aihu:shadow <mode>` marker the
    // Vite plugin reads to override its global shadowMode (drives both shadow
    // attachment and the css-engine light-DOM fold). Leading comment — survives
    // the downstream HMR/island passes untouched.
    //
    // DA4 (#437, the ratified flip): when the author did NOT pin `$shadow` and
    // the unit is a PAGE (`@route` block present), emit the DISTINCT
    // default-marker token `// @aihu:shadow-default light` instead. Pages
    // default to light DOM so server-rendered content is reachable by non-JS
    // crawlers. The token is deliberately NOT the pin marker: the Vite plugin
    // ranks it BELOW an explicit plugin-global `shadowMode` config (pin >
    // plugin-global > page/layout default 'light' > leaf default 'shadow'),
    // whereas the pin marker outranks everything. Layout SFCs carry no
    // `@route` block — the compiler cannot see layout-ness — so the plugin's
    // `_isLayoutFile` applies the same 'light' default on its side.
    if let Some(mode) = shadow_mode {
        merged_imports = format!("// @aihu:shadow {}\n{}", mode, merged_imports);
    } else if unit.source.route.is_some() {
        merged_imports = format!("// @aihu:shadow-default light\n{}", merged_imports);
    }

    // D5 — $form: `static formAssociated = true` must be set on the returned
    // component class so the browser recognises the element as form-associated.
    // We emit it as a post-define static property assignment on the class.
    let form_associated_suffix = if has_form {
        format!(
            "// form-associated custom element (D5)\n_aihuFormEl_{tag_name}.formAssociated = true\n",
            tag_name = tag_name.replace('-', "_")
        )
    } else {
        String::new()
    };

    if uses_options_form {
        // R1 options-form. Emit `[attrs: [...],] [props: { ... },]` config, then
        // the setup arrow. @agent inputs contribute an `attrs:` array (consumed by
        // `ctx.attrs.<name>`); $prop entries contribute the `props:` config. Both
        // can coexist (`defineComponent` builds attrSignals + propSignals).
        let mut config_lines: Vec<String> = Vec::new();
        // §9.4 — `base: <Ident>` first so the runtime extends the named
        // primitive instead of HTMLElement. The identifier is a user import
        // hoisted into the module by merge_imports.
        if let Some(base) = extends_base {
            config_lines.push(format!("  base: {},", base));
        }
        if has_agent_inputs {
            config_lines.push(format!("  attrs: [{}] as const,", agent_attrs.join(", ")));
        }
        if uses_props {
            let props_block = emit_props_config(&prop_entries, "    ");
            config_lines.push(format!("  props: {{\n{}\n  }},", props_block));
        }
        let config_block = config_lines.join("\n");
        if ssr_options {
            // GX P4 (#466, P3 item 2) — options-form standalone-SSR artifact.
            // Same three structural moves as the P3 plain-form shape (hoisted
            // setup, DOM-gated registration, `export default __ssr`), plus
            // prop threading: `__ssr(props)` receives PLAIN values (the
            // router's governed loader passes `{ route: { params, data } }`)
            // and wraps each DECLARED prop as an inert PropSignal-shaped
            // getter (callable, `.set` no-op), so the setup body's
            // `ctx.props.<name>` reads and the template's rewritten
            // `<name>()` calls behave exactly as client-side. A declared
            // `default:` applies when the caller omits the prop, mirroring
            // the runtime's `def.value` fallback.
            let ssr_prop_fields: Vec<String> = prop_entries
                .iter()
                .map(|entry| {
                    let default_suffix = crate::parser::state_macros::meta_get(entry, "default")
                        .map(|d| format!(" ?? {}", d.trim()))
                        .unwrap_or_default();
                    format!(
                        "{name}: __aihu_ssr_prop(props.{name}{suffix})",
                        name = entry.name,
                        suffix = default_suffix
                    )
                })
                .collect();
            format!(
                "{merged_imports}\n\n{helpers_decl}const __aihu_setup__ = ({ctx_param}) => {{\n{body}}}\n\n// DOM registration — side-effect only where custom elements exist (browser\n// or a DOM-shimmed host); a plain Node/Bun SSR import skips it.\nif (typeof HTMLElement !== 'undefined' && typeof customElements !== 'undefined') {{\n  defineElement('{tag_name}', defineComponent({{\n{config_block}\n  setup: __aihu_setup__,\n  }}))\n}}\n\n/** SSR entry (GX P4) — standalone arbor-tree factory with prop threading.\n * Host-less server SetupContext: no element, no shadow root; lifecycle\n * registration is not reachable from here (server render never mounts).\n * `props` values arrive plain (e.g. `{{ route: {{ params, data }} }}`) and are\n * wrapped as inert PropSignal-shaped getters — reads work, writes no-op. */\nconst __aihu_ssr_prop = (v: unknown) => Object.assign(() => v, {{ set: (_v: unknown) => {{}} }})\nexport const __ssr = (props: Record<string, unknown> = {{}}) => __aihu_setup__({{ host: null, element: null, attrs: {{}}, props: {{ {ssr_props} }} }})\nexport default __ssr\n",
                merged_imports = merged_imports,
                helpers_decl = helpers_decl,
                ctx_param = ctx_param,
                body = body,
                tag_name = tag_name,
                config_block = config_block,
                ssr_props = ssr_prop_fields.join(", "),
            )
        } else if has_form {
            format!(
                "{merged_imports}\n\n{module_decl}{helpers_decl}const _aihuFormEl_{tvar} = defineElement('{tag_name}', defineComponent({{\n{config_block}\n  setup: ({ctx_param}) => {{\n{body}  }},\n}}))\n{form_associated_suffix}",
                merged_imports = merged_imports,
                module_decl = module_decl,
                helpers_decl = helpers_decl,
                tvar = tag_name.replace('-', "_"),
                tag_name = tag_name,
                config_block = config_block,
                ctx_param = ctx_param,
                body = body,
                form_associated_suffix = form_associated_suffix,
            )
        } else {
            format!(
                "{}\n\n{}{}{}defineElement('{}', defineComponent({{\n{}\n  setup: ({}) => {{\n{}  }},\n}}))\n",
                merged_imports,
                module_decl,
                helpers_decl,
                "",
                tag_name,
                config_block,
                ctx_param,
                body
            )
        }
    } else if has_form {
        format!(
            "{merged_imports}\n\n{module_decl}{helpers_decl}const _aihuFormEl_{tvar} = defineElement('{tag_name}', defineComponent(({ctx_param}) => {{\n{body}}}))\n{form_associated_suffix}",
            merged_imports = merged_imports,
            module_decl = module_decl,
            helpers_decl = helpers_decl,
            tvar = tag_name.replace('-', "_"),
            tag_name = tag_name,
            ctx_param = ctx_param,
            body = body,
            form_associated_suffix = form_associated_suffix,
        )
    } else if ssr_standalone {
        // GX P3 — standalone-SSR server artifact. Three structural changes vs.
        // the client shape (which stays byte-identical — this branch is
        // `--target server` only):
        //
        //  1. Setup is hoisted to a named module const so it is reachable
        //     WITHOUT constructing a custom element (the client shape traps it
        //     inside `defineComponent`'s class closure, reachable only via
        //     `connectedCallback`/`_build`).
        //  2. The `defineElement` registration — whose `defineComponent` call
        //     evaluates `class extends HTMLElement` — is gated behind a
        //     DOM-globals check, so the module evaluates in plain Node/Bun
        //     (no DOM shim) while a DOM-shimmed host still registers the
        //     element exactly as before.
        //  3. `export const __ssr` / `export default` expose a host-less
        //     arbor-tree factory: the `ComponentDescription` shape
        //     (`() => arborTree`) that `@aihu/server`'s `renderToString` /
        //     `renderToStream` accept and `@aihu/app`'s `resolveComponent`
        //     finds as `mod.default`. The stub SetupContext carries no host
        //     element and empty attr/prop maps — sufficient for the plain
        //     function form, which never reads them (props/attrs force the
        //     options-form, excluded from this branch).
        format!(
            "{merged_imports}\n\n{helpers_decl}const __aihu_setup__ = ({ctx_param}) => {{\n{body}}}\n\n// DOM registration — side-effect only where custom elements exist (browser\n// or a DOM-shimmed host); a plain Node/Bun SSR import skips it.\nif (typeof HTMLElement !== 'undefined' && typeof customElements !== 'undefined') {{\n  defineElement('{tag_name}', defineComponent(__aihu_setup__))\n}}\n\n/** SSR entry (GX P3) — standalone arbor-tree factory. Host-less server\n * SetupContext: no element, no shadow root; lifecycle registration is not\n * reachable from here (server render never mounts). */\nexport const __ssr = () => __aihu_setup__({{ host: null, element: null, attrs: {{}}, props: {{}} }})\nexport default __ssr\n",
            merged_imports = merged_imports,
            helpers_decl = helpers_decl,
            ctx_param = ctx_param,
            body = body,
            tag_name = tag_name,
        )
    } else {
        format!(
            "{}\n\n{}{}{}defineElement('{}', defineComponent(({}) => {{\n{}}}))\n",
            merged_imports, module_decl, helpers_decl, "", tag_name, ctx_param, body
        )
    }
}

/// Parsed shape of a single ES-module import statement, used by `merge_imports`
/// to deduplicate named bindings across framework + user imports.
#[derive(Debug, Clone)]
struct ParsedImport {
    /// `import type { ... }` — kept separate from value imports because TS allows
    /// a value import and a type import from the same source to coexist.
    type_only: bool,
    source: String,
    /// Named-import specifiers as authored (e.g., `signal`, `announce as __a`).
    names: Vec<String>,
    /// Verbatim original line for non-named-import shapes (default, namespace,
    /// side-effect, or anything we don't fully parse). When set, `names` is
    /// ignored and the original line is emitted as-is.
    raw_passthrough: Option<String>,
}

/// Parse a single import statement. Returns `None` for non-import lines (blank,
/// comment) which the caller should drop. Unknown shapes are returned with
/// `raw_passthrough` so we never silently corrupt imports we don't understand.
fn parse_import_line(line: &str) -> Option<ParsedImport> {
    let trimmed = line.trim();
    if trimmed.is_empty() || !trimmed.starts_with("import") {
        return None;
    }
    // Find the `from 'source'` clause (single or double quotes).
    let (rest, source) = {
        let from_idx = trimmed.rfind(" from ")?;
        let after_from = trimmed[from_idx + 6..].trim().trim_end_matches(';').trim();
        let s = after_from
            .strip_prefix('\'')
            .and_then(|s| s.strip_suffix('\''))
            .or_else(|| after_from.strip_prefix('"').and_then(|s| s.strip_suffix('"')))?;
        (trimmed[..from_idx].trim(), s.to_string())
    };
    let (head, type_only) = if let Some(h) = rest.strip_prefix("import type ") {
        (h.trim(), true)
    } else if let Some(h) = rest.strip_prefix("import ") {
        (h.trim(), false)
    } else {
        return Some(ParsedImport {
            type_only: false,
            source,
            names: Vec::new(),
            raw_passthrough: Some(line.to_string()),
        });
    };
    if let Some(inner) = head.strip_prefix('{').and_then(|s| s.strip_suffix('}')) {
        let names: Vec<String> = inner
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        return Some(ParsedImport { type_only, source, names, raw_passthrough: None });
    }
    Some(ParsedImport {
        type_only,
        source,
        names: Vec::new(),
        raw_passthrough: Some(line.to_string()),
    })
}

/// Merge framework-emitted imports with user-lifted imports, deduping named
/// bindings per (source, type_only) bucket. Preserves original framework
/// ordering; user imports for unseen sources are appended after framework ones.
fn merge_imports(framework: &str, user: &[String]) -> String {
    // Parse framework imports line-by-line, preserving ordering.
    let mut buckets: Vec<ParsedImport> = Vec::new();
    let mut bucket_idx: std::collections::HashMap<(String, bool), usize> =
        std::collections::HashMap::new();

    let push = |imp: ParsedImport,
                    buckets: &mut Vec<ParsedImport>,
                    bucket_idx: &mut std::collections::HashMap<(String, bool), usize>| {
        if imp.raw_passthrough.is_some() || imp.names.is_empty() {
            buckets.push(imp);
            return;
        }
        let key = (imp.source.clone(), imp.type_only);
        if let Some(&i) = bucket_idx.get(&key) {
            for n in &imp.names {
                if !buckets[i].names.iter().any(|x| x == n) {
                    buckets[i].names.push(n.clone());
                }
            }
        } else {
            bucket_idx.insert(key, buckets.len());
            buckets.push(imp);
        }
    };

    for line in framework.lines() {
        if let Some(imp) = parse_import_line(line) {
            push(imp, &mut buckets, &mut bucket_idx);
        }
    }

    // User imports may span multiple lines per statement (already joined by
    // process_state_body with `\n`). Collapse multi-line statements onto a
    // single line before parsing so the regex-y parser above sees them whole.
    for user_stmt in user {
        let collapsed: String = user_stmt
            .split('\n')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        if let Some(imp) = parse_import_line(&collapsed) {
            push(imp, &mut buckets, &mut bucket_idx);
        }
    }

    // Re-emit.
    let mut out: Vec<String> = Vec::new();
    for b in buckets {
        if let Some(raw) = b.raw_passthrough {
            out.push(raw);
        } else if b.names.is_empty() {
            // No-op import (shouldn't occur via the framework), skip.
            continue;
        } else {
            let kw = if b.type_only { "import type" } else { "import" };
            out.push(format!("{} {{ {} }} from '{}'", kw, b.names.join(", "), b.source));
        }
    }
    out.join("\n")
}

fn build_function_imports(
    signal_map: &SignalMap,
    needs_effect: bool,
    script: &str,
    si: &StateImports,
    needs_each: bool,
    helpers: &NeededHelpers,
) -> String {
    let script_uses_effect = script.contains("effect(");
    // arch-5 M1: routing helpers (`<$link>`, `<$outlet>`, `<$navigate>`)
    // emit `effect()` calls inside their boundaries, so ensure `effect` is imported.
    let helper_effect = helpers.link_element || helpers.outlet_element;
    let emit_effect =
        needs_effect || script_uses_effect || si.needs_effect_for_macros || helper_effect;

    // Arbor imports — `when` / `each` are arbor's exported reactive structural
    // constructors. They MUST be imported (not inlined) because the published
    // arbor bundle uses oxc-minify with property mangling; synthesizing the
    // structural node literally with `structuralKind: 'list'` would mismatch
    // the mangled `t.sk` reads in the bundled reconciler. R5 (Defect E).
    let mut arbor_names: Vec<&str> = vec!["branch", "leaf", "slot"];
    if helpers.if_boundary {
        arbor_names.push("when");
    }
    if needs_each || helpers.each_boundary {
        arbor_names.push("each");
    }
    let mut lines: Vec<String> = vec![format!(
        "import {{ {} }} from '@aihu/arbor'",
        arbor_names.join(", ")
    )];

    // Signals imports
    if !signal_map.0.is_empty() {
        lines.push("import type { Signal } from '@aihu/signals'".to_string());
        let mut sig_items: Vec<&str> = vec!["signal"];
        if si.needs_computed { sig_items.push("computed"); }
        if emit_effect { sig_items.push("effect"); }
        if si.needs_batch { sig_items.push("batch"); }
        lines.push(format!("import {{ {} }} from '@aihu/signals'", sig_items.join(", ")));
    } else {
        // No signals in map, but may still need computed/effect/batch
        let mut sig_items: Vec<&str> = Vec::new();
        if si.needs_computed { sig_items.push("computed"); }
        if emit_effect { sig_items.push("effect"); }
        if si.needs_batch { sig_items.push("batch"); }
        if !sig_items.is_empty() {
            lines.push("import type { Signal } from '@aihu/signals'".to_string());
            lines.push(format!("import {{ {} }} from '@aihu/signals'", sig_items.join(", ")));
        }
    }

    // Runtime imports — onMount/onCleanup are also required by router boundary
    // helpers (which call them at component setup time).
    let mut rt_items: Vec<String> =
        vec!["defineComponent".to_string(), "defineElement".to_string()];
    let needs_on_mount_for_router =
        helpers.router_element || helpers.link_element || helpers.outlet_element || helpers.navigate_element;
    let needs_on_cleanup_for_router = helpers.router_element || helpers.outlet_element;
    if si.needs_on_mount || needs_on_mount_for_router || helpers.needs_on_mount_for_directives { rt_items.push("onMount".to_string()); }
    if si.needs_on_cleanup || needs_on_cleanup_for_router { rt_items.push("onCleanup".to_string()); }
    // R2 (Director r6 §3): $lifecycle four-callback extension imports.
    if si.needs_on_adopt { rt_items.push("onAdopt".to_string()); }
    if si.needs_on_attribute_change { rt_items.push("onAttributeChange".to_string()); }
    // v0.4.0 — `$stream` lazy-attach: only import createStream when used.
    if si.needs_create_stream { rt_items.push("createStream".to_string()); }
    // `$resource` (plain, non-magna) lowers to `createResource()` — import it
    // from `@aihu/runtime` (parallel to createStream). Was set but never pushed,
    // so `$resource` emitted a bare `createResource` ReferenceError.
    if si.needs_create_resource { rt_items.push("createResource".to_string()); }
    // arch-5 M1 a11y imports — RFC-A5-017..021. Each is feature-flagged so
    // SFCs that don't use a11y primitives import nothing extra.
    if helpers.a11y_focus_trap {
        rt_items.push("createFocusTrap".to_string());
    }
    if helpers.a11y_styles {
        rt_items.push("_ensureA11yStyles".to_string());
    }
    if helpers.a11y_announce {
        rt_items.push("announce as __a11y_announce".to_string());
    }
    lines.push(format!("import {{ {} }} from '@aihu/runtime'", rt_items.join(", ")));

    // arch-5 M1: namespace import for @aihu/router when `$route`,
    // `$beforeNavigate`, `$afterNavigate`, or any of `<$router>`,
    // `<$link>`, `<$outlet>`, `<$navigate>` are used.
    let needs_router_ns = si.needs_aihu_router
        || helpers.router_element
        || helpers.link_element
        || helpers.outlet_element
        || helpers.navigate_element;
    if needs_router_ns {
        lines.push("import * as __aihuRouter from '@aihu/router'".to_string());
    }

    // arch-3 M2 (RFC-003): magna `$query` / magna-origin `$resource` lower to
    // `createMagnaResource(inject(MagnaFetchToken), ...)`. Emit the magna +
    // context imports. Bare `@aihu/magna` specifier (G7 entry-split not landed;
    // forward-compatible with the future browser `.` entry).
    //
    // B5/O2: `$context` lowers to `provide`/`inject`/`contextKey` calls, which
    // also come from `@aihu/context`. Collect the needed names and emit exactly
    // ONE `@aihu/context` import line — two separate imports would double-bind
    // `inject` when magna and `$context` coexist.
    if si.needs_create_magna_resource {
        lines.push(
            "import { createMagnaResource, MagnaFetchToken } from '@aihu/magna'".to_string(),
        );
    }
    let ctx_items: &[&str] = match (si.needs_context, si.needs_create_magna_resource) {
        (true, _) => &["provide", "inject", "contextKey"],
        (false, true) => &["inject"],
        (false, false) => &[],
    };
    if !ctx_items.is_empty() {
        lines.push(format!("import {{ {} }} from '@aihu/context'", ctx_items.join(", ")));
    }

    // arch-3 M2 / A3 G2 (RFC-001): `$auth.*` lowers to `useCurrentUser()`,
    // the existing client reactive getter exported from `@aihu/auth` root.
    if si.needs_use_current_user {
        lines.push("import { useCurrentUser } from '@aihu/auth'".to_string());
    }

    lines.join("\n")
}

// ─── HTML entity decoding ─────────────────────────────────────────────────────

fn decode_html_entities(s: &str) -> String {
    s.replace("&larr;", "←")
     .replace("&rarr;", "→")
     .replace("&uarr;", "↑")
     .replace("&darr;", "↓")
     .replace("&lArr;", "⇐")
     .replace("&rArr;", "⇒")
     .replace("&nbsp;", "\u{00A0}")
     .replace("&amp;", "&")
     .replace("&lt;", "<")
     .replace("&gt;", ">")
     .replace("&quot;", "\"")
     .replace("&apos;", "'")
     .replace("&mdash;", "—")
     .replace("&ndash;", "–")
     .replace("&hellip;", "…")
     .replace("&copy;", "©")
     .replace("&reg;", "®")
}


/// v0.3.0 — Emit the `__agentBinding` named export for server artifacts.
///
/// This export is appended to the component setup code and enables the
/// `@aihu/agent-service` runtime to wire up a `LiveBinding` for each mounted
/// instance. The shape is specified in RFC §3 and must be kept in sync with
/// the `LiveBinding` interface in `packages/arbor/src/mount.ts`.
///
/// Security: the `elide_agent` gate in `emit()` ensures this export is NEVER
/// included in client artifacts. [SECURITY] Amendment 7 §6.11 requires a
/// `[SECURITY]` compiler warning when `$scope` is declared and `@aihu/auth`
/// is absent (always-warn in v0.3.0).
/// Exposed agent members collected from the `@state` collections of an SFC.
///
/// This is the single source of truth shared by the SERVER `__agentBinding`
/// export (`emit_agent_binding_export`) and the CLIENT opaque-ID dispatcher
/// (`emit_agent_client_dispatcher`). Both walk the exact same `@state` expose
/// metadata, so the set of action/read/write member names is identical between
/// the two artifacts — which is what lets the server-side allowlist match the
/// opaque IDs the client dispatcher exposes.
///
/// Only member NAMES are collected here (no policy: no scope, no rateLimit).
/// Policy lives exclusively on the server export.
#[derive(Default)]
struct AgentMembers {
    actions: Vec<String>,
    reads: Vec<String>,
    writes: Vec<String>,
    /// Member name → the entry's `describe:` value, stored as the RAW JS string
    /// literal (quotes included) exactly as authored. Kept as a side map rather
    /// than widening the three `Vec<String>`s above, because those feed the
    /// invoker-map emitters whose bodies are byte-aligned across the server
    /// export, the server registration, and the client opaque-ID dispatcher.
    ///
    /// Only populated for members that survive the `expose` gate — an
    /// unexposed member's description must never reach a public artifact.
    describes: BTreeMap<String, String>,
    /// Action name → the MCP `params` object-literal fragment derived from the
    /// handler's signature (DE5). Present only for exposed actions whose
    /// handler parsed and every parameter could be named; absent otherwise, so
    /// the server falls back to the legacy positional `args` schema.
    action_params: BTreeMap<String, String>,
}

/// GX Phase 1 (#437-GX) — whether ANY member of the SFC is `expose:`d
/// (read, write, or action). This is the "any `expose:` member on the
/// surface" predicate C481 and W481 compose against; it walks the SAME
/// `collect_agent_members` metadata the emitted artifacts are built from, so
/// the compile-time check and the emitted agent surface cannot disagree.
pub fn has_exposed_agent_members(raw_script: &str) -> bool {
    let members = collect_agent_members(raw_script);
    !members.actions.is_empty() || !members.reads.is_empty() || !members.writes.is_empty()
}

/// Walk the `@state` collections of an SFC and collect the names of members
/// exposed to agents. Shared by the server `__agentBinding` export and the
/// client opaque-ID dispatcher so the two stay structurally in sync.
fn collect_agent_members(raw_script: &str) -> AgentMembers {
    use crate::parser::state_macros::{
        arrow_args, arrow_is_async, meta_get, parse_state_macros, running_code,
    };
    use crate::types::{CollectionKind, StateMacro};

    let macros = parse_state_macros(raw_script).unwrap_or_default();
    let mut members = AgentMembers::default();

    for mac in &macros {
        if let StateMacro::Collection { kind, entries } = mac {
            for entry in entries {
                let expose_raw = meta_get(entry, "expose").unwrap_or("");
                let has_read = expose_raw.contains("read: true");
                let has_write = expose_raw.contains("write: true");

                match kind {
                    CollectionKind::Action => {
                        if has_read {
                            members.actions.push(entry.name.clone());
                            // DE5 — derive the MCP param schema from the SAME
                            // handler arrow CO1's prop-write pass parses, so the
                            // agent-facing schema cannot drift from the code.
                            // Any step that cannot be done confidently (handler
                            // does not parse, a param cannot be named) leaves
                            // the entry absent, and the server keeps the legacy
                            // positional `args` schema — a graceful degrade.
                            if let Some(arrow) = running_code(entry) {
                                let params = arrow_args(arrow).unwrap_or_default();
                                let is_async = arrow_is_async(arrow);
                                if let Some(hps) =
                                    crate::expr::handler_params(&params, is_async)
                                {
                                    if let Some(schema) =
                                        crate::codegen::mcp_schema::param_schema_json(&hps)
                                    {
                                        members
                                            .action_params
                                            .insert(entry.name.clone(), schema);
                                    }
                                }
                            }
                        }
                    }
                    CollectionKind::Prop => {
                        if has_read {
                            members.reads.push(entry.name.clone());
                        }
                        if has_write {
                            members.writes.push(entry.name.clone());
                        }
                    }
                    CollectionKind::Computed => {
                        if has_read {
                            members.reads.push(entry.name.clone());
                        }
                        // Computed entries are read-only; write: true is ignored.
                    }
                    _ => {}
                }

                // Record the description only for members that cleared the
                // gate above. Gating on (has_read || has_write) rather than on
                // the match arm keeps unexposed members — and their prose,
                // which may describe internals — out of every emitted artifact.
                if has_read || has_write {
                    if let Some(desc) = meta_get(entry, "describe") {
                        members
                            .describes
                            .insert(entry.name.clone(), desc.trim().to_string());
                    }
                }
            }
        }
    }

    members
}

/// FNV-1a 64-bit hash. Deterministic and stable across Rust toolchain versions
/// (unlike `std::hash::DefaultHasher`, whose output is explicitly NOT guaranteed
/// stable across releases). We rely on this stability because the opaque action
/// IDs it produces are matched against a server-side allowlist — the same input
/// MUST hash identically on every compile, on every machine, forever.
fn fnv1a_64(input: &str) -> u64 {
    const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;
    let mut hash = FNV_OFFSET;
    for byte in input.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

/// Deterministic, stable opaque ID for an agent-exposed member. Derived from
/// `tag + ':' + name` so it is (a) unique per (component, member) pair and
/// (b) identical across every compile of the same SFC. The `a_` prefix keeps
/// the ID a valid JS identifier (no leading digit) and namespaces it as an
/// agent action ID. Rendered as a zero-padded 16-char lowercase hex string.
fn opaque_member_id(tag_name: &str, member_name: &str) -> String {
    let key = format!("{}:{}", tag_name, member_name);
    format!("a_{:016x}", fnv1a_64(&key))
}

/// Emit the `registerAgentMetadata({...})` call that populates the
/// `@aihu/agent` registry — the ONLY source `@aihu/agent-server`'s
/// `buildToolDefinitions` reads when constructing MCP tool definitions.
///
/// Before this existed the compiler emitted no such call anywhere, so the
/// registry was empty in every real app and every action tool shipped with a
/// synthesized description and an untyped `args: { type: 'array' }` schema.
/// `describe:` was parsed, validated, and then dropped — it reached no artifact.
///
/// Unlike `__agentBinding`, this payload is PURE DATA: it closes over no setup
/// locals, so emitting it at module scope is safe and it can be read on import
/// without a live component instance.
///
/// Only `read`-exposed members are advertised. Write-exposed props are
/// deliberately omitted: the dispatch path to `setSignal` is closed by design
/// (`agent-service` proves this with a test), so advertising a write tool would
/// promise a capability the server refuses to serve.
///
/// GX #468 — the payload also carries the resolved `extract` policy, rendered
/// via the SAME `ResolvedExtract::json_object()` the agent-meta sidecar and
/// `.route.json` use (JSON is valid JS), so a deployment reading the LIVE
/// registry (`getAgentMetadata(tag).extract`) sees byte-identical policy to a
/// deployment reading the sidecar — the gate no longer defaults to
/// `'anonymous'` on the runtime-registry path for governed surfaces.
fn emit_agent_metadata_registration(
    tag_name: &str,
    raw_script: &str,
    extract: &crate::extract::ResolvedExtract,
) -> String {
    let members = collect_agent_members(raw_script);
    if members.actions.is_empty() && members.reads.is_empty() {
        return String::new();
    }

    // state: { name: '<describe>' } — Record<string, string>. Every read member
    // appears, described or not, so the read tool is generated either way; the
    // value is the description when authored and '' when not (agent-server
    // falls back to a synthesized string on empty).
    let state_entries: Vec<String> = members
        .reads
        .iter()
        .map(|name| {
            let desc = members.describes.get(name).map_or("''", String::as_str);
            format!("    {}: {}", name, desc)
        })
        .collect();

    // actions: { name: { describe: '<describe>', returns: {}, params: {…} } }
    // `returns` is present-but-empty: the v2 `@state` form carries no return
    // shape (only the retired v1 `@agent { action ... -> {...} }` did), and
    // ActionSchema requires the key. `params` (DE5) is the derived MCP
    // input-schema fragment; omitted when the handler could not be modeled, so
    // the server degrades to the legacy positional `args` shape for that tool.
    let action_entries: Vec<String> = members
        .actions
        .iter()
        .map(|name| {
            let describe = match members.describes.get(name) {
                Some(desc) => format!("describe: {}, ", desc),
                None => String::new(),
            };
            let params = match members.action_params.get(name) {
                Some(schema) => format!(", params: {}", schema),
                None => String::new(),
            };
            format!("    {}: {{ {}returns: {{}}{} }}", name, describe, params)
        })
        .collect();

    let mut out = String::from("registerAgentMetadata({\n");
    out.push_str(&format!("  tag: '{}',\n", tag_name));
    if !state_entries.is_empty() {
        out.push_str(&format!("  state: {{\n{}\n  }},\n", state_entries.join(",\n")));
    }
    if !action_entries.is_empty() {
        out.push_str(&format!(
            "  actions: {{\n{}\n  }},\n",
            action_entries.join(",\n")
        ));
    }
    // The resolved `extract` policy — rendered from the same
    // `ResolvedExtract::json_object()` string as the sidecars (DA-f2), so the
    // live registry provably cannot drift from the agent-meta artifact.
    out.push_str(&format!("  extract: {},\n", extract.json_object()));
    out.push_str("})\n");
    out
}

fn emit_agent_binding_export(tag_name: &str, agent: &AgentBlock, raw_script: &str) -> String {
    let members = collect_agent_members(raw_script);

    // actions: { name: (args) => name(args) }
    let action_entries: Vec<String> = members
        .actions
        .iter()
        .map(|name| format!("    {}: (args) => {}(args)", name, name))
        .collect();
    // reads: { name: () => name() }  (prop signal getter / computed callable)
    let read_entries: Vec<String> = members
        .reads
        .iter()
        .map(|name| format!("    {}: () => {}()", name, name))
        .collect();
    // writes: { name: (v) => name.set(v) }  (prop signal setter)
    // `name` is bound from `ctx.props.<name>`, a callable getter with a `.set`
    // writer (define-component R1). Reassigning the `const` binding (`name = v`)
    // both throws (const) and never reaches the signal — call `.set` instead.
    let write_entries: Vec<String> = members
        .writes
        .iter()
        .map(|name| format!("    {}: (v) => {}.set(v)", name, name))
        .collect();

    // $scope and $rate-limit from the @agent block agent_macros.
    let mut scope_val: Option<String> = None;
    let mut rate_limit_val: Option<u32> = None;
    for mac in &agent.agent_macros {
        match mac {
            AgentMacroDecl::Scope(s) => {
                scope_val = Some(s.clone());
            }
            AgentMacroDecl::RateLimit(n) => {
                rate_limit_val = Some(*n);
            }
            AgentMacroDecl::Stream(_) => {
                // v0.4.0: $stream in @agent wires result → stream entry.
                // Handled in emit_manifest / __agentBinding — skip for options form.
            }
        }
    }

    // [SECURITY] Amendment 7 §6.11: always warn when $scope is declared in v0.3.0
    // (option c — always-warn until @aihu/auth build-graph detection lands).
    if let Some(ref scope) = scope_val {
        eprintln!(
            "[SECURITY] {}: @agent $scope '{}' declared but @aihu/auth cannot be \
             verified at compile time (v0.3.0). Ensure @aihu/auth is installed and \
             configured before deploying to production. Third-party templates with \
             @agent blocks should be audited before use.",
            tag_name, scope
        );
    }

    let actions_str = if action_entries.is_empty() {
        "{}".to_string()
    } else {
        format!("{{\n{}\n  }}", action_entries.join(",\n"))
    };
    let reads_str = if read_entries.is_empty() {
        "{}".to_string()
    } else {
        format!("{{\n{}\n  }}", read_entries.join(",\n"))
    };
    let writes_str = if write_entries.is_empty() {
        "{}".to_string()
    } else {
        format!("{{\n{}\n  }}", write_entries.join(",\n"))
    };
    let scope_str = match &scope_val {
        Some(s) => format!("'{}'", s),
        None => "undefined".to_string(),
    };
    let rate_limit_str = match rate_limit_val {
        Some(n) => format!("'{}/min'", n),
        None => "undefined".to_string(),
    };

    format!(
        "export const __agentBinding = {{\n  tag: '{}',\n  actions: {},\n  reads: {},\n  writes: {},\n  scope: {},\n  rateLimit: {},\n}}",
        tag_name, actions_str, reads_str, writes_str, scope_str, rate_limit_str
    )
}

/// T1 (go-public eng review) — Emit the client-safe `__agentDispatcher` export.
///
/// CONTRAST WITH `emit_agent_binding_export`: the server `__agentBinding` ships
/// the full capability spec INCLUDING policy (`scope`, `rateLimit`) and is
/// elided from client builds by the `elide_agent` gate. The client must still
/// be drivable by an external agent (the capability bridge), but must NOT learn
/// any policy. So this emits a NARROW dispatcher keyed by deterministic OPAQUE
/// IDs — `actions` / `reads` / `writes` invoker maps and nothing else. There is
/// deliberately no `scope` and no `rateLimit` field: policy enforcement stays
/// server-side, the sole policy-enforcement point.
///
/// The opaque IDs are stable hashes of `tag + ':' + memberName` (see
/// `opaque_member_id`). The server-side allowlist recomputes the same IDs from
/// the same manifest, so a dispatched opaque ID matches iff the server approved
/// that exact (component, member). IDs being deterministic across compiles is
/// the load-bearing invariant — drift would desync the allowlist and 404 every
/// call (plan §"Failure modes — Opaque-ID drift").
///
/// Shape is registerable by the browser bridge (T3): the invoker bodies mirror
/// the server `__agentBinding` (`(args) => name(args)`, `() => name()`,
/// `(v) => name.set(v)`) so the bridge can adapt it to a `LiveBinding`
/// (`@aihu/arbor` `mount.ts` `options.agentBinding`) by keying on opaque IDs.
fn emit_agent_client_dispatcher(tag_name: &str, raw_script: &str) -> String {
    let members = collect_agent_members(raw_script);

    // actions: { <opaqueId>: (args) => name(args) }
    let action_entries: Vec<String> = members
        .actions
        .iter()
        .map(|name| {
            format!(
                "    {}: (args) => {}(args)",
                opaque_member_id(tag_name, name),
                name
            )
        })
        .collect();
    // reads: { <opaqueId>: () => name() }
    let read_entries: Vec<String> = members
        .reads
        .iter()
        .map(|name| format!("    {}: () => {}()", opaque_member_id(tag_name, name), name))
        .collect();
    // writes: { <opaqueId>: (v) => name.set(v) }  (prop signal setter, not a
    // `const` reassignment — see emit_agent_binding_export)
    let write_entries: Vec<String> = members
        .writes
        .iter()
        .map(|name| {
            format!(
                "    {}: (v) => {}.set(v)",
                opaque_member_id(tag_name, name),
                name
            )
        })
        .collect();

    let fmt = |entries: &[String]| -> String {
        if entries.is_empty() {
            "{}".to_string()
        } else {
            format!("{{\n{}\n  }}", entries.join(",\n"))
        }
    };

    // NOTE: NO scope, NO rateLimit, NO policy metadata of any kind. Policy is
    // server-only — see `__agentBinding` (server artifact). This export carries
    // only opaque-ID → invoker maps.
    format!(
        "export const __agentDispatcher = {{\n  tag: '{}',\n  actions: {},\n  reads: {},\n  writes: {},\n}}",
        tag_name,
        fmt(&action_entries),
        fmt(&read_entries),
        fmt(&write_entries)
    )
}

/// T6 (go-public demo) — inject a per-instance `_registerAgentDispatcher` call
/// into the compiled setup body so the opaque-ID invokers are bound to a SPECIFIC
/// mounted instance's signals (not the inert module-scope `__agentDispatcher`).
///
/// The invoker bodies are byte-identical to `emit_agent_client_dispatcher`'s
/// (same opaque IDs, same `(args) => name(args)` / `() => name()` / `(v) => { name = v }`
/// shapes) but emitted INSIDE setup where `name` resolves to the real closure.
/// We register against `<ctx>.element` (the host custom element) so the browser
/// bridge can look up the instance dispatcher after mount.
///
/// This is a string transform over the compiled module:
///  1. Add `_registerAgentDispatcher` to the `@aihu/runtime` import.
///  2. Insert the registration statement immediately before the setup's final
///     `  return <expr>` line.
///
/// Defensive: if the expected runtime-import or setup-`return` shape is not
/// present (e.g. a future codegen change, or a component with no agent members),
/// the input is returned UNCHANGED so the build never breaks — the module-scope
/// export still ships for introspection.
fn inject_dispatcher_registration(base_js: &str, tag_name: &str, raw_script: &str) -> String {
    let members = collect_agent_members(raw_script);
    if members.actions.is_empty() && members.reads.is_empty() && members.writes.is_empty() {
        return base_js.to_string();
    }

    // Build the same opaque-ID → invoker maps as the module-scope export, but as
    // an inline object literal for the registration call (4-space indent inside
    // setup body).
    let action_entries: Vec<String> = members
        .actions
        .iter()
        .map(|name| format!("      {}: (args) => {}(args)", opaque_member_id(tag_name, name), name))
        .collect();
    let read_entries: Vec<String> = members
        .reads
        .iter()
        .map(|name| format!("      {}: () => {}()", opaque_member_id(tag_name, name), name))
        .collect();
    let write_entries: Vec<String> = members
        .writes
        .iter()
        .map(|name| format!("      {}: (v) => {}.set(v)", opaque_member_id(tag_name, name), name))
        .collect();
    let fmt = |entries: &[String]| -> String {
        if entries.is_empty() {
            "{}".to_string()
        } else {
            format!("{{\n{}\n    }}", entries.join(",\n"))
        }
    };

    // The registration statement. `_ctx`/`ctx` is the setup parameter; the
    // compiled bare-arrow form names it `_ctx` (or `ctx` when @style/props are
    // present). We reference `(_ctx ?? ctx)`-free by matching the actual param
    // below; here we emit `__aihu_ctx__` and bind it via the param rename.
    let registration = format!(
        "  _registerAgentDispatcher(__aihu_ctx__?.element, {{\n    tag: '{}',\n    actions: {},\n    reads: {},\n    writes: {},\n  }})\n",
        tag_name,
        fmt(&action_entries),
        fmt(&read_entries),
        fmt(&write_entries),
    );

    // ── 1. Add `_registerAgentDispatcher` to the @aihu/runtime import. ────────
    let runtime_import_re = "import { defineComponent, defineElement } from '@aihu/runtime'";
    if !base_js.contains(runtime_import_re) {
        return base_js.to_string();
    }
    let with_import = base_js.replacen(
        runtime_import_re,
        "import { defineComponent, defineElement, _registerAgentDispatcher } from '@aihu/runtime'",
        1,
    );

    // ── 2. Rename the setup parameter to a stable name we can reference. ──────
    // Two shapes carry a setup closure whose body has the action/read closures:
    //   • bare-arrow form: `defineComponent((_ctx) => {` / `((ctx) => {`
    //   • options/props form: `  setup: (_ctx) => {` / `(ctx) => {`
    // In both, alias the parameter to `__aihu_ctx__` so the injected
    // registration can read `__aihu_ctx__?.element`, and keep `ctx` bound for any
    // body references (props bindings use `ctx.props`, @style uses `ctx.host`).
    let setup_shapes: [(&str, &str); 4] = [
        ("defineComponent((_ctx) => {", "defineComponent((__aihu_ctx__) => {"),
        (
            "defineComponent((ctx) => {",
            "defineComponent((__aihu_ctx__) => {\n  const ctx = __aihu_ctx__;",
        ),
        ("setup: (_ctx) => {", "setup: (__aihu_ctx__) => {"),
        ("setup: (ctx) => {", "setup: (__aihu_ctx__) => {\n    const ctx = __aihu_ctx__;"),
    ];
    let mut with_param = with_import;
    let mut renamed = false;
    for (from, to) in setup_shapes {
        if with_param.contains(from) {
            with_param = with_param.replacen(from, to, 1);
            renamed = true;
            break;
        }
    }
    if !renamed {
        // Unrecognised setup shape (e.g. form-associated) — don't transform.
        return base_js.to_string();
    }

    // ── 3. Insert the registration immediately before the setup's `return`. ──
    // The setup body always ends with `  return <expr>\n}))` (bare-arrow form).
    // Find the LAST `\n  return ` occurrence and splice the registration in.
    if let Some(idx) = with_param.rfind("\n  return ") {
        let (head, tail) = with_param.split_at(idx + 1); // keep the leading '\n'
        format!("{}{}{}", head, registration, tail)
    } else {
        base_js.to_string()
    }
}

/// fix(server-agent-macro-lowering) — SERVER analog of
/// `inject_dispatcher_registration`. Injects a per-instance
/// `_registerAgentServerBinding(ctx.element, { … })` call into the setup body so
/// a server-mounted instance lands a `LiveBinding` in arbor's
/// `componentInstanceRegistry` (the headless `@aihu/agent-service` gate path).
///
/// CONTRAST WITH the client dispatcher injection: this carries the FULL named
/// binding (member NAMES → invokers, NOT opaque IDs) AND policy (`scope`,
/// `rateLimit`) — exactly the `AgentBindingSpec` shape `mount()` consumes. It is
/// emitted ONLY into SERVER builds (the caller gates on `!elide_agent`); client
/// builds never see it, preserving the policy-server-only security model.
///
/// Defensive: if the runtime-import or setup-`return` shape is not present, the
/// input is returned UNCHANGED so the build never breaks (the module-scope
/// `__agentBinding` export still ships for introspection).
fn inject_server_binding_registration(
    base_js: &str,
    tag_name: &str,
    agent: &AgentBlock,
    raw_script: &str,
) -> String {
    let members = collect_agent_members(raw_script);
    if members.actions.is_empty() && members.reads.is_empty() && members.writes.is_empty() {
        return base_js.to_string();
    }

    // Named-member → invoker maps (4-space indent inside setup body), byte-aligned
    // with the module-scope `__agentBinding` export's bodies.
    let action_entries: Vec<String> = members
        .actions
        .iter()
        .map(|name| format!("      {}: (args) => {}(args)", name, name))
        .collect();
    let read_entries: Vec<String> = members
        .reads
        .iter()
        .map(|name| format!("      {}: () => {}()", name, name))
        .collect();
    let write_entries: Vec<String> = members
        .writes
        .iter()
        .map(|name| format!("      {}: (v) => {}.set(v)", name, name))
        .collect();
    let fmt = |entries: &[String]| -> String {
        if entries.is_empty() {
            "{}".to_string()
        } else {
            format!("{{\n{}\n    }}", entries.join(",\n"))
        }
    };

    // $scope / $rate-limit policy (server-only; same source as the export).
    let mut scope_val: Option<String> = None;
    let mut rate_limit_val: Option<u32> = None;
    for mac in &agent.agent_macros {
        match mac {
            AgentMacroDecl::Scope(s) => scope_val = Some(s.clone()),
            AgentMacroDecl::RateLimit(n) => rate_limit_val = Some(*n),
            AgentMacroDecl::Stream(_) => {}
        }
    }
    let scope_str = match &scope_val {
        Some(s) => format!("'{}'", s),
        None => "undefined".to_string(),
    };
    let rate_limit_str = match rate_limit_val {
        Some(n) => format!("'{}/min'", n),
        None => "undefined".to_string(),
    };

    let registration = format!(
        "  _registerAgentServerBinding(__aihu_ctx__?.element, {{\n    tag: '{}',\n    actions: {},\n    reads: {},\n    writes: {},\n    scope: {},\n    rateLimit: {},\n  }})\n",
        tag_name,
        fmt(&action_entries),
        fmt(&read_entries),
        fmt(&write_entries),
        scope_str,
        rate_limit_str,
    );

    // ── 1. Add `_registerAgentServerBinding` to the @aihu/runtime import. ──────
    let runtime_import_re = "import { defineComponent, defineElement } from '@aihu/runtime'";
    if !base_js.contains(runtime_import_re) {
        return base_js.to_string();
    }
    let with_import = base_js.replacen(
        runtime_import_re,
        "import { defineComponent, defineElement, _registerAgentServerBinding } from '@aihu/runtime'",
        1,
    );

    // ── 2. Rename the setup parameter to a stable name (same as client path). ─
    let setup_shapes: [(&str, &str); 4] = [
        ("defineComponent((_ctx) => {", "defineComponent((__aihu_ctx__) => {"),
        (
            "defineComponent((ctx) => {",
            "defineComponent((__aihu_ctx__) => {\n  const ctx = __aihu_ctx__;",
        ),
        ("setup: (_ctx) => {", "setup: (__aihu_ctx__) => {"),
        ("setup: (ctx) => {", "setup: (__aihu_ctx__) => {\n    const ctx = __aihu_ctx__;"),
    ];
    let mut with_param = with_import;
    let mut renamed = false;
    for (from, to) in setup_shapes {
        if with_param.contains(from) {
            with_param = with_param.replacen(from, to, 1);
            renamed = true;
            break;
        }
    }
    if !renamed {
        return base_js.to_string();
    }

    // ── 3. Insert the registration immediately before the setup's `return`. ──
    if let Some(idx) = with_param.rfind("\n  return ") {
        let (head, tail) = with_param.split_at(idx + 1);
        format!("{}{}{}", head, registration, tail)
    } else {
        base_js.to_string()
    }
}

fn emit_agent_bindings(agent: &AgentBlock) -> String {
    let mut lines: Vec<String> = Vec::new();
    for input in &agent.inputs {
        match &input.kind {
            InputKind::String => {
                lines.push(format!(
                    "    const [{}] = ctx.attrs.{}",
                    input.name, input.name
                ));
            }
            InputKind::Number => {
                lines.push(format!(
                    "    const {} = computed(() => Number(ctx.attrs.{}[0]()))",
                    input.name, input.name
                ));
            }
            InputKind::Boolean => {
                lines.push(format!(
                    "    const {} = computed(() => ctx.attrs.{}[0]() === 'true')",
                    input.name, input.name
                ));
            }
            InputKind::Enum(variants) => {
                let variant_strs: Vec<String> =
                    variants.iter().map(|v| format!("'{}'", v)).collect();
                lines.push(format!(
                    "    const _{}_V = new Set([{}])",
                    input.name,
                    variant_strs.join(", ")
                ));
                let first_variant = variants.first().map(|s| s.as_str()).unwrap_or("");
                lines.push(format!(
                    "    const {} = computed(() => _{}_V.has(ctx.attrs.{}[0]()) ? ctx.attrs.{}[0]() : '{}')",
                    input.name, input.name, input.name, input.name, first_variant
                ));
            }
        }
    }
    if lines.is_empty() {
        String::new()
    } else {
        lines.join("\n") + "\n"
    }
}

// ─── Manifest JSON emission ───────────────────────────────────────────────────

/// Convert an authored JS string literal (`'foo'` / `"foo"`, quotes included,
/// as `meta_get` returns it) into the body of a JSON string. Returns `None` for
/// anything not quote-delimited — a computed or interpolated `describe:` has no
/// compile-time text, so it is omitted rather than emitted wrong.
fn js_literal_to_json_body(raw: &str) -> Option<String> {
    let t = raw.trim();
    let inner = t
        .strip_prefix('\'')
        .and_then(|s| s.strip_suffix('\''))
        .or_else(|| t.strip_prefix('"').and_then(|s| s.strip_suffix('"')))?;
    Some(inner.replace('\\', "\\\\").replace('"', "\\\""))
}

fn emit_manifest(
    tag_name: &str,
    agent: &AgentBlock,
    raw_script: &str,
    extract: &crate::extract::ResolvedExtract,
) -> String {
    // v2 members live on `@state` entries, not on the `@agent` block. Collected
    // from the SAME walk that feeds `__agentBinding` and
    // `registerAgentMetadata`, so the sidecar cannot drift from the live
    // registry the way it did when it read only the retired v1 keywords.
    let members = collect_agent_members(raw_script);

    if agent.inputs.is_empty()
        && agent.actions.is_empty()
        && agent.agent_macros.is_empty()
        && members.actions.is_empty()
        && members.reads.is_empty()
    {
        return String::new();
    }

    let tool_name = tag_name.replace('-', "_");

    // Build inputs JSON
    let inputs_json = if agent.inputs.is_empty() {
        "{}".to_string()
    } else {
        let input_entries: Vec<String> = agent
            .inputs
            .iter()
            .map(|inp| {
                let type_str = match &inp.kind {
                    InputKind::String => "\"string\"".to_string(),
                    InputKind::Number => "\"number\"".to_string(),
                    InputKind::Boolean => "\"boolean\"".to_string(),
                    InputKind::Enum(_) => "\"enum\"".to_string(),
                };

                let values_part = if let InputKind::Enum(variants) = &inp.kind {
                    let vs: Vec<String> = variants.iter().map(|v| format!("\"{}\"", v)).collect();
                    format!(", \"values\": [{}]", vs.join(", "))
                } else {
                    String::new()
                };

                let default_part = if let Some(def) = &inp.default {
                    format!(", \"default\": \"{}\"", def)
                } else {
                    String::new()
                };

                format!(
                    "      \"{}\": {{ \"type\": {}{}{} }}",
                    inp.name, type_str, values_part, default_part
                )
            })
            .collect();
        format!("{{\n{}\n    }}", input_entries.join(",\n"))
    };

    // Build actions JSON — v1 `@agent { action ... }` entries first, then v2
    // `$action` entries that cleared the `expose` gate.
    let actions_json = {
        let mut action_entries: Vec<String> = agent
            .actions
            .iter()
            .map(|act| {
                let returns_json = if act.returns.is_empty() {
                    "{}".to_string()
                } else {
                    let return_entries: Vec<String> = act
                        .returns
                        .iter()
                        .map(|(fname, fkind)| {
                            let type_str = match fkind {
                                InputKind::String => "\"string\"",
                                InputKind::Number => "\"number\"",
                                InputKind::Boolean => "\"boolean\"",
                                InputKind::Enum(_) => "\"enum\"",
                            };
                            format!("          \"{}\": {{ \"type\": {} }}", fname, type_str)
                        })
                        .collect();
                    format!("{{\n{}\n        }}", return_entries.join(",\n"))
                };
                format!(
                    "      \"{}\": {{\n        \"returns\": {}\n      }}",
                    act.name, returns_json
                )
            })
            .collect();

        for name in &members.actions {
            let describe_part = members
                .describes
                .get(name)
                .and_then(|raw| js_literal_to_json_body(raw))
                .map(|body| format!(",\n        \"describe\": \"{}\"", body))
                .unwrap_or_default();
            action_entries.push(format!(
                "      \"{}\": {{\n        \"returns\": {{}}{}\n      }}",
                name, describe_part
            ));
        }

        if action_entries.is_empty() {
            "{}".to_string()
        } else {
            format!("{{\n{}\n    }}", action_entries.join(",\n"))
        }
    };

    // Build state JSON from v2 read-exposed members, mirroring the
    // `registerAgentMetadata` payload so the sidecar and the live registry
    // describe the same surface.
    let state_json = {
        let entries: Vec<String> = members
            .reads
            .iter()
            .map(|name| {
                let body = members
                    .describes
                    .get(name)
                    .and_then(|raw| js_literal_to_json_body(raw))
                    .unwrap_or_default();
                format!("      \"{}\": \"{}\"", name, body)
            })
            .collect();
        if entries.is_empty() {
            "{}".to_string()
        } else {
            format!("{{\n{}\n    }}", entries.join(",\n"))
        }
    };

    // Build agent macros extras (v2: only $scope and $rate-limit survive).
    // Per-name `expose` / `describe` metadata is now carried on the
    // corresponding `@state` collection entry (codegen reshapes the
    // `registerAgentMetadata` payload per AC-6 revised — Q.B-2 (a)).
    let mut extra_fields = String::new();
    for mac in &agent.agent_macros {
        match mac {
            AgentMacroDecl::Scope(val) => {
                extra_fields.push_str(&format!(",\n    \"scope\": \"{}\"", val));
            }
            AgentMacroDecl::RateLimit(n) => {
                extra_fields.push_str(&format!(",\n    \"rateLimit\": {}", n));
            }
            AgentMacroDecl::Stream(name) => {
                // v0.4.0: include streamOutput in manifest for agent-service bridge.
                extra_fields.push_str(&format!(",\n    \"streamOutput\": \"{}\"", name));
            }
        }
    }

    // GX Phase 1 (#437-GX) — artifact 3 of the fan-out (spec §2.4): the
    // resolved extract policy on the agent-meta sidecar, rendered from the
    // SAME `ResolvedExtract` as the code marker and `.route.json`. Always
    // present on agent components, so the registry → serving-gate path (Phase
    // 2) reads a recorded posture, never infers one.
    extra_fields.push_str(&format!(",\n    \"extract\": {}", extract.json_object()));

    format!(
        "{{\n  \"tools\": [{{\n    \"name\": \"{}\",\n    \"tag\": \"{}\",\n    \"inputs\": {},\n    \"actions\": {},\n    \"state\": {}{}\n  }}]\n}}",
        tool_name, tag_name, inputs_json, actions_json, state_json, extra_fields
    )
}


// ─── Template emission helpers ────────────────────────────────────────────────

fn emit_nodes(
    nodes: &[TemplateNode],
    signal_map: &SignalMap,
    state_names: &StateNames,
    child_indent: &str,
    mode: ExprParserMode,
) -> String {
    let non_empty: Vec<String> = nodes
        .iter()
        .map(|n| emit_node(n, signal_map, state_names, child_indent, mode))
        .filter(|s| !s.is_empty())
        .collect();

    match non_empty.len() {
        0 => "branch(null, undefined, [])".to_string(),
        1 => non_empty.into_iter().next().unwrap(),
        _ => {
            let parent_indent = &child_indent[..child_indent.len().saturating_sub(2)];
            let children = non_empty
                .iter()
                .enumerate()
                .map(|(i, s)| {
                    if i < non_empty.len() - 1 {
                        format!("{}{},", child_indent, s)
                    } else {
                        format!("{}{}", child_indent, s)
                    }
                })
                .collect::<Vec<_>>()
                .join("\n");
            format!(
                "branch(null, undefined, [\n{}\n{}])",
                children, parent_indent
            )
        }
    }
}

fn emit_node(
    node: &TemplateNode,
    signal_map: &SignalMap,
    state_names: &StateNames,
    child_indent: &str,
    mode: ExprParserMode,
) -> String {
    match node {
        TemplateNode::Text(s) => {
            // Decode entities first so &nbsp; etc. survive whitespace normalization.
            let raw = decode_html_entities(s);
            if raw.trim().is_empty() {
                // A whitespace-only text node. On a SINGLE line (no newline in the
                // run) it is a significant inline separator — the only space
                // between `{a}` and `{b}`, or between text and an inline element —
                // and collapses to one space, matching HTML's inline whitespace
                // model and rule 3 below (which only ran for mixed-content text).
                // Before this it was dropped outright, so `{a} {b}` rendered `ab`
                // (#400). A run that SPANS lines is template-body indentation
                // between block-level content and stays stripped (rule 4).
                if raw.contains('\n') {
                    String::new()
                } else if raw.contains('\u{00A0}') {
                    // A non-breaking space is deliberate significant whitespace —
                    // preserve it rather than folding to a plain space (the decode
                    // above exists precisely so `&nbsp;` survives).
                    "leaf('\\u00A0')".to_string()
                } else {
                    "leaf(' ')".to_string()
                }
            } else {
                // JSX-style whitespace handling for text adjacent to inline elements:
                //  1. Collapse runs of ASCII whitespace (incl. newlines) per-line.
                //  2. Lines that are only whitespace are dropped.
                //  3. Same-line leading/trailing whitespace (no `\n` in the leading/
                //     trailing run) is preserved as a single space — required to
                //     keep the gap between `<text>` and an inline `<element>` sibling.
                //  4. Multi-line surrounding whitespace (template body newlines) is
                //     stripped entirely (existing behavior).
                let leading_len = raw
                    .as_bytes()
                    .iter()
                    .take_while(|b| b.is_ascii_whitespace())
                    .count();
                let trailing_len = raw
                    .as_bytes()
                    .iter()
                    .rev()
                    .take_while(|b| b.is_ascii_whitespace())
                    .count();
                let leading_run = &raw[..leading_len];
                let trailing_run = &raw[raw.len() - trailing_len..];
                let has_same_line_leading =
                    !leading_run.is_empty() && !leading_run.contains('\n');
                let has_same_line_trailing =
                    !trailing_run.is_empty() && !trailing_run.contains('\n');

                let core: String = raw
                    .split('\n')
                    .map(|ln| ln.trim())
                    .filter(|ln| !ln.is_empty())
                    .collect::<Vec<_>>()
                    .join(" ");

                let mut normalized = String::with_capacity(core.len() + 2);
                if has_same_line_leading {
                    normalized.push(' ');
                }
                normalized.push_str(&core);
                if has_same_line_trailing {
                    normalized.push(' ');
                }

                let escaped = normalized.replace('\\', "\\\\").replace('\'', "\\'");
                format!("leaf('{}')", escaped)
            }
        }
        TemplateNode::Interpolation(id) => {
            let trimmed = id.trim();
            let is_simple_ident = !trimmed.is_empty()
                && trimmed
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');

            // 1. Bare registered signal/computed identifier → reactive tuple.
            if is_simple_ident {
                if let Some(setter) = signal_map.0.get(trimmed) {
                    if setter.is_empty() {
                        // Computed signal (read-only) — emit reactive getter.
                        return format!(
                            "leaf([() => {}() as unknown as string, () => {{}}] as unknown as Signal<string>)",
                            trimmed
                        );
                    }
                    return format!(
                        "leaf([{}, {}] as unknown as Signal<string>)",
                        trimmed, setter
                    );
                }
            }

            // 2. Dotted access whose BASE is a registered signal/computed →
            //    reactive member read (e.g. {user.name}, {route.params.slug}).
            //
            //    W3: under `--expr-parser ast` this fast path is restricted to
            //    PURE dotted ident paths. Legacy fires it for ANY expression
            //    whose text-before-the-first-dot is an identifier, copying the
            //    tail VERBATIM — so `{items.filter(i => i > count).length}`
            //    emitted `(items() as any).filter(i => i > count).length` with
            //    the arrow-body `count` unrewritten (plan d01, a silent
            //    miscompile). AST mode routes anything richer than
            //    `base.prop.path` through the scope-aware rewrite below.
            let dotted_fast_path = match mode {
                ExprParserMode::Legacy => true,
                ExprParserMode::Ast => is_pure_dotted_path(trimmed),
            };
            if !dotted_fast_path {
                // fall through to step 3
            } else if let Some(dot_pos) = trimmed.find('.') {
                let base = &trimmed[..dot_pos];
                let prop_path = &trimmed[dot_pos + 1..];
                let base_is_ident = !base.is_empty()
                    && base
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
                if base_is_ident {
                    if signal_map.is_computed(base) {
                        return format!(
                            "leaf([() => ({}() as any).{}, () => {{}}] as unknown as Signal<string>)",
                            base, prop_path
                        );
                    } else if let Some(setter) = signal_map.0.get(base) {
                        if !setter.is_empty() {
                            return format!(
                                "leaf([() => ({}() as any).{}, {}] as unknown as Signal<string>)",
                                base, prop_path, setter
                            );
                        }
                    }
                }
            }

            // 3. FEL-172/173: rewrite bare reads of registered getters to calls
            //    (`{count + 1}` → `count() + 1`, `{section.kind}` handled in
            //    step 2, but `{section.kind === 'x' ? a : b}` lands here).
            let rewritten = rewrite_template_expr(trimmed, signal_map, mode);

            // 4. FEL-228 / FEL-173: a complex interpolation that reads reactive
            //    state — a computed/getter CALL like `{selBookLabel()}`, an
            //    expression over an imported store, or a rewritten signal read
            //    from step 3. These previously fell through to an EAGER
            //    `leaf(expr)`: a static text node evaluated once that never
            //    re-rendered on signal change (the "sole text-leaf gap").
            //    Thunk-wrap so the leaf tracks its reads — the same reactivity
            //    contract attribute bindings get from `lower_attr_expr`. Pure
            //    projections of loop vars (`{item.title}` — no call) stay
            //    eager to avoid a needless per-row effect.
            //
            //    W3: AST mode ALSO thunks when the rewritten AST reads a
            //    signal even though no call-paren is visible to the legacy
            //    scanner — the template-literal class (plan a06/a24:
            //    `` {`Count: ${count}`} `` rewrote to `${count()}` INSIDE a
            //    backtick literal, which `interpolation_has_call` skips
            //    entirely, so it stayed an eager, never-updating leaf). The
            //    has-a-call heuristic is kept as an OR so expressions over
            //    imported stores the compiler can't see stay reactive,
            //    exactly as under legacy.
            if interpolation_has_call(&rewritten.source) || rewritten.reads_signal {
                return format!(
                    "leaf([() => ({}) as unknown as string, () => {{}}] as unknown as Signal<string>)",
                    rewritten.source
                );
            }

            // 5. Genuinely static (loop-var projection, plain const) → eager.
            format!("leaf({})", rewritten.source)
        }
        TemplateNode::Element {
            tag,
            attrs,
            children,
        } => {
            // §2.6 — enhanced <a>: internal links carry the SPA behaviors the
            // retired <$link> had (navigation, prefetch, replace, aria-current).
            // Auto-opt-out (target="_blank", download, external/non-http static
            // href) and explicit `reload` render a plain <a> instead.
            if tag == "a" && anchor_is_enhanced(attrs) {
                let base = emit_enhanced_anchor(
                    attrs, children, signal_map, state_names, child_indent, mode,
                );
                let effects =
                    emit_macro_effects(attrs, "el", &base, child_indent, signal_map, mode);
                return if effects.is_empty() {
                    base
                } else {
                    effects.into_iter().next().unwrap_or(base)
                };
            }

            // Check for `raw` — if present, emit the element verbatim with no macro wrapping.
            let is_raw = attrs.iter().any(|a| matches!(a, Attr::Macro { name, value } if name == "raw" && *value == MacroValue::Boolean));

            // W3 d03 — an element-level `each` scopes its binders over the
            // element's own attrs, effects, and children (shadowing signals).
            let scoped = each_scoped_maps(attrs, signal_map, state_names, mode);
            let (inner_signal_map, inner_state_names): (&SignalMap, &StateNames) = match &scoped {
                Some((sm, sn)) => (sm, sn),
                None => (signal_map, state_names),
            };

            // A plain (opted-out) <a> must not render the framework-only
            // vocabulary words (`reload`, `prefetch`, `replace`) as DOM attrs.
            let filtered_anchor_attrs: Vec<Attr>;
            let attrs_for_emit: &[Attr] = if tag == "a" {
                filtered_anchor_attrs = attrs
                    .iter()
                    .filter(|a| !matches!(attr_name(a), "reload" | "prefetch" | "replace"))
                    .cloned()
                    .collect();
                &filtered_anchor_attrs
            } else {
                attrs
            };
            let attrs_str = emit_attrs(attrs_for_emit, inner_state_names, inner_signal_map, mode);
            let has_element_child = children
                .iter()
                .any(|c| matches!(c, TemplateNode::Element { .. }));
            let next_indent = format!("{}  ", child_indent);
            let non_empty_children: Vec<String> = if is_raw {
                // $raw: no child processing
                Vec::new()
            } else {
                children
                    .iter()
                    .map(|c| emit_node(c, inner_signal_map, inner_state_names, &next_indent, mode))
                    .filter(|s| !s.is_empty())
                    .collect()
            };

            // O1a (tag naming): component references emit their NORMALIZED
            // custom-element name (`<UserCard>` → branch('user-card', …));
            // plain HTML/SVG tags pass through verbatim. `slot` and `<$macro>`
            // forms never reach here (handled above / in the MacroElement arm).
            let tag = if crate::tags::is_component_tag(tag) {
                crate::tags::kebab_component_tag(tag)
            } else {
                tag.clone()
            };

            let base = if non_empty_children.is_empty() {
                format!("branch('{}', {}, [])", tag, attrs_str)
            } else if has_element_child {
                let parent_indent = &child_indent[..child_indent.len().saturating_sub(2)];
                let children_str = non_empty_children
                    .iter()
                    .enumerate()
                    .map(|(i, s)| {
                        if i < non_empty_children.len() - 1 {
                            format!("{}{},", child_indent, s)
                        } else {
                            format!("{}{}", child_indent, s)
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                format!(
                    "branch('{}', {}, [\n{}\n{}])",
                    tag, attrs_str, children_str, parent_indent
                )
            } else {
                let inline = non_empty_children.join(", ");
                format!("branch('{}', {}, [{}])", tag, attrs_str, inline)
            };

            // Emit macro effects (wrapping/side-effect macros). Per-item
            // positions use the loop-scoped map; the each LIST uses the outer.
            let effects = emit_macro_effects_scoped(
                attrs, "el", &base, child_indent, inner_signal_map, signal_map, mode,
            );
            if effects.is_empty() {
                base
            } else {
                // Return the first effect (boundary wraps supersede the base node).
                effects.into_iter().next().unwrap_or(base)
            }
        }
        TemplateNode::MacroElement { name, attrs, children } => {
            // W3 d03 — `each` on a framework element (`<group each={…}>`)
            // scopes its binders over the element's subtree.
            let scoped = each_scoped_maps(attrs, signal_map, state_names, mode);
            let (inner_signal_map, inner_state_names): (&SignalMap, &StateNames) = match &scoped {
                Some((sm, sn)) => (sm, sn),
                None => (signal_map, state_names),
            };
            let base = emit_macro_element(name, attrs, children, inner_signal_map, inner_state_names, child_indent, mode);
            // Apply structural/effect directives (each/if/key/show/class:)
            // that wrap or affect the element — same as the plain Element arm
            // above. Without this, directives on macro elements were silently
            // dropped (e.g. `each` left a dangling loop var).
            let effects = emit_macro_effects_scoped(
                attrs, "el", &base, child_indent, inner_signal_map, signal_map, mode,
            );
            if effects.is_empty() {
                base
            } else {
                effects.into_iter().next().unwrap_or(base)
            }
        }
        // B3 — Variant B block-tag forms. Lower to the same runtime calls as
        // the v1 attribute-directives (`createIfBoundary` / `each`) so the
        // reactivity contract is preserved.
        TemplateNode::IfBlock { branches } => {
            emit_if_block(branches, signal_map, state_names, child_indent, mode)
        }
        TemplateNode::EachBlock {
            list_expr,
            item_alias,
            idx_alias,
            key_expr,
            body,
            empty_body,
        } => emit_each_block(
            list_expr,
            item_alias,
            idx_alias.as_deref(),
            key_expr.as_deref(),
            body,
            empty_body.as_deref(),
            signal_map,
            state_names,
            child_indent,
            mode,
        ),
        TemplateNode::HtmlBlock { expr } => emit_html_block(expr, child_indent),
    }
}

/// B3 — Lower an `{#if}/{:else if}/{:else}/{/if}` block to nested
/// `createIfBoundary` calls. Each branch becomes a fragment-list of children
/// wrapped in `branch('', undefined, [...])` so the runtime reconciles across
/// fragment boundaries the same way it does for attribute-form `$if`.
fn emit_if_block(
    branches: &[(String, Vec<TemplateNode>)],
    signal_map: &SignalMap,
    state_names: &StateNames,
    child_indent: &str,
    mode: ExprParserMode,
) -> String {
    fn emit_body(
        body: &[TemplateNode],
        signal_map: &SignalMap,
        state_names: &StateNames,
        child_indent: &str,
        mode: ExprParserMode,
    ) -> String {
        let next_indent = format!("{}  ", child_indent);
        let parts: Vec<String> = body
            .iter()
            .map(|c| emit_node(c, signal_map, state_names, &next_indent, mode))
            .filter(|s| !s.is_empty())
            .collect();
        if parts.is_empty() {
            "branch('', undefined, [])".to_string()
        } else if parts.len() == 1 {
            // Wrap a single child in a fragment-style branch so the runtime
            // sees a uniform shape across branches.
            format!("branch('', undefined, [{}])", parts[0])
        } else {
            format!("branch('', undefined, [{}])", parts.join(", "))
        }
    }

    // Compose else-if chain by negating prior conditions. The runtime's
    // `when(cond, grow)` (via createIfBoundary) takes a single cond+grow pair —
    // no built-in else slot — so for `{:else if}` we synthesize a sibling
    // when() with the negated previous condition AND the new condition. The
    // {:else} (empty cond) becomes a when() with the negation of all prior
    // conditions.
    //
    // To preserve reactivity, the negation reads each cond expression directly
    // (cond is wrapped with [() => (expr)] same as the original).
    fn negate_chain_thunk(branches_so_far: &[String]) -> String {
        // Build `[() => !(c0) && !(c1) && ... && (cN)]` for chained else-if;
        // for plain else: `[() => !(c0) && !(c1) && ...]`.
        let parts: Vec<String> = branches_so_far
            .iter()
            .map(|c| format!("!({})", c))
            .collect();
        format!("[() => ({})]", parts.join(" && "))
    }

    fn build_chain(
        idx: usize,
        branches: &[(String, Vec<TemplateNode>)],
        prior_conds: &mut Vec<String>,
        signal_map: &SignalMap,
        state_names: &StateNames,
        child_indent: &str,
        mode: ExprParserMode,
    ) -> Vec<String> {
        // Returns a list of when() calls (siblings) for the branches starting
        // at idx. The caller wraps these into a fragment-branch.
        let mut out: Vec<String> = Vec::new();
        if idx >= branches.len() {
            return out;
        }
        let (cond, body) = &branches[idx];
        let body_str = emit_body(body, signal_map, state_names, child_indent, mode);

        // FEL-172: chain/negation thunks read cond expressions verbatim, so
        // bare getter reads must be rewritten to calls here too — otherwise
        // `{:else if count}` emits `(count)` (the function — always truthy).
        let rewritten_cond = rewrite_template_expr(cond, signal_map, mode).source;
        let cond_arg = if cond.is_empty() {
            // {:else} — fire when all prior conds are false
            negate_chain_thunk(prior_conds)
        } else if prior_conds.is_empty() {
            lower_if_cond(cond, signal_map, mode)
        } else {
            // {:else if}: !prior0 && !prior1 && ... && cond
            let mut parts: Vec<String> = prior_conds
                .iter()
                .map(|c| format!("!({})", c))
                .collect();
            parts.push(format!("({})", rewritten_cond));
            format!("[() => ({})]", parts.join(" && "))
        };

        out.push(format!(
            "createIfBoundary({}, () => {{ return {} }})",
            cond_arg, body_str
        ));

        if !cond.is_empty() {
            prior_conds.push(rewritten_cond);
            let rest = build_chain(idx + 1, branches, prior_conds, signal_map, state_names, child_indent, mode);
            out.extend(rest);
            prior_conds.pop();
        }
        out
    }

    let mut prior: Vec<String> = Vec::new();
    let when_calls = build_chain(0, branches, &mut prior, signal_map, state_names, child_indent, mode);
    if when_calls.len() == 1 {
        when_calls.into_iter().next().unwrap()
    } else {
        format!("branch('', undefined, [{}])", when_calls.join(", "))
    }
}

/// Lower a `{#if}` condition the same way the attribute-form `$if` does:
/// simple identifier of a registered signal → `[get, set]` tuple; otherwise a
/// thunk array.
fn lower_if_cond(cond: &str, signal_map: &SignalMap, mode: ExprParserMode) -> String {
    let trimmed = cond.trim();
    let is_simple_ident = !trimmed.is_empty()
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
    if is_simple_ident && signal_map.is_reactive(trimmed) {
        if let Some(setter) = signal_map.0.get(trimmed) {
            if !setter.is_empty() {
                return format!("[{}, {}]", trimmed, setter);
            } else {
                return format!("[{}]", trimmed);
            }
        }
    }
    // FEL-172: complex conditions read getters by value.
    format!(
        "[() => ({})]",
        rewrite_template_expr(trimmed, signal_map, mode).source
    )
}

/// B3 — Lower an `{#each}` block to the existing `each(...)` runtime call.
fn emit_each_block(
    list_expr: &str,
    item_alias: &str,
    idx_alias: Option<&str>,
    key_expr: Option<&str>,
    body: &[TemplateNode],
    empty_body: Option<&[TemplateNode]>,
    signal_map: &SignalMap,
    state_names: &StateNames,
    child_indent: &str,
    mode: ExprParserMode,
) -> String {
    // W3 (plan d03/d04): the loop aliases are BINDINGS in scope for the body
    // and the key expr — an alias that shares a registered signal's name
    // shadows it. Legacy has no scope model, so `{#each items as count}`
    // emitted `leaf([count, setCount])` INSIDE the loop callback (the signal
    // tuple, not the row value). Under `--expr-parser ast` the body/key are
    // emitted against maps with the alias names REMOVED, so every downstream
    // decision (tuple fast paths, rewrites, thunk wrapping, nested blocks)
    // treats the alias as the plain loop variable it is. The LIST expression
    // (and the `{:empty}` length conds over it) evaluates OUTSIDE the alias
    // scope and keeps the original maps.
    //
    // Alias-name extraction reuses the sidecar's `extract_pattern_idents`
    // (destructuring-aware). The c10/c11 TORN patterns (`as [k, v]` split at
    // the comma into `[k` / `v]`) yield no idents and thus no filtering —
    // pattern aliases are W5's fix; until then they behave exactly as legacy.
    let mut alias_names = std::collections::BTreeSet::new();
    if mode == ExprParserMode::Ast {
        extract_pattern_idents(item_alias, &mut alias_names);
        if let Some(idx) = idx_alias {
            extract_pattern_idents(idx, &mut alias_names);
        }
    }
    let filtered_signal_map: SignalMap;
    let filtered_state_names: StateNames;
    let (body_signal_map, body_state_names): (&SignalMap, &StateNames) = if alias_names
        .iter()
        .any(|n| signal_map.0.contains_key(n) || state_names.contains(n))
    {
        filtered_signal_map = SignalMap(
            signal_map
                .0
                .iter()
                .filter(|(k, _)| !alias_names.contains(*k))
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect(),
        );
        filtered_state_names = StateNames(
            state_names
                .0
                .iter()
                .filter(|n| !alias_names.contains(*n))
                .cloned()
                .collect(),
        );
        (&filtered_signal_map, &filtered_state_names)
    } else {
        (signal_map, state_names)
    };

    let next_indent = format!("{}  ", child_indent);
    let body_parts: Vec<String> = body
        .iter()
        .map(|c| emit_node(c, body_signal_map, body_state_names, &next_indent, mode))
        .filter(|s| !s.is_empty())
        .collect();
    let body_str = if body_parts.len() == 1 {
        body_parts.into_iter().next().unwrap()
    } else {
        format!("branch('', undefined, [{}])", body_parts.join(", "))
    };

    let idx = idx_alias.unwrap_or("i");
    let key_part = match key_expr {
        // FEL-172: key exprs may read getters by value. W3: the key runs with
        // the alias bound (`({alias}) => key`), so it uses the alias-filtered
        // map under AST mode.
        Some(k) => format!(
            "({}) => {}",
            item_alias,
            rewrite_template_expr(k, body_signal_map, mode).source
        ),
        None => "undefined".to_string(),
    };

    // FEL-172: complex list exprs read getters by value
    // (`{#each section.data as it}` → `section().data`).
    let rewritten_list = rewrite_template_expr(list_expr, signal_map, mode).source;
    let items_arg = if signal_map.is_reactive(list_expr) {
        if let Some(setter) = signal_map.0.get(list_expr) {
            if !setter.is_empty() {
                format!("[{}, {}]", list_expr, setter)
            } else {
                format!("[{}]", list_expr)
            }
        } else {
            format!("[() => ({})]", rewritten_list)
        }
    } else {
        // Complex expression — wrap in thunk array to take Path 2.
        format!("[() => ({})]", rewritten_list)
    };

    let each_call = if signal_map.is_reactive(list_expr) {
        format!(
            "each({}, {}, ({}, {}) => {{ return {} }})",
            items_arg, key_part, item_alias, idx, body_str
        )
    } else {
        format!(
            "createEachBoundary({}, {}, ({}, {}) => {{ return {} }})",
            items_arg, key_part, item_alias, idx, body_str
        )
    };

    // {:empty} fallback: emit two sibling when() boundaries — one for the
    // populated case (length > 0) and one for the empty case (length === 0).
    if let Some(eb) = empty_body {
        let empty_parts: Vec<String> = eb
            .iter()
            .map(|c| emit_node(c, signal_map, state_names, &next_indent, mode))
            .filter(|s| !s.is_empty())
            .collect();
        let empty_str = if empty_parts.len() == 1 {
            empty_parts.into_iter().next().unwrap()
        } else {
            format!("branch('', undefined, [{}])", empty_parts.join(", "))
        };
        // Reactive length read uses thunk array. FEL-172: the cond thunks read
        // the list by value — a bare signal here would be a truthy function
        // with `.length === undefined`, so the populated branch would never fire.
        let cond_list = if signal_map.is_reactive(list_expr) {
            format!("{}()", list_expr)
        } else {
            rewritten_list.clone()
        };
        let populated_cond = format!("[() => (({}) && ({}).length > 0)]", cond_list, cond_list);
        let empty_cond = format!("[() => !(({}) && ({}).length > 0)]", cond_list, cond_list);
        return format!(
            "branch('', undefined, [createIfBoundary({}, () => {{ return {} }}), createIfBoundary({}, () => {{ return {} }})])",
            populated_cond, each_call, empty_cond, empty_str
        );
    }

    each_call
}

/// B3 — Lower a `{@html expr}` block to the same IIFE pattern as `$html`.
fn emit_html_block(expr: &str, indent: &str) -> String {
    // Mirror the `$html` attribute-form lowering: build a fragment branch with
    // a placeholder element whose content gets replaced reactively.
    format!(
        "(() => {{ const _n = branch('span', {{ 'data-aihu-html': '' }}, []); onMount(() => {{ const _el = _n && _n.el; if (!_el) return () => {{}}; const _s = effect(() => {{ _el.replaceChildren(document.createRange().createContextualFragment({})); }}); return () => {{ _s && _s(); }}; }}); return _n; }})(){}",
        expr,
        if indent.is_empty() { "" } else { "" }
    )
}

// ─── v0.5 Macro element boundary emitters ────────────────────────────────────

/// Emit JS for a `<$element>` macro boundary node.
fn emit_macro_element(
    name: &str,
    attrs: &[crate::types::Attr],
    children: &[TemplateNode],
    signal_map: &SignalMap,
    state_names: &StateNames,
    child_indent: &str,
    mode: ExprParserMode,
) -> String {
    let next_indent = format!("{}  ", child_indent);

    match name {
        // ── <group> — §2.5 invisible fragment carrier ────────────────────────
        // Renders no DOM element of its own; exists to carry `each`/`key`/`if`
        // (and the other §2.4 words) over a multi-element body. The wrapping
        // directives are applied by the caller (emit_node's MacroElement arm)
        // via emit_macro_effects, exactly as for plain elements.
        "group" => {
            // emit_nodes already yields the leanest fragment shape: a single
            // child passes through; multiple children wrap in a fragment
            // branch; an empty group renders nothing.
            emit_nodes(children, signal_map, state_names, &next_indent, mode)
        }

        // ── <slot> ───────────────────────────────────────────────────────────
        "slot" => {
            let expose_list = find_static_attr(attrs, "expose");
            let name_attr = find_static_attr(attrs, "name");

            let expose_arr = if let Some(expose_str) = expose_list {
                let items: Vec<String> = expose_str
                    .split(',')
                    .map(|s| format!("'{}'", s.trim()))
                    .collect();
                format!("[{}]", items.join(", "))
            } else {
                "[]".to_string()
            };

            let children_subtree = if children.is_empty() {
                String::new()
            } else {
                emit_nodes(children, signal_map, state_names, &next_indent, mode)
            };

            let child_fn = if children_subtree.is_empty() {
                "() => { return branch(null, undefined, []) }".to_string()
            } else {
                format!("() => {{ return {} }}", children_subtree)
            };

            if let Some(slot_name) = name_attr {
                format!(
                    "createSlotBoundary({{ name: '{}', expose: {} }}, {})",
                    slot_name, expose_arr, child_fn
                )
            } else {
                format!(
                    "createSlotBoundary({{ expose: {} }}, {})",
                    expose_arr, child_fn
                )
            }
        }

        // ── <$suspense> ──────────────────────────────────────────────────────
        "suspense" => {
            let source = find_static_or_binding_attr(attrs, "source")
                .unwrap_or_else(|| "undefined".to_string());

            let (fallback_children, loaded_children) = split_slot_fallback(children);

            let fallback_subtree = emit_nodes(&fallback_children, signal_map, state_names, &next_indent, mode);
            let loaded_subtree = emit_nodes(&loaded_children, signal_map, state_names, &next_indent, mode);

            format!(
                "createSuspenseBoundary({}, () => {{ return {} }}, () => {{ return {} }})",
                source, fallback_subtree, loaded_subtree
            )
        }

        // ── <$shield> ────────────────────────────────────────────────────────
        "shield" => {
            let (fallback_children, main_children) = split_slot_fallback(children);

            let main_subtree = emit_nodes(&main_children, signal_map, state_names, &next_indent, mode);
            let fallback_subtree = emit_nodes(&fallback_children, signal_map, state_names, &next_indent, mode);

            format!(
                "createShieldBoundary(() => {{ return {} }}, (shield) => {{ return {} }})",
                main_subtree, fallback_subtree
            )
        }

        // ── <$guard> ─────────────────────────────────────────────────────────
        // v0.3.0: `scope="..."` attribute lowers to `when(getScopeSignal(scope), ...)`
        // per RFC §3 / Layer 3. `getScopeSignal` is imported from `@aihu/auth`.
        //
        // [SECURITY] Amendment 7 §6.11: always emit a [SECURITY] warning when
        // `scope` is used on `<$guard>` in v0.3.0 (option c — always-warn until
        // @aihu/auth build-graph detection lands in a future release). The warning
        // is at compile time; the runtime is fail-closed (no auth → no render).
        //
        // If `scope` attribute is absent, falls back to `check` attribute (legacy).
        "guard" => {
            // v0.3.0: detect `scope="..."` attribute (must be a string literal).
            let scope_attr = find_static_attr(attrs, "scope");

            if let Some(scope_name) = scope_attr {
                // [SECURITY] Amendment 7 §6.11 — always warn in v0.3.0.
                eprintln!(
                    "[SECURITY] <$guard scope=\"{}\">: @aihu/auth cannot be verified at compile \
                     time (v0.3.0). Ensure @aihu/auth is installed and configured before \
                     deploying to production. Runtime is fail-closed: if getScopeSignal returns \
                     falsy, nothing renders.",
                    scope_name
                );

                let main_subtree = emit_nodes(children, signal_map, state_names, &next_indent, mode);
                // Lower to: when(getScopeSignal('scope'), () => branch(...children...))
                // `getScopeSignal` is imported from `@aihu/auth` at consumer build time.
                // The guard_boundary helper is not used for scope-form; when() is used directly.
                format!(
                    "when(getScopeSignal('{}'), () => {{ return {} }})",
                    scope_name, main_subtree
                )
            } else {
                // Legacy `check` attribute form.
                let check_expr = find_static_or_binding_attr(attrs, "check")
                    .unwrap_or_else(|| "undefined".to_string());

                let (fallback_children, main_children) = split_slot_fallback(children);

                let main_subtree = emit_nodes(&main_children, signal_map, state_names, &next_indent, mode);
                let fallback_subtree = emit_nodes(&fallback_children, signal_map, state_names, &next_indent, mode);

                format!(
                    "createGuardBoundary({}, () => {{ return {} }}, (guard) => {{ return {} }})",
                    check_expr, main_subtree, fallback_subtree
                )
            }
        }

        // ── <$warp> ──────────────────────────────────────────────────────────
        // NOTE(v0.5-stub): createWarpBoundary requires arbor.mount to accept an arbitrary
        // host node. If arbor.mount only accepts a custom-element host, this boundary
        // is a stub pending an arbor mount API extension.
        "warp" => {
            let target_expr = find_static_or_binding_attr(attrs, "target")
                .unwrap_or_else(|| "undefined".to_string());

            let children_subtree = emit_nodes(children, signal_map, state_names, &next_indent, mode);
            let child_fn = format!("() => {{ return {} }}", children_subtree);

            format!(
                "createWarpBoundary({}, {})\n{}// NOTE(v0.5-stub): createWarpBoundary requires arbor.mount to accept an arbitrary\n{}// host node. If arbor.mount only accepts a custom-element host, this boundary\n{}// is a stub pending an arbor mount API extension.",
                target_expr,
                child_fn,
                child_indent,
                child_indent,
                child_indent
            )
        }

        // ── arch-5 M1 a11y primitives ────────────────────────────────────────

        // <$liveRegion politeness="polite|assertive" atomic={bool}> — RFC-A5-017.
        // Lowers to <div role="status" aria-live="..." aria-atomic="true">. Pure DOM,
        // no runtime helper.
        "liveRegion" => {
            let politeness = find_static_attr(attrs, "politeness").unwrap_or("polite");
            // Validate politeness: silently coerce unknown values to 'polite' rather
            // than failing the build — defensive for HMR/templating cases.
            let politeness = if politeness == "assertive" { "assertive" } else { "polite" };
            let atomic = find_static_attr(attrs, "atomic")
                .map(|v| v != "false")
                .unwrap_or(true);
            let atomic_str = if atomic { "true" } else { "false" };
            let children_subtree = emit_nodes(children, signal_map, state_names, &next_indent, mode);
            // children_subtree is the wrapped branch; we want its children only. Easiest:
            // emit a branch wrapping the existing subtree as a single fragment child.
            format!(
                "branch('div', {{ role: 'status', 'aria-live': '{}', 'aria-atomic': '{}' }}, [{}])",
                politeness, atomic_str, children_subtree
            )
        }

        // <$visuallyHidden> — RFC-A5-020. Pure CSS span; sr-only class injected
        // once at component mount via _ensureA11yStyles().
        "visuallyHidden" => {
            let children_subtree = emit_nodes(children, signal_map, state_names, &next_indent, mode);
            format!(
                "branch('span', {{ class: 'aihu-sr-only' }}, [{}])",
                children_subtree
            )
        }

        // <$skipLink target="#id"> — RFC-A5-019. Pure HTML/CSS anchor; class
        // injected once at component mount.
        "skipLink" => {
            let target = find_static_attr(attrs, "target").unwrap_or("#main");
            let children_subtree = emit_nodes(children, signal_map, state_names, &next_indent, mode);
            format!(
                "branch('a', {{ href: '{}', class: 'aihu-skip-link' }}, [{}])",
                target, children_subtree
            )
        }

        // <$focusTrap active={...} returnFocus initialFocus="..."> — RFC-A5-018.
        // `createFocusTrap` is imported from @aihu/runtime; lowering hands it
        // the active getter (signal-ref via `() => expr` for curly bindings),
        // returnFocus flag, optional initialFocus selector, and a child function.
        "focusTrap" => {
            // active: curly `active={expr}` lands as `Attr::Binding`;
            // static `active="isOpen"` lands as `Attr::Static`. Wrap both in
            // `() => (expr)` so the helper can re-read on focus changes.
            // Literal `"true"`/`"false"` pass through as booleans.
            let active_expr = match attrs.iter().find_map(|a| match a {
                crate::types::Attr::Binding { name, expr } if name == "active" => {
                    Some(format!("() => ({})", expr))
                }
                crate::types::Attr::Static { name, value } if name == "active" => {
                    if value == "true" || value == "false" {
                        Some(value.clone())
                    } else {
                        Some(format!("() => ({})", value))
                    }
                }
                _ => None,
            }) {
                Some(e) => e,
                None => "false".to_string(),
            };

            // returnFocus: void-style boolean attr (`returnFocus`), static
            // (`returnFocus="false"`), or curly (`returnFocus={expr}`). Default
            // is `true` per spec.
            let return_focus = attrs.iter().find_map(|a| match a {
                crate::types::Attr::Static { name, value } if name == "returnFocus" => {
                    if value.is_empty() {
                        Some("true".to_string())
                    } else if value == "false" {
                        Some("false".to_string())
                    } else {
                        Some("true".to_string())
                    }
                }
                crate::types::Attr::Binding { name, expr } if name == "returnFocus" => {
                    Some(expr.clone())
                }
                _ => None,
            }).unwrap_or_else(|| "true".to_string());

            let initial_focus = match find_static_attr(attrs, "initialFocus") {
                Some(s) => format!("'{}'", s),
                None => "null".to_string(),
            };

            let children_subtree = emit_nodes(children, signal_map, state_names, &next_indent, mode);
            format!(
                "createFocusTrap({}, {}, {}, () => {{ return {} }})",
                active_expr, return_focus, initial_focus, children_subtree
            )
        }

        // ── arch-5 M1 routing macro elements ─────────────────────────────────
        "router" => {
            // `<$router>` — RFC-A5-011. Provides RouteContext to descendants.
            // Optional attribute `router={expr}` — when omitted, falls back to
            // `createRouter(routes)` using the file-system routes virtual module.
            let router_expr = find_static_or_binding_attr(attrs, "router")
                .unwrap_or_else(|| "__aihuRouter.createRouter((globalThis.__aihu_routes ?? []))".to_string());
            let vt_expr = find_static_or_binding_attr(attrs, "viewTransitions")
                .unwrap_or_else(|| "false".to_string());
            let children_subtree = emit_nodes(children, signal_map, state_names, &next_indent, mode);
            format!(
                "createRouterBoundary({}, {}, () => {{ return {} }})",
                router_expr, vt_expr, children_subtree
            )
        }

        "link" => {
            // `<$link href prefetch replace>` — RFC-A5-012.
            // A DYNAMIC href (`href={expr}`) is passed as a THUNK so the
            // boundary can bind it reactively (mirroring a plain
            // `<a $href={…}>`); the old eager form evaluated the expr once at
            // the call site and baked the string into the <a>, so a selection
            // signal change never updated the link. A static href stays a
            // quoted string (no needless per-link effect).
            let href_expr =
                link_href_arg(attrs, signal_map, mode).unwrap_or_else(|| "'#'".to_string());
            let prefetch_expr = find_static_or_binding_attr(attrs, "prefetch")
                .unwrap_or_else(|| "'none'".to_string());
            let replace_expr = find_static_or_binding_attr(attrs, "replace")
                .unwrap_or_else(|| "false".to_string());
            // Forward the author's OTHER attributes onto the rendered <a>
            // (class, id, aria-*, $on:click, $bind:*) via the same path plain
            // elements use. The <$link> props (href/prefetch/replace) are passed
            // explicitly and excluded here. Structural/effect directives
            // ($each/$if/$key/$class:/$show) are NOT consumed here —
            // emit_macro_effects applies them at the call site (emit_node's
            // MacroElement arm), exactly as for plain elements.
            let forwarded: Vec<Attr> = attrs
                .iter()
                .filter(|a| {
                    let n = match a {
                        Attr::Static { name, .. } => name.as_str(),
                        Attr::Binding { name, .. } => name.as_str(),
                        Attr::Macro { name, .. } => name.as_str(),
                    };
                    !matches!(n, "href" | "prefetch" | "replace")
                })
                .cloned()
                .collect();
            let attrs_obj = emit_attrs(&forwarded, state_names, signal_map, mode);
            // Children render inside the <a>.
            let children_subtree = if children.is_empty() {
                "[]".to_string()
            } else {
                let inner = emit_nodes(children, signal_map, state_names, &next_indent, mode);
                format!("[{}]", inner)
            };
            format!(
                "createLinkBoundary({}, {}, {}, {}, {})",
                href_expr, prefetch_expr, replace_expr, attrs_obj, children_subtree
            )
        }

        "outlet" => {
            // `<$outlet>` — RFC-A5-013. No props.
            "createOutletBoundary()".to_string()
        }

        "navigate" => {
            // `<$navigate to replace />` — RFC-A5-014.
            let to_expr = find_static_or_binding_attr(attrs, "to")
                .unwrap_or_else(|| "'/'".to_string());
            let replace_expr = find_static_or_binding_attr(attrs, "replace")
                .unwrap_or_else(|| "false".to_string());
            format!("createNavigateBoundary({}, {})", to_expr, replace_expr)
        }

        // ── Unknown macro element ─────────────────────────────────────────────
        _ => {
            let children_subtree = emit_nodes(children, signal_map, state_names, &next_indent, mode);
            format!(
                "/* <${}> unknown macro element — passthrough */ {}",
                name, children_subtree
            )
        }
    }
}

/// Find a static attribute value by name.
fn find_static_attr<'a>(attrs: &'a [crate::types::Attr], attr_name: &str) -> Option<&'a str> {
    attrs.iter().find_map(|a| match a {
        crate::types::Attr::Static { name, value } if name == attr_name => Some(value.as_str()),
        _ => None,
    })
}

/// Find a static OR curly-binding attribute value by name.
/// `<$link href>` argument for `createLinkBoundary`. A dynamic href
/// (`href={expr}`) is wrapped in a thunk `() => (expr)` so the boundary binds
/// it reactively (the eager form baked the value once → links never tracked a
/// selection signal). A static href (`href="/x"`) stays a quoted string so
/// static links pay no per-link effect. Bare getter reads in the expr are
/// rewritten to calls (FEL-172) so prop/signal hrefs read values, not the
/// getter function.
fn link_href_arg(
    attrs: &[crate::types::Attr],
    signal_map: &SignalMap,
    mode: ExprParserMode,
) -> Option<String> {
    use crate::types::Attr;
    attrs.iter().find_map(|a| match a {
        Attr::Static { name, value } if name == "href" => Some(format!("'{}'", value)),
        Attr::Macro {
            name,
            value: MacroValue::Quoted(s),
        } if name == "href" => Some(format!("'{}'", s)),
        Attr::Binding { name, expr } if name == "href" => Some(format!(
            "() => ({})",
            rewrite_template_expr(expr, signal_map, mode).source
        )),
        Attr::Macro {
            name,
            value: MacroValue::Curly(expr),
        } if name == "href" => Some(format!(
            "() => ({})",
            rewrite_template_expr(expr, signal_map, mode).source
        )),
        _ => None,
    })
}

/// The surface name of an attribute, whatever its form.
fn attr_name(a: &Attr) -> &str {
    match a {
        Attr::Static { name, .. } => name.as_str(),
        Attr::Binding { name, .. } => name.as_str(),
        Attr::Macro { name, .. } => name.as_str(),
    }
}

/// §2.6 — is this `<a>` SPA-enhanced? True when it has an `href` and none of
/// the opt-outs apply: explicit `reload`, `download` present, static
/// `target="_blank"` (or a dynamic `target` — conservative), a static href
/// that is external-origin / non-http(s) / fragment-only. A dynamic href stays
/// enhanced — the runtime handler re-checks origin+scheme per click.
fn anchor_is_enhanced(attrs: &[Attr]) -> bool {
    let mut has_href = false;
    for a in attrs {
        match attr_name(a) {
            "reload" | "download" => return false,
            "target" => match a {
                Attr::Static { value, .. } if value == "_blank" => return false,
                Attr::Binding { .. } => return false,
                _ => {}
            },
            "href" => match a {
                Attr::Static { value, .. } => {
                    if !static_href_is_internal(value) {
                        return false;
                    }
                    has_href = true;
                }
                Attr::Binding { .. } => {
                    has_href = true;
                }
                _ => {}
            },
            _ => {}
        }
    }
    has_href
}

/// A static href is an internal SPA destination when it is a same-origin
/// path: rooted (`/x`, but not protocol-relative `//host`), explicit-relative
/// (`./x`, `../x`), or a bare relative segment. Absolute URLs (any scheme —
/// the origin is unknowable at compile time), `mailto:`/`tel:`, and
/// fragment-only hrefs are plain navigation.
fn static_href_is_internal(href: &str) -> bool {
    let h = href.trim();
    if h.is_empty() || h.starts_with('#') {
        return false;
    }
    if h.starts_with("//") {
        return false;
    }
    if h.starts_with('/') || h.starts_with("./") || h.starts_with("../") {
        return true;
    }
    for c in h.chars() {
        match c {
            ':' => return false,
            '/' | '?' | '#' => return true,
            _ => {}
        }
    }
    true
}

/// §2.6 — lower an enhanced `<a>` to the same `createLinkBoundary` call the
/// retired `<$link>` compiled to: the element the author writes and the
/// element the runtime renders are the same element.
fn emit_enhanced_anchor(
    attrs: &[Attr],
    children: &[TemplateNode],
    signal_map: &SignalMap,
    state_names: &StateNames,
    child_indent: &str,
    mode: ExprParserMode,
) -> String {
    let next_indent = format!("{}  ", child_indent);
    let href_expr = link_href_arg(attrs, signal_map, mode).unwrap_or_else(|| "'#'".to_string());
    let prefetch_expr = find_static_or_binding_attr(attrs, "prefetch")
        .unwrap_or_else(|| "'none'".to_string());
    // Bare `replace` means true (boolean-attribute semantics).
    let replace_expr = attrs
        .iter()
        .find_map(|a| match a {
            Attr::Static { name, value } if name == "replace" => Some(
                if value.is_empty() || value == "true" {
                    "true".to_string()
                } else {
                    "false".to_string()
                },
            ),
            Attr::Binding { name, expr } if name == "replace" => Some(expr.clone()),
            _ => None,
        })
        .unwrap_or_else(|| "false".to_string());
    // Forward the author's OTHER attributes onto the rendered <a> (class, id,
    // aria-*, on:click, bind:*) via the same path plain elements use.
    // Structural/effect directives (each/if/key/class:/show) are NOT consumed
    // here — emit_macro_effects applies them at the call site.
    let forwarded: Vec<Attr> = attrs
        .iter()
        .filter(|a| !matches!(attr_name(a), "href" | "prefetch" | "replace" | "reload"))
        .cloned()
        .collect();
    let attrs_obj = emit_attrs(&forwarded, state_names, signal_map, mode);
    let children_subtree = if children.is_empty() {
        "[]".to_string()
    } else {
        let inner = emit_nodes(children, signal_map, state_names, &next_indent, mode);
        format!("[{}]", inner)
    };
    format!(
        "createLinkBoundary({}, {}, {}, {}, {})",
        href_expr, prefetch_expr, replace_expr, attrs_obj, children_subtree
    )
}

fn find_static_or_binding_attr(attrs: &[crate::types::Attr], attr_name: &str) -> Option<String> {
    attrs.iter().find_map(|a| match a {
        crate::types::Attr::Static { name, value } if name == attr_name => {
            Some(format!("'{}'", value))
        }
        // Plain bindings like `router={myRouter}` parsed as Attr::Binding.
        crate::types::Attr::Binding { name, expr } if name == attr_name => Some(expr.clone()),
        crate::types::Attr::Macro {
            name,
            value: MacroValue::Curly(expr),
        } if name == attr_name => Some(expr.clone()),
        crate::types::Attr::Macro {
            name,
            value: MacroValue::Quoted(s),
        } if name == attr_name => Some(s.clone()),
        _ => None,
    })
}

/// Partition children into (fallback_children, non_fallback_children).
fn split_slot_fallback(children: &[TemplateNode]) -> (Vec<TemplateNode>, Vec<TemplateNode>) {
    let mut fallback: Vec<TemplateNode> = Vec::new();
    let mut main: Vec<TemplateNode> = Vec::new();

    for child in children {
        let is_fallback = match child {
            TemplateNode::MacroElement { name, attrs, .. } if name == "slot" => {
                attrs.iter().any(|a| match a {
                    crate::types::Attr::Static { name, value } => {
                        name == "name" && value == "fallback"
                    }
                    _ => false,
                })
            }
            TemplateNode::Element { attrs, .. } => {
                attrs.iter().any(|a| match a {
                    crate::types::Attr::Static { name, value } => {
                        name == "slot" && value == "fallback"
                    }
                    _ => false,
                })
            }
            _ => false,
        };

        if is_fallback {
            match child {
                TemplateNode::MacroElement { children, .. } => {
                    fallback.extend(children.iter().cloned());
                }
                other => {
                    fallback.push(other.clone());
                }
            }
        } else {
            main.push(child.clone());
        }
    }

    (fallback, main)
}

fn emit_attrs(
    attrs: &[Attr],
    state_names: &StateNames,
    signal_map: &SignalMap,
    mode: ExprParserMode,
) -> String {
    // Filter out macro attrs that aren't pure attribute expressions
    // (those are handled via emit_macro_effects instead).
    //
    // R2 (Defect B): when a Binding/`$bind:` value references any name
    // declared in `@state`, lower the value to a single-element tuple
    // `[() => (expr)]`. arbor's `_applyAttrs` discriminates via
    // `Array.isArray(value)`: an array enters the reactive path, where
    // `value[0]` is invoked as the getter. Wrapping in a thunk array
    // achieves three goals at once:
    //
    //   1. `events={events}` where state initialises to `[]` no longer
    //      tripwires `Array.isArray([]) === true → call value[0]() →
    //      "TypeError: c is not a function"` (the LIVE crash on /calendar).
    //   2. Non-reactive plain `let` state still produces the *current*
    //      value at mount because the thunk is invoked once via
    //      `mountEffect`.
    //   3. When the underlying state IS reactive (signal/computed), the
    //      thunk re-invokes on every read inside the effect, so DOM
    //      attributes track signal changes natively.
    //
    // Static literal attributes and event handlers stay as plain values:
    // event handlers go through arbor's Path 1 (typeof === 'function');
    // statics go through Path 3 (string/number/boolean).
    let passthrough: Vec<String> = attrs
        .iter()
        .filter_map(|a| match a {
            Attr::Static { name, value } => {
                // Hyphenated attribute names (e.g. aria-label, data-foo) must be
                // quoted as JS object keys, otherwise the hyphen is parsed as minus.
                if name.contains('-') {
                    Some(format!("'{}': '{}'", name, value))
                } else {
                    Some(format!("{}: '{}'", name, value))
                }
            }
            Attr::Binding { name, expr } => {
                // Event-handler bindings (`<button onclick={handler}>`) take the
                // runtime's Path 1 (typeof === 'function'). They MUST stay raw —
                // wrapping them in a thunk array would put a function value
                // inside an array and trigger Path 2 instead, breaking events.
                let is_event = is_event_attr_name(name);
                // B3 — `class={[a, b && 'c']}` array form. When the binding is
                // `class` and the expression syntactically starts with `[`, wrap
                // the expression in `__aihu_cls([…])` so the runtime joins truthy
                // entries with spaces. Detection is conservative — only direct
                // bracket-literal at top level. Other class expressions
                // (`class={cond ? 'a' : 'b'}`) pass through unchanged.
                let lowered = if is_event {
                    // FEL-172: rewrite bare getter reads inside handler bodies
                    // (`$on.click={() => select(section)}` → `select(section())`).
                    // A bare-ident handler (`$on.click={increment}`) is left
                    // verbatim — it's the function itself, not a read.
                    let t = expr.trim();
                    let bare_ident = !t.is_empty()
                        && t.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
                    if bare_ident {
                        expr.to_string()
                    } else {
                        rewrite_template_expr(t, signal_map, mode).source
                    }
                } else if name == "class" && expr.trim_start().starts_with('[') {
                    // W3 (plan b04): legacy NEVER rewrote inside the class
                    // array, so `$class={[...items, 'x']}` spread the getter
                    // FUNCTION (silent runtime crash) and even plain signal
                    // reads (`[active ? 'on' : '']`) read the getter object.
                    // AST mode rewrites the array expression like any other
                    // binding; legacy copies it verbatim (byte-identical).
                    let inner = match mode {
                        ExprParserMode::Legacy => expr.trim().to_string(),
                        ExprParserMode::Ast => {
                            rewrite_template_expr(expr.trim(), signal_map, mode).source
                        }
                    };
                    // Wrap the array in a class-joining helper. The wrapped form
                    // becomes `[() => __aihu_cls([…])]` — a thunk-array reactive
                    // binding that still tracks signal updates via mountEffect.
                    format!("[() => __aihu_cls({})]", inner)
                } else {
                    lower_attr_expr(expr, state_names, signal_map, mode)
                };
                Some(format!("{}: {}", format_attr_key(name), lowered))
            }
            Attr::Macro { name, value } => {
                // $bind:prop and $on:event emit as direct attrs in the attrs object;
                // other macros ($if, $show, $each, etc.) are emitted as effects outside.
                if let Some(prop) = name.strip_prefix("bind:") {
                    let expr = macro_value_expr(value);
                    Some(format!(
                        "{}: {}",
                        format_attr_key(prop),
                        lower_attr_expr(&expr, state_names, signal_map, mode)
                    ))
                } else if let Some(event_full) = name.strip_prefix("on:") {
                    // §2.4 — dotted modifiers: `on:click.prevent`, `on:submit.once`.
                    let (event, mods): (&str, Vec<&str>) = match event_full.split_once('.') {
                        Some((e, m)) => (e, m.split('.').collect()),
                        None => (event_full, Vec::new()),
                    };
                    let handler = macro_value_expr(value);
                    // FEL-172: same handler-body rewrite as the Binding path.
                    let t = handler.trim();
                    let bare_ident = !t.is_empty()
                        && t.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
                    let lowered_handler = if bare_ident {
                        handler.clone()
                    } else {
                        rewrite_template_expr(t, signal_map, mode).source
                    };
                    let wrapped = wrap_event_modifiers(&lowered_handler, &mods);
                    Some(format!("on{}: {}", capitalize_first(event), wrapped))
                } else {
                    None
                }
            }
        })
        .collect();

    // R4 (Director r6 §3.R4): two-way `$bind:value` / `$bind:checked` write-side.
    // When a `$bind:` macro references a registered signal (i.e. has a setter
    // in `signal_map`), additionally emit an event listener that writes back
    // to the signal on user input. `oninput` for `value` (textboxes, ranges);
    // `onchange` for `checked` (checkboxes / radios). The userland-authored
    // `on:` handler (if any) is preserved verbatim above; the bind write-back
    // is composed alongside it.
    let mut bind_writebacks: Vec<String> = Vec::new();
    for a in attrs {
        if let Attr::Macro { name, value } = a {
            if let Some(prop) = name.strip_prefix("bind:") {
                let expr = macro_value_expr(value);
                let trimmed = expr.trim();
                let is_simple_ident = !trimmed.is_empty()
                    && trimmed
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
                if is_simple_ident {
                    if let Some(setter) = signal_map.0.get(trimmed) {
                        if !setter.is_empty() {
                            // Pick the event by bound prop. WHATWG: `value` mutates on
                            // `input`; `checked` mutates on `change`. Other props use
                            // `change` as a sane default (safe since custom elements
                            // dispatching custom events override this anyway).
                            let evt = match prop {
                                "checked" => "change",
                                _ => "input",
                            };
                            // B3 / R4 typed-conv (Director r7 §2 Surface 1):
                            // Mirror R1's `_convert` direction at the write site.
                            // The input event always gives back a string; if the
                            // bound signal currently holds a number/boolean, coerce.
                            // Compiler emits a small inline conversion helper:
                            //   __aihu_conv(currentValue, inputString)
                            // which inspects `typeof currentValue` and parses the
                            // input string accordingly. Falls back to identity for
                            // strings and unknown types.
                            //
                            // For `checked` (boolean by platform contract) we read
                            // e.target.checked directly — no conversion needed.
                            let read_expr = if prop == "checked" {
                                "e.target.checked".to_string()
                            } else {
                                // R4 typed-conv at $bind.value write site:
                                //   __aihu_conv(getter(), e.target.value)
                                format!("__aihu_conv({}(), e.target.value)", trimmed)
                            };
                            let evt_cap = capitalize_first(evt);
                            // Avoid clobbering an existing `on{Event}: ...` userland
                            // attribute in the same attrs object: detect in passthrough
                            // by scanning the rendered strings.
                            let on_key = format!("on{}", evt_cap);
                            let already_has_on = passthrough
                                .iter()
                                .any(|s| s.starts_with(&format!("{}:", on_key)));
                            if !already_has_on {
                                bind_writebacks.push(format!(
                                    "{}: (e) => {}({})",
                                    on_key, setter, read_expr
                                ));
                            }
                        }
                    }
                }
            }
        }
    }

    let mut all_attrs = passthrough;
    all_attrs.extend(bind_writebacks);

    if all_attrs.is_empty() {
        "undefined".to_string()
    } else {
        format!("{{ {} }}", all_attrs.join(", "))
    }
}

/// Quote attribute keys that aren't valid bare JS identifiers (hyphenated
/// names like `aria-label`, `data-foo`, custom-attr keys for web components).
fn format_attr_key(name: &str) -> String {
    if name.contains('-') {
        format!("'{}'", name)
    } else {
        name.to_string()
    }
}

/// Return true if `name` is an event-handler attribute (`onclick`, `onSubmit`,
/// etc.). These take the runtime's Path 1 (typeof === 'function') so the
/// emitter must NOT wrap their values in `[() => expr]` thunk arrays.
fn is_event_attr_name(name: &str) -> bool {
    if !name.starts_with("on") || name.len() < 3 {
        return false;
    }
    // `on` followed by an uppercase letter (`onClick`, `onSubmit`) or a
    // lowercase letter that pairs with a known DOM event (heuristic: any
    // remaining char is alphabetic).
    name.as_bytes()[2].is_ascii_alphabetic()
}

/// Lower a binding expression for the runtime attr setter. When the expression
/// references any name declared in `@state`, wrap it in `[() => (expr)]` so
/// arbor's `_applyAttrs` takes the reactive Path 2 (Array.isArray + getter[0]).
/// Otherwise pass through unchanged so simple closed-over locals stay as
/// static primitives.
///
/// Identifier extraction is a lightweight token walk — sufficient for
/// well-formed JS expressions and indifferent to string-literal contents
/// because string contents would not match `@state` declarations.
fn lower_attr_expr(
    expr: &str,
    state_names: &StateNames,
    signal_map: &SignalMap,
    mode: ExprParserMode,
) -> String {
    let trimmed = expr.trim();
    // R5c: pass-through signal tuple when the expression is a simple
    // identifier that's a registered signal — matches the leaf-emission
    // shape and `when()` shape, avoids the `() => getter` wrap that yields
    // the function reference instead of the tracked value.
    let is_simple_ident = !trimmed.is_empty()
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
    if is_simple_ident && signal_map.is_reactive(trimmed) {
        if let Some(setter) = signal_map.0.get(trimmed) {
            if !setter.is_empty() {
                return format!("[{}, {}]", trimmed, setter);
            }
            return format!("[{}]", trimmed);
        }
    }
    // Thunk-wrap any binding that references local @state OR is a complex
    // (non-simple-identifier) expression. The latter mirrors `$if`/`$show`,
    // which always wrap complex conditions: a dynamic attr expression may read
    // an imported/provided reactive getter the compiler can't see in
    // `state_names` (e.g. a layout's `$class={activeStudy() ? …}` over a store),
    // so wrapping keeps the binding reactive. Bare non-reactive identifiers stay
    // eager (the simple-ident path above already handled reactive ones).
    // FEL-172: bare getter reads inside the expression are rewritten to calls
    // (`$class={section.kind === 'prose' ? 'a' : 'b'}` → `section().kind …`)
    // so the thunk reads VALUES, not the signal function.
    if expr_references_state(expr, state_names) || !is_simple_ident {
        format!(
            "[() => ({})]",
            rewrite_template_expr(trimmed, signal_map, mode).source
        )
    } else {
        expr.to_string()
    }
}

/// FEL-228: decide whether a text interpolation must be lowered to a reactive
/// thunk-leaf. True when the expression contains a function call `(` outside
/// string literals — this catches computed/getter calls (`{selBookLabel()}`,
/// `{label()}`) and expressions over imported reactive stores the compiler
/// cannot resolve to a bare signal, which previously compiled to an EAGER,
/// never-re-rendering `leaf(expr)`. Bare registered signals/computeds and
/// reactive dotted reads are already handled by the tuple paths above; plain
/// consts and pure loop-var projections (`{message}`, `{item.title}`) contain
/// no call and stay eager, avoiding a needless per-node reactive effect.
///
/// FEL-172: collect arrow-function parameter names appearing in `expr`, so the
/// signal-read rewrite can skip identifiers shadowed by handler params (e.g.
/// the `e` in `(e) => …`, or a param that happens to share a signal's name).
/// Over-collects inside parenthesized param lists (defaults/destructuring also
/// contribute their identifiers) — conservative: a missed rewrite, never a
/// broken one.
fn collect_arrow_params(expr: &str) -> std::collections::BTreeSet<String> {
    let mut params = std::collections::BTreeSet::new();
    let bytes = expr.as_bytes();
    let mut i = 0usize;
    let mut in_str: Option<u8> = None;
    while i + 1 < bytes.len() {
        let c = bytes[i];
        if let Some(q) = in_str {
            if c == b'\\' {
                i += 2;
                continue;
            }
            if c == q {
                in_str = None;
            }
            i += 1;
            continue;
        }
        if c == b'\'' || c == b'"' || c == b'`' {
            in_str = Some(c);
            i += 1;
            continue;
        }
        if c == b'=' && bytes[i + 1] == b'>' {
            // Walk back over whitespace to the params.
            let mut j = i;
            while j > 0 && bytes[j - 1].is_ascii_whitespace() {
                j -= 1;
            }
            if j > 0 && bytes[j - 1] == b')' {
                // Parenthesized list — scan back to the matching '('.
                let mut depth = 1usize;
                let mut k = j - 1;
                while k > 0 {
                    k -= 1;
                    match bytes[k] {
                        b')' => depth += 1,
                        b'(' => {
                            depth -= 1;
                            if depth == 0 {
                                break;
                            }
                        }
                        _ => {}
                    }
                }
                if depth == 0 {
                    let inner = &expr[k + 1..j - 1];
                    let mut start: Option<usize> = None;
                    for (idx, ch) in inner.char_indices() {
                        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '$' {
                            if start.is_none() {
                                start = Some(idx);
                            }
                        } else if let Some(s) = start.take() {
                            params.insert(inner[s..idx].to_string());
                        }
                    }
                    if let Some(s) = start {
                        params.insert(inner[s..].to_string());
                    }
                }
            } else {
                // Single bare-ident param: `e => …`.
                let end = j;
                let mut k = j;
                while k > 0
                    && (bytes[k - 1].is_ascii_alphanumeric()
                        || bytes[k - 1] == b'_'
                        || bytes[k - 1] == b'$')
                {
                    k -= 1;
                }
                if k < end {
                    params.insert(expr[k..end].to_string());
                }
            }
            i += 2;
            continue;
        }
        i += 1;
    }
    params
}

/// W3 (advanced-js-template-expressions) — the mode-dispatched signal-read
/// rewrite every template-expression lowering site calls.
///
/// `Legacy` (the default): the token-scanner rewrite below, byte-identical to
/// pre-W3 output. `Ast` (`--expr-parser ast`): the scope-aware span-edit
/// rewrite over the oxc AST (`expr::rewrite_signal_reads`) — spread,
/// template-literal `${…}` holes, arrow bodies, param defaults, and object
/// shorthand all rewrite correctly, and `reads_signal` reports whether the
/// expression actually reads a signal (post-shadowing) for the reactivity
/// decision. An unparseable capture (already C320/C321-rejected before emit
/// when compiled through `compile_full_with_options`; reachable only by
/// direct `emit()` callers) falls back to the legacy rewrite so emit always
/// produces output.
struct RewrittenExpr {
    source: String,
    /// AST mode only: the expression reads a registered signal after
    /// shadowing is resolved. Always `false` under `Legacy` (legacy decision
    /// sites don't consult it).
    reads_signal: bool,
}

/// W3 — true when `s` is nothing but `ident.ident[.ident…]` (the shape the
/// Interpolation dotted-base fast path exists for: `{user.name}`,
/// `{route.params.slug}`). Anything richer — calls, operators, optional
/// chaining, arrows — must go through the full rewrite under AST mode.
fn is_pure_dotted_path(s: &str) -> bool {
    s.contains('.')
        && s.split('.').all(|seg| {
            !seg.is_empty()
                && seg
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
        })
}

fn rewrite_template_expr(
    expr: &str,
    signal_map: &SignalMap,
    mode: ExprParserMode,
) -> RewrittenExpr {
    if mode == ExprParserMode::Ast {
        if let Some(result) = crate::expr::rewrite_signal_reads(expr, signal_map) {
            return RewrittenExpr {
                source: result.source,
                reads_signal: result.reads_signal,
            };
        }
    }
    RewrittenExpr {
        source: rewrite_signal_reads_to_calls(expr, signal_map),
        reads_signal: false,
    }
}

/// FEL-172 / FEL-173: rewrite bare reads of registered reactive getters
/// (props, signals, computeds — the keys of `signal_map`) to getter CALLS
/// inside a template expression, so expressions emitted into thunks read
/// values instead of function objects. `$if={section.kind === 'prose'}`
/// becomes `section().kind === 'prose'` — previously `.kind` was read off the
/// signal FUNCTION → always undefined → the branch silently never rendered.
///
/// The rewrite is token-based and deliberately conservative; an identifier is
/// rewritten only when ALL of:
///   - it is a key of `signal_map` (a compiled getter)
///   - not a member access (`obj.section` — prev significant char is `.`)
///   - not already a call (`section(...)` — next significant char is `(`)
///   - not an object-literal key (`{ section: 1 }`) or shorthand (`{ section }`)
///     — guarded only inside object-literal braces, tracked via a bracket
///     stack that distinguishes arrow BLOCK bodies (`=> { … }`) from literals
///   - not shadowed by an arrow param in the same expression
/// String/template literals are copied verbatim (template `${}` interpolation
/// is conservatively not entered, matching `expr_references_state`).
fn rewrite_signal_reads_to_calls(expr: &str, signal_map: &SignalMap) -> String {
    if signal_map.0.is_empty() {
        return expr.to_string();
    }
    let shadowed = collect_arrow_params(expr);
    let bytes = expr.as_bytes();
    let mut out = String::with_capacity(expr.len() + 8);
    let mut i = 0usize;
    // Bytes [flush_from..) not yet copied to `out`. Copied as a single UTF-8
    // slice the next time output diverges from input (a getter `()` append) and
    // once at the end. This preserves multibyte UTF-8 verbatim — the old
    // byte-by-byte `out.push(b as char)` mangled Greek/Hebrew/glyphs in string
    // literals into latin-1 mojibake. All tokenizing decisions key on ASCII
    // bytes (quotes, identifiers, delimiters), so every flush boundary lands on
    // a char boundary; non-ASCII bytes simply pass through inside a slice.
    let mut flush_from = 0usize;
    let mut prev_significant: u8 = 0;
    // Bracket context: '(' | '[' | 'O' (object-literal brace) | 'B' (block brace).
    let mut stack: Vec<u8> = Vec::new();
    let mut arrow_pending = false;

    let next_significant = |from: usize| -> Option<u8> {
        bytes[from..]
            .iter()
            .copied()
            .find(|b| !b.is_ascii_whitespace())
    };

    while i < bytes.len() {
        let c = bytes[i];
        // String / template literals: skip over verbatim (stay in flush region).
        if c == b'\'' || c == b'"' || c == b'`' {
            let quote = c;
            i += 1;
            while i < bytes.len() {
                if bytes[i] == b'\\' && i + 1 < bytes.len() {
                    i += 2;
                    continue;
                }
                if bytes[i] == quote {
                    i += 1;
                    break;
                }
                i += 1;
            }
            prev_significant = quote;
            arrow_pending = false;
            continue;
        }
        // Identifier token (ASCII-led).
        if c.is_ascii_alphabetic() || c == b'_' || c == b'$' {
            let start = i;
            while i < bytes.len()
                && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_' || bytes[i] == b'$')
            {
                i += 1;
            }
            let ident = &expr[start..i];
            let next = next_significant(i);
            let in_object = stack.last() == Some(&b'O');
            let after_open_or_comma =
                prev_significant == b'{' || prev_significant == b',' || prev_significant == 0;
            // Spread (`...xs`) ends in a `.`, but the ident it precedes is a
            // VALUE read, not a member access — distinguish it from real member
            // access (`obj.xs`) by looking back over whitespace for a `...` run.
            let is_spread = {
                let mut k = start;
                while k > 0 && bytes[k - 1].is_ascii_whitespace() {
                    k -= 1;
                }
                k >= 3 && &bytes[k - 3..k] == b"..."
            };
            let is_member = prev_significant == b'.' && !is_spread;
            let is_call = next == Some(b'(');
            let is_obj_key = in_object && after_open_or_comma && next == Some(b':');
            let is_obj_shorthand = in_object
                && after_open_or_comma
                && matches!(next, Some(b'}') | Some(b','));
            if !is_member
                && !is_call
                && !is_obj_key
                && !is_obj_shorthand
                && signal_map.0.contains_key(ident)
                && !shadowed.contains(ident)
            {
                // Flush everything through the identifier, then append the call.
                out.push_str(&expr[flush_from..i]);
                out.push_str("()");
                flush_from = i;
            }
            prev_significant = bytes[i - 1];
            arrow_pending = false;
            continue;
        }
        // Any other byte (operator, whitespace, or a multibyte UTF-8 byte):
        // stays in the flush region, copied verbatim later as part of a slice.
        if !c.is_ascii_whitespace() {
            match c {
                b'(' | b'[' => stack.push(c),
                b'{' => {
                    stack.push(if arrow_pending { b'B' } else { b'O' });
                }
                b')' | b']' | b'}' => {
                    stack.pop();
                }
                _ => {}
            }
            arrow_pending = c == b'>' && prev_significant == b'=';
            prev_significant = c;
        }
        i += 1;
    }
    out.push_str(&expr[flush_from..]);
    out
}

/// NOTE: interpolations are REWRITTEN first (`rewrite_signal_reads_to_calls`,
/// FEL-172/173) — `{count + 1}` becomes `count() + 1`, which then carries a
/// call and gets wrapped here. So this predicate runs on the rewritten form.
fn interpolation_has_call(expr: &str) -> bool {
    let bytes = expr.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        let c = bytes[i];
        // Skip string / template literals so a `(` inside text doesn't count.
        if c == b'\'' || c == b'"' || c == b'`' {
            let quote = c;
            i += 1;
            while i < bytes.len() {
                if bytes[i] == b'\\' && i + 1 < bytes.len() {
                    i += 2;
                    continue;
                }
                if bytes[i] == quote {
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }
        if c == b'(' {
            return true;
        }
        i += 1;
    }
    false
}

/// Return true iff `expr` contains an identifier token that matches any name
/// in `state_names`. Skips identifiers inside string literals and after a `.`
/// (member access — `obj.foo` where `foo` shadows a state name in property
/// position is not a state reference).
fn expr_references_state(expr: &str, state_names: &StateNames) -> bool {
    if state_names.0.is_empty() {
        return false;
    }
    let bytes = expr.as_bytes();
    let mut i = 0usize;
    let mut prev_significant: u8 = 0;
    while i < bytes.len() {
        let c = bytes[i];
        // Skip string literals — single, double, and template (no interpolation
        // tracking for templates; conservative: also skip backtick strings).
        if c == b'\'' || c == b'"' || c == b'`' {
            let quote = c;
            i += 1;
            while i < bytes.len() {
                if bytes[i] == b'\\' && i + 1 < bytes.len() {
                    i += 2;
                    continue;
                }
                if bytes[i] == quote {
                    i += 1;
                    break;
                }
                i += 1;
            }
            prev_significant = quote;
            continue;
        }
        // Skip line / block comments.
        if c == b'/' && i + 1 < bytes.len() {
            if bytes[i + 1] == b'/' {
                while i < bytes.len() && bytes[i] != b'\n' {
                    i += 1;
                }
                continue;
            }
            if bytes[i + 1] == b'*' {
                i += 2;
                while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                    i += 1;
                }
                if i + 1 < bytes.len() {
                    i += 2;
                }
                continue;
            }
        }
        // Identifier?
        if c.is_ascii_alphabetic() || c == b'_' || c == b'$' {
            let start = i;
            while i < bytes.len()
                && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_' || bytes[i] == b'$')
            {
                i += 1;
            }
            let ident = &expr[start..i];
            // Treat property-access positions (`.ident`, `?.ident`) as
            // non-references so `obj.events` doesn't match a state `events`.
            let is_member_access = prev_significant == b'.';
            if !is_member_access && state_names.contains(ident) {
                return true;
            }
            prev_significant = b'a'; // identifier marker
            continue;
        }
        if !c.is_ascii_whitespace() {
            prev_significant = c;
        }
        i += 1;
    }
    false
}

fn capitalize_first(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

/// §2.4 — compose `on:<event>.<mods>` dotted modifiers around the handler.
/// `.prevent` → preventDefault; `.stop` → stopPropagation; `.self` → only when
/// the event target IS the element; `.once` → fire at most once.
fn wrap_event_modifiers(handler: &str, mods: &[&str]) -> String {
    if mods.is_empty() {
        return handler.to_string();
    }
    let mut prelude = String::new();
    if mods.contains(&"self") {
        prelude.push_str("if (_e.target !== _e.currentTarget) return; ");
    }
    if mods.contains(&"prevent") {
        prelude.push_str("_e.preventDefault(); ");
    }
    if mods.contains(&"stop") {
        prelude.push_str("_e.stopPropagation(); ");
    }
    let core = format!("(_e) => {{ {}return ({})(_e); }}", prelude, handler);
    if mods.contains(&"once") {
        format!(
            "((_h) => {{ let _fired = false; return (_e) => {{ if (_fired) return; _fired = true; return _h(_e); }}; }})({})",
            core
        )
    } else {
        core
    }
}

fn macro_value_expr(value: &MacroValue) -> String {
    match value {
        MacroValue::Quoted(s) => s.clone(),
        MacroValue::Curly(s) => s.clone(),
        MacroValue::Boolean => "true".to_string(),
    }
}

/// B3b — Collect `$event` collection-form entry names from the parsed @state
/// macros. Used for compile-time `$emit.<name>` resolution (C501) and sidecar
/// typed-payload generation.
fn collect_event_names(macros: &[crate::types::StateMacro]) -> std::collections::BTreeSet<String> {
    use crate::types::{CollectionKind, StateMacro};
    let mut out = std::collections::BTreeSet::new();
    for m in macros {
        if let StateMacro::Collection { kind: CollectionKind::Event, entries } = m {
            for e in entries {
                out.insert(e.name.clone());
            }
        }
    }
    out
}

/// B3b — Rewrite `$emit.<name>(payload)` → `this.dispatchEvent(new CustomEvent(...))`.
///
/// Scans `expr` for `$emit.<ident>` followed by `(args)`. Args may contain
/// arbitrary JS, so paren-balanced extraction is used (string-aware).
/// Per Architect spec §5.e: lowers to `dispatchEvent(new CustomEvent(name, {
///   detail: payload, bubbles: true, composed: false, cancelable: true }))`
/// on the host element. The host is `this` in the SFC's setup function,
/// matching the post-customelement constructor context.
///
/// `event_names` are the declared `$event:` collection entries; emissions
/// targeting an undeclared name surface stderr with C501.
///
/// Idempotency: if the call has already been rewritten (no `$emit.` markers),
/// the input is returned unchanged.
fn lower_emit_calls(expr: &str, event_names: &std::collections::BTreeSet<String>) -> String {
    let bytes = expr.as_bytes();
    let mut out = String::with_capacity(expr.len());
    let mut i = 0;
    // Bytes [flush_from..) pending verbatim copy — flushed as a single UTF-8
    // slice at each `$emit` rewrite and once at the end. Strings, comments, and
    // gaps stay in this region rather than being copied byte-by-byte (the old
    // `out.push(b as char)` mangled multibyte UTF-8 into latin-1 mojibake). All
    // tokenizing keys on ASCII, so flush boundaries are always char boundaries.
    let mut flush_from = 0usize;
    while i < bytes.len() {
        // Skip strings to avoid rewriting `$emit.x` inside a string literal.
        let c = bytes[i];
        if c == b'"' || c == b'\'' || c == b'`' {
            let q = c;
            i += 1;
            while i < bytes.len() {
                let b = bytes[i];
                if b == b'\\' && i + 1 < bytes.len() {
                    i += 2;
                    continue;
                }
                i += 1;
                if b == q {
                    break;
                }
            }
            continue;
        }
        // Skip line + block comments.
        if c == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        if c == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                i += 1;
            }
            if i + 1 < bytes.len() {
                i += 2;
            }
            continue;
        }
        // Detect `$emit.<ident>(`.
        if expr[i..].starts_with("$emit.") {
            // Identifier scan.
            let name_start = i + 6;
            let mut name_end = name_start;
            while name_end < bytes.len() {
                let b = bytes[name_end];
                if b.is_ascii_alphanumeric() || b == b'_' || b == b'$' {
                    name_end += 1;
                } else {
                    break;
                }
            }
            // Skip whitespace.
            let mut p = name_end;
            while p < bytes.len() && (bytes[p] == b' ' || bytes[p] == b'\t') {
                p += 1;
            }
            if p < bytes.len() && bytes[p] == b'(' && name_end > name_start {
                let name = &expr[name_start..name_end];
                let close = match find_paren_close_local(expr, p) {
                    Some(k) => k,
                    None => {
                        // Malformed; leave verbatim (stays in the flush region).
                        i += 1;
                        continue;
                    }
                };
                let args = &expr[p + 1..close];
                let detail_arg = if args.trim().is_empty() {
                    "undefined".to_string()
                } else {
                    args.to_string()
                };
                // Compile-time validation: name must be in $event collection.
                if !event_names.is_empty() && !event_names.contains(name) {
                    eprintln!(
                        "C501: $emit.{} not declared — add `{}: {{ payload: <type> }}` to your @state $event collection",
                        name, name
                    );
                }
                out.push_str(&expr[flush_from..i]);
                out.push_str(&format!(
                    "this.dispatchEvent(new CustomEvent('{}', {{ detail: {}, bubbles: true, composed: false, cancelable: true }}))",
                    name, detail_arg
                ));
                i = close + 1;
                flush_from = i;
                continue;
            }
        }
        i += 1;
    }
    out.push_str(&expr[flush_from..]);
    out
}

/// B3b — Walk the template AST and apply `lower_emit_calls` to every
/// expression string (curly bindings, macro values, interpolations,
/// {#if}/{#each}/{@html} expressions). Mutates in place.
fn apply_emit_lowering_nodes(
    nodes: &mut [TemplateNode],
    event_names: &std::collections::BTreeSet<String>,
) {
    for node in nodes.iter_mut() {
        match node {
            TemplateNode::Element { attrs, children, .. }
            | TemplateNode::MacroElement { attrs, children, .. } => {
                for a in attrs.iter_mut() {
                    apply_emit_lowering_attr(a, event_names);
                }
                apply_emit_lowering_nodes(children, event_names);
            }
            TemplateNode::Interpolation(s) => {
                if s.contains("$emit.") {
                    *s = lower_emit_calls(s, event_names);
                }
            }
            TemplateNode::IfBlock { branches } => {
                for (cond, body) in branches.iter_mut() {
                    if cond.contains("$emit.") {
                        *cond = lower_emit_calls(cond, event_names);
                    }
                    apply_emit_lowering_nodes(body, event_names);
                }
            }
            TemplateNode::EachBlock { list_expr, key_expr, body, empty_body, .. } => {
                if list_expr.contains("$emit.") {
                    *list_expr = lower_emit_calls(list_expr, event_names);
                }
                if let Some(k) = key_expr {
                    if k.contains("$emit.") {
                        *k = lower_emit_calls(k, event_names);
                    }
                }
                apply_emit_lowering_nodes(body, event_names);
                if let Some(eb) = empty_body {
                    apply_emit_lowering_nodes(eb, event_names);
                }
            }
            TemplateNode::HtmlBlock { expr } => {
                if expr.contains("$emit.") {
                    *expr = lower_emit_calls(expr, event_names);
                }
            }
            TemplateNode::Text(_) => {}
        }
    }
}

fn apply_emit_lowering_attr(
    a: &mut Attr,
    event_names: &std::collections::BTreeSet<String>,
) {
    match a {
        Attr::Binding { expr, .. } => {
            if expr.contains("$emit.") {
                *expr = lower_emit_calls(expr, event_names);
            }
        }
        Attr::Macro { value, .. } => {
            if let MacroValue::Curly(s) = value {
                if s.contains("$emit.") {
                    *s = lower_emit_calls(s, event_names);
                }
            }
        }
        Attr::Static { .. } => {}
    }
}

/// Local copy of paren-close finder (string/comment-aware) for use in
/// `lower_emit_calls`. Returns the position of the matching `)` for the `(`
/// at `i`, or `None` on imbalance.
fn find_paren_close_local(s: &str, i: usize) -> Option<usize> {
    let bytes = s.as_bytes();
    if i >= bytes.len() || bytes[i] != b'(' {
        return None;
    }
    let mut depth: i32 = 0;
    let mut j = i;
    while j < bytes.len() {
        let c = bytes[j];
        if c == b'"' || c == b'\'' || c == b'`' {
            let q = c;
            j += 1;
            while j < bytes.len() {
                let b = bytes[j];
                if b == b'\\' && j + 1 < bytes.len() {
                    j += 2;
                    continue;
                }
                j += 1;
                if b == q {
                    break;
                }
            }
            continue;
        }
        if c == b'/' && j + 1 < bytes.len() && bytes[j + 1] == b'/' {
            while j < bytes.len() && bytes[j] != b'\n' {
                j += 1;
            }
            continue;
        }
        if c == b'/' && j + 1 < bytes.len() && bytes[j + 1] == b'*' {
            j += 2;
            while j + 1 < bytes.len() && !(bytes[j] == b'*' && bytes[j + 1] == b'/') {
                j += 1;
            }
            if j + 1 < bytes.len() {
                j += 2;
            }
            continue;
        }
        if c == b'(' {
            depth += 1;
        } else if c == b')' {
            depth -= 1;
            if depth == 0 {
                return Some(j);
            }
        }
        j += 1;
    }
    None
}

/// Emit side-effectful JS for macro attributes ($if, $show, $each, $html, etc.)
/// attached to an element identified by `el_var`.
/// A per-element effect directive ($show/$html/$class:/$ref) that wraps the
/// element node in an IIFE registering an onMount effect. These read the
/// element's `.el`, so they must nest immediately around the base node, inside
/// any structural boundary ($if/$each).
enum ElemEffect {
    Show(String),
    Html(String),
    Class(String, String),
    Ref(String),
}

impl ElemEffect {
    /// Wrap `inner` (the node expression this effect operates on) in the IIFE.
    fn wrap(&self, inner: &str, indent: &str) -> String {
        match self {
            ElemEffect::Show(expr) => format!(
                "{}(() => {{ const _n = {}; onMount(() => {{ const _el = _n && _n.el; if (!_el) return () => {{}}; const _s = effect(() => {{ _el.toggleAttribute('hidden', !({})) }}); return () => {{ _s && _s(); }}; }}); return _n; }})()",
                indent, inner, expr
            ),
            ElemEffect::Html(expr) => format!(
                "{}(() => {{ const _n = {}; onMount(() => {{ const _el = _n && _n.el; if (!_el) return () => {{}}; const _s = effect(() => {{ _el.replaceChildren(document.createRange().createContextualFragment({})); }}); return () => {{ _s && _s(); }}; }}); return _n; }})()",
                indent, inner, expr
            ),
            ElemEffect::Class(class_name, expr) => format!(
                "{}(() => {{ const _n = {}; onMount(() => {{ const _el = _n && _n.el; if (!_el) return () => {{}}; const _s = effect(() => {{ _el.classList.toggle('{}', Boolean({})) }}); return () => {{ _s && _s(); }}; }}); return _n; }})()",
                indent, inner, class_name, expr
            ),
            ElemEffect::Ref(setter_call) => format!(
                "{}(() => {{ const _n = {}; onMount(() => {{ const _el = _n && _n.el; if (_el) {{ {} }}; return () => {{}}; }}); return _n; }})()",
                indent, inner, setter_call
            ),
        }
    }
}

/// Compose all effect/structural directives on a single element into ONE nested
/// wrapper around `subtree`, returning it as a single-element Vec (or an empty
/// Vec when the element carries no such directives).
///
/// FEL-238: an element may carry MULTIPLE directives at once — e.g.
/// `<span $each=… $show=…>` or `<li $each=… $class:on=…>`. Each directive WRAPS
/// the node, so they must be COMPOSED (nested), not emitted as independent
/// siblings. Previously each directive built its own wrapper around the bare
/// `subtree` and the caller kept only the FIRST, silently dropping the rest.
/// When `$each` was the dropped one (it was always appended last), the element
/// rendered ONCE with the loop alias dangling, so descendant `$on` handlers —
/// and the element's own `$show`/`$class` thunks — closed over an undeclared
/// loop variable that never advanced per iteration (the production reader
/// opened verse 1's study for every tap).
///
/// Composition is innermost → outermost, independent of source order:
///   base node
///     → element effects ($show/$html/$class:/$ref — need the element's `.el`)
///       → $once / $memo / $if (structural boundaries)
///         → $each (iteration — OUTERMOST so its factory's loop alias scopes
///                  every inner wrapper and every descendant handler)
/// W3 d03 (grammar v2, attribute form) — when an element carries `each`, its
/// loop binders SHADOW same-named signals/state for everything evaluated
/// per-item (the element's own attrs, effects, `if`/`key` values, and its
/// children). Returns filtered map copies when a collision exists.
fn each_scoped_maps(
    attrs: &[Attr],
    signal_map: &SignalMap,
    state_names: &StateNames,
    mode: ExprParserMode,
) -> Option<(SignalMap, StateNames)> {
    if mode != ExprParserMode::Ast {
        return None;
    }
    let head = attrs.iter().find_map(|a| match a {
        Attr::Macro { name, value } if name == "each" => Some(macro_value_expr(value)),
        _ => None,
    })?;
    let head = crate::parser::directives::parse_each_of_head(&head).ok()?;
    let mut alias_names = std::collections::BTreeSet::new();
    extract_pattern_idents(&head.item, &mut alias_names);
    if let Some(ref idx) = head.idx {
        extract_pattern_idents(idx, &mut alias_names);
    }
    if !alias_names
        .iter()
        .any(|n| signal_map.0.contains_key(n) || state_names.contains(n))
    {
        return None;
    }
    let filtered_signal_map = SignalMap(
        signal_map
            .0
            .iter()
            .filter(|(k, _)| !alias_names.contains(*k))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
    );
    let filtered_state_names = StateNames(
        state_names
            .0
            .iter()
            .filter(|n| !alias_names.contains(*n))
            .cloned()
            .collect(),
    );
    Some((filtered_signal_map, filtered_state_names))
}

fn emit_macro_effects(
    attrs: &[Attr],
    _el_var: &str,
    subtree: &str,
    indent: &str,
    signal_map: &SignalMap,
    mode: ExprParserMode,
) -> Vec<String> {
    emit_macro_effects_scoped(attrs, _el_var, subtree, indent, signal_map, signal_map, mode)
}

/// `signal_map` scopes per-item positions (`if`/`key`/effects — loop binders
/// shadow); `list_signal_map` scopes the `each` LIST expression, which
/// evaluates in the OUTER scope (alias-shadows-iterable).
fn emit_macro_effects_scoped(
    attrs: &[Attr],
    _el_var: &str,
    subtree: &str,
    indent: &str,
    signal_map: &SignalMap,
    list_signal_map: &SignalMap,
    mode: ExprParserMode,
) -> Vec<String> {
    let mut elem_effects: Vec<ElemEffect> = Vec::new();
    let mut once = false;
    let mut memo_deps: Option<String> = None;
    let mut if_cond_arg: Option<String> = None;

    let mut has_each = false;
    let mut each_items = String::new();
    let mut key_fn = String::new();
    let mut item_alias = "item".to_string();
    let mut idx_alias = "i".to_string();

    for attr in attrs {
        let Attr::Macro { name, value } = attr else {
            continue;
        };
        match name.as_str() {
            "if" => {
                let cond = macro_value_expr(value);
                // R5c (Defect E follow-up): if cond is a simple identifier
                // that's a registered signal, pass the signal tuple directly
                // — `when()` reads `cond[0]()` reactively (matches the
                // leaf-emission shape for `{name}` interpolation). Wrapping
                // a signal in `[() => name]` would yield the getter function
                // (truthy), making the condition always true.
                let trimmed = cond.trim();
                let is_simple_ident = !trimmed.is_empty()
                    && trimmed
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
                let cond_arg = if is_simple_ident && signal_map.is_reactive(trimmed) {
                    if let Some(setter) = signal_map.0.get(trimmed) {
                        if !setter.is_empty() {
                            format!("[{}, {}]", trimmed, setter)
                        } else {
                            // computed signal — read-only getter, no setter
                            format!("[{}]", trimmed)
                        }
                    } else {
                        format!("[() => ({})]", trimmed)
                    }
                } else {
                    // complex expression — wrap in thunk. FEL-172: bare getter
                    // reads are rewritten to calls (`$if={section.kind === 'x'}`
                    // → `section().kind === 'x'`); previously `.kind` was read
                    // off the signal FUNCTION → always undefined → the branch
                    // silently never rendered.
                    format!(
                        "[() => ({})]",
                        rewrite_template_expr(trimmed, signal_map, mode).source
                    )
                };
                if_cond_arg = Some(cond_arg);
            }
            "show" => {
                // R3 (Director r6 §3.R3): lower $show to the platform `hidden`
                // attribute (NOT --show CSS custom property). `hidden` respects
                // user CSS [hidden] { display: none !important }; Shadow DOM
                // consumers can override via :host([hidden]) { display: ... }.
                // toggleAttribute is the WHATWG-canonical primitive: passing
                // `false` removes the attribute; `true` writes empty-string.
                // FEL-172: rewrite bare getter reads inside the effect body.
                elem_effects.push(ElemEffect::Show(
                    rewrite_template_expr(&macro_value_expr(value), signal_map, mode).source,
                ));
            }
            "each" => {
                has_each = true;
                let raw = macro_value_expr(value);
                // Grammar v2 — parse the `of` head: `<binder> [, <index>] of <list>`.
                match crate::parser::directives::parse_each_of_head(&raw) {
                    Ok(head) => {
                        each_items = head.list;
                        item_alias = head.item;
                        idx_alias = head.idx.unwrap_or_else(|| "i".to_string());
                    }
                    Err(_) => {
                        // Malformed heads are rejected at parse time; be safe.
                        each_items = raw;
                        item_alias = "item".to_string();
                        idx_alias = "i".to_string();
                    }
                }
            }
            "key" => {
                key_fn = macro_value_expr(value);
            }
            "html" => {
                // branch() returns a descriptor; .el is populated after arbor mounts it.
                // IIFE: capture node, wire reactive effect inside onMount, return node
                // so the parent children array receives the element (not a bare effect).
                // replaceChildren + createContextualFragment parses trusted build-time HTML.
                elem_effects.push(ElemEffect::Html(
                    rewrite_template_expr(&macro_value_expr(value), signal_map, mode).source,
                ));
            }
            "once" => {
                once = true;
            }
            "memo" => {
                memo_deps = Some(macro_value_expr(value));
            }
            n if n.starts_with("class:") => {
                let class_name = n["class:".len()..].to_string();
                // Same IIFE pattern as $show: capture node, wire reactive effect inside
                // onMount so .el is guaranteed to be set, return node to parent children.
                elem_effects.push(ElemEffect::Class(
                    class_name,
                    rewrite_template_expr(&macro_value_expr(value), signal_map, mode).source,
                ));
            }
            n if n.starts_with("bind:") || n.starts_with("on:") => {
                // These are already handled in emit_attrs — skip here.
            }
            "raw" => {
                // $raw: node is pass-through, no child processing — handled at node level
            }
            "ref" => {
                // B3 — `$ref={signal}` writes the element node to the signal at mount.
                // Mirror the IIFE pattern used by $show/$html to capture _n.el.
                let expr = macro_value_expr(value);
                let trimmed = expr.trim();
                // If signal is a registered $prop/signal, get its setter.
                let setter_call = if let Some(setter) = signal_map.0.get(trimmed) {
                    if !setter.is_empty() {
                        format!("{}(_el)", setter)
                    } else {
                        // computed/non-writable — best-effort, ignore.
                        "/* $ref to non-writable signal */".to_string()
                    }
                } else {
                    // Plain identifier reassignment in scope.
                    format!("{} = _el", trimmed)
                };
                elem_effects.push(ElemEffect::Ref(setter_call));
            }
            // Risk-7 closure (spec-template-syntax-v2 §"Codegen hardening —
            // silent-drop fix"): the parser now rejects unreserved
            // `$<name>="quoted"` with a hard C500 at parse time, and
            // `$<name>={expr}` routes to `Attr::Binding` via Amendment 04
            // before reaching this match. This arm is therefore unreachable
            // for well-formed inputs — kept as a defensive stderr fallback in
            // case future AST-construction paths (codemods, plugin contracts)
            // leak an unknown directive name.
            other => {
                eprintln!(
                    "C500: unknown directive `${}` (template attribute) — ignored. \
                     This should have been caught at parse time; please file a bug.",
                    other
                );
            }
        }
    }

    // Nothing to wrap — caller uses the bare base node.
    if elem_effects.is_empty() && !once && memo_deps.is_none() && if_cond_arg.is_none() && !has_each {
        return Vec::new();
    }

    // --- compose innermost → outermost ---
    // Element effects sit closest to the node (they read `_n.el`). Only the
    // OUTERMOST wrapper carries the caller's `indent`; inner wrappers use no
    // extra indent so single-directive output is byte-identical to before.
    let mut current = subtree.to_string();
    for eff in &elem_effects {
        current = eff.wrap(&current, "");
    }

    if once {
        current = format!("createOnceBoundary(() => {{ return {} }})", current);
    }
    if let Some(deps) = &memo_deps {
        current = format!("createMemoBoundary({}, () => {{ return {} }})", deps, current);
    }
    if let Some(cond_arg) = &if_cond_arg {
        current = format!("createIfBoundary({}, () => {{ return {} }})", cond_arg, current);
    }

    if has_each {
        let key_part = if key_fn.is_empty() {
            "undefined".to_string()
        } else {
            // FEL-172: key exprs may read getters too ($key={section.id + b.ref}).
            format!(
                "({}) => {}",
                item_alias,
                rewrite_template_expr(&key_fn, signal_map, mode).source
            )
        };

        // Use arbor's reactive `each()` when the list is an authored signal.
        // arbor expects a Signal tuple `[getter, setter]` (it reads `items[0]()`),
        // so for `const [items, setItems] = signal(...)` we MUST pass
        // `[items, setItems]` — not the getter alone (which would make
        // `items[0]` an undefined string-indexed access on a function value).
        // For computed signals (no setter) pass `[items]` — index-0 read still works.
        // Plain class-property arrays (no signal) wrap in a `[() => list]` thunk.
        if list_signal_map.is_reactive(&each_items) {
            let items_arg = if let Some(setter) = list_signal_map.0.get(&each_items) {
                if !setter.is_empty() {
                    format!("[{}, {}]", each_items, setter)
                } else {
                    format!("[{}]", each_items)
                }
            } else {
                format!("[() => ({})]", each_items)
            };
            current = format!(
                "each({}, {}, ({}, {}) => {{ return {} }})",
                items_arg, key_part, item_alias, idx_alias, current
            );
        } else {
            // FEL-172: a complex list expr may read a prop/signal getter
            // (`each={it of section.data}` → `section().data`); without the
            // rewrite the thunk reads `.data` off the signal FUNCTION →
            // undefined → the loop renders nothing. The LIST evaluates in the
            // OUTER scope (loop binders do not shadow their own iterable).
            current = format!(
                "createEachBoundary([() => ({})], {}, ({}, {}) => {{ return {} }})",
                rewrite_template_expr(&each_items, list_signal_map, mode).source,
                key_part,
                item_alias,
                idx_alias,
                current
            );
        }
    }

    // Apply the caller's indent to the outermost wrapper.
    vec![format!("{}{}", indent, current)]
}

#[cfg(test)]
mod sidecar_alias_tests {
    use super::extract_pattern_idents;
    use std::collections::BTreeSet;

    fn idents(part: &str) -> Vec<String> {
        let mut out = BTreeSet::new();
        extract_pattern_idents(part, &mut out);
        out.into_iter().collect()
    }

    // Fix B — a loop alias may be a destructuring pattern; every contained
    // binding must land in the sidecar scope. Regression for `$each="… as
    // [name, desc]"` where the whole `[name, desc]` failed `is_js_ident` and
    // bound nothing → template refs TS2304'd.
    #[test]
    fn bare_alias() {
        assert_eq!(idents("item"), vec!["item"]);
    }

    #[test]
    fn array_destructure_binds_each_element() {
        assert_eq!(idents("[name, desc]"), vec!["desc", "name"]); // BTreeSet → sorted
    }

    #[test]
    fn array_holes_and_rest() {
        assert_eq!(idents("[a, , c]"), vec!["a", "c"]);
        assert_eq!(idents("[first, ...rest]"), vec!["first", "rest"]);
    }

    #[test]
    fn object_shorthand_rename_and_rest() {
        assert_eq!(idents("{a, b}"), vec!["a", "b"]);
        // `{key: local}` binds the LOCAL name, not the key.
        assert_eq!(idents("{key: local}"), vec!["local"]);
        assert_eq!(idents("{a, ...others}"), vec!["a", "others"]);
    }

    #[test]
    fn default_initializers_are_stripped() {
        assert_eq!(idents("[a = 5]"), vec!["a"]);
        assert_eq!(idents("{a = 1, b}"), vec!["a", "b"]);
    }

    #[test]
    fn nested_pattern_recurses() {
        assert_eq!(idents("[a, [b, c]]"), vec!["a", "b", "c"]);
        assert_eq!(idents("{outer: {inner}}"), vec!["inner"]);
    }

    #[test]
    fn non_ident_tokens_skipped() {
        // Empty / punctuation-only parts contribute nothing (no panic).
        assert!(idents("[]").is_empty());
        assert!(idents("").is_empty());
    }
}

// ─── DE5 — derived MCP param schema reaches the registration ──────────────────
//
// End-to-end over `emit_agent_metadata_registration`: proves the derived
// `params` fragment (built in `codegen::mcp_schema`) is threaded from the
// authored handler signature all the way into `registerAgentMetadata`. The
// per-mapping matrix lives in `mcp_schema::tests`; this pins the plumbing.
#[cfg(test)]
mod agent_metadata_param_schema_tests {
    use super::emit_agent_metadata_registration;

    fn script(action_entry: &str) -> String {
        format!(
            "@state {{\n$action: {{\n  {}\n}}\n}}",
            action_entry
        )
    }

    /// The ratified default posture (`read: 'agents'`, `call: 'anonymous'`) —
    /// what `resolve_extract` yields for a source with no declaration.
    fn default_extract() -> crate::extract::ResolvedExtract {
        crate::extract::ResolvedExtract {
            read: crate::types::ExtractRead::Agents,
            call: crate::types::ExtractCall::Anonymous,
            read_origin: crate::extract::ExtractOrigin::Default,
            call_origin: crate::extract::ExtractOrigin::Default,
        }
    }

    #[test]
    fn typed_required_params_reach_the_registration() {
        // (a) — `(id: string, count: number)` → named, typed, both required.
        let s = script(
            "save: { expose: { read: true }, handler: (id: string, count: number) => persist(id, count) }",
        );
        let out = emit_agent_metadata_registration("my-el", &s, &default_extract());
        assert!(
            out.contains(
                "params: { properties: { id: { type: 'string' }, count: { type: 'number' } }, \
                 required: ['id', 'count'] }"
            ),
            "typed params must reach the registration:\n{out}"
        );
    }

    #[test]
    fn optional_param_is_present_but_not_required() {
        // (b) — `(x?: string)` is a named property, absent from `required`.
        let s = script("go: { expose: { read: true }, handler: (x?: string) => run(x) }");
        let out = emit_agent_metadata_registration("my-el", &s, &default_extract());
        assert!(
            out.contains("params: { properties: { x: { type: 'string' } }, required: [] }"),
            "optional param must be present but not required:\n{out}"
        );
    }

    #[test]
    fn non_mappable_param_degrades_to_permissive_without_a_shape() {
        // (c) — a union-typed param keeps its name and stays required, but its
        // schema degrades to permissive `{}` — never an invented enum shape.
        let s = script(
            "filter: { expose: { read: true }, handler: (mode: 'all' | 'done') => setMode(mode) }",
        );
        let out = emit_agent_metadata_registration("my-el", &s, &default_extract());
        assert!(
            out.contains("params: { properties: { mode: {} }, required: ['mode'] }"),
            "non-mappable param must degrade to permissive, not a guessed shape:\n{out}"
        );
        assert!(
            !out.contains("'all'") && !out.contains("'done'"),
            "the union members must NOT be materialized as an invented enum:\n{out}"
        );
    }

    #[test]
    fn unexposed_action_emits_nothing() {
        // No `read` expose → no registration at all (nothing leaks).
        let s = script("secret: { handler: (x: string) => run(x) }");
        let out = emit_agent_metadata_registration("my-el", &s, &default_extract());
        assert!(out.is_empty(), "unexposed action must not register:\n{out}");
    }

    // GX #468 — the registration payload carries the resolved `extract` policy,
    // rendered VERBATIM from `ResolvedExtract::json_object()` (the same string
    // both sidecars embed), so the live registry cannot drift from the
    // agent-meta artifact.
    #[test]
    fn resolved_extract_reaches_the_registration_verbatim() {
        let s = script("save: { expose: { read: true }, handler: (id: string) => persist(id) }");
        let ex = default_extract();
        let out = emit_agent_metadata_registration("my-el", &s, &ex);
        assert!(
            out.contains(&format!("  extract: {},", ex.json_object())),
            "registration must carry the sidecar-identical extract object:\n{out}"
        );
    }

    #[test]
    fn scoped_extract_reaches_the_registration_verbatim() {
        let s = script("save: { expose: { read: true }, handler: (id: string) => persist(id) }");
        let ex = crate::extract::ResolvedExtract {
            read: crate::types::ExtractRead::Scope("dash:read".to_string()),
            call: crate::types::ExtractCall::Verified,
            read_origin: crate::extract::ExtractOrigin::Declared,
            call_origin: crate::extract::ExtractOrigin::Declared,
        };
        let out = emit_agent_metadata_registration("my-el", &s, &ex);
        assert!(
            out.contains("extract: { \"read\": { \"scope\": \"dash:read\" }, \"call\": \"verified\" },"),
            "scope-shaped policy must render exactly as the sidecar does:\n{out}"
        );
    }
}
