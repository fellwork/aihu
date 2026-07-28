use aihu_compiler::{compile_full, compile_full_with_target, compile_with_path, emit, sfc, BuildTarget};

#[test]
fn route_block_parses_path() {
    let parsed = sfc::parse_with_path(
        "@template { <h1>Users</h1> }\n@route { path: \"/admin/users\" }\n",
        Some("src/pages/users.aihu"),
    )
    .unwrap();
    let route = parsed.route.expect("route block");
    assert_eq!(route.path.as_deref(), Some("/admin/users"));
    assert!(route.name.is_none());
}

#[test]
fn route_block_parses_all_fields() {
    let parsed = sfc::parse_with_path(
        "@template { <h1>Users</h1> }\n@route { path: \"/admin/users\", name: \"admin-users\", middleware: [\"auth\", \"audit\"], ssr: false, layout: \"admin\" }\n",
        Some("src/pages/users.aihu"),
    )
    .unwrap();
    let route = parsed.route.expect("route block");
    assert_eq!(route.path.as_deref(), Some("/admin/users"));
    assert_eq!(route.name.as_deref(), Some("admin-users"));
    assert_eq!(route.middleware, vec!["auth".to_string(), "audit".to_string()]);
    assert_eq!(route.ssr, Some(false));
    assert_eq!(route.layout.as_deref(), Some("admin"));
}

#[test]
fn route_block_empty_is_ok() {
    let parsed = sfc::parse_with_path(
        "@template { <h1>Users</h1> }\n@route { }\n",
        Some("src/pages/users.aihu"),
    )
    .unwrap();
    let route = parsed.route.expect("route block");
    assert!(route.path.is_none());
    assert!(route.middleware.is_empty());
}

#[test]
fn route_codegen_emits_route_json() {
    let parsed = sfc::parse_with_path(
        "@template { <h1>Users</h1> }\n@route { path: \"/admin/users\", name: \"admin-users\", middleware: [\"auth\", \"audit\"], ssr: false, layout: \"admin\" }\n",
        Some("src/pages/users.aihu"),
    )
    .unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "users-page");
    let route_json = result.route_json.as_deref().unwrap_or("");
    assert!(route_json.contains("\"pattern\": \"/admin/users\""));
    assert!(route_json.contains("\"name\": \"admin-users\""));
    assert!(route_json.contains("\"auth\""));
    assert!(route_json.contains("\"ssr\": false"));
    assert!(route_json.contains("\"layout\": \"admin\""));
}

#[test]
fn route_json_is_none_without_route_block() {
    let parsed = sfc::parse("@template { <h1>Users</h1> }\n").unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "users-page");
    assert!(result.route_json.is_none());
}

// FEL-434 (closes FEL-423): a CLIENT-target build of an agent component now
// EMITS the agent manifest sidecar (`manifest_json`) so the agent-readiness
// generator can list the component — while the client JS still elides the
// in-bundle `registerAgentMetadata` (mcp_emit.rs "NEVER in client builds"; the
// manifest is an on-disk build artifact, never bundled). Was
// `build_target_client_suppresses_manifest`, which asserted the opposite; that
// suppression is exactly the FEL-434 defect (client -> empty ## Components).
#[test]
fn build_target_client_emits_manifest_sidecar_but_elides_in_bundle_registration() {
    let parsed = sfc::parse(
        "@agent {\naction ping() -> { ok: boolean }\n}\n@template { <div></div> }\n",
    )
    .unwrap();
    let unit = compile_full_with_target(&parsed, BuildTarget::Client).unwrap();
    let result = emit(&unit, "x-ping");
    // The build-time sidecar IS emitted for client builds (the fix).
    assert!(
        !result.manifest_json.is_empty(),
        "client build must emit the agent manifest sidecar, got empty"
    );
    // The client JS still elides the in-bundle registration — the elision and
    // the size/policy invariant (T1-b) are untouched.
    assert!(result.js.contains("// [client build] @agent block elided"));
    assert!(
        !result.js.contains("registerAgentMetadata"),
        "client JS must NOT carry registerAgentMetadata (in-bundle elision stays), got:\n{}",
        result.js
    );
}

#[test]
fn route_block_errors_outside_pages_when_path_known() {
    let err = compile_with_path(
        "@template { <h1>Users</h1> }\n@route { path: \"/admin/users\" }\n",
        Some("src/components/users.aihu"),
    )
    .expect_err("route outside src/pages should fail");
    assert!(err.message.contains("C500"));
}
