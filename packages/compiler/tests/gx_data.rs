//! GX Phase 4 (#466) — the `@route { data: ... }` governed-resource
//! declaration: two-position parse, `.route.json` fan-out, generated
//! withheld-type sidecar contract (70-governed-data-access §2.1/§4.5/§5),
//! the loader-route SSR emission (P3 item 2), and the client-invariance
//! doctrine (a `data:` declaration adds ZERO bytes to client artifacts;
//! routes without `data:` are untouched everywhere — policed by the golden
//! suite; asserted here for the governed fixture directly).
//!
//! Value-shape unit tests (C485/C487 parse rows) live with the parser in
//! `src/data.rs`; this file covers the pipeline-level behavior.

use aihu_compiler::{compile_full, compile_full_with_target, emit, sfc, BuildTarget, DataDecl};

const FIXTURE_PATH: &str = "src/pages/04-governed-data.aihu";

fn fixture_src() -> String {
    let p = format!(
        "{}/../../bench/compiler-conformance/route/04-governed-data.aihu",
        env!("CARGO_MANIFEST_DIR")
    );
    std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read fixture: {}", e))
}

fn read_conformance(name: &str) -> String {
    let p = format!(
        "{}/../../bench/compiler-conformance/route/{}",
        env!("CARGO_MANIFEST_DIR"),
        name
    );
    std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {}", name, e))
}

// ─── Parse — the two positions agree ─────────────────────────────────────────

#[test]
fn production_parser_carries_data_decl() {
    let src = fixture_src();
    let parsed = sfc::parse_with_path(&src, Some(FIXTURE_PATH)).unwrap();
    let data = parsed.route.as_ref().and_then(|r| r.data.as_ref()).expect("data decl parsed");
    assert_eq!(
        data,
        &DataDecl {
            type_name: "LexiconEntry".to_string(),
            preview: vec!["headword".to_string()],
        }
    );
}

#[test]
fn unit_test_parser_position_agrees() {
    // parser/route.rs — the second authoring-position parser shares the SAME
    // value parser (data.rs), so the two positions cannot drift.
    let route = aihu_compiler::parser::route::parse_route(
        "path: '/x', data: { type: 'LexiconEntry', preview: ['headword'] }",
    )
    .unwrap();
    let data = route.data.expect("data decl parsed");
    assert_eq!(data.type_name, "LexiconEntry");
    assert_eq!(data.preview, vec!["headword".to_string()]);
}

#[test]
fn c485_malformed_data_in_route_block_is_a_hard_error() {
    let src = "\
@route {
  path: '/x',
  data: { preview: ['headword'] }
}
@template {
  <div>x</div>
}
";
    let err = sfc::parse_with_path(src, Some("src/pages/x.aihu"))
        .expect_err("data: without type must fail the parse");
    assert_eq!(err.code.as_deref(), Some("C485"));
}

#[test]
fn c485_duplicate_data_key_in_route_block() {
    let src = "\
@route {
  path: '/x',
  data: { type: 'A' },
  data: { type: 'B' }
}
@template {
  <div>x</div>
}
";
    let err = sfc::parse_with_path(src, Some("src/pages/x.aihu"))
        .expect_err("duplicate data: keys must fail the parse");
    assert_eq!(err.code.as_deref(), Some("C485"));
    assert!(err.message.contains("duplicate"));
}

#[test]
fn c487_authored_gx_member_in_route_prop_type() {
    // The compile_full-boundary composition check (lib.rs): a governed route
    // whose declared `route` prop type carries its own `$gx` member collides
    // with the generated discriminant.
    let src = "\
@route {
  path: '/x',
  data: { type: 'Thing' }
}
@state {
  $prop: {
    route: {
      type: { params: { id: string }; data: { $gx: { entitled: boolean }; x: string } },
    },
  }
}
@template {
  <div>{route.params.id}</div>
}
";
    let parsed = sfc::parse_with_path(src, Some("src/pages/x.aihu")).unwrap();
    let err = compile_full(&parsed).expect_err("authored $gx member must fail compile");
    assert_eq!(err.code.as_deref(), Some("C487"));
}

#[test]
fn ungoverned_route_with_gx_free_prop_type_still_compiles() {
    // No data: declaration → no C487 check, even with exotic prop types.
    let src = "\
@route {
  path: '/x'
}
@state {
  $prop: {
    route: {
      type: { params: { id: string }; data: { x: string } },
    },
  }
}
@template {
  <div>{route.params.id}</div>
}
";
    let parsed = sfc::parse_with_path(src, Some("src/pages/x.aihu")).unwrap();
    assert!(compile_full(&parsed).is_ok());
}

// ─── Fan-out — `.route.json` beside `extract` ────────────────────────────────

#[test]
fn route_json_carries_data_beside_extract_golden() {
    let src = fixture_src();
    let parsed = sfc::parse_with_path(&src, Some(FIXTURE_PATH)).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let route_json = emit(&unit, "governed-lexicon").route_json.expect("route_json present");
    // Byte-exact against the checked-in golden sidecar (the artifact the
    // server registry's boot validation and the router Vite layer consume).
    assert_eq!(route_json.trim(), read_conformance("04-governed-data.route.json").trim());
    // And the two load-bearing members explicitly, so a golden regen cannot
    // silently drop them.
    assert!(route_json.contains(r#""extract": { "read": { "scope": "members" }, "call": "anonymous" }"#));
    assert!(route_json.contains(r#""data": { "type": "LexiconEntry", "preview": ["headword"] }"#));
}

#[test]
fn route_json_omits_data_member_when_undeclared() {
    let src = "\
@route {
  path: '/plain'
}
@template {
  <div>x</div>
}
";
    let parsed = sfc::parse_with_path(src, Some("src/pages/plain.aihu")).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let route_json = emit(&unit, "plain-page").route_json.unwrap();
    assert!(
        !route_json.contains("\"data\""),
        "ungoverned route.json must not grow a data member; got:\n{}",
        route_json
    );
}

// ─── Client invariance — `data:` adds zero client/universal bytes ────────────

#[test]
fn universal_output_matches_golden() {
    let src = fixture_src();
    let parsed = sfc::parse_with_path(&src, Some(FIXTURE_PATH)).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let js = emit(&unit, "governed-lexicon").js;
    assert_eq!(js, read_conformance("04-governed-data.golden.js"));
}

#[test]
fn data_decl_is_byte_invisible_in_client_and_universal_js() {
    // The SAME fixture with the `data:` line removed must emit byte-identical
    // client and universal JS — the declaration rides ONLY `.route.json` (and
    // the sidecar types); enforcement is server-side.
    let with = fixture_src();
    let without: String = with
        .lines()
        .filter(|l| !l.contains("data: { type:"))
        .collect::<Vec<_>>()
        .join("\n");
    // The filtered line also carried the block's last comma-less entry
    // position; ensure the fixture edit actually removed the declaration.
    assert!(without.contains("extract:") && !without.contains("data: { type:"));

    for target in [BuildTarget::Universal, BuildTarget::Client] {
        let a = {
            let parsed = sfc::parse_with_path(&with, Some(FIXTURE_PATH)).unwrap();
            let unit = compile_full_with_target(&parsed, target).unwrap();
            emit(&unit, "governed-lexicon").js
        };
        let b = {
            let parsed = sfc::parse_with_path(&without, Some(FIXTURE_PATH)).unwrap();
            let unit = compile_full_with_target(&parsed, target).unwrap();
            emit(&unit, "governed-lexicon").js
        };
        assert_eq!(a, b, "data: must add zero bytes for target {:?}", target);
    }
}

// ─── §4.5 — the generated withheld-type sidecar contract (G7g, compile side) ─

#[test]
fn governed_sidecar_types_route_data_as_discriminated_union() {
    let src = fixture_src();
    let parsed = sfc::parse_with_path(&src, Some(FIXTURE_PATH)).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let sidecar = emit(&unit, "governed-lexicon").sidecar_ts.expect("sidecar present");

    // The generated types, on the preamble line.
    assert!(sidecar.contains("type __GxEntitled<T>"));
    assert!(sidecar.contains("type __GxWithheld<T, P extends PropertyKey = never>"));
    assert!(sidecar.contains("declare function __gxEntitled"));
    // The route prop is VALUE-typed through the wrapper, previews narrowed to
    // the declared subset.
    assert!(
        sidecar.contains("let route: __GxRoute<{ params: { slug: string }; data: { headword: string; senses: string[] } }, 'headword'> = null as any;"),
        "route prop must be __GxRoute-typed; got:\n{}",
        sidecar
    );
    // The authored nested discriminant is rewritten to the narrowing
    // predicate (TS does not narrow through `$gx.entitled` itself)...
    assert!(sidecar.contains("void (__gxEntitled(route.data) ? route.data.headword"));
    // ...and (#485 step 2) if-guarded branch bodies check inside REAL
    // `if/else` blocks headed by the predicate, so narrowing flows for the
    // entitled branch and the else branch sees the withheld variant.
    assert!(sidecar.contains("if (__gxEntitled(route.data)) {"));
    assert!(sidecar.contains("void (route.data.senses.join(', '));"));
    assert!(sidecar.contains("} else {"));
    assert!(sidecar.contains("void (route.data.$gx.reason); }"));
}

#[test]
fn ungoverned_sidecar_is_untouched() {
    // A route with the same template but NO data: declaration keeps the
    // accessor prop typing and the ordinary value-view lift — the GX sidecar
    // machinery (types, predicate, VALUE-typed route) is invisible outside
    // governed routes.
    let with = fixture_src();
    let without: String = with
        .lines()
        .filter(|l| !l.contains("data: { type:"))
        .collect::<Vec<_>>()
        .join("\n");
    let parsed = sfc::parse_with_path(&without, Some(FIXTURE_PATH)).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let sidecar = emit(&unit, "governed-lexicon").sidecar_ts.expect("sidecar present");
    assert!(!sidecar.contains("__Gx"), "no GX types on ungoverned routes:\n{}", sidecar);
    assert!(sidecar.contains("let route: () => {"), "accessor typing preserved");
    // The prop read lifts through the ordinary `__aihu_ctx` value view (#485
    // step 1) — no `__gxEntitled` predicate rewrite anywhere.
    assert!(
        sidecar.contains("void (__aihu_ctx.route.data.$gx.entitled ? __aihu_ctx.route.data.headword"),
        "ordinary value-view lift preserved:\n{}",
        sidecar
    );
    assert!(!sidecar.contains("__gxEntitled"), "no predicate on ungoverned routes");
}

#[test]
fn governed_route_without_prop_still_declares_route_wrapper() {
    let src = "\
@route {
  path: '/x',
  data: { type: 'Thing', preview: ['name'] }
}
@template {
  <div>{route.data.$gx.entitled && 'y'}</div>
}
";
    let parsed = sfc::parse_with_path(src, Some("src/pages/x.aihu")).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let sidecar = emit(&unit, "x-page").sidecar_ts.expect("sidecar present");
    assert!(sidecar
        .contains("let route: __GxRoute<{ params: Record<string, string> }, 'name'> = null as any;"));
}

// ─── P3 item 2 — loader-route server emission (prop threading) ───────────────

#[test]
fn server_target_emits_options_form_ssr_entry_with_prop_threading() {
    let src = fixture_src();
    let parsed = sfc::parse_with_path(&src, Some(FIXTURE_PATH)).unwrap();
    let unit = compile_full_with_target(&parsed, BuildTarget::Server).unwrap();
    let js = emit(&unit, "governed-lexicon").js;

    // The three P3 structural moves, now for the options-form.
    assert!(js.contains("const __aihu_setup__ = (ctx) => {"));
    assert!(js.contains(
        "if (typeof HTMLElement !== 'undefined' && typeof customElements !== 'undefined')"
    ));
    assert!(js.contains("export default __ssr"));
    // Prop threading: declared props ride __ssr(props) as inert getters.
    assert!(js.contains("const __aihu_ssr_prop = (v: unknown)"));
    assert!(js.contains(
        "export const __ssr = (props: Record<string, unknown> = {}) => __aihu_setup__({ host: null, element: null, attrs: {}, props: { route: __aihu_ssr_prop(props.route) } })"
    ));
    // The registration keeps the full props config for the DOM path.
    assert!(js.contains("props: {\n    route: {}\n  },"));
}

#[test]
fn server_prop_threading_applies_declared_defaults() {
    let src = "\
@route {
  path: '/x'
}
@state {
  $prop: {
    title: { type: string, default: 'untitled' },
  }
}
@template {
  <h1>{title}</h1>
}
";
    let parsed = sfc::parse_with_path(src, Some("src/pages/x.aihu")).unwrap();
    let unit = compile_full_with_target(&parsed, BuildTarget::Server).unwrap();
    let js = emit(&unit, "x-page").js;
    assert!(
        js.contains("title: __aihu_ssr_prop(props.title ?? 'untitled')"),
        "declared default must back the SSR prop stub; got:\n{}",
        js
    );
}

#[test]
fn client_and_universal_targets_carry_no_ssr_entry_bytes() {
    let src = fixture_src();
    let parsed = sfc::parse_with_path(&src, Some(FIXTURE_PATH)).unwrap();
    for target in [BuildTarget::Universal, BuildTarget::Client] {
        let unit = compile_full_with_target(&parsed, target).unwrap();
        let js = emit(&unit, "governed-lexicon").js;
        assert!(!js.contains("__ssr"), "no __ssr bytes for {:?}", target);
        assert!(!js.contains("__aihu_setup__"), "no hoisted setup for {:?}", target);
        assert!(!js.contains("__aihu_ssr_prop"), "no prop stub for {:?}", target);
        assert!(js.contains("defineElement("), "registration stays module-scope for {:?}", target);
        assert!(!js.contains("typeof HTMLElement !== 'undefined'"));
    }
}

#[test]
fn form_and_extends_components_keep_legacy_server_emission() {
    // $form is excluded from the standalone-SSR options shape (no server stub
    // for form internals) — its server output keeps the legacy registration.
    let src = "\
@state {
  $prop: {
    value: { type: string },
  }
  $form: { value: value }
}
@template {
  <input />
}
";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full_with_target(&parsed, BuildTarget::Server).unwrap();
    let js = emit(&unit, "x-input").js;
    assert!(!js.contains("__ssr"), "$form components keep legacy server emission:\n{}", js);
}
