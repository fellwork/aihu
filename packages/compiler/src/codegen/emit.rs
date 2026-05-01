use crate::codegen::signals::SignalMap;
use crate::types::{Attr, CompileUnit, ContractAst, InputKind, TemplateNode};

#[derive(Debug, Default)]
pub struct EmitResult {
    pub js: String,
    pub manifest_json: String,
}

pub fn emit(unit: &CompileUnit, tag_name: &str) -> EmitResult {
    if unit.source.style.is_some() {
        eprintln!("warning: <style> block ignored in v0 output");
    }

    if !tag_name.contains('-') {
        eprintln!(
            "warning: tag '{}' does not contain a hyphen; custom element names must include '-'",
            tag_name
        );
    }

    let js = if let Some(contract) = &unit.source.contract {
        emit_options_form(unit, tag_name, contract)
    } else {
        emit_function_form(unit, tag_name)
    };

    let manifest_json = if let Some(contract) = &unit.source.contract {
        emit_manifest(tag_name, contract)
    } else {
        String::new()
    };

    EmitResult { js, manifest_json }
}

// ─── Function form (no contract) ─────────────────────────────────────────────

fn emit_function_form(unit: &CompileUnit, tag_name: &str) -> String {
    let signal_map = crate::codegen::signals::resolve_signals(unit.source.script.unwrap_or(""));

    let imports = build_function_imports(&signal_map);
    let script_body = extract_script_body(unit.source.script.unwrap_or(""));
    let template_nodes = unit.template_ast.as_deref().unwrap_or(&[]);
    let return_expr = emit_nodes(template_nodes, &signal_map, "    ");

    let body = if script_body.is_empty() {
        format!("  return {}\n", return_expr)
    } else {
        format!("{}\n\n  return {}\n", script_body, return_expr)
    };

    format!(
        "{}\n\ndefineElement('{}', defineComponent((_ctx) => {{\n{}}}))
",
        imports, tag_name, body
    )
}

fn build_function_imports(signal_map: &SignalMap) -> String {
    if signal_map.0.is_empty() {
        [
            "import { branch, leaf } from '@scribe/arbor'",
            "import { defineComponent, defineElement } from '@scribe/runtime'",
        ]
        .join("\n")
    } else {
        [
            "import { branch, leaf } from '@scribe/arbor'",
            "import type { Signal } from '@scribe/signals'",
            "import { signal } from '@scribe/signals'",
            "import { defineComponent, defineElement } from '@scribe/runtime'",
        ]
        .join("\n")
    }
}

// ─── Options form (with contract) ─────────────────────────────────────────────

fn emit_options_form(unit: &CompileUnit, tag_name: &str, contract: &ContractAst) -> String {
    let signal_map = crate::codegen::signals::resolve_signals(unit.source.script.unwrap_or(""));
    let needs_computed = contract.inputs.iter().any(|i| {
        matches!(
            i.kind,
            InputKind::Number | InputKind::Boolean | InputKind::Enum(_)
        )
    });

    let mut import_lines: Vec<&str> = vec!["import { branch, leaf } from '@scribe/arbor'"];

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
    let attrs_list: Vec<String> = contract
        .inputs
        .iter()
        .map(|i| format!("'{}'", i.name))
        .collect();
    let attrs_str = attrs_list.join(", ");

    // contract bindings inside setup(ctx)
    let contract_bindings = emit_contract_bindings(contract);

    let script_body = extract_script_body(unit.source.script.unwrap_or(""));
    let template_nodes = unit.template_ast.as_deref().unwrap_or(&[]);
    let return_expr = emit_nodes(template_nodes, &signal_map, "      ");

    let mut setup_body = String::new();
    if !contract_bindings.is_empty() {
        setup_body.push_str(&contract_bindings);
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
        "{}\n\ndefineElement('{}', defineComponent({{\n  attrs: [{}] as const,\n  setup(ctx) {{\n{}  }}\n}}))\n",
        imports, tag_name, attrs_str, setup_body
    )
}

fn emit_contract_bindings(contract: &ContractAst) -> String {
    let mut lines: Vec<String> = Vec::new();
    for input in &contract.inputs {
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

fn emit_manifest(tag_name: &str, contract: &ContractAst) -> String {
    if contract.inputs.is_empty() && contract.actions.is_empty() {
        return String::new();
    }

    let tool_name = tag_name.replace('-', "_");

    // Build inputs JSON
    let inputs_json = if contract.inputs.is_empty() {
        "{}".to_string()
    } else {
        let input_entries: Vec<String> = contract
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
    let actions_json = if contract.actions.is_empty() {
        "{}".to_string()
    } else {
        let action_entries: Vec<String> = contract
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

    format!(
        "{{\n  \"tools\": [{{\n    \"name\": \"{}\",\n    \"tag\": \"{}\",\n    \"inputs\": {},\n    \"actions\": {}\n  }}]\n}}",
        tool_name, tag_name, inputs_json, actions_json
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
            let attrs_str = emit_attrs(attrs);
            let has_element_child = children
                .iter()
                .any(|c| matches!(c, TemplateNode::Element { .. }));
            let next_indent = format!("{}  ", child_indent);
            let non_empty_children: Vec<String> = children
                .iter()
                .map(|c| emit_node(c, signal_map, &next_indent))
                .filter(|s| !s.is_empty())
                .collect();

            if non_empty_children.is_empty() {
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
            }
        }
    }
}

fn emit_attrs(attrs: &[Attr]) -> String {
    if attrs.is_empty() {
        return "undefined".to_string();
    }
    let pairs: Vec<String> = attrs
        .iter()
        .map(|a| match a {
            Attr::Static { name, value } => format!("{}: '{}'", name, value),
            Attr::Binding { name, expr } => format!("{}: {}", name, expr),
            Attr::Event { name, handler } => format!("on{}: {}", name, handler),
        })
        .collect();
    format!("{{ {} }}", pairs.join(", "))
}
