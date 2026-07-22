use crate::types::{AgentBlock, AgentMacroDecl, InputKind, RouteBlock, TemplateNode};
use super::mcp_emit::{collect_agent_members};
// ─── v0.6.2 — Route JSON sidecar ─────────────────────────────────────────────

pub(crate) fn emit_route_json(
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
pub(crate) fn collect_component_tags(nodes: &[TemplateNode], out: &mut std::collections::BTreeSet<String>) {
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

pub(crate) fn emit_manifest(
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
