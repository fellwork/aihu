/// v0.6a Conformance tests for @route block parsing and BuildTarget emission gates.
///
/// Covers:
///   v0.6.1 — @route block parser + RouteBlock struct in ScribeSource
///   v0.6.2 — EmitResult.route_json sidecar
///   v0.6.4 — BuildTarget enum plumbed through CompileUnit
///   v0.6.6 — Client build elides @agent manifest_json + emits warning comment
///   C500   — @route block outside pages/ path → compile error
use scribe_compiler::{
    compile_full, compile_full_with_target, emit, sfc, BuildTarget,
};

// ─── v0.6.1 — @route block parsing ──────────────────────────────────────────

/// Basic @route block with all fields is parsed into RouteBlock.
#[test]
fn v061_route_block_parsed_all_fields() {
    let src = r#"
@route {
  path: '/admin/users',
  name: 'admin-users',
  middleware: ['auth', 'admin'],
  ssr: true,
  layout: 'admin'
}

@template {
  <div>Hello</div>
}
"#;
    let parsed = sfc::parse_with_path(src, Some("src/pages/admin/users.scribe")).unwrap();
    let route = parsed.route.as_ref().expect("route should be Some");
    assert_eq!(route.path.as_deref(), Some("/admin/users"));
    assert_eq!(route.name.as_deref(), Some("admin-users"));
    assert_eq!(route.middleware, vec!["auth", "admin"]);
    assert_eq!(route.ssr, Some(true));
    assert_eq!(route.layout.as_deref(), Some("admin"));
}

/// Minimal @route block with only a name field.
#[test]
fn v061_route_block_minimal_name_only() {
    let src = r#"
@route {
  name: 'home'
}

@template {
  <div>Home</div>
}
"#;
    let parsed = sfc::parse_with_path(src, Some("src/pages/index.scribe")).unwrap();
    let route = parsed.route.as_ref().expect("route should be Some");
    assert_eq!(route.name.as_deref(), Some("home"));
    assert!(route.path.is_none());
    assert!(route.middleware.is_empty());
    assert!(route.ssr.is_none());
    assert!(route.layout.is_none());
}

/// @route block with ssr: false
#[test]
fn v061_route_block_ssr_false() {
    let src = r#"
@route {
  name: 'static-page',
  ssr: false
}

@template {
  <div>Static</div>
}
"#;
    let parsed = sfc::parse_with_path(src, Some("src/pages/static.scribe")).unwrap();
    let route = parsed.route.as_ref().expect("route should be Some");
    assert_eq!(route.ssr, Some(false));
}

/// @route block with empty middleware array.
#[test]
fn v061_route_block_empty_middleware() {
    let src = r#"
@route {
  name: 'open-page',
  middleware: []
}

@template {
  <div>Open</div>
}
"#;
    let parsed = sfc::parse_with_path(src, Some("src/pages/open.scribe")).unwrap();
    let route = parsed.route.as_ref().expect("route should be Some");
    assert!(route.middleware.is_empty());
}

/// ScribeSource.route is None when no @route block present.
#[test]
fn v061_route_absent_when_no_route_block() {
    let src = r#"
@template {
  <div>Hello</div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    assert!(parsed.route.is_none());
}

// ─── C500 — @route outside pages/ path ───────────────────────────────────────

/// @route block outside pages/ path → C500 compile error.
#[test]
fn v061_c500_route_outside_pages_path() {
    let src = r#"
@route {
  name: 'widget'
}

@template {
  <div>Widget</div>
}
"#;
    let err = sfc::parse_with_path(src, Some("src/components/widget.scribe")).unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C500"));
    assert!(err.message.contains("C500"));
}

/// @route block with no file path (None) → C500.
#[test]
fn v061_c500_route_no_file_path() {
    let src = r#"
@route {
  name: 'widget'
}

@template {
  <div>Widget</div>
}
"#;
    let err = sfc::parse_with_path(src, None).unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C500"));
}

/// parse() (no file path) does NOT trigger C500 for files without @route.
#[test]
fn v061_no_c500_without_route_block() {
    let src = r#"
@template {
  <div>Hello</div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    assert!(parsed.route.is_none());
}

// ─── @layout shorthand ────────────────────────────────────────────────────────

/// @layout 'name' shorthand emits a RouteBlock with layout field set.
#[test]
fn v061_layout_shorthand_parses_to_route_block() {
    let src = "@layout 'dashboard'\n\n@template {\n  <div>Page</div>\n}\n";
    let parsed = sfc::parse_with_path(src, Some("src/pages/settings.scribe")).unwrap();
    let route = parsed.route.as_ref().expect("route should be Some from @layout");
    assert_eq!(route.layout.as_deref(), Some("dashboard"));
    assert!(route.name.is_none());
    assert!(route.path.is_none());
}

/// @layout outside pages/ → C500.
#[test]
fn v061_layout_shorthand_c500_outside_pages() {
    let src = "@layout 'admin'\n\n@template {\n  <div>X</div>\n}\n";
    let err = sfc::parse_with_path(src, Some("src/components/header.scribe")).unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C500"));
}

// ─── v0.6.2 — route_json sidecar ─────────────────────────────────────────────

/// EmitResult.route_json is Some when @route block is present.
#[test]
fn v062_route_json_emitted_when_route_present() {
    let src = r#"
@route {
  path: '/admin/users',
  name: 'admin-users',
  middleware: ['auth'],
  ssr: true,
  layout: 'admin'
}

@template {
  <div>Users</div>
}
"#;
    let parsed = sfc::parse_with_path(src, Some("src/pages/admin/users.scribe")).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "admin-users");

    let route_json = result.route_json.as_ref().expect("route_json should be Some");
    assert!(route_json.contains(r#""pattern": "/admin/users""#));
    assert!(route_json.contains(r#""name": "admin-users""#));
    assert!(route_json.contains(r#""auth""#));
    assert!(route_json.contains(r#""ssr": true"#));
    assert!(route_json.contains(r#""layout": "admin""#));
}

/// EmitResult.route_json is None when no @route block.
#[test]
fn v062_route_json_none_without_route_block() {
    let src = r#"
@template {
  <div>Hello</div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "my-widget");
    assert!(result.route_json.is_none());
}

/// route_json: empty path field when @route has no path override.
#[test]
fn v062_route_json_empty_pattern_when_no_path() {
    let src = r#"
@route {
  name: 'home',
  ssr: false
}

@template {
  <div>Home</div>
}
"#;
    let parsed = sfc::parse_with_path(src, Some("src/pages/index.scribe")).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "home-page");
    let route_json = result.route_json.as_ref().unwrap();
    assert!(route_json.contains(r#""pattern": """#));
    assert!(route_json.contains(r#""ssr": false"#));
}

// ─── v0.6.4 — BuildTarget enum ───────────────────────────────────────────────

/// Default BuildTarget is Universal.
#[test]
fn v064_default_build_target_is_universal() {
    let src = r#"
@template {
  <div>Hello</div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    assert_eq!(unit.target, BuildTarget::Universal);
}

/// compile_full_with_target sets target correctly.
#[test]
fn v064_compile_full_with_target_client() {
    let src = r#"
@template {
  <div>Hello</div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full_with_target(&parsed, BuildTarget::Client).unwrap();
    assert_eq!(unit.target, BuildTarget::Client);
}

/// compile_full_with_target server variant.
#[test]
fn v064_compile_full_with_target_server() {
    let src = r#"
@template {
  <div>Hello</div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full_with_target(&parsed, BuildTarget::Server).unwrap();
    assert_eq!(unit.target, BuildTarget::Server);
}

// ─── v0.6.6 — Client build emission gates ────────────────────────────────────

/// Client build with @agent block: manifest_json is empty, JS has elision comment.
#[test]
fn v066_client_build_elides_agent_manifest() {
    let src = r#"
@agent {
  input name: string
  action greet() -> { message: string }
}

@template {
  <div>Hello</div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full_with_target(&parsed, BuildTarget::Client).unwrap();
    let result = emit(&unit, "my-agent");

    // manifest_json must be empty for client build
    assert!(
        result.manifest_json.is_empty(),
        "manifest_json should be elided in client build"
    );
    // JS must contain the elision comment
    assert!(
        result.js.contains("// [client build] @agent block elided"),
        "JS should contain elision comment"
    );
}

/// Universal build with @agent block: manifest_json IS emitted normally.
#[test]
fn v066_universal_build_emits_agent_manifest() {
    let src = r#"
@agent {
  input name: string
  action greet() -> { message: string }
}

@template {
  <div>Hello</div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full_with_target(&parsed, BuildTarget::Universal).unwrap();
    let result = emit(&unit, "my-agent");

    assert!(
        !result.manifest_json.is_empty(),
        "manifest_json should be emitted in universal build"
    );
    assert!(
        !result.js.contains("@agent block elided"),
        "JS should not have elision comment in universal build"
    );
}

/// Client build with $server macro reference: elision comment in JS.
#[test]
fn v066_client_build_elides_server_macro() {
    let src = r#"
@state {
  const data = $server.fetchUsers()
}

@template {
  <div>Users</div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full_with_target(&parsed, BuildTarget::Client).unwrap();
    let result = emit(&unit, "server-users");

    assert!(
        result.js.contains("// [client build] $server macro reference elided"),
        "JS should contain $server elision comment for client build"
    );
}

/// Server build with @agent block: manifest_json IS emitted (only client gates).
#[test]
fn v066_server_build_does_not_elide_agent() {
    let src = r#"
@agent {
  input name: string
  action greet() -> { message: string }
}

@template {
  <div>Hello</div>
}
"#;
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full_with_target(&parsed, BuildTarget::Server).unwrap();
    let result = emit(&unit, "my-agent");

    // Server build keeps the agent manifest
    assert!(
        !result.manifest_json.is_empty(),
        "manifest_json should be emitted in server build"
    );
}

// ─── v0.6.9 — Conformance fixtures ───────────────────────────────────────────

/// bench/compiler-conformance/route/01-basic-route.scribe route_json matches golden.
#[test]
fn v069_fixture_basic_route_json() {
    let src = include_str!("../../../bench/compiler-conformance/route/01-basic-route.scribe");
    let golden_json = include_str!("../../../bench/compiler-conformance/route/01-basic-route.route.json");

    let parsed = sfc::parse_with_path(src, Some("src/pages/users.scribe")).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "01-basic-route");

    let route_json = result.route_json.as_ref().expect("route_json should be Some for fixture");
    // Normalize whitespace for comparison
    let actual = route_json.split_whitespace().collect::<Vec<_>>().join(" ");
    let expected = golden_json.split_whitespace().collect::<Vec<_>>().join(" ");
    assert_eq!(actual, expected, "route_json should match golden file");
}

/// bench/compiler-conformance/route/02-route-with-layout.scribe route_json matches golden.
#[test]
fn v069_fixture_route_with_layout_json() {
    let src = include_str!("../../../bench/compiler-conformance/route/02-route-with-layout.scribe");
    let golden_json = include_str!("../../../bench/compiler-conformance/route/02-route-with-layout.route.json");

    let parsed = sfc::parse_with_path(src, Some("src/pages/admin/users.scribe")).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "02-route-with-layout");

    let route_json = result.route_json.as_ref().expect("route_json should be Some");
    let actual = route_json.split_whitespace().collect::<Vec<_>>().join(" ");
    let expected = golden_json.split_whitespace().collect::<Vec<_>>().join(" ");
    assert_eq!(actual, expected, "route_json should match golden for layout fixture");
}

/// bench/compiler-conformance/build-target/01-client-elides-agent.scribe
/// — client build produces elision comment.
#[test]
fn v069_fixture_client_elides_agent_js() {
    let src = include_str!("../../../bench/compiler-conformance/build-target/01-client-elides-agent.scribe");

    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full_with_target(&parsed, BuildTarget::Client).unwrap();
    let result = emit(&unit, "01-client-elides-agent");

    // Must have the elision comment.
    assert!(
        result.js.contains("// [client build] @agent block elided"),
        "client build JS should have elision comment"
    );
    // Must not have manifest_json.
    assert!(
        result.manifest_json.is_empty(),
        "client build must not emit manifest_json"
    );
}
