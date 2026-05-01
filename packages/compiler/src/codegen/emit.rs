use crate::codegen::signals::SignalMap;
use crate::types::{Attr, CompileUnit, TemplateNode};

#[derive(Debug, Default)]
pub struct EmitResult {
    pub js: String,
    pub manifest_json: String,
}

pub fn emit(unit: &CompileUnit, tag_name: &str) -> EmitResult {
    let signal_map = crate::codegen::signals::resolve_signals(unit.source.script.unwrap_or(""));

    if unit.source.style.is_some() {
        eprintln!("warning: <style> block ignored in v0 output");
    }

    if !tag_name.contains('-') {
        eprintln!(
            "warning: tag '{}' does not contain a hyphen; custom element names must include '-'",
            tag_name
        );
    }

    let imports = build_imports(&signal_map);
    let script_body = extract_script_body(unit.source.script.unwrap_or(""));
    let template_nodes = unit.template_ast.as_deref().unwrap_or(&[]);
    let return_expr = emit_nodes(template_nodes, &signal_map, "    ");

    let body = if script_body.is_empty() {
        format!(
            "  return {}
",
            return_expr
        )
    } else {
        format!(
            "{}

  return {}
",
            script_body, return_expr
        )
    };

    let js = format!(
        "{}

defineElement('{}', defineComponent((_ctx) => {{
{}}}))
",
        imports, tag_name, body
    );
    EmitResult {
        js,
        manifest_json: String::new(),
    }
}

fn build_imports(signal_map: &SignalMap) -> String {
    if signal_map.0.is_empty() {
        [
            "import { branch, leaf } from '@scribe/arbor'",
            "import { defineComponent, defineElement } from '@scribe/runtime'",
        ]
        .join(
            "
",
        )
    } else {
        [
            "import { branch, leaf } from '@scribe/arbor'",
            "import type { Signal } from '@scribe/signals'",
            "import { signal } from '@scribe/signals'",
            "import { defineComponent, defineElement } from '@scribe/runtime'",
        ]
        .join(
            "
",
        )
    }
}

fn extract_script_body(script: &str) -> String {
    let filtered: Vec<&str> = script
        .lines()
        .filter(|l| {
            let t = l.trim();
            !t.starts_with("import ") && !t.starts_with("import	")
        })
        .collect();

    let start = filtered
        .iter()
        .position(|l| !l.trim().is_empty())
        .unwrap_or(filtered.len());
    let end = filtered
        .iter()
        .rposition(|l| !l.trim().is_empty())
        .map(|i| i + 1)
        .unwrap_or(0);

    if start >= end {
        return String::new();
    }

    filtered[start..end]
        .iter()
        .map(|l| format!("  {}", l))
        .collect::<Vec<_>>()
        .join(
            "
",
        )
}

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
                .join(
                    "
",
                );
            format!(
                "branch(null, undefined, [
{}
{}])",
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
                    .join(
                        "
",
                    );
                format!(
                    "branch('{}', {}, [
{}
{}])",
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
