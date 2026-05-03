use scribe_compiler::{compile_full, compile_full_with_target, compile_with_path, emit, sfc, BuildTarget};

#[test]
fn route_block_parses_path() {
    let parsed = sfc::parse_with_path(
        "@template { <h1>Users</h1> }\n@route { path: \"/admin/users\" }\n",
        Some("src/pages/users.scribe"),
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
        Some("src/pages/users.scribe"),
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
        Some("src/pages/users.scribe"),
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
        Some("src/pages/users.scribe"),
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

#[test]
fn build_target_client_suppresses_manifest() {
    let parsed = sfc::parse(
        "@agent {\naction ping() -> { ok: boolean }\n}\n@template { <div></div> }\n",
    )
    .unwrap();
    let unit = compile_full_with_target(&parsed, BuildTarget::Client).unwrap();
    let result = emit(&unit, "x-ping");
    assert!(result.manifest_json.is_empty());
    assert!(result.js.contains("// [client build] @agent block elided"));
}

#[test]
fn route_block_errors_outside_pages_when_path_known() {
    let err = compile_with_path(
        "@template { <h1>Users</h1> }\n@route { path: \"/admin/users\" }\n",
        Some("src/components/users.scribe"),
    )
    .expect_err("route outside src/pages should fail");
    assert!(err.message.contains("C500"));
}
