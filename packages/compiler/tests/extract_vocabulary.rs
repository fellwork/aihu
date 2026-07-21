//! GX Phase 1 (#437-GX) — the `extract:` two-axis vocabulary, compile-error
//! composition (spec §3), and the three-artifact fan-out (spec §2.4).
//!
//! Fixture pairs follow the C470/C471 discipline: every compile error has a
//! should-fail fixture AND a should-pass sibling proving the legal neighbor
//! compiles. The fan-out tests assert the code marker, the `.route.json`
//! sidecar, and the agent-meta manifest render the SAME resolved policy — the
//! DA-f2 agreement, checked before any enforcement phase exists.

use aihu_compiler::{compile_full, extract, sfc};
use aihu_compiler::codegen::emit;

fn compile_page(src: &str) -> aihu_compiler::EmitResult {
    let parsed = sfc::parse_with_path(src, Some("src/pages/fixture.aihu")).unwrap();
    let unit = compile_full(&parsed).unwrap();
    emit(&unit, "x-fixture")
}

/// Pull the `// @aihu:extract read=<v> call=<v>` marker tokens out of emitted JS.
fn marker_tokens(js: &str) -> (String, String) {
    let line = js
        .lines()
        .find(|l| l.starts_with("// @aihu:extract "))
        .expect("emitted JS must carry the extract marker");
    let rest = line.strip_prefix("// @aihu:extract ").unwrap();
    let mut parts = rest.split_whitespace();
    let read = parts.next().unwrap().strip_prefix("read=").unwrap().to_string();
    let call = parts.next().unwrap().strip_prefix("call=").unwrap().to_string();
    (read, call)
}

/// Pull the `"extract": {...}` object (single-line, as emitted) out of a JSON
/// sidecar string.
fn extract_object(json: &str) -> String {
    let start = json
        .find("\"extract\": ")
        .expect("sidecar must carry the extract member");
    let obj_start = start + "\"extract\": ".len();
    let bytes = json.as_bytes();
    let mut depth = 0usize;
    let mut end = obj_start;
    for (i, b) in bytes.iter().enumerate().skip(obj_start) {
        match b {
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    end = i + 1;
                    break;
                }
            }
            _ => {}
        }
    }
    json[obj_start..end].to_string()
}

// ─── The declaration parses — both positions, all value shapes ───────────────

/// Verification item 5: the spec-§2.2 hard-tier route fixture parses.
#[test]
fn route_extract_scope_shape_parses() {
    let src = r#"
@route {
  path: '/reports/:id'
  ssr: true
  extract: {
    read: { scope: 'reports:read' }
    call: { scope: 'reports:read' }
  }
}

@template { <div>report</div> }
"#;
    let parsed = sfc::parse_with_path(src, Some("src/pages/reports.aihu")).unwrap();
    let decl = parsed.route.as_ref().unwrap().extract.as_ref().unwrap();
    assert_eq!(
        decl.read,
        Some(aihu_compiler::ExtractRead::Scope("reports:read".to_string()))
    );
    assert_eq!(
        decl.call,
        Some(aihu_compiler::ExtractCall::Scope("reports:read".to_string()))
    );
}

/// The spec-§2.2 default-posture route fixture (the scaffold shape).
#[test]
fn route_extract_enum_shape_parses() {
    let src = r#"
@route {
  path: '/pricing'
  ssr: true
  extract: {
    read: 'agents'
    call: 'anonymous'
  }
}

@template { <div>pricing</div> }
"#;
    let parsed = sfc::parse_with_path(src, Some("src/pages/pricing.aihu")).unwrap();
    let decl = parsed.route.as_ref().unwrap().extract.as_ref().unwrap();
    assert_eq!(decl.read, Some(aihu_compiler::ExtractRead::Agents));
    assert_eq!(decl.call, Some(aihu_compiler::ExtractCall::Anonymous));
}

/// The `$extract` state-macro position (spec §2.2, non-route components).
#[test]
fn state_extract_macro_parses() {
    let src = "@state {\n  $extract: { read: 'verified', call: 'verified' }\n  const balance = 0\n}\n@template { <div>{balance}</div> }";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-balance");
    let (read, call) = marker_tokens(&result.js);
    assert_eq!(read, "verified");
    assert_eq!(call, "verified");
}

// ─── C481 — expose: under a closed call axis (spec §3 row 3) ─────────────────

#[test]
fn c481_expose_under_call_none_fails() {
    let src = r#"@state {
  $extract: { read: 'all', call: 'none' }
  $computed: { total: { expose: { read: true }, value: () => 41 + 1 } }
}
@template { <div>{total}</div> }"#;
    let parsed = sfc::parse(src).unwrap();
    let err = compile_full(&parsed).unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C481"));
}

#[test]
fn c481_route_extract_call_none_with_expose_fails() {
    let src = r#"
@route {
  path: '/docs'
  extract: { read: 'all', call: 'none' }
}
@state {
  $action: { refresh: { expose: { read: true }, handler: () => { console.log('r') } } }
}
@template { <div>docs</div> }
"#;
    let parsed = sfc::parse_with_path(src, Some("src/pages/docs.aihu")).unwrap();
    let err = compile_full(&parsed).unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C481"));
}

/// Should-pass sibling: `call: 'none'` with NO expose anywhere is row 2 —
/// crawlable-but-not-callable, the D3-independence pattern.
#[test]
fn call_none_without_expose_is_legal() {
    let src = r#"@state {
  $extract: { read: 'all', call: 'none' }
  const total = 42
}
@template { <div>{total}</div> }"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-open");
    let (read, call) = marker_tokens(&result.js);
    assert_eq!((read.as_str(), call.as_str()), ("all", "none"));
}

/// Should-pass sibling: an exposed member under an OPEN call axis (row 1).
#[test]
fn expose_under_open_call_is_legal() {
    let src = r#"@state {
  $extract: { read: 'agents', call: 'anonymous' }
  $computed: { total: { expose: { read: true }, value: () => 42 } }
}
@template { <div>{total}</div> }"#;
    let parsed = sfc::parse(src).unwrap();
    assert!(compile_full(&parsed).is_ok());
}

// ─── C483 — malformed policy values (spec §3 rows 6–7) ───────────────────────

#[test]
fn c483_route_unknown_read_value_fails() {
    let src = r#"
@route {
  path: '/p'
  extract: { read: 'everyone', call: 'anonymous' }
}
@template { <div>p</div> }
"#;
    let err = sfc::parse_with_path(src, Some("src/pages/p.aihu")).unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C483"));
}

#[test]
fn c483_state_extract_non_object_fails() {
    let src = "@state {\n  $extract: 'agents'\n}\n@template { <div>x</div> }";
    let parsed = sfc::parse(src).unwrap();
    let err = compile_full(&parsed).unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C483"));
}

/// Row 6: A's C482 is UNREPRESENTABLE — an empty scope name is a malformed
/// value (C483), not a "gated without a scope" policy state.
#[test]
fn c483_empty_scope_is_malformed_value_not_c482() {
    let src = r#"
@route {
  path: '/r'
  extract: { read: { scope: '' }, call: 'anonymous' }
}
@template { <div>r</div> }
"#;
    let err = sfc::parse_with_path(src, Some("src/pages/r.aihu")).unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C483"));
}

// ─── C484 — one declaration per surface (spec §3 row 8) ──────────────────────

#[test]
fn c484_route_extract_and_state_extract_fails() {
    let src = r#"
@route {
  path: '/both'
  extract: { read: 'agents', call: 'anonymous' }
}
@state {
  $extract: { read: 'verified', call: 'verified' }
}
@template { <div>both</div> }
"#;
    let parsed = sfc::parse_with_path(src, Some("src/pages/both.aihu")).unwrap();
    let err = compile_full(&parsed).unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C484"));
}

#[test]
fn c484_two_state_extracts_fails() {
    let src = "@state {\n  $extract: { read: 'human' }\n  $extract: { call: 'verified' }\n}\n@template { <div>x</div> }";
    let parsed = sfc::parse(src).unwrap();
    let err = compile_full(&parsed).unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C484"));
}

/// Should-pass sibling: ONE declaration in either position compiles.
#[test]
fn single_declaration_either_position_is_legal() {
    let route_only = r#"
@route {
  path: '/one'
  extract: { read: 'search', call: 'none' }
}
@template { <div>one</div> }
"#;
    let parsed = sfc::parse_with_path(route_only, Some("src/pages/one.aihu")).unwrap();
    assert!(compile_full(&parsed).is_ok());

    let state_only =
        "@state {\n  $extract: { read: 'human', call: 'verified' }\n}\n@template { <div>x</div> }";
    let parsed = sfc::parse(state_only).unwrap();
    assert!(compile_full(&parsed).is_ok());
}

// ─── W480 / W481 — the advisory rows (spec §3 rows 11–12) ────────────────────

#[test]
fn w480_explicit_public_read_over_component_scope() {
    let src = r#"
@state {
  $extract: { read: 'agents', call: 'anonymous' }
}
@agent {
  $scope "reports:read"
}
@template { <div>x</div> }
"#;
    let parsed = sfc::parse(src).unwrap();
    let warnings = aihu_compiler::extract_policy_warnings(&parsed);
    assert_eq!(warnings.len(), 1);
    assert_eq!(warnings[0].code.as_deref(), Some("W480"));
}

#[test]
fn w481_call_scope_with_nothing_exposed() {
    let src = "@state {\n  $extract: { read: 'all', call: { scope: 'x' } }\n}\n@template { <div>x</div> }";
    let parsed = sfc::parse(src).unwrap();
    let warnings = aihu_compiler::extract_policy_warnings(&parsed);
    assert_eq!(warnings.len(), 1);
    assert_eq!(warnings[0].code.as_deref(), Some("W481"));
}

/// Row 4 sanity — act-but-never-read is legal AND warning-free when a member
/// is exposed: the pattern A's lattice forbade.
#[test]
fn act_but_never_read_is_legal_and_quiet() {
    let src = r#"@state {
  $extract: { read: 'human', call: 'verified' }
  $action: { act: { expose: { read: true }, handler: () => { console.log('a') } } }
}
@template { <div>x</div> }"#;
    let parsed = sfc::parse(src).unwrap();
    assert!(compile_full(&parsed).is_ok());
    assert!(aihu_compiler::extract_policy_warnings(&parsed).is_empty());
}

// ─── The derivation: component-$scope → read (spec §2.3) ─────────────────────

#[test]
fn component_scope_derives_fail_closed_read() {
    let src = r#"
@state {
  $computed: { total: { expose: { read: true }, value: () => 42 } }
}
@agent {
  $scope "reports:read"
}
@template { <div>{total}</div> }
"#;
    let parsed = sfc::parse(src).unwrap();
    let resolved = extract::resolve_extract(&parsed);
    assert_eq!(
        resolved.read,
        aihu_compiler::ExtractRead::Scope("reports:read".to_string())
    );
    assert_eq!(resolved.read_origin, extract::ExtractOrigin::DerivedFromScope);
    // ...and the derived value reaches the emitted marker.
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-scoped");
    let (read, _) = marker_tokens(&result.js);
    assert_eq!(read, "scope:reports:read");
}

// ─── The default posture (spec §9) ───────────────────────────────────────────

#[test]
fn no_declaration_resolves_to_ratified_default() {
    let src = "@state {\n  const n = 1\n}\n@template { <div>{n}</div> }";
    let parsed = sfc::parse(src).unwrap();
    let resolved = extract::resolve_extract(&parsed);
    assert_eq!(resolved.read, aihu_compiler::ExtractRead::Agents);
    assert_eq!(resolved.call, aihu_compiler::ExtractCall::Anonymous);
    assert_eq!(resolved.read_origin, extract::ExtractOrigin::Default);
    assert_eq!(resolved.call_origin, extract::ExtractOrigin::Default);
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "x-default");
    let (read, call) = marker_tokens(&result.js);
    assert_eq!((read.as_str(), call.as_str()), ("agents", "anonymous"));
}

// ─── Three-artifact fan-out agreement (spec §2.4 / DA-f2) ────────────────────

/// One declaration on a route page with an agent surface produces all three
/// artifacts, and the three carry the SAME policy — extracted from the
/// artifacts themselves, not from the resolver, so a drift in ANY emitter
/// breaks this test.
#[test]
fn fan_out_three_artifacts_agree_declared() {
    let src = r#"
@route {
  path: '/dash'
  ssr: true
  extract: { read: { scope: 'dash:read' }, call: 'verified' }
}
@state {
  $computed: { total: { expose: { read: true }, value: () => 42 } }
}
@template { <div>{total}</div> }
"#;
    let result = compile_page(src);

    // Artifact 1 — the code marker.
    let (read, call) = marker_tokens(&result.js);
    assert_eq!(read, "scope:dash:read");
    assert_eq!(call, "verified");

    // Artifact 2 — the `.route.json` sidecar.
    let route_json = result.route_json.as_deref().expect("route sidecar");
    let route_extract = extract_object(route_json);
    assert_eq!(route_extract, "{ \"read\": { \"scope\": \"dash:read\" }, \"call\": \"verified\" }");

    // Artifact 3 — the agent-meta manifest.
    assert!(!result.manifest_json.is_empty(), "agent surface → manifest");
    let manifest_extract = extract_object(&result.manifest_json);

    // Agreement: the two sidecars are byte-identical on the policy object, and
    // the marker tokens are that object's canonical single-token forms.
    assert_eq!(route_extract, manifest_extract, "route.json and agent-meta must agree");

    // Artifact 4 (GX #468) — the LIVE registry payload. The emitted
    // `registerAgentMetadata({...})` call carries the same policy object,
    // byte-identical to the sidecars, so a deployment reading
    // `getAgentMetadata(tag).extract` instead of the sidecar sees the same
    // governance the sidecar records.
    assert!(
        result.js.contains("registerAgentMetadata({"),
        "agent surface must register live metadata:\n{}",
        result.js
    );
    assert!(
        result.js.contains(&format!("  extract: {},", route_extract)),
        "registerAgentMetadata must carry the sidecar-identical extract object:\n{}",
        result.js
    );
}

/// The DEFAULT also fans out consistently (recorded, never implied).
#[test]
fn fan_out_three_artifacts_agree_default() {
    let src = r#"
@route {
  path: '/plain'
  ssr: true
}
@state {
  $computed: { total: { expose: { read: true }, value: () => 42 } }
}
@template { <div>{total}</div> }
"#;
    let result = compile_page(src);
    let (read, call) = marker_tokens(&result.js);
    assert_eq!((read.as_str(), call.as_str()), ("agents", "anonymous"));
    let route_extract = extract_object(result.route_json.as_deref().unwrap());
    let manifest_extract = extract_object(&result.manifest_json);
    assert_eq!(route_extract, "{ \"read\": \"agents\", \"call\": \"anonymous\" }");
    assert_eq!(route_extract, manifest_extract);
    // Artifact 4 (GX #468) — the recorded default also reaches the live registry.
    assert!(
        result.js.contains(&format!("  extract: {},", route_extract)),
        "registerAgentMetadata must carry the recorded default:\n{}",
        result.js
    );
}
