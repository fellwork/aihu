/// arch-3 M2 (RFC-003) — `$query` macro + magna-origin `$resource` lowering.
///
/// Acceptance:
///   #1 `$query name = data.X.query(vars)` parses (NO C440) in `@state`.
///   #2 `$query` AND magna-origin `$resource` lower to `createMagnaResource`
///      with `inject(MagnaFetchToken)` + the magna/context imports.
///   #3 a plain non-magna `$resource` keeps the `createResource(() => ...)`
///      lowering and emits NO `createMagnaResource` (no regression).

use aihu_compiler::{emit, sfc, BuildTarget, CompileUnit, StateMacro};

fn parse_macros(script: &str) -> Vec<StateMacro> {
    aihu_compiler::parse_state_macros(script).unwrap_or_default()
}

fn emit_sfc(sfc_src: &str, tag: &str) -> String {
    let source = sfc::parse(sfc_src).unwrap();
    let template_ast = source
        .template
        .map(|t| aihu_compiler::parse_template(t).unwrap_or_default());
    let unit = CompileUnit {
        source,
        template_ast,
        target: BuildTarget::Universal,
    };
    emit(&unit, tag).js
}

// ─── Acceptance #1: $query parses (NO C440) ──────────────────────────────────

#[test]
fn ac1_query_parses_without_c440() {
    let script = "$query feed = data.posts.query(vars)";
    // Must NOT error (C440 or otherwise).
    let result = aihu_compiler::parse_state_macros(script);
    assert!(
        result.is_ok(),
        "Expected $query to parse without error, got: {:?}",
        result.err()
    );

    let macros = result.unwrap();
    let query = macros
        .iter()
        .find(|m| matches!(m, StateMacro::Query { .. }));
    assert!(query.is_some(), "Expected a StateMacro::Query, got: {:?}", macros);

    let StateMacro::Query { name, expr } = query.unwrap() else {
        panic!("Expected Query variant");
    };
    assert_eq!(name, "feed");
    assert!(
        expr.contains("data.posts.query(vars)"),
        "Expected expr to contain the verbatim RHS, got: {}",
        expr
    );
}

#[test]
fn ac1_query_not_c440_negative() {
    // Explicit negative assertion: the C440 (collection-form rejection) path
    // is NOT taken for the `$query` `=`-shorthand.
    let script = "$query feed = data.posts.query({ first: 10 })";
    let err = aihu_compiler::parse_state_macros(script).err();
    assert!(
        err.is_none(),
        "Expected NO error for $query, got code {:?}",
        err.and_then(|e| e.code)
    );
}

#[test]
fn query_missing_eq_errors() {
    let err = aihu_compiler::parse_state_macros("$query feed data.posts.query(vars)")
        .unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C460"));
}

// ─── Acceptance #2a: $query emits createMagnaResource + imports (fn form) ─────

#[test]
fn ac2_query_emits_create_magna_resource() {
    let sfc_src = r#"
@state {
  $query feed = data.posts.query({ first: 10 })
}
@template <div>{feed.status}</div>
"#;
    let js = emit_sfc(sfc_src, "post-feed");

    assert!(
        js.contains("createMagnaResource("),
        "Expected createMagnaResource() call. Got:\n{}",
        js
    );
    assert!(
        js.contains("inject(MagnaFetchToken)"),
        "Expected inject(MagnaFetchToken). Got:\n{}",
        js
    );
    assert!(
        js.contains("data.posts.query({ first: 10 })"),
        "Expected verbatim query expr. Got:\n{}",
        js
    );
    assert!(
        js.contains("import { createMagnaResource, MagnaFetchToken } from '@aihu/magna'"),
        "Expected magna import. Got:\n{}",
        js
    );
    assert!(
        js.contains("from '@aihu/context'"),
        "Expected @aihu/context inject import. Got:\n{}",
        js
    );
}

// ─── Acceptance #2b: magna-origin $resource emits createMagnaResource ─────────

#[test]
fn ac2_magna_resource_emits_create_magna_resource() {
    let sfc_src = r#"
@state {
  $resource: {
    feed: () => data.posts.query(vars)
  }
}
@template <div>{feed.status}</div>
"#;
    let js = emit_sfc(sfc_src, "post-feed-2");

    assert!(
        js.contains("createMagnaResource("),
        "Expected createMagnaResource() for magna-origin $resource. Got:\n{}",
        js
    );
    assert!(
        js.contains("inject(MagnaFetchToken)"),
        "Expected inject(MagnaFetchToken). Got:\n{}",
        js
    );
    assert!(
        js.contains("import { createMagnaResource, MagnaFetchToken } from '@aihu/magna'"),
        "Expected magna import. Got:\n{}",
        js
    );
    // Must NOT use the plain createResource lowering for the magna entry.
    assert!(
        !js.contains("createResource(() => data.posts.query"),
        "Magna-origin $resource must not lower to createResource. Got:\n{}",
        js
    );
}

// ─── Acceptance #2c: magna-origin $resource in @agent (options) form ──────────

#[test]
fn ac2_magna_resource_options_form() {
    let sfc_src = r#"
@state {
  $resource: {
    feed: () => data.posts.query(vars)
  }
}
@agent {
  $scope "public"
}
@template <div>{feed.status}</div>
"#;
    let js = emit_sfc(sfc_src, "agent-feed");

    assert!(
        js.contains("createMagnaResource("),
        "Expected createMagnaResource() in @agent (options) form. Got:\n{}",
        js
    );
    assert!(
        js.contains("inject(MagnaFetchToken)"),
        "Expected inject(MagnaFetchToken) in @agent form. Got:\n{}",
        js
    );
    assert!(
        js.contains("import { createMagnaResource, MagnaFetchToken } from '@aihu/magna'"),
        "Expected magna import in @agent form. Got:\n{}",
        js
    );
    assert!(
        js.contains("from '@aihu/context'"),
        "Expected @aihu/context import in @agent form. Got:\n{}",
        js
    );
    // The raw `$resource: { ... }` macro must NOT leak into the setup body.
    assert!(
        !js.contains("$resource"),
        "Raw $resource macro leaked into @agent output. Got:\n{}",
        js
    );
}

#[test]
fn ac2_query_options_form() {
    let sfc_src = r#"
@state {
  $query feed = data.posts.query(vars)
}
@agent {
  $scope "public"
}
@template <div>{feed.status}</div>
"#;
    let js = emit_sfc(sfc_src, "agent-query");

    assert!(
        js.contains("createMagnaResource("),
        "Expected createMagnaResource() for $query in @agent form. Got:\n{}",
        js
    );
    assert!(
        js.contains("inject(MagnaFetchToken)"),
        "Expected inject(MagnaFetchToken). Got:\n{}",
        js
    );
    assert!(
        !js.contains("$query"),
        "Raw $query macro leaked into @agent output. Got:\n{}",
        js
    );
}

// ─── Acceptance #3: non-magna $resource unchanged (no regression) ─────────────

#[test]
fn ac3_non_magna_resource_unchanged() {
    let sfc_src = r#"
@state {
  $resource: {
    users: () => fetchUsers()
  }
}
@template <div>{users.status}</div>
"#;
    let js = emit_sfc(sfc_src, "user-list");

    assert!(
        js.contains("createResource(() => fetchUsers())"),
        "Expected plain createResource lowering. Got:\n{}",
        js
    );
    assert!(
        !js.contains("createMagnaResource"),
        "Non-magna $resource must NOT emit createMagnaResource. Got:\n{}",
        js
    );
    assert!(
        !js.contains("MagnaFetchToken"),
        "Non-magna $resource must NOT import MagnaFetchToken. Got:\n{}",
        js
    );
}

#[test]
fn ac3_is_magna_origin_is_conservative() {
    // Common non-magna calls must NOT trigger magna lowering.
    assert!(!aihu_compiler::is_magna_origin("db.query(sql)"));
    assert!(!aihu_compiler::is_magna_origin("el.querySelector('.x')"));
    assert!(!aihu_compiler::is_magna_origin("fetchUsers()"));
    assert!(!aihu_compiler::is_magna_origin("data.query(x)")); // no IDENT between data. and .query
    // The magna client shape DOES trigger it.
    assert!(aihu_compiler::is_magna_origin("data.posts.query(vars)"));
    assert!(aihu_compiler::is_magna_origin("data.users.query({ a: 1 })"));
}

// ─── #5: no magna usage emits neither call nor import ─────────────────────────

#[test]
fn no_magna_usage_no_magna_emission() {
    let sfc_src = r#"
@state {
  $prop: {
    label: { default: 'hi' }
  }
}
@template <p>{label}</p>
"#;
    let js = emit_sfc(sfc_src, "plain-comp");

    assert!(
        !js.contains("createMagnaResource"),
        "Expected NO createMagnaResource for SFC without magna usage. Got:\n{}",
        js
    );
    assert!(
        !js.contains("@aihu/magna"),
        "Expected NO @aihu/magna import for SFC without magna usage. Got:\n{}",
        js
    );
}

// ─── multi-entry $resource: mixed magna + non-magna ───────────────────────────

#[test]
fn mixed_resource_entries() {
    let macros = parse_macros(
        "$resource: { feed: () => data.posts.query(vars), users: () => fetchUsers() }",
    );
    assert_eq!(macros.len(), 1);

    let sfc_src = r#"
@state {
  $resource: {
    feed: () => data.posts.query(vars),
    users: () => fetchUsers()
  }
}
@template <div>{feed.status} {users.status}</div>
"#;
    let js = emit_sfc(sfc_src, "mixed-comp");
    assert!(js.contains("createMagnaResource("), "magna entry missing. Got:\n{}", js);
    assert!(
        js.contains("createResource(() => fetchUsers())"),
        "non-magna entry must keep createResource. Got:\n{}",
        js
    );
}
