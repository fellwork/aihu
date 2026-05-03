use crate::codegen::signals::SignalMap;
use crate::types::{AgentBlock, AgentMacroDecl, Attr, CompileUnit, InputKind, MacroValue, StyleBlock, StyleScope, TemplateNode};

#[derive(Debug, Default)]
pub struct EmitResult {
    pub js: String,
    pub manifest_json: String,
}

fn emit_style_block(style: &StyleBlock) -> (String, String) {
    let module_decl = format!(
        "const __style__ = new CSSStyleSheet();\n__style__.replaceSync(`{}`);\n",
        style.content
    );
    let setup_injection = match style.scope {
        StyleScope::Scoped => {
            "(ctx.host as ShadowRoot).adoptedStyleSheets = [__style__];".to_string()
        }
        StyleScope::Global => {
            "document.adoptedStyleSheets = [...document.adoptedStyleSheets, __style__];".to_string()
        }
    };
    (module_decl, setup_injection)
}

pub fn emit(unit: &CompileUnit, tag_name: &str) -> EmitResult {
    if !tag_name.contains('-') {
        eprintln!(
            "warning: tag '{}' does not contain a hyphen; custom element names must include '-'",
            tag_name
        );
    }

    let js = if let Some(agent) = &unit.source.agent {
        emit_options_form(unit, tag_name, agent)
    } else {
        emit_function_form(unit, tag_name)
    };

    let manifest_json = if let Some(agent) = &unit.source.agent {
        emit_manifest(tag_name, agent)
    } else {
        String::new()
    };

    EmitResult { js, manifest_json }
}

// ─── Function form (no agent block) ──────────────────────────────────────────

fn emit_function_form(unit: &CompileUnit, tag_name: &str) -> String {
    let signal_map = crate::codegen::signals::resolve_signals(unit.source.script.unwrap_or(""));

    let imports = build_function_imports(&signal_map);
    let script_body = extract_script_body(unit.source.script.unwrap_or(""));
    let template_nodes = unit.template_ast.as_deref().unwrap_or(&[]);
    let return_expr = emit_nodes(template_nodes, &signal_map, "    ");

    let (module_decl, ctx_param, style_injection) = if let Some(style) = &unit.source.style {
        let (decl, injection) = emit_style_block(style);
        (decl, "ctx", format!("  {}\n", injection))
    } else {
        (String::new(), "_ctx", String::new())
    };

    let body = if script_body.is_empty() {
        format!("{}  return {}\n", style_injection, return_expr)
    } else {
        format!("{}{}\n\n  return {}\n", style_injection, script_body, return_expr)
    };

    format!(
        "{}\n\n{}defineElement('{}', defineComponent(({}) => {{\n{}}}))
",
        imports, module_decl, tag_name, ctx_param, body
    )
}

fn build_function_imports(signal_map: &SignalMap) -> String {
    if signal_map.0.is_empty() {
        [
            "import { branch, leaf, slot } from '@scribe/arbor'",
            "import { defineComponent, defineElement } from '@scribe/runtime'",
        ]
        .join("\n")
    } else {
        [
            "import { branch, leaf, slot } from '@scribe/arbor'",
            "import type { Signal } from '@scribe/signals'",
            "import { signal } from '@scribe/signals'",
            "import { defineComponent, defineElement } from '@scribe/runtime'",
        ]
        .join("\n")
    }
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

    let mut import_lines: Vec<&str> = vec!["import { branch, leaf, slot } from '@scribe/arbor'"];

    // computed import if needed for number/boolean/enum coercions
    if needs_computed {
        import_lines.push("import { computed } from '@scribe/signals'");
    }

    // signal import if script uses signals
    if !signal_map.0.is_empty() {
        import_lines.push("import type { Signal } from '@scribe/signals'");
        import_lines.push("import { signal } from '@scribe/signals'");
    }

    import_lines.push("import { defineComponent, defineElement } from '@scribe/runtime'");

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

    let script_body = extract_script_body(unit.source.script.unwrap_or(""));
    let template_nodes = unit.template_ast.as_deref().unwrap_or(&[]);
    let return_expr = emit_nodes(template_nodes, &signal_map, "      ");

    let (module_decl, style_injection) = if let Some(style) = &unit.source.style {
        let (decl, injection) = emit_style_block(style);
        (decl, format!("    {}\n", injection))
    } else {
        (String::new(), String::new())
    };

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
        "{}\n\n{}defineElement('{}', defineComponent({{\n  attrs: [{}] as const,\n  setup(ctx) {{\n{}  }}\n}}))\n",
        imports, module_decl, tag_name, attrs_str, setup_body
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
            let t = s.trim();
            if t.is_empty() {
                String::new()
            } else {
                format!("leaf('{}')", t)
            }
        }
        TemplateNode::Interpolation(id) => {
            if let Some(setter) = signal_map.0.get(id) {
                format!("leaf([{}, {}] as unknown as Signal<string>)", id, setter)
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
            let effects = emit_macro_effects(attrs, "el", &base, child_indent);
            if effects.is_empty() {
                base
            } else {
                // Return the first effect (boundary wraps supersede the base node).
                effects.into_iter().next().unwrap_or(base)
            }
        }
    }
}

fn emit_attrs(attrs: &[Attr]) -> String {
    // Filter out macro attrs that aren't pure attribute expressions
    // (those are handled via emit_macro_effects instead).
    let passthrough: Vec<String> = attrs
        .iter()
        .filter_map(|a| match a {
            Attr::Static { name, value } => Some(format!("{}: '{}'", name, value)),
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
fn emit_macro_effects(attrs: &[Attr], el_var: &str, subtree: &str, indent: &str) -> Vec<String> {
    let mut effects: Vec<String> = Vec::new();

    let mut has_each = false;
    let mut each_items = String::new();
    let mut key_fn = String::new();

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
                each_items = macro_value_expr(value);
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
            key_fn.clone()
        };
        effects.push(format!(
            "{}createEachBoundary({}, {}, (item, i) => {{ return {} }})",
            indent, each_items, key_part, subtree
        ));
    }

    effects
}
