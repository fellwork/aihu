//! Envelope API differential tests — the byte-identity gate.
//!
//! `compile_envelope` MUST produce, for every (source, target), the exact
//! `EmitResult.js` string the legacy single-target pipeline produces — that is
//! the contract that lets the JS driver route `transform()` through the
//! envelope (napi addon or `--envelope` CLI) without any output drift.
//! Likewise `astJson` must match `build_owned_ast` + the CLI stem override,
//! and `routeJson` must match `EmitResult.route_json`.

use aihu_compiler::{
    compile_envelope, compile_full_with_target, emit, sfc, BuildTarget, EnvelopeOptions,
};

/// Representative sources: each/if/on:click, @state wrappers, server-elided
/// macros (@agent + expose), @route + layout, @style.
fn fixtures() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        (
            "counter-each-if-click",
            // Registerable by construction: this tag is emitted into a
            // `defineElement(...)` call, so C450 requires the hyphen.
            "aihu-counter",
            r#"
@state {
  let items = state(['alpha', 'beta'])
  let open = state(false)

  const toggle = action(() => { open = !open })
}

@template {
  <div class="wrap">
    <button on:click={toggle}>toggle</button>
    <ul if={open}>
      <li each={item of items} key={item}>{item}</li>
    </ul>
  </div>
}
"#,
        ),
        (
            "state-wrappers",
            "fancy-widget",
            r#"
@state {
  let count = state(0)

  const doubled = derived(() => count * 2)
  const bump = action(() => { count = count + 1 })
}

@template {
  <div>
    <span>{doubled()}</span>
    <button on:click={bump}>+</button>
  </div>
}
"#,
        ),
        (
            "agent-exposed",
            "agent-card",
            r#"
@state {
  let count = state(0)

  const increment = action(
    { describe: 'Add 1 to the counter', expose: 'read write' },
    () => { count = count + 1 })
}

@template {
  <div>{count}</div>
}
"#,
        ),
        (
            "routed-page",
            "index",
            r#"
@route {
  path: '/',
  name: 'home-page',
  ssr: true
}

@template {
  <main>
    <h1>Home</h1>
  </main>
}
"#,
        ),
        (
            "styled",
            "styled-box",
            r#"
@style {
  .box { color: rebeccapurple; }
}

@template {
  <div class="box">styled</div>
}
"#,
        ),
    ]
}

fn legacy_js(src: &str, tag: &str, path: &str, target: BuildTarget) -> String {
    let parsed = sfc::parse_with_path(src, Some(path)).unwrap();
    let unit = compile_full_with_target(&parsed, target).unwrap();
    let tag_name = unit
        .source
        .meta
        .name
        .clone()
        .or_else(|| unit.source.route.as_ref().and_then(|r| r.name.clone()))
        .unwrap_or_else(|| tag.to_string());
    let tag_name = aihu_compiler::resolve_define_tag(&tag_name);
    emit(&unit, &tag_name).js
}

#[test]
fn envelope_js_is_byte_identical_to_legacy_per_target() {
    for (name, tag, src) in fixtures() {
        let path = format!("src/pages/{name}.aihu");
        for (tkey, target) in [
            ("universal", BuildTarget::Universal),
            ("client", BuildTarget::Client),
            ("server", BuildTarget::Server),
        ] {
            let opts = EnvelopeOptions {
                tag: Some(tag.to_string()),
                path: Some(path.clone()),
                targets: vec![tkey.to_string()],
                emits: vec!["js".to_string()],
                ..Default::default()
            };
            let env = compile_envelope(src, &opts)
                .unwrap_or_else(|e| panic!("envelope failed for {name}/{tkey}: {e:?}"));
            let env_js = env.targets[tkey].js.as_deref().unwrap();
            let legacy = legacy_js(src, tag, &path, target);
            assert_eq!(
                env_js, legacy,
                "envelope js diverged from legacy emit for fixture '{name}' target '{tkey}'"
            );
        }
    }
}

#[test]
fn envelope_multi_target_single_parse_matches_per_target_runs() {
    for (name, tag, src) in fixtures() {
        let path = format!("src/pages/{name}.aihu");
        let opts = EnvelopeOptions {
            tag: Some(tag.to_string()),
            path: Some(path.clone()),
            targets: vec![
                "client".to_string(),
                "server".to_string(),
                "universal".to_string(),
            ],
            emits: vec!["js".to_string(), "manifest".to_string()],
            ..Default::default()
        };
        let env = compile_envelope(src, &opts).unwrap();
        assert_eq!(env.targets.len(), 3, "{name}: expected all three targets");
        for (tkey, target) in [
            ("client", BuildTarget::Client),
            ("server", BuildTarget::Server),
            ("universal", BuildTarget::Universal),
        ] {
            let legacy = legacy_js(src, tag, &path, target);
            assert_eq!(
                env.targets[tkey].js.as_deref().unwrap(),
                legacy,
                "{name}: multi-target envelope js diverged for '{tkey}'"
            );
        }
    }
}

#[test]
fn envelope_route_json_matches_legacy_and_is_null_when_absent() {
    // Routed fixture → route_json present and equal to EmitResult.route_json.
    let (_, tag, src) = fixtures()[3];
    let path = "src/pages/index.aihu";
    let opts = EnvelopeOptions {
        tag: Some(tag.to_string()),
        path: Some(path.to_string()),
        emits: vec!["route".to_string()],
        ..Default::default()
    };
    let env = compile_envelope(src, &opts).unwrap();
    let parsed = sfc::parse_with_path(src, Some(path)).unwrap();
    let unit = compile_full_with_target(&parsed, BuildTarget::Universal).unwrap();
    let legacy = emit(&unit, "home-page").route_json;
    assert_eq!(env.route_json, legacy);
    assert!(env.route_json.is_some());

    // Non-routed fixture → absent (the legacy CLI prints `null`).
    let (_, tag2, src2) = fixtures()[0];
    let opts2 = EnvelopeOptions {
        tag: Some(tag2.to_string()),
        path: Some("src/components/counter.aihu".to_string()),
        emits: vec!["route".to_string()],
        ..Default::default()
    };
    let env2 = compile_envelope(src2, &opts2).unwrap();
    assert!(env2.route_json.is_none());
}

#[test]
fn envelope_ast_json_matches_build_owned_ast_with_cli_stem_override() {
    for (name, tag, src) in fixtures() {
        let path = format!("src/pages/{name}.aihu");
        let opts = EnvelopeOptions {
            tag: Some(tag.to_string()),
            path: Some(path.clone()),
            emits: vec!["ast".to_string()],
            ..Default::default()
        };
        let env = compile_envelope(src, &opts).unwrap();
        let parsed = sfc::parse_with_path(src, Some(&path)).unwrap();
        let unit = compile_full_with_target(&parsed, BuildTarget::Universal).unwrap();
        let mut ast = aihu_compiler::build_owned_ast(&unit, Some(&path));
        let stem_fallback = unit
            .source
            .meta
            .name
            .clone()
            .or_else(|| unit.source.route.as_ref().and_then(|r| r.name.clone()))
            .unwrap_or_else(|| tag.to_string());
        let stem_fallback = aihu_compiler::resolve_define_tag(&stem_fallback);
        ast.tag = stem_fallback.clone();
        ast.meta.name = stem_fallback;
        let legacy = serde_json::to_string(&ast).unwrap();
        assert_eq!(
            env.ast_json.as_deref(),
            Some(legacy.as_str()),
            "{name}: envelope astJson diverged"
        );
    }
}

#[test]
fn envelope_defaults_and_option_validation() {
    let (_, tag, src) = fixtures()[0];
    // Empty targets/emits default to universal/js.
    let env = compile_envelope(
        src,
        &EnvelopeOptions {
            tag: Some(tag.to_string()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(env.envelope, aihu_compiler::ENVELOPE_VERSION);
    assert!(env.targets.contains_key("universal"));
    assert!(env.ast_json.is_none());
    assert!(env.route_json.is_none());

    // Unknown target / emit → C900.
    for bad in [
        EnvelopeOptions {
            targets: vec!["wasm".to_string()],
            ..Default::default()
        },
        EnvelopeOptions {
            emits: vec!["sidecar".to_string()],
            ..Default::default()
        },
    ] {
        let err = compile_envelope(src, &bad).unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C900"));
    }
}

#[test]
fn envelope_compile_error_propagates() {
    // C450 — single-word component reference is a hard error; the envelope
    // must carry it through the Result channel like every legacy path.
    let src = r#"
@template {
  <div><Comment /></div>
}
"#;
    let err = compile_envelope(
        src,
        &EnvelopeOptions {
            // Hyphenated on purpose: the define-name must be VALID so this
            // test isolates the component-REFERENCE rule (`<Comment />`)
            // rather than tripping the define-site rule first.
            tag: Some("aihu-host".to_string()),
            ..Default::default()
        },
    )
    .unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C450"));
    // format_compile_error renders code + message + tail for the napi channel.
    let rendered = aihu_compiler::format_compile_error(&err);
    assert!(rendered.contains("C450"));
}
