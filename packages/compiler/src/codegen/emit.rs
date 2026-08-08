use super::mcp_emit::{build_dispatcher_registration_stmt, build_server_binding_registration_stmt, collect_agent_members, emit_agent_binding_export, emit_agent_bindings, emit_agent_client_dispatcher, emit_agent_metadata_registration};
use super::sidecar_json::{collect_component_tags, emit_manifest, emit_route_json};
use super::sidecar_ts::emit_sidecar_ts;
use super::state_emit::{collect_prop_entries, emit_aria_wiring, emit_form_wiring, emit_prop_bindings, emit_props_config, emit_state_macro_code, process_state_body};
use super::template_emit::{anchor_is_enhanced, apply_emit_lowering_nodes, apply_state_write_lowering_nodes, collect_event_names, emit_nodes};
use crate::codegen::signals::SignalMap;
use crate::parser::style_macros::{emit_style_macros, extract_global_reactives};
use crate::types::{
    AgentBlock, Attr, BuildTarget, CompileUnit, InputKind, StyleBlock, StyleMacro, StyleScope,
    TemplateNode,
};
// Note: $html macro emits innerHTML assignments — these are intentionally unsafe
// and documented as requiring consumer-side sanitization (see spec).

/// Imports needed due to `@state` macro declarations.
#[derive(Default)]
pub(crate) struct StateImports {
    pub(crate) needs_computed: bool,
    pub(crate) needs_batch: bool,
    pub(crate) needs_on_mount: bool,
    pub(crate) needs_on_cleanup: bool,
    // R2 (Director r6 §3): four-callback $lifecycle extension.
    pub(crate) needs_on_adopt: bool,
    pub(crate) needs_on_attribute_change: bool,
    pub(crate) needs_effect_for_macros: bool,
    pub(crate) needs_create_resource: bool,
    // arch-3 M2 (RFC-003) — `$query` and magna-origin `$resource` lower to
    // `createMagnaResource(inject(MagnaFetchToken), ...)`. When set, the
    // imports `createMagnaResource`/`MagnaFetchToken` (`@aihu/magna`) and
    // `inject` (`@aihu/context`) are emitted.
    pub(crate) needs_create_magna_resource: bool,
    // arch-3 M2 / A3 G2 (RFC-001) — `$auth.session()`/`$auth.currentUser()`
    // lower to `const <name> = useCurrentUser()`. When set, the
    // `import { useCurrentUser } from '@aihu/auth'` import is emitted.
    pub(crate) needs_use_current_user: bool,
    // v0.4.0 — `$stream` lowers to `createStream()` in `@aihu/runtime`.
    pub(crate) needs_create_stream: bool,
    // arch-5 M1 — `$route`, `$beforeNavigate`, `$afterNavigate` lower to
    // calls into `@aihu/router`. When set, the namespace import is emitted.
    pub(crate) needs_aihu_router: bool,
    // B5 — `$controller` requires onMount+onCleanup for lifecycle wiring.
    pub(crate) needs_controller: bool,
    // B5/O2 — `$context` lowers to `provide`/`inject`/`contextKey` calls from
    // `@aihu/context` (prototype-chain hierarchical DI). When set, that import
    // is emitted.
    pub(crate) needs_context: bool,
}

/// Wave 3c — authoritative island classification. A component is a STATIC
/// island when its emitted body needs NONE of the owner-context reactive
/// primitives (signal/computed/effect/onMount/onCleanup) and takes no reactive
/// props — it can register and render with zero `@aihu/signals` +
/// `@aihu/runtime`-owner participation, so the client can skip hydration
/// entirely. The compiler is the single source of truth: it KNOWS this at emit
/// time from the IR, and records it here + as a `// @aihu:island <kind>` code
/// marker. Downstream (the Vite plugin) READS the marker; it must never
/// re-derive the answer by regexing generated code — that is the derived-
/// property violation this replaces.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum IslandKind {
    /// Inert: server-render only, no client hydration/registration needed.
    #[default]
    Static,
    /// Needs the reactive runtime — must hydrate/register client-side.
    Interactive,
}

impl IslandKind {
    /// The `// @aihu:island <kind>` marker token.
    pub fn as_marker(self) -> &'static str {
        match self {
            IslandKind::Static => "static",
            IslandKind::Interactive => "interactive",
        }
    }
}

/// FEL-440 — which per-instance agent registration `emit_function_form` must
/// emit into the setup body. Computed ONCE in `emit_with_options` from the build
/// target + exposed-member set, then threaded in as a codegen INPUT so the
/// registration is data in the same path as the runtime import (see
/// `build_function_imports`) — no post-emit string surgery, no exact-literal
/// anchor to miss (GH #636: any third runtime symbol silently dropped it).
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum AgentReg {
    /// Component exposes no agent members — emit nothing.
    None,
    /// Client build — opaque-ID, policy-free `_registerAgentDispatcher`.
    ClientDispatcher,
    /// Server/universal build — named, policy-carrying `_registerAgentServerBinding`.
    ServerBinding,
}

/// FEL-440 tripwire — the registration is now emitted structurally, so its
/// absence when one was REQUIRED is a compiler bug, never the old silent no-op.
/// Unreachable by construction post-refactor (a non-`None` `AgentReg` is set iff
/// the component has members, and the statement builders emit iff members exist),
/// so this is the hard-error backstop the pre-440 string-surgery bail-out
/// (`return base_js.to_string()`) silently lacked. Returns `Err` (which the
/// caller turns into a hard compile failure) rather than shipping an agent
/// component whose `LiveBinding` would never register.
pub(crate) fn verify_agent_registration(agent_reg: AgentReg, setup_body: &str) -> Result<(), String> {
    let expected = match agent_reg {
        AgentReg::None => return Ok(()),
        AgentReg::ClientDispatcher => "_registerAgentDispatcher(",
        AgentReg::ServerBinding => "_registerAgentServerBinding(",
    };
    if setup_body.contains(expected) {
        Ok(())
    } else {
        Err(format!(
            "FEL-440: agent registration `{}` was required for this component but is absent \
             from the emitted setup body. This is a compiler bug — the registration must be \
             emitted structurally (as a codegen input), never string-spliced onto an anchor. \
             Refusing to emit an agent component whose LiveBinding would silently never register.",
            expected.trim_end_matches('(')
        ))
    }
}

#[derive(Debug, Default, serde::Serialize)]
pub struct EmitResult {
    pub js: String,
    pub manifest_json: String,
    /// Wave 3c — static vs interactive island classification (authoritative,
    /// computed from the IR at emit time). Mirrors the `// @aihu:island`
    /// code marker embedded in `js`.
    pub island: IslandKind,
    /// v0.6.2: Serialized `.route.json` sidecar. Some when @route block is present.
    pub route_json: Option<String>,
    /// B3 — Per-SFC TypeScript sidecar. Contains `@state` declarations in
    /// scope plus every `@template` curly expression as a typed body statement.
    /// `tsc --noEmit` over `**/*.aihu.ts` enforces type-safety end-to-end per
    /// Architect spec §7 path (i). None when no template/state is present.
    pub sidecar_ts: Option<String>,
}

/// Escape CSS for interpolation into a JS template literal.
///
/// Any backtick, `${`, or backslash in the source CSS (e.g. inside a comment
/// that mentions a `.foo` selector) would otherwise terminate the literal
/// early — throwing at runtime and aborting `customElements.define`.
///
/// Shared by the client's `CSSStyleSheet` declaration and the server target's
/// `__aihu_css__` export: the two carry the SAME bytes to two renderers, and an
/// escape applied in one place only would make a shadow component's server
/// markup differ from what the client adopts.
fn escape_css_for_js_literal(css: &str) -> String {
    css.replace('\\', "\\\\")
        .replace('`', "\\`")
        .replace("${", "\\${")
}

/// The component's own CSS, exported as a plain string on the SERVER target.
///
/// The client declaration is elided there because `new CSSStyleSheet()` is a
/// DOM dependency, not because the CSS needs processing — `emit_style_block`
/// applies no scoping transform, since a shadow component's isolation is
/// structural (the shadow root itself). So the same bytes can ride the module
/// channel as a string.
///
/// This exists for Declarative Shadow DOM. A shadow root is style-isolated by
/// construction, so a prerendered `<template shadowrootmode="open">` whose
/// styles are not INSIDE it paints unstyled until the component's chunk loads —
/// the #754 failure, where content rendering before its scoped CSS applied
/// pushed the LCP element below the fold. `__aihu_schild` inlines this as
/// `<style>` in the same template.
///
/// Light-DOM components do not need it: their rules arrive via the app
/// stylesheet's `@scope([data-a=…])` blocks (#758). Emitted for both anyway —
/// the mode can be reconfigured per build, and an export the renderer ignores
/// costs nothing next to a missing one it needed.
fn emit_ssr_css_export(style: &StyleBlock) -> String {
    // Global styles belong to the document, not to any shadow root; inlining
    // them into a child's template would scope them to that child and silently
    // change what they match.
    if style.scope == StyleScope::Global {
        return String::new();
    }
    format!(
        "\nexport const __aihu_css__ = `{}`\n",
        escape_css_for_js_literal(style.content)
    )
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
    let escaped_css = escape_css_for_js_literal(&css_content);
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
    emit_with_options(unit, tag_name, false)
}

/// #486 step 4 — `strict_templates` switches the sidecar's attribute/
/// component-prop type layer on (`--strict-templates`). It affects ONLY the
/// generated type-check surface (`sidecar_ts`); the emitted JS, manifest, and
/// route sidecar are identical either way. Default-off keeps the sidecar
/// byte-identical to the pre-#486 output.
///
/// `tag_name` is assumed to be a REGISTERABLE custom-element name. It used to
/// be merely warned about here — an advisory `eprintln!` that fired ~30 times
/// per build while the build stayed green, so components that could never
/// register shipped for months. That rule is now a hard C450 error raised
/// where the define-name is resolved, before this function is reached:
/// `envelope::validate_define_tag`, called from the CLI (`src/bin/main.rs`),
/// the wasm binding, and `compile_envelope` (the napi addon path). A gate that
/// cannot fail the build is not a gate; see
/// `docs/lessons/hyphenless-custom-element-tags.md`.
pub fn emit_with_options(unit: &CompileUnit, tag_name: &str, strict_templates: bool) -> EmitResult {
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
    // When target == Client, check for an @agent block.
    let elide_agent = target == BuildTarget::Client && is_agent_component;
    // v0.4.0: @stream block is server-only. Elide in client builds.
    let elide_stream = target == BuildTarget::Client && unit.source.stream.is_some();

    // FEL-440 — resolve the per-instance agent registration ONCE, as a codegen
    // input to `emit_function_form`. Non-`None` iff the component actually
    // exposes members (`is_agent_component` can be true via an `@agent` block
    // with no exposed members — that carries policy but registers nothing, so it
    // stays `None`, matching the pre-440 injectors' member-empty early return).
    // Client agent build → opaque-ID dispatcher; server/universal → named,
    // policy-carrying server binding. This drives BOTH the runtime import symbol
    // and the in-setup registration statement, so the import can no longer say
    // one thing while the body does another.
    let agent_reg = if !has_exposed_members {
        AgentReg::None
    } else if elide_agent {
        AgentReg::ClientDispatcher
    } else if is_agent_component {
        AgentReg::ServerBinding
    } else {
        AgentReg::None
    };

    // GX P3 (server emission, keystone slice) — a `--target server` build of a
    // NON-agent component emits a standalone SSR entry: setup is hoisted to a
    // named module const, the `defineElement(...)` registration is gated behind
    // a DOM-globals check, and `export default __ssr` exposes a host-less
    // arbor-tree factory that `@aihu/server`'s `renderToString` and
    // `@aihu/app`'s `resolveComponent` (`mod.default`) consume directly.
    //
    // Agent components were EXCLUDED wholesale. The original string-surgery
    // reason (their `inject_server_binding_registration` anchored on the exact
    // `defineComponent((_ctx) => {` shape, so a restructure silently dropped the
    // LiveBinding) is GONE as of FEL-440 — registration is now a codegen input
    // with no anchor.
    //
    // NARROWED (was: `!is_agent_component`, excluding EVERY agent component —
    // including any plain `$action` block with no `@agent`, which is the
    // scaffold CLI's own default page under `output: 'ssr'`). The one real,
    // still-live gate is `@agent { }`'s `$input` declarations: `emit_agent_bindings`
    // lowers each to `ctx.attrs.<name>[0]()` (see `mcp_emit.rs`), reading the
    // attribute as a live signal pair. The host-less SSR `SetupContext` passes
    // `attrs: {}` (`emit.rs`'s SSR-entry template, ~line 1478) — nothing to
    // index — so a component with `$input`s would throw at first render, not
    // silently misbehave. `_registerAgentServerBinding` itself is unaffected
    // either way: it takes `ctx.element`, which is `null` under SSR by design,
    // and is a documented no-op on a null host (`agent-dispatch.ts`) — the
    // registration call was never the reason for the exclusion.
    //
    // A component using ONLY `$action`/`$state`/`$computed` — `is_agent_component`
    // via `has_exposed_members`, `unit.source.agent` absent — reads no `ctx.attrs`
    // at all: every exposed read/action/write closure references a LOCAL `@state`
    // signal (`build_server_binding_registration_stmt` emits them capturing the
    // setup body's own bindings, not the context), which is exactly as safe
    // under the host-less SSR context as a non-agent component's own state. Same
    // for an `@agent` block that carries only policy ($scope/$rate-limit) with no
    // `$input`s. Both now get the standalone SSR entry.
    let agent_has_attr_inputs = unit.source.agent.as_ref().is_some_and(|a| !a.inputs.is_empty());
    let emit_ssr_entry = target == BuildTarget::Server && !agent_has_attr_inputs;

    // Wave 3c — island classification, hoisted out of the `js` block below so it
    // can ride the returned `EmitResult`. Deferred-init: the block assigns it
    // unconditionally from `emit_function_form` (the authoritative source)
    // before yielding, so it is always definitely-assigned afterwards.
    let island_kind;
    let js = {
        // Unified lowering engine. `emit_function_form` runs `process_state_body`
        // (full $prop/$action/$computed/magna/$auth/... lowering) for EVERY
        // component, including @agent ones — both client (`elide_agent`) and
        // server builds. The @agent block is passed so the function form can emit
        // the agent `input` coercions (number/boolean/enum → computed) regardless
        // of build target. Server-only `__agentBinding`/registration are appended
        // below; client-only opaque-ID dispatcher likewise.
        let (mut base_js, island_k) = emit_function_form(
            unit,
            tag_name,
            unit.source.agent.as_ref(),
            &extract,
            emit_ssr_entry,
            agent_reg,
        );
        island_kind = island_k;
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
            // FEL-440 — the in-setup `_registerAgentDispatcher(ctx.element, { … })`
            // call is now emitted STRUCTURALLY by `emit_function_form`
            // (`agent_reg == ClientDispatcher`), so `base_js` already carries it.
            // We only append the (introspection-only) module-scope export here.
            format!(
                "// [client build] @agent block elided\n{}\n{}",
                base_js, dispatcher
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
            // FEL-440 — the in-setup `_registerAgentServerBinding(ctx.element, …)`
            // call is now emitted STRUCTURALLY by `emit_function_form`
            // (`agent_reg == ServerBinding`), so `base_js` already carries it. Only
            // the module-scope `__agentBinding` export + `registerAgentMetadata`
            // (both pure data) are appended here.
            let agent_binding_export = emit_agent_binding_export(tag_name, agent, raw_script);
            let agent_metadata = emit_agent_metadata_registration(tag_name, raw_script, &extract);
            let with_metadata = if agent_metadata.is_empty() {
                base_js
            } else {
                format!(
                    "import {{ registerAgentMetadata }} from '@aihu/agent'\n{}\n{}",
                    base_js, agent_metadata
                )
            };
            format!("{}\n{}\n", with_metadata, agent_binding_export)
        } else {
            base_js
        }
    };

    // FEL-434 (closes FEL-423): emit the agent manifest for EVERY agent
    // component — including client (`elide_agent`) builds. `manifest_json` is a
    // BUILD-TIME SIDECAR (`agent-manifest.json`, written beside `.route.json` by
    // bin/main.rs), NOT bundled bytes: it costs zero browser weight and leaks
    // zero policy into the client output. Suppressing it for client builds
    // (the former `if elide_agent { String::new() }`) is what starved the
    // agent-readiness generator, so a $action component compiled `--target
    // client` produced an empty `## Components` section. The client JS elision
    // of `registerAgentMetadata` stays untouched (mcp_emit.rs "NEVER in client
    // builds"; T1-b: no scope/rateLimit bytes in the bundle) — only this on-disk
    // sidecar is (re)enabled. The sidecar MAY carry policy (scope/rate-limit);
    // that is fine for a build artifact — the readiness generator is responsible
    // for not RENDERING policy into the served llms.txt.
    let manifest_json = if is_agent_component {
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

    // §22 — the REFERENCE set, as a code marker, on the same channel as
    // `// @aihu:island`.
    //
    // This is NOT `__aihu_child_tags__` and must never be conflated with it.
    // `__aihu_child_tags__` is derived in `js/index.ts` from the emitted
    // `__aihu_schild('…'` call sites, so it is exactly "tags the compiled SSR
    // renderer will look up" — the right edge set for `buildChildRegistry`'s
    // cycle check. This marker is "every component tag the TEMPLATE mentions",
    // whether or not the SSR emitter lowered that mention into a child call.
    // The two differ by every reference the v1 child boundaries DECLINE (has
    // attributes, has children, sits at ROOT_PATH, …).
    //
    // The difference is not academic: `<weather-demo city="London">` in
    // `apps/docs/src/pages/index.aihu` carries an attribute, so it produces no
    // `__aihu_schild` call site, so `weather-demo` appears in no
    // `__aihu_child_tags__` anywhere — and `@aihu/app`'s prerender diagnostics,
    // which ask "is this broken component referenced?" (§18 warn-gate) and "is
    // this tag resolvable?" (§3), both answered "not referenced" for a
    // component that fails to load under SSR. Two diagnostics, silent, on a
    // real reference.
    //
    // Reuses `collect_component_tags` — the SAME walk that fills `route.json`'s
    // `components` array — so "component tag" means here exactly what it means
    // everywhere else in the compiler (`tags::is_component_tag`: hyphenated or
    // PascalCase; `<$macro>` intrinsics excluded; normalized with
    // `kebab_component_tag`). One definition, one walk, one place to change.
    //
    // A CODE MARKER rather than an envelope field because the marker is the
    // only channel all three backends share: the legacy per-output CLI spawn
    // (`aihu-compile x.aihu --target server`) prints bare JS with no envelope
    // at all, and `AIHU_COMPILE_BIN` forces exactly that path when someone is
    // working on the compiler. `// @aihu:island` was routed this way for the
    // same reason and is read the same way (`_parseIslandMarker`).
    //
    // Omitted entirely when the template references no component, so a consumer
    // can treat "no marker" and "empty" identically — the same rule
    // `__aihu_child_tags__` follows. Tag names reaching here are already
    // normalized to `[a-z0-9-]`-shaped custom-element names, so a
    // comma-separated single line needs no escaping and cannot swallow a
    // newline.
    let js = if component_tags.is_empty() {
        js
    } else {
        format!(
            "// @aihu:component-tags {}\n{}",
            component_tags.iter().cloned().collect::<Vec<_>>().join(","),
            js
        )
    };

    // B3 — Per-SFC `.aihu.ts` sidecar (Architect spec §7 path (i)). Generates
    // a typed function body containing the template expressions so `tsc
    // --noEmit` over `**/*.aihu.ts` checks template type-safety end-to-end.
    let sidecar_ts = emit_sidecar_ts(unit, tag_name, strict_templates);

    EmitResult { js, manifest_json, route_json, sidecar_ts, island: island_kind }
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
                    // The `empty` arm lowers to two sibling `createIfBoundary`
                    // wrappers (populated / empty) around the each — a
                    // template whose ONLY conditional is an each-empty arm
                    // previously emitted the call with no helper definition
                    // (ReferenceError at setup).
                    h.if_boundary = true;
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
        // FEL-GH478: `b` is the authored fallback-content fn. A `<slot>` renders
        // its own children as fallback when it has no assigned nodes, and the
        // assigned nodes override them otherwise — so emit the fallback AS the
        // slot's children rather than a childless `slot()` leaf (which discarded
        // it). `branch('slot', …)` is the same element `slot()` builds, but can
        // carry children; `branch` is always imported. `b()` returns a fragment
        // (`branch(null, …, [])`) when no fallback was authored — an empty child
        // list, so a bare `<$slot>` still emits a plain childless `<slot>`.
        lines.push("const createSlotBoundary = (o, b) => branch('slot', o?.name != null ? { name: o.name } : undefined, typeof b === 'function' ? [b()] : []);");
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

// ─── Function form (no agent block) ──────────────────────────────────────────

pub(crate) fn emit_function_form(
    unit: &CompileUnit,
    tag_name: &str,
    agent: Option<&AgentBlock>,
    extract: &crate::extract::ResolvedExtract,
    // GX P3 — when true (server build, non-agent component) the plain function
    // form emits the standalone-SSR shape: hoisted setup const, DOM-gated
    // registration, `export default __ssr`. See the caller in `emit()`.
    ssr_entry: bool,
    // FEL-440 — which per-instance agent registration to emit into the setup
    // body (and which runtime symbol to import). See `AgentReg`.
    agent_reg: AgentReg,
) -> (String, IslandKind) {
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
    // #487 — wrapper-dialect rewrite targets (empty for old-dialect files;
    // every use below is a strict no-op then).
    let wrapper_targets = crate::parser::state_wrappers::collect_wrapper_targets(&macros);
    let mut handler_needs_state_helper = false;
    let mut handler_needs_prop_helper = false;
    let mut template_owned: Vec<TemplateNode> = unit
        .template_ast
        .as_deref()
        .map(|n| {
            let mut cloned: Vec<TemplateNode> = n.to_vec();
            apply_emit_lowering_nodes(&mut cloned, &event_names);
            // #487 §4.3 — handler-position writes to wrapper bindings lower
            // to the setter forms BEFORE the read rewrite walks the tree.
            if wrapper_targets.has_writes() {
                apply_state_write_lowering_nodes(
                    &mut cloned,
                    &wrapper_targets,
                    &mut handler_needs_state_helper,
                    &mut handler_needs_prop_helper,
                );
            }
            cloned
        })
        .unwrap_or_default();

    // B4 — $aria wiring. Collect entries and determine tabindex injection before
    // template_nodes is borrowed for emit_nodes.
    let (aria_wiring, _aria_needs_effect, aria_inject_tabindex) =
        emit_aria_wiring(&macros, &template_owned);

    // D5 — $form wiring. Lazy: only emitted when $form is declared.
    let (form_wiring_raw, has_form) = emit_form_wiring(&macros, &signal_map);
    // If $aria is already declared, it emits the attachInternals guard; suppress
    // the duplicate guard from $form by stripping it when both are present.
    let form_wiring = if has_form && !aria_wiring.is_empty() {
        // The aria wiring already emitted the guard; strip the guard line from form_wiring.
        let guard = crate::codegen::state_emit::INTERNALS_GUARD;
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

    let mut imports = build_function_imports(
        &signal_map,
        // B4 — OR in aria's effect requirement so `effect` is imported when
        // $aria thunks are declared (even if no other effect is needed).
        // D5 — OR in form's effect requirement similarly.
        helpers_needed.needs_effect || _aria_needs_effect || form_needs_effect,
        raw_script,
        &si,
        helpers_needed.each_boundary,
        &helpers_needed,
        agent_reg,
    );
    // W3: the emitter's rewrite front-end follows the unit's `--expr-parser`
    // mode (Legacy = byte-identical token pipeline; Ast = scope-aware oxc
    // rewrite).
    // FEL-441: owner-scope `$ref` onMount registrations are HOISTED out of the
    // return-tree IIFE into `ref_hoist_sink`, so they can be spliced in BEFORE
    // macro_code (below) and thus register — and therefore run — ahead of the
    // author's `@state onMount` callbacks. Without this, a `@state onMount` that
    // read a ref saw null (GH #637): the setter's onMount was registered while
    // building the return tree, i.e. after macro_code. `RefHoist::owner` marks
    // the top of the template as sharing the component setup owner.
    let ref_hoist_sink: std::cell::RefCell<Vec<String>> = std::cell::RefCell::new(Vec::new());
    let return_expr = emit_nodes(
        template_nodes,
        &signal_map,
        &state_names,
        "    ",
        unit.expr_parser,
        crate::codegen::template_emit::RefHoist::owner(&ref_hoist_sink),
    );
    let ref_hoist_regs = ref_hoist_sink.into_inner();

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

    // GX P3 — the standalone-SSR shape applies to the plain function form (no
    // $prop/attrs config). `$form` joins it now: `$aria`/`$form`'s
    // `ElementInternals` wiring (`state_emit.rs`'s `INTERNALS_GUARD` and every
    // per-entry statement) is null-guarded on `ctx.element`, so a host-less
    // `SetupContext` (`element: null`) makes that wiring a no-op instead of
    // throwing — correct, since a server render never mounts, so there is
    // nothing for `ElementInternals` to attach to or report validity on. The
    // component still needs `{ formAssociated: true }` on `defineElement`
    // for the CLIENT half of this same guarded call, so `define_opts` is
    // threaded through this branch below (it previously was not — dead code
    // for every component that could actually reach this branch, since
    // `$form` was the only source of a non-empty `define_opts` and `$form`
    // could never get here before).
    //
    // Deliberately NOT extended to `$form` combined with `$prop`/agent
    // inputs/`$extends` (`ssr_options`, below) — that stays excluded exactly
    // as it already was; this only lifts the PLAIN-form case.
    let ssr_standalone = ssr_entry && !uses_options_form;

    // GX P4 (#466, P3 item 2) — the options-form standalone-SSR shape: a
    // non-agent `$prop` component (the loader-route case — `$prop route` is
    // how a page receives `route.data`) also emits a hoisted setup + gated
    // registration + `__ssr` entry, with the DECLARED props threaded through
    // a host-less SetupContext (`__ssr(props)` wraps each value as an inert
    // PropSignal-shaped getter). Exclusions, deliberately narrow:
    //   - `$form` COMBINED with `$prop`/agent-inputs/`$extends` — the plain
    //     `$form`-only case joined `ssr_standalone` above (its internals
    //     wiring is now null-safe); this narrower combination stays excluded
    //     because this branch's `defineElement` call does not yet thread
    //     `define_opts`, and doing so was out of scope for lifting the plain
    //     case. Lift it here too if that combination turns out to matter.
    //   - `$extends` — evaluating a custom base class touches HTMLElement at
    //     module scope in the BASE module, which this gate cannot reach;
    //   - agent inputs — agent components are excluded from `ssr_entry`
    //     already (see the `emit_ssr_entry` gate above; post-FEL-440 the reason
    //     is the server SetupContext stub, not string-surgery); the
    //     `!has_agent_inputs` term is a belt-and-suspenders restatement.
    let ssr_options = ssr_entry
        && uses_options_form
        && !has_form
        && extends_base.is_none()
        && !has_agent_inputs;
    let ssr_no_dom = ssr_standalone || ssr_options;

    // ── Wave 3c — island classification (authoritative, from IR) ─────────────
    // A component is a STATIC island iff its emitted body requires NONE of the
    // owner-context reactive primitives and takes no reactive props: it can
    // register and render with zero @aihu/signals + @aihu/runtime-owner
    // participation, so the client can skip hydration for it entirely.
    //
    // Conservative by construction — any doubt resolves to `interactive`.
    // Over-classifying merely forfeits the zero-JS optimisation; UNDER-
    // classifying would strip the runtime out from under a component that
    // needs it (the static-island shim inlines a bare `HTMLElement` subclass
    // and drops `@aihu/runtime`). Notably, a component whose OWN body is inert
    // but which declares `$prop`s is `interactive`: props are reactive inputs
    // the PARENT drives, so the instance still needs attribute→signal
    // hydration — and its emit takes the options-form the shim cannot lower.
    //
    // Every term below maps to an owner-requiring primitive the emitter WOULD
    // put in the output (this is the same fact-set `build_function_imports`
    // reads to decide which of signal/computed/effect/onMount/onCleanup to
    // import), so the classification and the emitted code cannot drift.
    let island_interactive =
        // reactive state / computed / props — any signal-map entry. Props are
        // in the map, so the reactive-props case is covered here too.
        !signal_map.0.is_empty()
        // effect() — authored, macro-driven ($aria/$form/directives), or a
        // routing boundary (<$link>/<$outlet> emit effect() in their closures).
        || helpers_needed.needs_effect
        || _aria_needs_effect
        || form_needs_effect
        || si.needs_effect_for_macros
        || raw_script.contains("effect(")
        || helpers_needed.link_element
        || helpers_needed.outlet_element
        // computed() coercions
        || si.needs_computed
        // owner-context lifecycle hooks
        || si.needs_on_mount
        || si.needs_on_cleanup
        || si.needs_on_adopt
        || si.needs_on_attribute_change
        || helpers_needed.needs_on_mount_for_directives
        // routing boundaries register onMount()/onCleanup() at setup
        || helpers_needed.router_element
        || helpers_needed.navigate_element
        // streams / resources / controller / context wiring
        || si.needs_create_stream
        || si.needs_create_resource
        || si.needs_create_magna_resource
        || si.needs_controller
        || si.needs_context
        // agent surface / class-extension recipes always take the full runtime
        || has_agent_inputs
        || agent.is_some()
        || extends_base.is_some();
    let island = if island_interactive {
        IslandKind::Interactive
    } else {
        IslandKind::Static
    };

    // Wave-3 keystone — the SSR string fast path. Attempt to lower the
    // template to a compiled string renderer for every standalone-SSR
    // artifact. `None` (a template using constructs outside the lowerable
    // set) is not an error: the module simply ships without `__ssrString`
    // and @aihu/server keeps using the tree walker for it.
    let ssr_string_fn = if ssr_no_dom {
        super::ssr_string_emit::emit_ssr_string_body(
            template_nodes,
            &signal_map,
            &state_names,
            unit.expr_parser,
        )
    } else {
        None
    };
    if let Some(f) = &ssr_string_fn {
        if !f.helpers.is_empty() {
            // Runtime escape/serialize helpers used by the generated string
            // code. `@aihu/runtime/ssr` is the SERVER-ONLY subpath entry —
            // deliberately not the root entry, so the helpers never enter a
            // client bundle's size budget.
            imports.push_str(&format!(
                "\nimport {{ {} }} from '@aihu/runtime/ssr'",
                f.helpers.join(", ")
            ));
        }
    }

    // Styles never reach server HTML (`renderToString` walks the arbor tree
    // only), and the style block is the module-scope DOM dependency that makes
    // a compiled artifact un-importable in plain Node/Bun (`new
    // CSSStyleSheet()` + `document.adoptedStyleSheets`). Gate it OUT of the
    // standalone-SSR artifacts entirely.
    let (module_decl, style_injection) = if ssr_no_dom {
        // The CLIENT declaration stays elided (CSSStyleSheet is a DOM
        // dependency), but the CSS itself now rides the module channel as a
        // plain string so a declarative shadow root can carry its own styles.
        // See emit_ssr_css_export.
        let css_export = unit
            .source
            .style
            .as_ref()
            .map(emit_ssr_css_export)
            .unwrap_or_default();
        (css_export, String::new())
    } else if let Some(style) = &unit.source.style {
        let (decl, injection) = emit_style_block(style);
        (decl, format!("  {}\n", injection))
    } else {
        (String::new(), String::new())
    };

    // `ctx` is only needed for the style injection (`ctx.host`), the
    // options-form config reads, or the `$aria`/`$form` wiring (`ctx.element`);
    // the SSR artifact drops the style injection, so it falls back to `_ctx`
    // when nothing else needs the context.
    let wiring_uses_ctx = !aria_wiring.is_empty() || !form_wiring.is_empty();
    let ctx_param = if uses_ctx || wiring_uses_ctx || (!ssr_no_dom && unit.source.style.is_some()) {
        "ctx"
    } else {
        "_ctx"
    };

    let (macro_code, mut needs_prop_upd_helper, mut needs_state_upd_helper) =
        emit_state_macro_code(&macros, &signal_map);
    needs_state_upd_helper |= handler_needs_state_helper;
    needs_prop_upd_helper |= handler_needs_prop_helper;

    // #487 — the state-model §4.2/§4.3 pass over the PLAIN body (top-level
    // statements and helper functions declared in `@state`). Old-dialect
    // files have no wrapper targets, so their plain body is byte-identical.
    let plain_body = if wrapper_targets.reads.is_empty() && !wrapper_targets.has_writes() {
        plain_body
    } else {
        match crate::expr::rewrite_state_body(&plain_body, "", false, &wrapper_targets, true) {
            Ok(Some(r)) => {
                if r.needs_state_update_helper {
                    needs_state_upd_helper = true;
                }
                if r.needs_prop_update_helper {
                    needs_prop_upd_helper = true;
                }
                r.source
            }
            _ => plain_body,
        }
    };

    let helpers_decl = emit_boundary_helpers(&helpers_needed);
    // CO1 §4.5: the `++`/`--` ToNumeric helper, declared once per component and
    // ONLY when some emitted form actually calls it. `cookbook/aihu-counter`
    // takes the inline fast path, so it never loads this.
    let prop_upd_decl = if needs_prop_upd_helper {
        format!("  {}\n", crate::expr::UPDATE_HELPER_DECL)
    } else {
        String::new()
    };
    // #487 §4.3 — the `state` sibling of the CO1 helper.
    let prop_upd_decl = if needs_state_upd_helper {
        format!("{}  {}\n", prop_upd_decl, crate::expr::STATE_UPDATE_HELPER_DECL)
    } else {
        prop_upd_decl
    };

    let (body, ssr_body_prefix) = {
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
        // FEL-441: hoisted owner-scope `$ref` onMount registrations. Emitted
        // AFTER plain_body (the holder onMount closes over the ref's target
        // signal/binding, declared there) and BEFORE macro_code, so the ref
        // setter registers — and at mount runs — ahead of the author's
        // `@state onMount` callbacks. Each entry declares its `__aihu_ref_N`
        // holder (assigned in the return tree at build time) and registers the
        // onMount that reads `holder.el`. `onMount` is already imported whenever
        // a `$ref` is present (see needs_on_mount).
        for reg in &ref_hoist_regs {
            b.push_str("  ");
            b.push_str(reg);
            b.push('\n');
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
        // The SSR string renderer re-runs the SAME setup preamble (state,
        // computeds, actions, effects registration) and then builds a string
        // instead of returning the tree — capture the body without the
        // `return <tree>` tail for it.
        let prefix = b.clone();
        // FEL-440 — the per-instance agent registration, emitted STRUCTURALLY
        // here (referencing the real `ctx_param`) rather than string-spliced onto
        // a fragile import anchor afterward. Placed AFTER the `prefix` clone so it
        // stays out of the SSR-string fast path (agent components never take it),
        // and immediately BEFORE `return` so it runs after every state/action
        // closure it references is in scope. Empty for non-agent components.
        let agent_registration = match agent_reg {
            AgentReg::None => String::new(),
            AgentReg::ClientDispatcher => {
                build_dispatcher_registration_stmt(tag_name, raw_script, ctx_param)
            }
            AgentReg::ServerBinding => {
                build_server_binding_registration_stmt(tag_name, agent, raw_script, ctx_param)
            }
        };
        b.push_str(&agent_registration);
        b.push_str(&format!("  return {}\n", return_expr));
        (b, prefix)
    };

    // FEL-440 tripwire — a required registration must be present in the emitted
    // body. Unreachable by construction; a hard failure if it ever regresses,
    // never the pre-440 silent drop. See `verify_agent_registration`.
    if let Err(msg) = verify_agent_registration(agent_reg, &body) {
        panic!("{}", msg);
    }

    // Wave-3 — the `__ssrString` export block appended to standalone-SSR
    // artifacts when the template lowered. Shape:
    //   * `__aihu_ssr_string_setup__(ctx, opts)` — setup preamble + compiled
    //     string body (so state reads resolve exactly as in `__aihu_setup__`);
    //   * `export const __ssrString(props, opts)` — the module-level entry
    //     (props-first, mirroring `__ssr(props)`);
    //   * `__ssr.__aihu_ssr_string__` — an opts-only renderer attached to the
    //     component function itself, so @aihu/server's renderToString /
    //     renderToStream can take the fast path when handed `mod.default`
    //     directly (callers that bind props re-attach via `mod.__ssrString`).
    let ssr_string_suffix = |ctx_arg: &str, props_sig: &str| -> String {
        match &ssr_string_fn {
            None => String::new(),
            Some(f) => format!(
                "\n/** SSR string fast path (wave-3) — compile-time lowering of the template to\n * straight-line string concatenation. Byte-identical to @aihu/server's\n * tree-walk renderer for the same component+state; hydration markers and\n * `data-aihu-path` attrs are emitted when `opts.hydratable`. */\n// This component's light-DOM scope id (light-DOM leaf flip, LDF §10 step 3):\n// `undefined` here in Rust's own output — whether this SPECIFIC component\n// resolves to light mode depends on the plugin-global `shadowMode` config,\n// which only the JS layer (`index.ts`'s `transform` hook, run AFTER this Rust\n// codegen) knows. `_injectLightScopeId` there replaces this literal with the\n// real id when applicable — same pattern `_injectShadowMode` already uses for\n// `defineElement`'s options, but as a real binding (not a parsed comment)\n// since the value must reach `__ssrString`'s runtime merge below, not just\n// gate a Rust-side codegen choice.\n// The opts every compiled string renderer accepts. Spelled ONCE: it appears\n// in four positions below, and `children` (the pre-resolved tag -> module\n// registry that `__aihu_schild` renders from) has to reach all of them.\n// Inline `import(...)` keeps this type-only -- erased at compile time, so an\n// artifact that uses no SSR helpers grows no runtime edge on @aihu/runtime/ssr.\ntype __AihuSsrOpts = import('@aihu/runtime/ssr').SsrChildRenderOpts;\nconst __AIHU_LIGHT_SCOPE_ID__: string | undefined = undefined;\nconst __aihu_ssr_string_setup__ = ({ctx_param}, __opts: __AihuSsrOpts = {{}}) => {{\n{prefix}{string_body}}}\n\nexport const __ssrString = ({props_sig}, opts: __AihuSsrOpts = {{}}) => __aihu_ssr_string_setup__({ctx_arg}, {{ ...opts, lightScopeId: opts.lightScopeId ?? __AIHU_LIGHT_SCOPE_ID__ }})\n;(__ssr as unknown as {{ __aihu_ssr_string__?: (opts?: __AihuSsrOpts) => string }}).__aihu_ssr_string__ = (opts?: __AihuSsrOpts) => __ssrString({{}}, opts)\n",
                ctx_param = ctx_param,
                prefix = ssr_body_prefix,
                string_body = f.body,
                props_sig = props_sig,
                ctx_arg = ctx_arg,
            ),
        }
    };

    // Merge user-lifted imports into the framework imports block, deduping
    // against framework-emitted bindings from the same source. ES modules forbid
    // re-binding an identifier (`import { signal } from 'x'` twice is a
    // SyntaxError), so we union named-import sets per source.
    let mut merged_imports = merge_imports(&imports, &user_imports);

    // Wave 3c — island classification marker. The compiler is authoritative:
    // it emits `static`/`interactive` here from IR facts (computed above) so
    // the Vite plugin drives the zero-JS static-island shim by READING this,
    // never by regexing the generated code. Prepended BEFORE the extract/shadow
    // markers so those keep their documented leading-line positions (the
    // `// @aihu:shadow*` marker stays line 1 when present); the Vite plugin
    // parses all three position-independently (`/^…$/m`).
    merged_imports = format!("// @aihu:island {}\n{}", island.as_marker(), merged_imports);

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

    // D5 — $form: `formAssociated = true` must be on the component class BEFORE
    // it is registered. `customElements.define()` reads `formAssociated` off the
    // constructor at definition time (HTML §custom-element-definition step 14),
    // so the old shape — bind the `defineElement(...)` result to
    // `const _aihuFormEl_<tag>` and assign the static afterwards — could never
    // work: `defineElement` returns void, so the assignment threw
    // `Cannot set properties of undefined` at module evaluation, and even with a
    // returned class the write would land after registration and be ignored.
    // Pass it as a `defineElement` option instead; the runtime stamps it on the
    // wrapped class ahead of `customElements.define`.
    let define_opts = if has_form {
        ", { formAssociated: true }"
    } else {
        ""
    };

    let component_code = if uses_options_form {
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
            let ssr_props = ssr_prop_fields.join(", ");
            let string_export = ssr_string_suffix(
                &format!(
                    "{{ host: null, element: null, attrs: {{}}, props: {{ {} }} }}",
                    ssr_props
                ),
                "props: Record<string, unknown> = {}",
            );
            format!(
                "{merged_imports}\n{module_decl}\n{helpers_decl}const __aihu_setup__ = ({ctx_param}) => {{\n{body}}}\n\n// DOM registration — side-effect only where custom elements exist (browser\n// or a DOM-shimmed host); a plain Node/Bun SSR import skips it.\nif (typeof HTMLElement !== 'undefined' && typeof customElements !== 'undefined') {{\n  defineElement('{tag_name}', defineComponent({{\n{config_block}\n  setup: __aihu_setup__,\n  }}))\n}}\n\n/** SSR entry (GX P4) — standalone arbor-tree factory with prop threading.\n * Host-less server SetupContext: no element, no shadow root; lifecycle\n * registration is not reachable from here (server render never mounts).\n * `props` values arrive plain (e.g. `{{ route: {{ params, data }} }}`) and are\n * wrapped as inert PropSignal-shaped getters — reads work, writes no-op. */\nconst __aihu_ssr_prop = (v: unknown) => Object.assign(() => v, {{ set: (_v: unknown) => {{}} }})\nexport const __ssr = (props: Record<string, unknown> = {{}}) => __aihu_setup__({{ host: null, element: null, attrs: {{}}, props: {{ {ssr_props} }} }})\nexport default __ssr\n{string_export}",
                merged_imports = merged_imports,
                helpers_decl = helpers_decl,
                ctx_param = ctx_param,
                body = body,
                tag_name = tag_name,
                config_block = config_block,
                ssr_props = ssr_props,
                string_export = string_export,
            )
        } else {
            format!(
                "{merged_imports}\n\n{module_decl}{helpers_decl}defineElement('{tag_name}', defineComponent({{\n{config_block}\n  setup: ({ctx_param}) => {{\n{body}  }},\n}}){define_opts})\n",
                merged_imports = merged_imports,
                module_decl = module_decl,
                helpers_decl = helpers_decl,
                tag_name = tag_name,
                config_block = config_block,
                ctx_param = ctx_param,
                body = body,
                define_opts = define_opts,
            )
        }
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
        //
        //  `{define_opts}` on the guarded `defineElement` call — this branch
        //  now also covers plain `$form` components (see `ssr_standalone`'s
        //  derivation above), which need `{ formAssociated: true }` for their
        //  CLIENT-side registration exactly as they always did. The SSR-side
        //  factory (`__ssr`, below) never constructs the element at all, so
        //  `define_opts` has no effect there — it only reaches the guarded
        //  branch a real browser/DOM-shimmed host actually executes.
        let string_export = ssr_string_suffix(
            "{ host: null, element: null, attrs: {}, props: {} }",
            "_props: Record<string, unknown> = {}",
        );
        format!(
            "{merged_imports}\n{module_decl}\n{helpers_decl}const __aihu_setup__ = ({ctx_param}) => {{\n{body}}}\n\n// DOM registration — side-effect only where custom elements exist (browser\n// or a DOM-shimmed host); a plain Node/Bun SSR import skips it.\nif (typeof HTMLElement !== 'undefined' && typeof customElements !== 'undefined') {{\n  defineElement('{tag_name}', defineComponent(__aihu_setup__){define_opts})\n}}\n\n/** SSR entry (GX P3) — standalone arbor-tree factory. Host-less server\n * SetupContext: no element, no shadow root; lifecycle registration is not\n * reachable from here (server render never mounts). */\nexport const __ssr = () => __aihu_setup__({{ host: null, element: null, attrs: {{}}, props: {{}} }})\nexport default __ssr\n{string_export}",
            merged_imports = merged_imports,
            helpers_decl = helpers_decl,
            ctx_param = ctx_param,
            body = body,
            tag_name = tag_name,
            define_opts = define_opts,
            string_export = string_export,
        )
    } else {
        // Plain client shape (no props, no SSR entry — a client-target build,
        // or a server-target build the `ssr_entry`/`ssr_standalone`/
        // `ssr_options` gates above all declined). `{define_opts}` threaded
        // here too: before `$form` joined `ssr_standalone`, this was the ONLY
        // branch a `$form`-only component's CLIENT build could ever reach, so
        // its absence here would have been a real regression the moment the
        // dedicated `has_form` branch above was removed.
        format!(
            "{}\n\n{}{}{}defineElement('{}', defineComponent(({}) => {{\n{}}}){})\n",
            merged_imports, module_decl, helpers_decl, "", tag_name, ctx_param, body, define_opts
        )
    };
    (component_code, island)
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
    agent_reg: AgentReg,
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
    // FEL-440 — the agent registration helper is now a runtime import like any
    // other symbol (`onMount` etc.), added to the SAME `rt_items` Vec. The import
    // is therefore data, not a literal an injector string-matches after the fact:
    // whatever else joins this list, the registration symbol rides along, so the
    // registration call in the body can never reference an un-imported name.
    match agent_reg {
        AgentReg::ClientDispatcher => rt_items.push("_registerAgentDispatcher".to_string()),
        AgentReg::ServerBinding => rt_items.push("_registerAgentServerBinding".to_string()),
        AgentReg::None => {}
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

pub(crate) fn decode_html_entities(s: &str) -> String {
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

// ─── FEL-440 — agent-registration tripwire (the MUST-FAIL direction) ──────────
//
// Post-refactor the registration is emitted as a codegen input, so its absence
// when one was required is unreachable by construction. These tests exercise the
// hard-error backstop directly: given a required registration and a body that
// LACKS the call (the "unanchorable input" the old code silently swallowed with
// `return base_js.to_string()`), the compiler must ERROR — not pass it through.
#[cfg(test)]
mod agent_registration_tripwire_tests {
    use super::{verify_agent_registration, AgentReg};

    #[test]
    fn none_never_errors_even_with_empty_body() {
        assert!(verify_agent_registration(AgentReg::None, "").is_ok());
    }

    #[test]
    fn present_registration_passes() {
        let body = "  function go() {}\n  _registerAgentDispatcher(_ctx?.element, { tag: 'x' })\n  return x\n";
        assert!(verify_agent_registration(AgentReg::ClientDispatcher, body).is_ok());
        let sbody = "  _registerAgentServerBinding(_ctx?.element, { tag: 'x' })\n  return x\n";
        assert!(verify_agent_registration(AgentReg::ServerBinding, sbody).is_ok());
    }

    #[test]
    fn client_registration_absent_is_a_hard_error() {
        // The exact silent-drop scenario pre-FEL-440: a required client dispatcher
        // registration missing from the body. Must be an error, not a no-op.
        let err = verify_agent_registration(AgentReg::ClientDispatcher, "  return x\n")
            .expect_err("absent client registration must error, never pass silently");
        assert!(err.contains("_registerAgentDispatcher"), "error must name the missing symbol: {err}");
        assert!(err.contains("FEL-440"), "error must be attributable: {err}");
    }

    #[test]
    fn server_registration_absent_is_a_hard_error() {
        let err = verify_agent_registration(AgentReg::ServerBinding, "  return x\n")
            .expect_err("absent server registration must error, never pass silently");
        assert!(err.contains("_registerAgentServerBinding"), "error must name the missing symbol: {err}");
    }

    #[test]
    fn a_server_body_does_not_satisfy_a_client_requirement() {
        // Cross-check: the wrong registration symbol must NOT satisfy the tripwire
        // (a server binding present cannot stand in for a required client one).
        let sbody = "  _registerAgentServerBinding(_ctx?.element, {})\n  return x\n";
        assert!(verify_agent_registration(AgentReg::ClientDispatcher, sbody).is_err());
    }
}
