use std::collections::BTreeMap;
use crate::types::{AgentBlock, AgentMacroDecl, InputKind};
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
pub(crate) struct AgentMembers {
    pub(crate) actions: Vec<String>,
    pub(crate) reads: Vec<String>,
    pub(crate) writes: Vec<String>,
    /// Member name → the entry's `describe:` value, stored as the RAW JS string
    /// literal (quotes included) exactly as authored. Kept as a side map rather
    /// than widening the three `Vec<String>`s above, because those feed the
    /// invoker-map emitters whose bodies are byte-aligned across the server
    /// export, the server registration, and the client opaque-ID dispatcher.
    ///
    /// Only populated for members that survive the `expose` gate — an
    /// unexposed member's description must never reach a public artifact.
    pub(crate) describes: BTreeMap<String, String>,
    /// Action name → the MCP `params` object-literal fragment derived from the
    /// handler's signature (DE5). Present only for exposed actions whose
    /// handler parsed and every parameter could be named; absent otherwise, so
    /// the server falls back to the legacy positional `args` schema.
    pub(crate) action_params: BTreeMap<String, String>,
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
pub(crate) fn collect_agent_members(raw_script: &str) -> AgentMembers {
    use crate::parser::state_macros::{
        arrow_args, arrow_is_async, entry_expose, meta_get, parse_state_macros, running_code,
    };
    use crate::types::{CollectionKind, StateMacro};

    // #487 — BOTH dialects contribute members: `$`-collections and the new
    // wrapper declarations lower onto one `StateMacro` IR (C625 bars mixing,
    // so a file is one dialect or the other).
    let mut macros = parse_state_macros(raw_script).unwrap_or_default();
    if let Ok(scan) = crate::parser::state_wrappers::scan_state_wrappers(raw_script) {
        macros.extend(scan.macros);
    }
    let mut members = AgentMembers::default();

    for mac in &macros {
        if let StateMacro::Collection { kind, entries } = mac {
            for entry in entries {
                // #487 §6.1 — the ONE structured expose resolver (shorthand
                // strings + the structured object) replaces the former
                // string-`contains`; server export and client dispatcher both
                // flow through this single function.
                let expose = entry_expose(entry);
                let has_read = expose.read;
                let has_write = expose.write;

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
pub(crate) fn emit_agent_metadata_registration(
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

pub(crate) fn emit_agent_binding_export(tag_name: &str, agent: &AgentBlock, raw_script: &str) -> String {
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
pub(crate) fn emit_agent_client_dispatcher(tag_name: &str, raw_script: &str) -> String {
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

/// T6 (go-public demo) — build the per-instance `_registerAgentDispatcher`
/// STATEMENT that binds the opaque-ID invokers to a SPECIFIC mounted instance's
/// signals (not the inert module-scope `__agentDispatcher`). We register against
/// `<ctx>.element` (the host custom element) so the browser bridge can look up
/// the instance dispatcher after mount.
///
/// FEL-440 — this is a PURE statement builder. It returns only the registration
/// call (2-space body indent), for `emit_function_form` to splice in before the
/// setup's `return`. It does NOT touch the `@aihu/runtime` import (that symbol is
/// added structurally in `build_function_imports`) and does NOT rename the setup
/// parameter (the caller passes the real `ctx_param`). There is therefore no
/// import/`return`/param anchor to miss — the previous exact-literal anchor on
/// `import { defineComponent, defineElement } …` silently dropped the whole
/// registration whenever any third symbol (`onMount`, `ref`→`onMount`, …) joined
/// the import (GH #636). The invoker bodies stay byte-identical to
/// `emit_agent_client_dispatcher`'s (same opaque IDs, same shapes).
///
/// Returns "" when the component exposes no agent members (nothing to register).
pub(crate) fn build_dispatcher_registration_stmt(
    tag_name: &str,
    raw_script: &str,
    ctx_param: &str,
) -> String {
    let members = collect_agent_members(raw_script);
    if members.actions.is_empty() && members.reads.is_empty() && members.writes.is_empty() {
        return String::new();
    }

    // The same opaque-ID → invoker maps as the module-scope export, as an inline
    // object literal for the registration call (6-space entries inside setup).
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

    format!(
        "  _registerAgentDispatcher({}?.element, {{\n    tag: '{}',\n    actions: {},\n    reads: {},\n    writes: {},\n  }})\n",
        ctx_param,
        tag_name,
        fmt(&action_entries),
        fmt(&read_entries),
        fmt(&write_entries),
    )
}

/// fix(server-agent-macro-lowering) — SERVER analog of
/// `build_dispatcher_registration_stmt`. Builds the per-instance
/// `_registerAgentServerBinding(<ctx>.element, { … })` STATEMENT so a
/// server-mounted instance lands a `LiveBinding` in arbor's
/// `componentInstanceRegistry` (the headless `@aihu/agent-service` gate path).
///
/// CONTRAST WITH the client dispatcher: this carries the FULL named binding
/// (member NAMES → invokers, NOT opaque IDs) AND policy (`scope`, `rateLimit`) —
/// exactly the `AgentBindingSpec` shape `mount()` consumes. It is emitted ONLY
/// into SERVER builds (the caller gates on `!elide_agent`); client builds never
/// see it, preserving the policy-server-only security model.
///
/// FEL-440 — a PURE statement builder (see `build_dispatcher_registration_stmt`
/// for the full rationale): no runtime-import surgery, no setup-param rename, no
/// `return`-splice, so there is no anchor to miss. `agent` is `None` for an
/// exposed-members-only component (no `@agent` block) → unscoped, unthrottled.
///
/// Returns "" when the component exposes no agent members (nothing to register).
pub(crate) fn build_server_binding_registration_stmt(
    tag_name: &str,
    agent: Option<&AgentBlock>,
    raw_script: &str,
    ctx_param: &str,
) -> String {
    let members = collect_agent_members(raw_script);
    if members.actions.is_empty() && members.reads.is_empty() && members.writes.is_empty() {
        return String::new();
    }

    // Named-member → invoker maps (6-space entries inside setup body), byte-aligned
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
    // Absent when there is no `@agent` block → undefined (unscoped, unthrottled).
    let mut scope_val: Option<String> = None;
    let mut rate_limit_val: Option<u32> = None;
    if let Some(agent) = agent {
        for mac in &agent.agent_macros {
            match mac {
                AgentMacroDecl::Scope(s) => scope_val = Some(s.clone()),
                AgentMacroDecl::RateLimit(n) => rate_limit_val = Some(*n),
                AgentMacroDecl::Stream(_) => {}
            }
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

    format!(
        "  _registerAgentServerBinding({}?.element, {{\n    tag: '{}',\n    actions: {},\n    reads: {},\n    writes: {},\n    scope: {},\n    rateLimit: {},\n  }})\n",
        ctx_param,
        tag_name,
        fmt(&action_entries),
        fmt(&read_entries),
        fmt(&write_entries),
        scope_str,
        rate_limit_str,
    )
}

pub(crate) fn emit_agent_bindings(agent: &AgentBlock) -> String {
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
