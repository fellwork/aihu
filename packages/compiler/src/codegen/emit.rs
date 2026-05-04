use crate::codegen::signals::SignalMap;
use crate::parser::style_macros::{emit_style_macros, extract_global_reactives};
use crate::types::{AgentBlock, AgentMacroDecl, Attr, BuildTarget, CompileUnit, InputKind, MacroValue, RouteBlock, StyleBlock, StyleMacro, StyleScope, TemplateNode};
// Note: $html macro emits innerHTML assignments — these are intentionally unsafe
// and documented as requiring consumer-side sanitization (see spec).

/// Imports needed due to `@state` macro declarations.
#[derive(Default)]
struct StateImports {
    needs_computed: bool,
    needs_batch: bool,
    needs_on_mount: bool,
    needs_on_cleanup: bool,
    needs_effect_for_macros: bool,
    needs_create_resource: bool,
}

#[derive(Debug, Default)]
pub struct EmitResult {
    pub js: String,
    pub manifest_json: String,
    /// v0.6.2: Serialized `.route.json` sidecar. Some when @route block is present.
    pub route_json: Option<String>,
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

    EmitResult { js, manifest_json, route_json }
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
                            // $html and $show emit `effect()` calls — ensure effect is imported.
                            "html" | "show" => h.needs_effect = true,
                            _ => {}
                        }
                    }
                }
                collect_helpers_recursive(children, h);
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
        lines.push("const createIfBoundary = (cond, b) => cond ? b() : branch(null, undefined, []);");
    }
    if h.once_boundary {
        lines.push("const createOnceBoundary = (b) => b();");
    }
    if h.memo_boundary {
        lines.push("const createMemoBoundary = (deps, b) => b();");
    }
    if h.each_boundary {
        lines.push("const createEachBoundary = (items, key, itemFn) => branch(null, undefined, (items ?? []).map((item, i) => itemFn(item, i)));");
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
) -> (StateImports, Vec<crate::types::StateMacro>, String) {
    use crate::parser::state_macros::parse_state_macros;
    use crate::types::StateMacro;

    let macros = parse_state_macros(raw_script).unwrap_or_default();
    let mut si = StateImports::default();

    for mac in &macros {
        match mac {
            StateMacro::Computed { name, .. } => {
                si.needs_computed = true;
                signal_map.insert_computed(name);
            }
            StateMacro::Prop { name, .. } => {
                let _ = name; // not reactive at this stage
            }
            StateMacro::Action { .. } => {
                si.needs_batch = true;
            }
            StateMacro::LifecycleMount { .. } => {
                si.needs_on_mount = true;
            }
            StateMacro::LifecycleDispose { .. } => {
                si.needs_on_cleanup = true;
            }
            StateMacro::Effect { .. } | StateMacro::EffectOn { .. } | StateMacro::Watch { .. } => {
                si.needs_effect_for_macros = true;
            }
            StateMacro::Resource { .. } => {
                si.needs_create_resource = true;
            }
        }
    }

    let mut plain_lines: Vec<String> = Vec::new();
    let mut i = 0usize;
    let mut in_import = false;
    let bytes = raw_script.as_bytes();
    while i < bytes.len() {
        let nl = raw_script[i..].find('\n').map(|r| i + r).unwrap_or(raw_script.len());
        let line_raw = &raw_script[i..nl];
        let line = line_raw.trim();

        // Skip import lines (handled by extract_script_body)
        // Use the same multiline state machine as extract_script_body.
        if line.starts_with("import ") || line.starts_with("import\t") {
            let opens_block = line.contains('{') && !line.contains('}');
            if opens_block {
                in_import = true;
            }
            i = nl + 1;
            continue;
        }
        if in_import {
            if line.contains(" from ") || line.ends_with(';') {
                in_import = false;
            }
            i = nl + 1;
            continue;
        }

        // Skip $macro lines (and their multi-line bodies)
        if line.starts_with('$') {
            let has_brace = raw_script[i..].find('{').map(|r| i + r);
            let has_nl_first = raw_script[i..].find('\n').map(|r| i + r);
            let macro_keyword = line.trim_start_matches('$').split_ascii_whitespace().next();
            let is_block_macro = matches!(
                macro_keyword,
                Some("effect") | Some("effect.on") | Some("action") | Some("watch") |
                Some("lifecycle.mount") | Some("lifecycle.dispose")
            );
            // Also check for $effect.on( prefix
            let is_block_macro = is_block_macro || line.trim_start_matches('$').starts_with("effect.on(");
            if is_block_macro {
                // For `$action`, the argument list may contain `{ Type }` annotations —
                // the first `{` in the line is NOT the body brace.  Use paren-depth
                // tracking to skip past the arg list and find the true body brace.
                let brace_start_opt = if macro_keyword == Some("action") {
                    let mut depth_paren = 0usize;
                    let mut found: Option<usize> = None;
                    for (j, ch) in raw_script[i..].char_indices() {
                        if ch == '\n' { break; }
                        match ch {
                            '(' => depth_paren += 1,
                            ')' => { depth_paren = depth_paren.saturating_sub(1); }
                            '{' if depth_paren == 0 => { found = Some(i + j); break; }
                            _ => {}
                        }
                    }
                    found
                } else {
                    has_brace.filter(|&b| has_nl_first.map_or(true, |nl2| b < nl2))
                };
                if let Some(brace_start) = brace_start_opt {
                    if let Some(close) = crate::parser::state_macros::find_brace_close(raw_script, brace_start + 1) {
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

    (si, macros, plain_body)
}

/// Transform a bare TypeScript class-property declaration to a `const` declaration.
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
    format!("{}const {}", leading_ws, trimmed)
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

fn emit_state_macro_code(macros: &[crate::types::StateMacro]) -> String {
    use crate::types::StateMacro;
    let mut lines: Vec<String> = Vec::new();
    for mac in macros {
        match mac {
            StateMacro::Prop { name, type_name } => {
                lines.push(format!(
                    "  const {name}: {type_name} = (() => {{ try {{ return JSON.parse((ctx.element as HTMLElement).getAttribute('{name}') ?? '{{}}') as {type_name} }} catch {{ return {{}} as {type_name} }} }})()"
                ));
            }
            StateMacro::Computed { name, expr } => {
                lines.push(format!("  const {name} = computed(() => {expr});"));
            }
            StateMacro::Resource { name, fetcher } => {
                lines.push(format!("  const {name} = createResource(() => {fetcher});"));
            }
            StateMacro::Effect { body } => {
                lines.push(format!("  effect(() => {{ {body} }});"));
            }
            StateMacro::EffectOn { dep, body } => {
                lines.push(format!("  effect(() => {{ {dep}; {body} }});"));
            }
            StateMacro::Watch { name, body } => {
                lines.push(format!("  effect(() => {{ {name}; {body} }});"));
            }
            StateMacro::Action { name, args, body } => {
                lines.push(format!(
                    "  function {name}({args}) {{ return batch(() => {{ {body} }}) }}"
                ));
            }
            StateMacro::LifecycleMount { body } => {
                lines.push(format!("  onMount(() => {{ {body} }});"));
            }
            StateMacro::LifecycleDispose { body } => {
                lines.push(format!("  onCleanup(() => {{ {body} }});"));
            }
        }
    }
    if lines.is_empty() {
        String::new()
    } else {
        lines.join("\n") + "\n"
    }
}

// ─── Function form (no agent block) ──────────────────────────────────────────

fn emit_function_form(unit: &CompileUnit, tag_name: &str) -> String {
    let raw_script = unit.source.script.unwrap_or("");
    let template_nodes = unit.template_ast.as_deref().unwrap_or(&[]);
    let helpers_needed = collect_needed_helpers(template_nodes);

    // Process state macros first (updates signal_map with computed names)
    let mut signal_map = crate::codegen::signals::resolve_signals(raw_script);
    let (si, macros, plain_body) = process_state_body(raw_script, &mut signal_map);

    let imports = build_function_imports(
        &signal_map,
        helpers_needed.needs_effect,
        raw_script,
        &si,
        helpers_needed.each_boundary,
    );
    let return_expr = emit_nodes(template_nodes, &signal_map, "    ");

    let (module_decl, style_injection) = if let Some(style) = &unit.source.style {
        let (decl, injection) = emit_style_block(style);
        (decl, format!("  {}\n", injection))
    } else {
        (String::new(), String::new())
    };

    // Need ctx access for $prop (JSON attribute parsing) — use "ctx" if macros use it
    let uses_ctx = macros.iter().any(|m| matches!(m, crate::types::StateMacro::Prop { .. }));
    let ctx_param = if uses_ctx || unit.source.style.is_some() { "ctx" } else { "_ctx" };

    let macro_code = emit_state_macro_code(&macros);
    let helpers_decl = emit_boundary_helpers(&helpers_needed);

    let body = {
        let mut b = String::new();
        b.push_str(&style_injection);
        if !macro_code.is_empty() {
            b.push_str(&macro_code);
        }
        if !plain_body.is_empty() {
            b.push_str(&plain_body);
            b.push_str("\n\n");
        }
        b.push_str(&format!("  return {}\n", return_expr));
        b
    };

    format!(
        "{}\n\n{}{}defineElement('{}', defineComponent(({}) => {{\n{}}}))
",
        imports, module_decl, helpers_decl, tag_name, ctx_param, body
    )
}

fn build_function_imports(
    signal_map: &SignalMap,
    needs_effect: bool,
    script: &str,
    si: &StateImports,
    needs_each: bool,
) -> String {
    let script_uses_effect = script.contains("effect(");
    let emit_effect = needs_effect || script_uses_effect || si.needs_effect_for_macros;

    // Arbor imports
    let arbor_items = if needs_each {
        "import { branch, leaf, slot, each } from '@scribe/arbor'"
    } else {
        "import { branch, leaf, slot } from '@scribe/arbor'"
    };

    let mut lines: Vec<String> = vec![arbor_items.to_string()];

    // Signals imports
    if !signal_map.0.is_empty() {
        lines.push("import type { Signal } from '@scribe/signals'".to_string());
        let mut sig_items: Vec<&str> = vec!["signal"];
        if si.needs_computed { sig_items.push("computed"); }
        if emit_effect { sig_items.push("effect"); }
        if si.needs_batch { sig_items.push("batch"); }
        lines.push(format!("import {{ {} }} from '@scribe/signals'", sig_items.join(", ")));
    } else {
        // No signals in map, but may still need computed/effect/batch
        let mut sig_items: Vec<&str> = Vec::new();
        if si.needs_computed { sig_items.push("computed"); }
        if emit_effect { sig_items.push("effect"); }
        if si.needs_batch { sig_items.push("batch"); }
        if !sig_items.is_empty() {
            lines.push("import type { Signal } from '@scribe/signals'".to_string());
            lines.push(format!("import {{ {} }} from '@scribe/signals'", sig_items.join(", ")));
        }
    }

    // Runtime imports
    let mut rt_items: Vec<&str> = vec!["defineComponent", "defineElement"];
    if si.needs_on_mount { rt_items.push("onMount"); }
    if si.needs_on_cleanup { rt_items.push("onCleanup"); }
    lines.push(format!("import {{ {} }} from '@scribe/runtime'", rt_items.join(", ")));

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
    let template_nodes = unit.template_ast.as_deref().unwrap_or(&[]);
    let helpers_needed = collect_needed_helpers(template_nodes);
    let script_uses_effect = raw_script.contains("effect(");
    let emit_effect = helpers_needed.needs_effect || script_uses_effect;

    let si = StateImports::default();

    let mut import_lines: Vec<String> = if helpers_needed.each_boundary {
        vec!["import { branch, leaf, slot, each } from '@scribe/arbor'".to_string()]
    } else {
        vec!["import { branch, leaf, slot } from '@scribe/arbor'".to_string()]
    };

    // computed import if needed for number/boolean/enum coercions
    if needs_computed {
        import_lines.push("import { computed } from '@scribe/signals'".to_string());
    }

    // signal import if script uses signals; effect if $html/$show macros or direct effect() calls
    if !signal_map.0.is_empty() {
        import_lines.push("import type { Signal } from '@scribe/signals'".to_string());
        if emit_effect {
            import_lines.push("import { signal, effect } from '@scribe/signals'".to_string());
        } else {
            import_lines.push("import { signal } from '@scribe/signals'".to_string());
        }
    } else if emit_effect {
        import_lines.push("import { effect } from '@scribe/signals'".to_string());
    }

    let mut rt_items: Vec<&str> = vec!["defineComponent", "defineElement"];
    if si.needs_on_mount { rt_items.push("onMount"); }
    if si.needs_on_cleanup { rt_items.push("onCleanup"); }
    import_lines.push(format!("import {{ {} }} from '@scribe/runtime'", rt_items.join(", ")));

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

    let return_expr = emit_nodes(template_nodes, &signal_map, "      ");

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

    // Build agent macros extras (v0.4.8)
    let mut extra_fields = String::new();
    for mac in &agent.agent_macros {
        match mac {
            AgentMacroDecl::Scope(val) => {
                extra_fields.push_str(&format!(",\n    \"scope\": \"{}\"", val));
            }
            AgentMacroDecl::RateLimit(n) => {
                extra_fields.push_str(&format!(",\n    \"rateLimit\": {}", n));
            }
            AgentMacroDecl::Describe(text) => {
                extra_fields.push_str(&format!(",\n    \"description\": \"{}\"", text));
            }
            AgentMacroDecl::Expose { name, type_name, writable } => {
                extra_fields.push_str(&format!(
                    ",\n    \"exposes\": {{\"name\": \"{}\", \"type\": \"{}\", \"writable\": {}}}",
                    name, type_name, writable
                ));
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

fn emit_nodes(nodes: &[TemplateNode], signal_map: &SignalMap, child_indent: &str) -> String {
    let non_empty: Vec<String> = nodes
        .iter()
        .map(|n| emit_node(n, signal_map, child_indent))
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

fn emit_node(node: &TemplateNode, signal_map: &SignalMap, child_indent: &str) -> String {
    match node {
        TemplateNode::Text(s) => {
            let t = decode_html_entities(s.trim());
            if t.is_empty() {
                String::new()
            } else {
                let escaped = t.replace('\\', "\\\\").replace('\'', "\\'");
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
                        "leaf([() => ({}[0]() as any).{}, () => {{}}] as unknown as Signal<string>)",
                        base, prop_path
                    );
                } else if let Some(setter) = signal_map.0.get(base) {
                    if !setter.is_empty() {
                        return format!(
                            "leaf([() => ({}[0]() as any).{}, {}] as unknown as Signal<string>)",
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
                    format!("leaf([() => {}[0]() as unknown as string, () => {{}}] as unknown as Signal<string>)", id)
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

            let attrs_str = emit_attrs(attrs);
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
                    .map(|c| emit_node(c, signal_map, &next_indent))
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
            emit_macro_element(name, attrs, children, signal_map, child_indent)
        }
    }
}

// ─── v0.5 Macro element boundary emitters ────────────────────────────────────

/// Emit JS for a `<$element>` macro boundary node.
fn emit_macro_element(
    name: &str,
    attrs: &[crate::types::Attr],
    children: &[TemplateNode],
    signal_map: &SignalMap,
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
                emit_nodes(children, signal_map, &next_indent)
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

            let fallback_subtree = emit_nodes(&fallback_children, signal_map, &next_indent);
            let loaded_subtree = emit_nodes(&loaded_children, signal_map, &next_indent);

            format!(
                "createSuspenseBoundary({}, () => {{ return {} }}, () => {{ return {} }})",
                source, fallback_subtree, loaded_subtree
            )
        }

        // ── <$shield> ────────────────────────────────────────────────────────
        "shield" => {
            let (fallback_children, main_children) = split_slot_fallback(children);

            let main_subtree = emit_nodes(&main_children, signal_map, &next_indent);
            let fallback_subtree = emit_nodes(&fallback_children, signal_map, &next_indent);

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

            let main_subtree = emit_nodes(&main_children, signal_map, &next_indent);
            let fallback_subtree = emit_nodes(&fallback_children, signal_map, &next_indent);

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

            let children_subtree = emit_nodes(children, signal_map, &next_indent);
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

        // ── Unknown macro element ─────────────────────────────────────────────
        _ => {
            let children_subtree = emit_nodes(children, signal_map, &next_indent);
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

fn emit_attrs(attrs: &[Attr]) -> String {
    // Filter out macro attrs that aren't pure attribute expressions
    // (those are handled via emit_macro_effects instead).
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
                // deprecated :prop alias — emit as direct attr
                Some(format!("{}: {}", name, expr))
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
                    Some(format!("{}: {}", prop, expr))
                } else if let Some(event) = name.strip_prefix("on:") {
                    let handler = macro_value_expr(value);
                    Some(format!("on{}: {}", capitalize_first(event), handler))
                } else {
                    None
                }
            }
        })
        .collect();

    if passthrough.is_empty() {
        "undefined".to_string()
    } else {
        format!("{{ {} }}", passthrough.join(", "))
    }
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

/// Emit side-effectful JS for macro attributes ($if, $show, $each, $html, etc.)
/// attached to an element identified by `el_var`.
fn emit_macro_effects(attrs: &[Attr], el_var: &str, subtree: &str, indent: &str, signal_map: &SignalMap) -> Vec<String> {
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
                effects.push(format!(
                    "{}createIfBoundary({}, () => {{ return {} }})",
                    indent, cond, subtree
                ));
            }
            "show" => {
                let expr = macro_value_expr(value);
                effects.push(format!(
                    "{}effect(() => {{ {}.style.setProperty('--show', ({}) ? '1' : '0') }})",
                    indent, el_var, expr
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
                // $html is unsafe — consumer must sanitize; see spec
                effects.push(format!(
                    "{}// WARNING: $html is unsafe; sanitize consumer-side\n{}effect(() => {{ {}.innerHTML = {} }})",
                    indent, indent, el_var, expr
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
            n if n.starts_with("bind:") || n.starts_with("on:") => {
                // These are already handled in emit_attrs — skip here.
            }
            "raw" => {
                // $raw: node is pass-through, no child processing — handled at node level
            }
            _ => {}
        }
    }

    if has_each {
        let key_part = if key_fn.is_empty() {
            "undefined".to_string()
        } else {
            format!("({}) => {}", item_alias, key_fn)
        };

        // Use arbor's reactive `each()` when the list is a signal;
        // fall back to the static createEachBoundary for plain arrays.
        if signal_map.is_reactive(&each_items) {
            effects.push(format!(
                "{}each({}, {}, ({}, {}) => {{ return {} }})",
                indent, each_items, key_part, item_alias, idx_alias, subtree
            ));
        } else {
            effects.push(format!(
                "{}createEachBoundary({}, {}, ({}, {}) => {{ return {} }})",
                indent, each_items, key_part, item_alias, idx_alias, subtree
            ));
        }
    }

    effects
}
