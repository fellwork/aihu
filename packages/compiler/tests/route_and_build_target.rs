/// v0.6a Conformance tests for @route block parsing and BuildTarget emission gates.
///
/// Covers:
///   v0.6.1 — @route block parser + RouteBlock struct in AihuSource
///   v0.6.2 — EmitResult.route_json sidecar
///   v0.6.4 — BuildTarget enum plumbed through CompileUnit
///   v0.6.6 — Client build elides @agent manifest_json + emits warning comment
///   C500   — @route block outside pages/ path → compile error
use aihu_compiler::{
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
    let parsed = sfc::parse_with_path(src, Some("src/pages/admin/users.aihu")).unwrap();
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
    let parsed = sfc::parse_with_path(src, Some("src/pages/index.aihu")).unwrap();
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
    let parsed = sfc::parse_with_path(src, Some("src/pages/static.aihu")).unwrap();
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
    let parsed = sfc::parse_with_path(src, Some("src/pages/open.aihu")).unwrap();
    let route = parsed.route.as_ref().expect("route should be Some");
    assert!(route.middleware.is_empty());
}

/// AihuSource.route is None when no @route block present.
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
    let err = sfc::parse_with_path(src, Some("src/components/widget.aihu")).unwrap_err();
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
    let parsed = sfc::parse_with_path(src, Some("src/pages/settings.aihu")).unwrap();
    let route = parsed.route.as_ref().expect("route should be Some from @layout");
    assert_eq!(route.layout.as_deref(), Some("dashboard"));
    assert!(route.name.is_none());
    assert!(route.path.is_none());
}

/// @layout outside pages/ → C500.
#[test]
fn v061_layout_shorthand_c500_outside_pages() {
    let src = "@layout 'admin'\n\n@template {\n  <div>X</div>\n}\n";
    let err = sfc::parse_with_path(src, Some("src/components/header.aihu")).unwrap_err();
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
    let parsed = sfc::parse_with_path(src, Some("src/pages/admin/users.aihu")).unwrap();
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
    let parsed = sfc::parse_with_path(src, Some("src/pages/index.aihu")).unwrap();
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

/// bench/compiler-conformance/route/01-basic-route.aihu route_json matches golden.
#[test]
fn v069_fixture_basic_route_json() {
    let src = include_str!("../../../bench/compiler-conformance/route/01-basic-route.aihu");
    let golden_json = include_str!("../../../bench/compiler-conformance/route/01-basic-route.route.json");

    let parsed = sfc::parse_with_path(src, Some("src/pages/users.aihu")).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "01-basic-route");

    let route_json = result.route_json.as_ref().expect("route_json should be Some for fixture");
    // Normalize whitespace for comparison
    let actual = route_json.split_whitespace().collect::<Vec<_>>().join(" ");
    let expected = golden_json.split_whitespace().collect::<Vec<_>>().join(" ");
    assert_eq!(actual, expected, "route_json should match golden file");
}

/// bench/compiler-conformance/route/02-route-with-layout.aihu route_json matches golden.
#[test]
fn v069_fixture_route_with_layout_json() {
    let src = include_str!("../../../bench/compiler-conformance/route/02-route-with-layout.aihu");
    let golden_json = include_str!("../../../bench/compiler-conformance/route/02-route-with-layout.route.json");

    let parsed = sfc::parse_with_path(src, Some("src/pages/admin/users.aihu")).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "02-route-with-layout");

    let route_json = result.route_json.as_ref().expect("route_json should be Some");
    let actual = route_json.split_whitespace().collect::<Vec<_>>().join(" ");
    let expected = golden_json.split_whitespace().collect::<Vec<_>>().join(" ");
    assert_eq!(actual, expected, "route_json should match golden for layout fixture");
}

// ─── B1 (SEO arc) — per-route head metadata ──────────────────────────────────

/// Full head block round-trips into route_json with title/description/canonical,
/// nested og/twitter objects, and verbatim jsonld.
#[test]
fn b1_route_head_round_trips_into_route_json() {
    let src = r#"
@route {
  path: '/about',
  name: 'about',
  head: {
    title: 'About Us',
    description: 'Who we are',
    canonical: '/about',
    og: { title: 'About', image: '/og.png', type: 'website', url: '/about' },
    twitter: { card: 'summary_large_image', title: 'About', site: '@acme' },
    jsonld: { "@context": "https://schema.org", "@type": "Organization", "name": "Acme" }
  }
}

@template {
  <div>About</div>
}
"#;
    let parsed = sfc::parse_with_path(src, Some("src/pages/about.aihu")).unwrap();

    // Parser: head present with typed sub-objects.
    let head = parsed.route.as_ref().unwrap().head.as_ref().expect("head parsed");
    assert_eq!(head.title.as_deref(), Some("About Us"));
    assert_eq!(head.description.as_deref(), Some("Who we are"));
    assert_eq!(head.canonical.as_deref(), Some("/about"));
    assert_eq!(head.og.as_ref().unwrap().image.as_deref(), Some("/og.png"));
    assert_eq!(head.og.as_ref().unwrap().r#type.as_deref(), Some("website"));
    assert_eq!(head.twitter.as_ref().unwrap().site.as_deref(), Some("@acme"));
    assert!(head.jsonld.as_ref().unwrap().contains(r#""@context": "https://schema.org""#));

    // Codegen: head member emitted into the sidecar, jsonld verbatim, valid JSON.
    let unit = compile_full(&parsed).unwrap();
    let route_json = emit(&unit, "about").route_json.expect("route_json");
    assert!(route_json.contains(r#""head": {"#));
    assert!(route_json.contains(r#""title": "About Us""#));
    assert!(route_json.contains(r#""og": {"#));
    assert!(route_json.contains(r#""type": "website""#));
    assert!(route_json.contains(r#""twitter": {"#));
    assert!(route_json.contains(r#""card": "summary_large_image""#));
    assert!(route_json.contains(r#""jsonld": {"#));
    assert!(route_json.contains(r#""@type": "Organization""#));

    // The whole sidecar must be valid, parseable JSON.
    let parsed_json: serde_json::Value =
        serde_json::from_str(&route_json).expect("emitted route_json must be valid JSON");
    assert_eq!(parsed_json["head"]["title"], "About Us");
    assert_eq!(parsed_json["head"]["og"]["url"], "/about");
    assert_eq!(parsed_json["head"]["twitter"]["card"], "summary_large_image");
    assert_eq!(parsed_json["head"]["jsonld"]["@type"], "Organization");
    assert_eq!(parsed_json["head"]["jsonld"]["@context"], "https://schema.org");
}

/// A route WITHOUT a head key emits a valid route_json with no head member
/// (backward compatible).
#[test]
fn b1_route_without_head_omits_head_member() {
    let src = r#"
@route {
  path: '/plain',
  name: 'plain'
}

@template {
  <div>Plain</div>
}
"#;
    let parsed = sfc::parse_with_path(src, Some("src/pages/plain.aihu")).unwrap();
    assert!(parsed.route.as_ref().unwrap().head.is_none());
    let unit = compile_full(&parsed).unwrap();
    let route_json = emit(&unit, "plain").route_json.expect("route_json");
    assert!(!route_json.contains("head"), "no head member when head absent");
    let v: serde_json::Value =
        serde_json::from_str(&route_json).expect("route_json must be valid JSON");
    assert!(v.get("head").is_none());
}

/// Conformance fixture 03-route-with-head.aihu route_json matches golden.
#[test]
fn b1_fixture_route_with_head_json() {
    let src = include_str!("../../../bench/compiler-conformance/route/03-route-with-head.aihu");
    let golden_json =
        include_str!("../../../bench/compiler-conformance/route/03-route-with-head.route.json");

    let parsed = sfc::parse_with_path(src, Some("src/pages/about.aihu")).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let result = emit(&unit, "03-route-with-head");

    let route_json = result.route_json.as_ref().expect("route_json should be Some");
    let actual = route_json.split_whitespace().collect::<Vec<_>>().join(" ");
    let expected = golden_json.split_whitespace().collect::<Vec<_>>().join(" ");
    assert_eq!(actual, expected, "route_json should match golden for head fixture");
}

/// bench/compiler-conformance/build-target/01-client-elides-agent.aihu
/// — client build produces elision comment.
#[test]
fn v069_fixture_client_elides_agent_js() {
    let src = include_str!("../../../bench/compiler-conformance/build-target/01-client-elides-agent.aihu");

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
