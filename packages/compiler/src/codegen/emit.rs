use crate::codegen::signals::{SignalMap, StateNames};
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
    // arch-5 M1 — `$route`, `$beforeNavigate`, `$afterNavigate` lower to
    // calls into `@aihu/router`. When set, the namespace import is emitted.
    needs_aihu_router: bool,
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

    let module_decl = format!(
        "const __style__ = new CSSStyleSheet();\n__style__.replaceSync(`{}`);\n",
        css_content
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

    // v0.6.6: Server-artifact emission gates.
    // When target == Client, check for @agent block or $server macro references.
    let elide_agent = target == BuildTarget::Client && unit.source.agent.is_some();
    let elide_server_macro = target == BuildTarget::Client
        && unit.source.script.map_or(false, |s| s.contains("$server"));

    let js = if !elide_agent && unit.source.agent.is_some() {
        emit_options_form(unit, tag_name, unit.source.agent.as_ref().unwrap())
    } else {
        let base_js = emit_function_form(unit, tag_name);
        if elide_agent {
            eprintln!("WARNING: @agent block elided — client-only build");
            // Prepend elision comment to the emitted JS.
            format!("// [client build] @agent block elided\n{}", base_js)
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
    } else if let Some(agent) = &unit.source.agent {
        emit_manifest(tag_name, agent)
    } else {
        String::new()
    };

    // v0.6.2: Emit route_json sidecar when @route block is present.
    let route_json = unit.source.route.as_ref().map(|r| emit_route_json(r));

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
    let mut exprs: Vec<String> = Vec::new();
    collect_template_exprs(nodes, &mut exprs);
    // Always emit a sidecar when a template is present so tsc has a per-SFC
    // surface to check, even if the @template happens to contain only static
    // markup at this moment.

    let script = unit.source.script.unwrap_or("").trim();
    let header = format!(
        "// generated sidecar for {}.aihu — DO NOT EDIT\n// Type-checking surface for @template expressions per spec §7 path (i).\n",
        tag_name
    );
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
    let preamble = format!(
        "\
declare const signal: <T>(initial: T) => readonly [() => T, (v: T) => void];
declare const computed: <T>(fn: () => T) => () => T;
declare const onMount: (fn: () => void | (() => void)) => void;
declare const onCleanup: (fn: () => void) => void;
declare const onAdopt: (fn: () => void) => void;
declare const onAttributeChange: (fn: (name: string, oldVal: string | null, newVal: string | null) => void) => void;
{}
{}
",
        emit_decl, event_decl
    );
    let body_exprs: Vec<String> = exprs
        .iter()
        .map(|e| {
            // Wrap each expression in `void (...)` so its result type isn't
            // checked beyond syntactic validity. tsc will still flag undefined
            // identifiers and most type errors.
            format!("  void ({});", e)
        })
        .collect();
    let body = body_exprs.join("\n");
    // B3b — DO NOT embed the user @state script verbatim. The script body
    // contains aihu macros (`$prop`, `$computed`, `$event` etc.) which
    // surface as labeled-statement-shaped lines and are NOT valid TypeScript
    // — they would emit noisy `TS1128 Declaration or statement expected`
    // errors that mask real template type errors. The framework globals are
    // already permissively re-declared in the preamble; that's enough for
    // tsc to type-check the template expressions in `__aihu_template`.
    let _ = script;
    let out = format!(
        "{}{}\nfunction __aihu_template(): void {{\n{}\n}}\n",
        header, preamble, body
    );
    Some(out)
}

/// Walk the template AST and collect every JS expression appearing in a
/// curly-binding, $on handler, $bind expr, {#if cond}, {#each list as item},
/// {@html expr}, or text interpolation.
fn collect_template_exprs(nodes: &[TemplateNode], out: &mut Vec<String>) {
    for node in nodes {
        match node {
            TemplateNode::Element { attrs, children, .. } => {
                for a in attrs {
                    match a {
                        Attr::Binding { expr, .. } => out.push(expr.clone()),
                        Attr::Macro { value: MacroValue::Curly(s), .. } => out.push(s.clone()),
                        _ => {}
                    }
                }
                collect_template_exprs(children, out);
            }
            TemplateNode::MacroElement { attrs, children, .. } => {
                for a in attrs {
                    match a {
                        Attr::Binding { expr, .. } => out.push(expr.clone()),
                        Attr::Macro { value: MacroValue::Curly(s), .. } => out.push(s.clone()),
                        _ => {}
                    }
                }
                collect_template_exprs(children, out);
            }
            TemplateNode::Interpolation(s) => out.push(s.clone()),
            TemplateNode::IfBlock { branches } => {
                for (cond, body) in branches {
                    if !cond.is_empty() {
                        out.push(cond.clone());
                    }
                    collect_template_exprs(body, out);
                }
            }
            TemplateNode::EachBlock {
                list_expr,
                key_expr,
                body,
                empty_body,
                ..
            } => {
                out.push(list_expr.clone());
                if let Some(k) = key_expr {
                    out.push(k.clone());
                }
                collect_template_exprs(body, out);
                if let Some(eb) = empty_body {
                    collect_template_exprs(eb, out);
                }
            }
            TemplateNode::HtmlBlock { expr } => out.push(expr.clone()),
            TemplateNode::Text(_) => {}
        }
    }
}

// ─── v0.6.2 — Route JSON sidecar ─────────────────────────────────────────────

fn emit_route_json(route: &RouteBlock) -> String {
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

    format!(
        "{{\n  \"pattern\": \"{}\",\n  \"name\": \"{}\",\n  \"middleware\": {},\n  \"ssr\": {},\n  \"layout\": \"{}\"\n}}",
        pattern, name, middleware_json, ssr, layout
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

fn collect_helpers_recursive(nodes: &[TemplateNode], h: &mut NeededHelpers) {
    for node in nodes {
        match node {
            TemplateNode::MacroElement { name, children, .. } => {
                match name.as_str() {
                    "slot" => h.slot_boundary = true,
                    "suspense" => h.suspense_boundary = true,
                    "shield" => h.shield_boundary = true,
                    "guard" => h.guard_boundary = true,
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
                collect_helpers_recursive(children, h);
            }
            TemplateNode::Element { attrs, children, .. } => {
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
        // `<$link>` — render <a>, intercept clicks, set aria-current via effect.
        lines.push("const createLinkBoundary = (href, prefetch, replace, children) => {\n  const node = branch('a', { href, 'data-aihu-link': '' }, children);\n  const ariaCompute = () => {\n    const r = __aihuRouter.useRoute();\n    return r && r.pathname === href ? 'page' : null;\n  };\n  onMount(() => {\n    const el = (typeof node === 'object' && node && 'el' in node ? node.el : null) || null;\n    const a = el && (el.tagName === 'A' ? el : el.querySelector?.('a')) || null;\n    if (!a) return () => {};\n    const onClick = (e) => {\n      if (e.defaultPrevented || e.button !== 0) return;\n      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;\n      e.preventDefault();\n      void __aihuRouter.navigate(href, { replace: !!replace });\n    };\n    a.addEventListener('click', onClick);\n    const pf = __aihuRouter.createPrefetcher(prefetch || 'none');\n    pf.attach(a, ariaCompute);\n    const stop = effect(() => {\n      const v = ariaCompute();\n      if (v) a.setAttribute('aria-current', v);\n      else a.removeAttribute('aria-current');\n    });\n    return () => { a.removeEventListener('click', onClick); pf.detach(a); stop && stop(); };\n  });\n  return node;\n};");
    }
    if h.outlet_element {
        // `<$outlet>` — render the matched route component as a child custom element.
        // Replaces children via DOM methods (no innerHTML). The matched component
        // reads `route` JSON via the standard $prop pattern.
        lines.push("const createOutletBoundary = () => {\n  const host = branch('div', { 'data-aihu-outlet': '' }, []);\n  onMount(() => {\n    const el = host && host.el;\n    if (!el) return () => {};\n    let cleanup = null;\n    const stop = effect(() => {\n      const m = __aihuRouter.useRoute();\n      if (cleanup) { cleanup(); cleanup = null; }\n      while (el.firstChild) el.removeChild(el.firstChild);\n      if (!m) return;\n      Promise.resolve(m.route.module()).then(async (mod) => {\n        const Component = mod.default;\n        const loaderData = mod.loader ? await mod.loader(m.params) : undefined;\n        const inst = (typeof Component === 'function') ? new Component() : null;\n        if (inst && inst.setAttribute) {\n          inst.setAttribute('route', JSON.stringify({ params: m.params, pathname: m.pathname, data: loaderData }));\n          el.appendChild(inst);\n          cleanup = () => { try { el.removeChild(inst); } catch {} };\n        }\n      });\n    });\n    return () => { if (cleanup) cleanup(); stop && stop(); };\n  });\n  return host;\n};");
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
                    si.needs_create_resource = true;
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
        }
    }

    let mut plain_lines: Vec<String> = Vec::new();
    let mut user_imports: Vec<String> = Vec::new();
    let mut i = 0usize;
    let mut in_import = false;
    let mut current_import: Vec<String> = Vec::new();
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
            ) && stripped.contains(':');
            let is_preserved_macro = stripped.starts_with("effect.on(")
                || matches!(macro_keyword, Some("watch"));

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
                            if let Some(close) = crate::parser::state_macros::find_brace_close(
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
                                            crate::parser::state_macros::find_brace_close(
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
                    if let Some(close) = crate::parser::state_macros::find_brace_close(
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

            i = nl + 1;
            continue;
        }

        let transformed = transform_bare_declaration(line_raw);
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

fn emit_state_macro_code(macros: &[crate::types::StateMacro], signal_map: &SignalMap) -> String {
    use crate::parser::state_macros::{arrow_args, arrow_body, meta_get, running_code};
    use crate::types::{CollectionKind, StateMacro};
    let mut lines: Vec<String> = Vec::new();
    let indent = "  ";
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
                            // Userland body code that needs the value calls `name()`
                            // (consistent with `$computed` access semantics — see
                            // Director r5 §2.b). This is a behavior change from the
                            // pre-R1 read-once-at-mount const; surfaced in build_manifest.
                            let name = &entry.name;
                            lines.push(format!(
                                "{indent}const {name} = ctx.props.{name}"
                            ));
                        }
                        CollectionKind::Computed => {
                            let thunk = match running_code(entry) {
                                Some(t) => t,
                                None => continue,
                            };
                            let body =
                                arrow_body(thunk).unwrap_or_else(|| thunk.to_string());
                            lines.push(format!(
                                "{indent}const {} = computed(() => {body});",
                                entry.name
                            ));
                        }
                        CollectionKind::Resource => {
                            let thunk = match running_code(entry) {
                                Some(t) => t,
                                None => continue,
                            };
                            let body =
                                arrow_body(thunk).unwrap_or_else(|| thunk.to_string());
                            lines.push(format!(
                                "{indent}const {} = createResource(() => {body});",
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
                            // arch-5 M1: rewrite $announce(...) call sites in
                            // action bodies to the runtime-imported alias.
                            let body = body.replace("$announce(", "__a11y_announce(");
                            lines.push(format!(
                                "{indent}function {}({args}) {{ return batch(() => {{ {body} }}) }}",
                                entry.name
                            ));
                        }
                        CollectionKind::Effect => {
                            let thunk = match running_code(entry) {
                                Some(t) => t,
                                None => continue,
                            };
                            let body =
                                arrow_body(thunk).unwrap_or_else(|| thunk.to_string());
                            if let Some(deps_raw) = meta_get(entry, "on") {
                                let deps_inner = deps_raw
                                    .trim()
                                    .strip_prefix('[')
                                    .and_then(|s| s.strip_suffix(']'))
                                    .unwrap_or(deps_raw);
                                lines.push(format!(
                                    "{indent}effect(() => {{ {dep}; {body} }});",
                                    dep = deps_inner.trim()
                                ));
                            } else {
                                lines.push(format!("{indent}effect(() => {{ {body} }});"));
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
                            match entry.name.as_str() {
                                "mount" => lines
                                    .push(format!("{indent}onMount(() => {{ {body} }});")),
                                "dispose" => lines
                                    .push(format!("{indent}onCleanup(() => {{ {body} }});")),
                                "adopt" => lines
                                    .push(format!("{indent}onAdopt(() => {{ {body} }});")),
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
        }
    }
    if lines.is_empty() {
        String::new()
    } else {
        lines.join("\n") + "\n"
    }
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
                    Attr::Event { name, .. } => name == "click",
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

/// Collect all `$aria` entries from the parsed macros. Returns empty vec when
/// no `$aria` collection is declared (lazy-attach invariant).
// ─── Function form (no agent block) ──────────────────────────────────────────

fn emit_function_form(unit: &CompileUnit, tag_name: &str) -> String {
    let raw_script = unit.source.script.unwrap_or("");

    // Process state macros first (updates signal_map with computed names)
    let mut signal_map = crate::codegen::signals::resolve_signals(raw_script);
    let (si, macros, plain_body, user_imports, state_names) =
        process_state_body(raw_script, &mut signal_map);

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

    let imports = build_function_imports(
        &signal_map,
        // B4 — OR in aria's effect requirement so `effect` is imported when
        // $aria thunks are declared (even if no other effect is needed).
        helpers_needed.needs_effect || _aria_needs_effect,
        raw_script,
        &si,
        helpers_needed.each_boundary,
        &helpers_needed,
    );
    let return_expr = emit_nodes(template_nodes, &signal_map, &state_names, "    ");

    let (module_decl, style_injection) = if let Some(style) = &unit.source.style {
        let (decl, injection) = emit_style_block(style);
        (decl, format!("  {}\n", injection))
    } else {
        (String::new(), String::new())
    };

    // R1 — when `$prop` entries exist, switch to the options-form
    // `defineComponent({ props, setup })` so the runtime can synthesize
    // observedAttributes + attributeChangedCallback. Otherwise stay in the
    // bare-arrow function form (smaller emit; no behavioral diff).
    let prop_entries = collect_prop_entries(&macros);
    let uses_props = !prop_entries.is_empty();
    let uses_ctx = uses_props;
    let ctx_param = if uses_ctx || unit.source.style.is_some() { "ctx" } else { "_ctx" };

    let macro_code = emit_state_macro_code(&macros, &signal_map);
    let helpers_decl = emit_boundary_helpers(&helpers_needed);

    let body = {
        let mut b = String::new();
        b.push_str(&style_injection);
        // arch-5 M1: inject sr-only / skip-link CSS once when the template uses
        // <$visuallyHidden> or <$skipLink>. Idempotent; cost is trivially small.
        if helpers_needed.a11y_styles {
            b.push_str("  _ensureA11yStyles()\n");
        }
        // R2 (Defect A): state declarations (plain_body) MUST precede macro_code
        // because `effect(...)` / `onMount(...)` / `onCleanup(...)` registrations
        // capture state variables by lexical reference. effect() runs its callback
        // synchronously once at registration time to track dependencies; if the
        // referenced state has not been declared yet (whether `const` or `let`),
        // the access hits the temporal dead zone and throws ReferenceError.
        // Action functions are also emitted from macro_code; while `function`
        // declarations are hoisted, calls to them from inside effect/onMount
        // closures still trip TDZ when reaching the captured state vars.
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
        b.push_str(&format!("  return {}\n", return_expr));
        b
    };

    // Merge user-lifted imports into the framework imports block, deduping
    // against framework-emitted bindings from the same source. ES modules forbid
    // re-binding an identifier (`import { signal } from 'x'` twice is a
    // SyntaxError), so we union named-import sets per source.
    let merged_imports = merge_imports(&imports, &user_imports);

    if uses_props {
        // R1 options-form. Emit `props: { ... }` config, then the setup arrow.
        let props_block = emit_props_config(&prop_entries, "    ");
        format!(
            "{}\n\n{}{}{}defineElement('{}', defineComponent({{\n  props: {{\n{}\n  }},\n  setup: ({}) => {{\n{}  }},\n}}))\n",
            merged_imports,
            module_decl,
            helpers_decl,
            "",
            tag_name,
            props_block,
            ctx_param,
            body
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

// ─── Options form (with agent block) ─────────────────────────────────────────

fn emit_options_form(unit: &CompileUnit, tag_name: &str, agent: &AgentBlock) -> String {
    let signal_map = crate::codegen::signals::resolve_signals(unit.source.script.unwrap_or(""));
    let needs_computed = agent.inputs.iter().any(|i| {
        matches!(
            i.kind,
            InputKind::Number | InputKind::Boolean | InputKind::Enum(_)
        )
    });

    let raw_script = unit.source.script.unwrap_or("");
    let script_body = extract_script_body(raw_script);

    // B3b — pre-emit `$emit.<name>(...)` lowering pass against the @state
    // $event collection (if any). Mirror function-form path.
    let pre_macros = crate::parser::state_macros::parse_state_macros(raw_script).unwrap_or_default();
    let event_names = collect_event_names(&pre_macros);
    let template_owned: Vec<TemplateNode> = unit
        .template_ast
        .as_deref()
        .map(|n| {
            let mut cloned: Vec<TemplateNode> = n.to_vec();
            apply_emit_lowering_nodes(&mut cloned, &event_names);
            cloned
        })
        .unwrap_or_default();
    let template_nodes: &[TemplateNode] = &template_owned;
    let helpers_needed = collect_needed_helpers(template_nodes);
    let script_uses_effect = raw_script.contains("effect(");
    let emit_effect = helpers_needed.needs_effect || script_uses_effect;

    let si = StateImports::default();

    // R5 (Defect E): import `when`/`each` from arbor — never inline structural
    // node literals, because the published arbor bundle minifies internal
    // property names (`structuralKind` → `sk`, etc).
    let mut arbor_names: Vec<&str> = vec!["branch", "leaf", "slot"];
    if helpers_needed.if_boundary {
        arbor_names.push("when");
    }
    if helpers_needed.each_boundary {
        arbor_names.push("each");
    }
    let mut import_lines: Vec<String> = vec![format!(
        "import {{ {} }} from '@aihu/arbor'",
        arbor_names.join(", ")
    )];

    // computed import if needed for number/boolean/enum coercions
    if needs_computed {
        import_lines.push("import { computed } from '@aihu/signals'".to_string());
    }

    // signal import if script uses signals; effect if $html/$show macros or direct effect() calls
    if !signal_map.0.is_empty() {
        import_lines.push("import type { Signal } from '@aihu/signals'".to_string());
        if emit_effect {
            import_lines.push("import { signal, effect } from '@aihu/signals'".to_string());
        } else {
            import_lines.push("import { signal } from '@aihu/signals'".to_string());
        }
    } else if emit_effect {
        import_lines.push("import { effect } from '@aihu/signals'".to_string());
    }

    let mut rt_items: Vec<String> =
        vec!["defineComponent".to_string(), "defineElement".to_string()];
    if si.needs_on_mount || helpers_needed.needs_on_mount_for_directives { rt_items.push("onMount".to_string()); }
    if si.needs_on_cleanup { rt_items.push("onCleanup".to_string()); }
    // R2 (Director r6 §3): $lifecycle four-callback extension imports.
    if si.needs_on_adopt { rt_items.push("onAdopt".to_string()); }
    if si.needs_on_attribute_change { rt_items.push("onAttributeChange".to_string()); }
    // arch-5 M1 a11y imports — RFC-A5-017..020 in options form (`@agent` SFCs).
    if helpers_needed.a11y_focus_trap {
        rt_items.push("createFocusTrap".to_string());
    }
    if helpers_needed.a11y_styles {
        rt_items.push("_ensureA11yStyles".to_string());
    }
    import_lines.push(format!("import {{ {} }} from '@aihu/runtime'", rt_items.join(", ")));

    let imports = import_lines.join("\n");

    // attrs array
    let attrs_list: Vec<String> = agent
        .inputs
        .iter()
        .map(|i| format!("'{}'", i.name))
        .collect();
    let attrs_str = attrs_list.join(", ");

    // agent-block bindings inside setup(ctx)
    let agent_bindings = emit_agent_bindings(agent);

    // Options form (`@agent` SFCs) does not run `process_state_body` so no
    // bare class-property names are tracked. Seed `state_names` from the
    // signal_map directly so signals declared in the script body still get
    // wrapped reactively in attribute bindings.
    let mut state_names = StateNames::default();
    for k in signal_map.0.keys() {
        state_names.insert(k);
    }
    let return_expr = emit_nodes(template_nodes, &signal_map, &state_names, "      ");

    let (module_decl, style_injection) = if let Some(style) = &unit.source.style {
        let (decl, injection) = emit_style_block(style);
        (decl, format!("    {}\n", injection))
    } else {
        (String::new(), String::new())
    };

    let helpers_decl = emit_boundary_helpers(&helpers_needed);

    let mut setup_body = String::new();
    if !style_injection.is_empty() {
        setup_body.push_str(&style_injection);
    }
    if helpers_needed.a11y_styles {
        setup_body.push_str("    _ensureA11yStyles()\n");
    }
    if !agent_bindings.is_empty() {
        setup_body.push_str(&agent_bindings);
    }
    if !script_body.is_empty() {
        // script_body is already 2-space indented; re-indent to 4 spaces for setup()
        let re_indented = script_body
            .lines()
            .map(|l| {
                if l.trim().is_empty() {
                    String::new()
                } else {
                    format!("  {}", l)
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        if !setup_body.is_empty() {
            setup_body.push('\n');
        }
        setup_body.push_str(&re_indented);
        setup_body.push('\n');
    }
    setup_body.push_str(&format!("    return {}\n", return_expr));

    format!(
        "{}\n\n{}{}defineElement('{}', defineComponent({{\n  attrs: [{}] as const,\n  setup(ctx) {{\n{}  }}\n}}))\n",
        imports, module_decl, helpers_decl, tag_name, attrs_str, setup_body
    )
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

fn emit_manifest(tag_name: &str, agent: &AgentBlock) -> String {
    if agent.inputs.is_empty() && agent.actions.is_empty() && agent.agent_macros.is_empty() {
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

    // Build actions JSON
    let actions_json = if agent.actions.is_empty() {
        "{}".to_string()
    } else {
        let action_entries: Vec<String> = agent
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
        format!("{{\n{}\n    }}", action_entries.join(",\n"))
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
        }
    }

    format!(
        "{{\n  \"tools\": [{{\n    \"name\": \"{}\",\n    \"tag\": \"{}\",\n    \"inputs\": {},\n    \"actions\": {}{}\n  }}]\n}}",
        tool_name, tag_name, inputs_json, actions_json, extra_fields
    )
}

// ─── Import-span state machine (D6) ──────────────────────────────────────────

fn extract_script_body(script: &str) -> String {
    let mut in_import = false;
    let mut result_lines: Vec<String> = Vec::new();
    for line in script.lines() {
        let t = line.trim();
        if t.starts_with("import ") || t.starts_with("import\t") {
            // A multiline `import { ... } from '...'` block is detected by the
            // presence of `{` without a matching close on the same line. Bare
            // side-effect imports (`import 'foo'`) and single-line bracket
            // imports complete on the opening line.
            let opens_block = t.contains('{') && !t.contains('}');
            if !opens_block {
                // single-line import (with-from, side-effect, or one-line block) — skip
            } else {
                in_import = true;
            }
            continue;
        }
        if in_import {
            if t.contains(" from ") || t.ends_with(';') {
                in_import = false;
            }
            continue;
        }
        // Strip top-level `export ` from function/const/let/class declarations:
        // when the user's <script setup> declares an exported action handler
        // (e.g. `export function quote() { ... }`), the emitted setup(ctx)
        // body must not retain `export` — that keyword is only valid at module
        // top level and would be a TypeScript error inside a function body.
        let stripped = if let Some(rest) = line.strip_prefix("export ") {
            rest.to_string()
        } else {
            line.to_string()
        };
        result_lines.push(stripped);
    }
    // trim leading/trailing blank lines, add 2-space indent
    let trimmed: Vec<_> = result_lines
        .iter()
        .skip_while(|l| l.trim().is_empty())
        .cloned()
        .collect();
    let trimmed: Vec<_> = trimmed
        .iter()
        .rev()
        .skip_while(|l| l.trim().is_empty())
        .cloned()
        .collect();
    if trimmed.is_empty() {
        return String::new();
    }
    trimmed
        .iter()
        .rev()
        .map(|l| {
            if l.trim().is_empty() {
                String::new()
            } else {
                format!("  {}", l)
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

// ─── Template emission helpers ────────────────────────────────────────────────

fn emit_nodes(
    nodes: &[TemplateNode],
    signal_map: &SignalMap,
    state_names: &StateNames,
    child_indent: &str,
) -> String {
    let non_empty: Vec<String> = nodes
        .iter()
        .map(|n| emit_node(n, signal_map, state_names, child_indent))
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
) -> String {
    match node {
        TemplateNode::Text(s) => {
            let t = decode_html_entities(s.trim());
            if t.is_empty() {
                String::new()
            } else {
                // Normalize HTML whitespace: collapse newlines + surrounding spaces into
                // a single space, then escape for a JS single-quoted string literal.
                let normalized: String = t
                    .split('\n')
                    .map(|ln| ln.trim())
                    .filter(|ln| !ln.is_empty())
                    .collect::<Vec<_>>()
                    .join(" ");
                let escaped = normalized.replace('\\', "\\\\").replace('\'', "\\'");
                format!("leaf('{}')", escaped)
            }
        }
        TemplateNode::Interpolation(id) => {
            // Support dotted property access: "item.title", "post.title", "route.params.slug"
            if let Some(dot_pos) = id.find('.') {
                let base = &id[..dot_pos];
                let prop_path = &id[dot_pos + 1..];
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
                // Plain variable (e.g., loop variable `item.title`)
                return format!("leaf({}.{})", base, prop_path);
            }
            // Simple identifier
            if let Some(setter) = signal_map.0.get(id) {
                if setter.is_empty() {
                    // Computed signal (read-only) — emit reactive getter
                    format!("leaf([() => {}() as unknown as string, () => {{}}] as unknown as Signal<string>)", id)
                } else {
                    format!("leaf([{}, {}] as unknown as Signal<string>)", id, setter)
                }
            } else {
                format!("leaf({})", id)
            }
        }
        TemplateNode::Element {
            tag,
            attrs,
            children,
        } => {
            // <slot> / <slot name="x"> — content projection via Shadow DOM.
            // Emits slot() or slot('name') rather than branch()/leaf.element().
            if tag == "slot" {
                let name_attr = attrs.iter().find_map(|a| match a {
                    crate::types::Attr::Static { name, value } if name == "name" => {
                        Some(value.as_str())
                    }
                    _ => None,
                });
                return match name_attr {
                    Some(n) => format!("slot('{}')", n),
                    None => "slot()".to_string(),
                };
            }

            // Check for $raw — if present, emit the element verbatim with no macro wrapping.
            let is_raw = attrs.iter().any(|a| matches!(a, Attr::Macro { name, value } if name == "raw" && *value == MacroValue::Boolean));

            let attrs_str = emit_attrs(attrs, state_names, signal_map);
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
                    .map(|c| emit_node(c, signal_map, state_names, &next_indent))
                    .filter(|s| !s.is_empty())
                    .collect()
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

            // Emit macro effects (wrapping/side-effect macros).
            let effects = emit_macro_effects(attrs, "el", &base, child_indent, signal_map);
            if effects.is_empty() {
                base
            } else {
                // Return the first effect (boundary wraps supersede the base node).
                effects.into_iter().next().unwrap_or(base)
            }
        }
        TemplateNode::MacroElement { name, attrs, children } => {
            emit_macro_element(name, attrs, children, signal_map, state_names, child_indent)
        }
        // B3 — Variant B block-tag forms. Lower to the same runtime calls as
        // the v1 attribute-directives (`createIfBoundary` / `each`) so the
        // reactivity contract is preserved.
        TemplateNode::IfBlock { branches } => {
            emit_if_block(branches, signal_map, state_names, child_indent)
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
) -> String {
    fn emit_body(
        body: &[TemplateNode],
        signal_map: &SignalMap,
        state_names: &StateNames,
        child_indent: &str,
    ) -> String {
        let next_indent = format!("{}  ", child_indent);
        let parts: Vec<String> = body
            .iter()
            .map(|c| emit_node(c, signal_map, state_names, &next_indent))
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
    ) -> Vec<String> {
        // Returns a list of when() calls (siblings) for the branches starting
        // at idx. The caller wraps these into a fragment-branch.
        let mut out: Vec<String> = Vec::new();
        if idx >= branches.len() {
            return out;
        }
        let (cond, body) = &branches[idx];
        let body_str = emit_body(body, signal_map, state_names, child_indent);

        let cond_arg = if cond.is_empty() {
            // {:else} — fire when all prior conds are false
            negate_chain_thunk(prior_conds)
        } else if prior_conds.is_empty() {
            lower_if_cond(cond, signal_map)
        } else {
            // {:else if}: !prior0 && !prior1 && ... && cond
            let mut parts: Vec<String> = prior_conds
                .iter()
                .map(|c| format!("!({})", c))
                .collect();
            parts.push(format!("({})", cond));
            format!("[() => ({})]", parts.join(" && "))
        };

        out.push(format!(
            "createIfBoundary({}, () => {{ return {} }})",
            cond_arg, body_str
        ));

        if !cond.is_empty() {
            prior_conds.push(cond.clone());
            let rest = build_chain(idx + 1, branches, prior_conds, signal_map, state_names, child_indent);
            out.extend(rest);
            prior_conds.pop();
        }
        out
    }

    let mut prior: Vec<String> = Vec::new();
    let when_calls = build_chain(0, branches, &mut prior, signal_map, state_names, child_indent);
    if when_calls.len() == 1 {
        when_calls.into_iter().next().unwrap()
    } else {
        format!("branch('', undefined, [{}])", when_calls.join(", "))
    }
}

/// Lower a `{#if}` condition the same way the attribute-form `$if` does:
/// simple identifier of a registered signal → `[get, set]` tuple; otherwise a
/// thunk array.
fn lower_if_cond(cond: &str, signal_map: &SignalMap) -> String {
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
    format!("[() => ({})]", trimmed)
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
) -> String {
    let next_indent = format!("{}  ", child_indent);
    let body_parts: Vec<String> = body
        .iter()
        .map(|c| emit_node(c, signal_map, state_names, &next_indent))
        .filter(|s| !s.is_empty())
        .collect();
    let body_str = if body_parts.len() == 1 {
        body_parts.into_iter().next().unwrap()
    } else {
        format!("branch('', undefined, [{}])", body_parts.join(", "))
    };

    let idx = idx_alias.unwrap_or("i");
    let key_part = match key_expr {
        Some(k) => format!("({}) => {}", item_alias, k),
        None => "undefined".to_string(),
    };

    let items_arg = if signal_map.is_reactive(list_expr) {
        if let Some(setter) = signal_map.0.get(list_expr) {
            if !setter.is_empty() {
                format!("[{}, {}]", list_expr, setter)
            } else {
                format!("[{}]", list_expr)
            }
        } else {
            format!("[() => ({})]", list_expr)
        }
    } else {
        // Complex expression — wrap in thunk array to take Path 2.
        format!("[() => ({})]", list_expr)
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
            .map(|c| emit_node(c, signal_map, state_names, &next_indent))
            .filter(|s| !s.is_empty())
            .collect();
        let empty_str = if empty_parts.len() == 1 {
            empty_parts.into_iter().next().unwrap()
        } else {
            format!("branch('', undefined, [{}])", empty_parts.join(", "))
        };
        // Reactive length read uses thunk array.
        let populated_cond = format!("[() => (({}) && ({}).length > 0)]", list_expr, list_expr);
        let empty_cond = format!("[() => !(({}) && ({}).length > 0)]", list_expr, list_expr);
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
) -> String {
    let next_indent = format!("{}  ", child_indent);

    match name {
        // ── <$slot> ──────────────────────────────────────────────────────────
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
                emit_nodes(children, signal_map, state_names, &next_indent)
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

            let fallback_subtree = emit_nodes(&fallback_children, signal_map, state_names, &next_indent);
            let loaded_subtree = emit_nodes(&loaded_children, signal_map, state_names, &next_indent);

            format!(
                "createSuspenseBoundary({}, () => {{ return {} }}, () => {{ return {} }})",
                source, fallback_subtree, loaded_subtree
            )
        }

        // ── <$shield> ────────────────────────────────────────────────────────
        "shield" => {
            let (fallback_children, main_children) = split_slot_fallback(children);

            let main_subtree = emit_nodes(&main_children, signal_map, state_names, &next_indent);
            let fallback_subtree = emit_nodes(&fallback_children, signal_map, state_names, &next_indent);

            format!(
                "createShieldBoundary(() => {{ return {} }}, (shield) => {{ return {} }})",
                main_subtree, fallback_subtree
            )
        }

        // ── <$guard> ─────────────────────────────────────────────────────────
        "guard" => {
            let check_expr = find_static_or_binding_attr(attrs, "check")
                .unwrap_or_else(|| "undefined".to_string());

            let (fallback_children, main_children) = split_slot_fallback(children);

            let main_subtree = emit_nodes(&main_children, signal_map, state_names, &next_indent);
            let fallback_subtree = emit_nodes(&fallback_children, signal_map, state_names, &next_indent);

            format!(
                "createGuardBoundary({}, () => {{ return {} }}, (guard) => {{ return {} }})",
                check_expr, main_subtree, fallback_subtree
            )
        }

        // ── <$warp> ──────────────────────────────────────────────────────────
        // NOTE(v0.5-stub): createWarpBoundary requires arbor.mount to accept an arbitrary
        // host node. If arbor.mount only accepts a custom-element host, this boundary
        // is a stub pending an arbor mount API extension.
        "warp" => {
            let target_expr = find_static_or_binding_attr(attrs, "target")
                .unwrap_or_else(|| "undefined".to_string());

            let children_subtree = emit_nodes(children, signal_map, state_names, &next_indent);
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
            let children_subtree = emit_nodes(children, signal_map, state_names, &next_indent);
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
            let children_subtree = emit_nodes(children, signal_map, state_names, &next_indent);
            format!(
                "branch('span', {{ class: 'aihu-sr-only' }}, [{}])",
                children_subtree
            )
        }

        // <$skipLink target="#id"> — RFC-A5-019. Pure HTML/CSS anchor; class
        // injected once at component mount.
        "skipLink" => {
            let target = find_static_attr(attrs, "target").unwrap_or("#main");
            let children_subtree = emit_nodes(children, signal_map, state_names, &next_indent);
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

            let children_subtree = emit_nodes(children, signal_map, state_names, &next_indent);
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
            let children_subtree = emit_nodes(children, signal_map, state_names, &next_indent);
            format!(
                "createRouterBoundary({}, {}, () => {{ return {} }})",
                router_expr, vt_expr, children_subtree
            )
        }

        "link" => {
            // `<$link href prefetch replace>` — RFC-A5-012.
            let href_expr = find_static_or_binding_attr(attrs, "href")
                .unwrap_or_else(|| "'#'".to_string());
            let prefetch_expr = find_static_or_binding_attr(attrs, "prefetch")
                .unwrap_or_else(|| "'none'".to_string());
            let replace_expr = find_static_or_binding_attr(attrs, "replace")
                .unwrap_or_else(|| "false".to_string());
            // Children render inside the <a>.
            let children_subtree = if children.is_empty() {
                "[]".to_string()
            } else {
                let inner = emit_nodes(children, signal_map, state_names, &next_indent);
                format!("[{}]", inner)
            };
            format!(
                "createLinkBoundary({}, {}, {}, {})",
                href_expr, prefetch_expr, replace_expr, children_subtree
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
            let children_subtree = emit_nodes(children, signal_map, state_names, &next_indent);
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

fn emit_attrs(attrs: &[Attr], state_names: &StateNames, signal_map: &SignalMap) -> String {
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
                    expr.to_string()
                } else if name == "class" && expr.trim_start().starts_with('[') {
                    let inner = expr.trim();
                    // Wrap the array in a class-joining helper. The wrapped form
                    // becomes `[() => __aihu_cls([…])]` — a thunk-array reactive
                    // binding that still tracks signal updates via mountEffect.
                    format!("[() => __aihu_cls({})]", inner)
                } else {
                    lower_attr_expr(expr, state_names, signal_map)
                };
                Some(format!("{}: {}", format_attr_key(name), lowered))
            }
            Attr::Event { name, handler } => {
                // deprecated @event alias — emit as onX attr
                Some(format!("on{}: {}", name, handler))
            }
            Attr::Macro { name, value } => {
                // $bind:prop and $on:event emit as direct attrs in the attrs object;
                // other macros ($if, $show, $each, etc.) are emitted as effects outside.
                if let Some(prop) = name.strip_prefix("bind:") {
                    let expr = macro_value_expr(value);
                    Some(format!(
                        "{}: {}",
                        format_attr_key(prop),
                        lower_attr_expr(&expr, state_names, signal_map)
                    ))
                } else if let Some(event) = name.strip_prefix("on:") {
                    let handler = macro_value_expr(value);
                    Some(format!("on{}: {}", capitalize_first(event), handler))
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
fn lower_attr_expr(expr: &str, state_names: &StateNames, signal_map: &SignalMap) -> String {
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
    if expr_references_state(expr, state_names) {
        format!("[() => ({})]", trimmed)
    } else {
        expr.to_string()
    }
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
    while i < bytes.len() {
        // Skip strings to avoid rewriting `$emit.x` inside a string literal.
        let c = bytes[i];
        if c == b'"' || c == b'\'' || c == b'`' {
            let q = c;
            out.push(q as char);
            i += 1;
            while i < bytes.len() {
                let b = bytes[i];
                if b == b'\\' && i + 1 < bytes.len() {
                    out.push(b as char);
                    out.push(bytes[i + 1] as char);
                    i += 2;
                    continue;
                }
                out.push(b as char);
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
                out.push(bytes[i] as char);
                i += 1;
            }
            continue;
        }
        if c == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            out.push('/');
            out.push('*');
            i += 2;
            while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                out.push(bytes[i] as char);
                i += 1;
            }
            if i + 1 < bytes.len() {
                out.push('*');
                out.push('/');
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
                        // Malformed; leave verbatim.
                        out.push(c as char);
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
                out.push_str(&format!(
                    "this.dispatchEvent(new CustomEvent('{}', {{ detail: {}, bubbles: true, composed: false, cancelable: true }}))",
                    name, detail_arg
                ));
                i = close + 1;
                continue;
            }
        }
        out.push(c as char);
        i += 1;
    }
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
        Attr::Event { handler, .. } => {
            if handler.contains("$emit.") {
                *handler = lower_emit_calls(handler, event_names);
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
fn emit_macro_effects(attrs: &[Attr], _el_var: &str, subtree: &str, indent: &str, signal_map: &SignalMap) -> Vec<String> {
    let mut effects: Vec<String> = Vec::new();

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
                    // complex expression — wrap in thunk; user is responsible
                    // for calling getters inside (e.g. `{loading() && !error()}`).
                    format!("[() => ({})]", trimmed)
                };
                effects.push(format!(
                    "{}createIfBoundary({}, () => {{ return {} }})",
                    indent, cond_arg, subtree
                ));
            }
            "show" => {
                let expr = macro_value_expr(value);
                // R3 (Director r6 §3.R3): lower $show to the platform `hidden`
                // attribute (NOT --show CSS custom property). `hidden` respects
                // user CSS [hidden] { display: none !important }; Shadow DOM
                // consumers can override via :host([hidden]) { display: ... }.
                // toggleAttribute is the WHATWG-canonical primitive: passing
                // `false` removes the attribute; `true` writes empty-string.
                effects.push(format!(
                    "{}(() => {{ const _n = {}; onMount(() => {{ const _el = _n && _n.el; if (!_el) return () => {{}}; const _s = effect(() => {{ _el.toggleAttribute('hidden', !({})) }}); return () => {{ _s && _s(); }}; }}); return _n; }})()",
                    indent, subtree, expr
                ));
            }
            "each" => {
                has_each = true;
                let raw = macro_value_expr(value);
                // Parse "list as item" or "list as item, idx"
                if let Some((list_part, rest)) = raw.split_once(" as ") {
                    each_items = list_part.trim().to_string();
                    if let Some((item, idx)) = rest.split_once(',') {
                        item_alias = item.trim().to_string();
                        idx_alias = idx.trim().to_string();
                    } else {
                        item_alias = rest.trim().to_string();
                        idx_alias = "i".to_string();
                    }
                } else {
                    // fallback for old form (should have been caught by parser, but be safe)
                    each_items = raw;
                    item_alias = "item".to_string();
                    idx_alias = "i".to_string();
                }
            }
            "key" => {
                key_fn = macro_value_expr(value);
            }
            "html" => {
                let expr = macro_value_expr(value);
                // branch() returns a descriptor; .el is populated after arbor mounts it.
                // IIFE: capture node, wire reactive effect inside onMount, return node
                // so the parent children array receives the element (not a bare effect).
                // replaceChildren + createContextualFragment parses trusted build-time HTML.
                effects.push(format!(
                    "{}(() => {{ const _n = {}; onMount(() => {{ const _el = _n && _n.el; if (!_el) return () => {{}}; const _s = effect(() => {{ _el.replaceChildren(document.createRange().createContextualFragment({})); }}); return () => {{ _s && _s(); }}; }}); return _n; }})()",
                    indent, subtree, expr
                ));
            }
            "once" => {
                effects.push(format!(
                    "{}createOnceBoundary(() => {{ return {} }})",
                    indent, subtree
                ));
            }
            "memo" => {
                let deps = macro_value_expr(value);
                effects.push(format!(
                    "{}createMemoBoundary({}, () => {{ return {} }})",
                    indent, deps, subtree
                ));
            }
            n if n.starts_with("class:") => {
                let class_name = &n["class:".len()..];
                let expr = macro_value_expr(value);
                // Same IIFE pattern as $show: capture node, wire reactive effect inside
                // onMount so .el is guaranteed to be set, return node to parent children.
                effects.push(format!(
                    "{}(() => {{ const _n = {}; onMount(() => {{ const _el = _n && _n.el; if (!_el) return () => {{}}; const _s = effect(() => {{ _el.classList.toggle('{}', Boolean({})) }}); return () => {{ _s && _s(); }}; }}); return _n; }})()",
                    indent, subtree, class_name, expr
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
                effects.push(format!(
                    "{}(() => {{ const _n = {}; onMount(() => {{ const _el = _n && _n.el; if (_el) {{ {} }}; return () => {{}}; }}); return _n; }})()",
                    indent, subtree, setter_call
                ));
            }
            // B3c — C500 reserved error code. Unknown $<name> directives that
            // reach codegen (not caught by the parser) are logged to stderr.
            // If this is a v1 colon-form, it will already have been rejected
            // by the parser with a hard C500 error. This path covers truly
            // unknown directive names that pass through the AST unchanged.
            other => {
                eprintln!(
                    "C500: unknown directive `${}` (template attribute) — ignored. \
                     Run: bun run --cwd packages/compiler codemod:template-syntax <glob>",
                    other
                );
            }
        }
    }

    if has_each {
        let key_part = if key_fn.is_empty() {
            "undefined".to_string()
        } else {
            format!("({}) => {}", item_alias, key_fn)
        };

        // Use arbor's reactive `each()` when the list is an authored signal.
        // arbor expects a Signal tuple `[getter, setter]` (it reads `items[0]()`),
        // so for `const [items, setItems] = signal(...)` we MUST pass
        // `[items, setItems]` — not the getter alone (which would make
        // `items[0]` an undefined string-indexed access on a function value).
        // For computed signals (no setter) pass `[items]` — index-0 read still works.
        // Plain class-property arrays (no signal) wrap in a `[() => list]` thunk.
        if signal_map.is_reactive(&each_items) {
            let items_arg = if let Some(setter) = signal_map.0.get(&each_items) {
                if !setter.is_empty() {
                    format!("[{}, {}]", each_items, setter)
                } else {
                    format!("[{}]", each_items)
                }
            } else {
                format!("[() => ({})]", each_items)
            };
            effects.push(format!(
                "{}each({}, {}, ({}, {}) => {{ return {} }})",
                indent, items_arg, key_part, item_alias, idx_alias, subtree
            ));
        } else {
            effects.push(format!(
                "{}createEachBoundary([() => ({})], {}, ({}, {}) => {{ return {} }})",
                indent, each_items, key_part, item_alias, idx_alias, subtree
            ));
        }
    }

    effects
}
