/// arch-3 M2 / A3 G2 (RFC-001) — `$auth.*` macro family lowering.
///
/// Acceptance:
///   #1 `$auth name = $auth.session()` / `$auth name = $auth.currentUser()`
///      parse and lower without error in `@state` (NO C440).
///   #2 lowering emits `const name = useCurrentUser()`; `$auth.session()`
///      ADDITIONALLY emits the `/* TODO(M3-auth-ssr) … */` codegen marker —
///      the documented M3 SSR-seed forward dependency (see the NOTE in
///      `ac2b_session_emits_m3_todo`).
///   #3 non-$auth macros ($query, $resource, $state, …) lower unchanged.
///   #5 a new auth_macros suite passes; the existing query_macro + state-macro
///      suites still pass (run separately, proving no regression).

use aihu_compiler::{emit, sfc, AuthMacroKind, BuildTarget, CompileUnit, StateMacro};

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

// ─── Acceptance #1: $auth parses (NO C440) ───────────────────────────────────

#[test]
fn ac1a_current_user_parses_without_c440() {
    let script = "$auth u = $auth.currentUser()";
    let result = aihu_compiler::parse_state_macros(script);
    assert!(
        result.is_ok(),
        "Expected $auth.currentUser() to parse without error, got: {:?}",
        result.err()
    );

    let macros = result.unwrap();
    let auth = macros.iter().find(|m| matches!(m, StateMacro::Auth { .. }));
    assert!(auth.is_some(), "Expected a StateMacro::Auth, got: {:?}", macros);

    let StateMacro::Auth { name, method } = auth.unwrap() else {
        panic!("Expected Auth variant");
    };
    assert_eq!(name, "u");
    assert_eq!(*method, AuthMacroKind::CurrentUser);
}

#[test]
fn ac1b_session_parses_to_session_kind() {
    let script = "$auth s = $auth.session()";
    let result = aihu_compiler::parse_state_macros(script);
    assert!(
        result.is_ok(),
        "Expected $auth.session() to parse without error, got: {:?}",
        result.err()
    );
    let macros = result.unwrap();
    let StateMacro::Auth { name, method } = macros
        .iter()
        .find(|m| matches!(m, StateMacro::Auth { .. }))
        .expect("Expected a StateMacro::Auth")
    else {
        panic!("Expected Auth variant");
    };
    assert_eq!(name, "s");
    assert_eq!(*method, AuthMacroKind::Session);
}

#[test]
fn ac1_auth_not_c440_negative() {
    // The C440 (collection-form rejection) path is NOT taken for the `$auth`
    // `=`-shorthand.
    let err = aihu_compiler::parse_state_macros("$auth u = $auth.currentUser()").err();
    assert!(
        err.is_none(),
        "Expected NO error for $auth, got code {:?}",
        err.and_then(|e| e.code)
    );
}

// ─── Acceptance #1c (negative): malformed forms error with C461 ──────────────

#[test]
fn ac1c_missing_eq_errors_c461() {
    let err =
        aihu_compiler::parse_state_macros("$auth u $auth.currentUser()").unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C461"));
}

#[test]
fn ac1c_empty_name_errors_c461() {
    let err = aihu_compiler::parse_state_macros("$auth  = $auth.session()").unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C461"));
}

#[test]
fn ac1c_unknown_method_errors_c461() {
    let err = aihu_compiler::parse_state_macros("$auth x = $auth.foo()").unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C461"));
}

// ─── Acceptance #2a: $auth.currentUser() emits useCurrentUser + import ────────

#[test]
fn ac2a_current_user_emits_use_current_user() {
    let sfc_src = r#"
@state {
  $auth u = $auth.currentUser()
}
@template <p>{u}</p>
"#;
    let js = emit_sfc(sfc_src, "auth-user");

    assert!(
        js.contains("const u = useCurrentUser()"),
        "Expected `const u = useCurrentUser()`. Got:\n{}",
        js
    );
    assert!(
        js.contains("import { useCurrentUser } from '@aihu/auth'"),
        "Expected `@aihu/auth` import. Got:\n{}",
        js
    );
    // currentUser() must NOT carry the SSR-seed M3 marker.
    assert!(
        !js.contains("TODO(M3-auth-ssr"),
        "$auth.currentUser() must NOT emit the SSR-seed M3 marker. Got:\n{}",
        js
    );
}

// ─── Acceptance #2b: $auth.session() emits useCurrentUser + M3 TODO marker ────

#[test]
fn ac2b_session_emits_m3_todo() {
    // NOTE: `$auth.session()` does NOT yet seed a `$shared` signal server-side
    // from `getAuthState(request, config)`. That SSR pre-seed is INTENTIONALLY
    // deferred to M3 — the compiler has no request-context/config passthrough
    // at the `@state` lowering boundary, and `@aihu/auth` exports no
    // session-getter / `createSharedSignal` primitive. Per acceptance #2's
    // explicit fallback clause, `$auth.session()` lowers to the
    // client-resolvable `useCurrentUser()` form PLUS a `/* TODO(M3-auth-ssr) */`
    // codegen marker. This test DOCUMENTS that deferral; the marker is the
    // contract, not a bug.
    let sfc_src = r#"
@state {
  $auth s = $auth.session()
}
@template <p>{s}</p>
"#;
    let js = emit_sfc(sfc_src, "auth-session");

    assert!(
        js.contains("const s = useCurrentUser()"),
        "Expected `const s = useCurrentUser()`. Got:\n{}",
        js
    );
    assert!(
        js.contains("import { useCurrentUser } from '@aihu/auth'"),
        "Expected `@aihu/auth` import. Got:\n{}",
        js
    );
    assert!(
        js.contains("TODO(M3-auth-ssr"),
        "Expected the deferred-SSR M3 codegen marker for $auth.session(). Got:\n{}",
        js
    );
}

// ─── Acceptance #2c: $auth in @agent (options) form ──────────────────────────

#[test]
fn ac2c_current_user_options_form() {
    let sfc_src = r#"
@state {
  $auth u = $auth.currentUser()
}
@agent {
  $scope "public"
}
@template <p>{u}</p>
"#;
    let js = emit_sfc(sfc_src, "auth-agent");

    assert!(
        js.contains("const u = useCurrentUser()"),
        "Expected `const u = useCurrentUser()` inside setup(). Got:\n{}",
        js
    );
    assert!(
        js.contains("import { useCurrentUser } from '@aihu/auth'"),
        "Expected `@aihu/auth` import in @agent form. Got:\n{}",
        js
    );
    // The raw `$auth …` macro must NOT leak into the setup body.
    assert!(
        !js.contains("$auth"),
        "Raw $auth macro leaked into @agent output. Got:\n{}",
        js
    );
}

// ─── Acceptance #3: non-$auth macros unchanged (no regression) ───────────────

#[test]
fn ac3_mixed_macros_no_auth_interference() {
    let sfc_src = r#"
@state {
  $auth u = $auth.currentUser()
  $query feed = data.posts.query(vars)
  $resource: {
    x: () => fetchX()
  }
}
@template <p>{u} {feed.status} {x.status}</p>
"#;
    let js = emit_sfc(sfc_src, "mixed-auth");

    // $auth still lowers.
    assert!(
        js.contains("const u = useCurrentUser()"),
        "Expected $auth lowering. Got:\n{}",
        js
    );
    // $query still lowers to createMagnaResource.
    assert!(
        js.contains("createMagnaResource("),
        "Expected $query -> createMagnaResource unchanged. Got:\n{}",
        js
    );
    assert!(
        js.contains("inject(MagnaFetchToken)"),
        "Expected inject(MagnaFetchToken) unchanged. Got:\n{}",
        js
    );
    // plain $resource still lowers to createResource.
    assert!(
        js.contains("createResource(() => fetchX())"),
        "Expected plain $resource -> createResource unchanged. Got:\n{}",
        js
    );
}
