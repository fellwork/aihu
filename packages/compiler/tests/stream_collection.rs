/// Tests for `$stream` collection (AC1, AC2, AC7, AC8) and
/// compile errors C550, C551, C552, C553, C554.
///
/// Per spec docs/specs/stream-impl.md §1.2 and §3.2.

use aihu_compiler::{compile_full, emit, sfc, BuildTarget, CollectionKind, StateMacro};

// ─── Helper: parse @state macros from inline script ──────────────────────────

fn parse_macros(script: &str) -> Vec<StateMacro> {
    aihu_compiler::parse_state_macros(script).unwrap_or_default()
}

// ─── AC1: $stream parser ──────────────────────────────────────────────────────

#[test]
fn ac1_stream_parser_basic() {
    let script = r#"
$stream: {
  chat: {
    source: () => fetch('/api/chat').then(r => r.body),
    describe: 'AI chat response stream',
  }
}
"#;
    let macros = parse_macros(script);
    let stream_mac = macros
        .iter()
        .find(|m| matches!(m, StateMacro::Collection { kind: CollectionKind::Stream, .. }));
    assert!(stream_mac.is_some(), "Expected $stream collection macro");

    let StateMacro::Collection { kind, entries } = stream_mac.unwrap() else {
        panic!("Expected Collection variant");
    };
    assert_eq!(*kind, CollectionKind::Stream);
    assert_eq!(entries.len(), 1);

    let entry = &entries[0];
    assert_eq!(entry.name, "chat");
    assert!(entry.is_wrapped, "Expected is_wrapped = true");

    let source_key = entry.meta.iter().find(|(k, _)| k == "source");
    assert!(source_key.is_some(), "Expected 'source' key in metadata");

    let (_, source_val) = source_key.unwrap();
    assert!(
        source_val.contains("fetch('/api/chat')"),
        "Expected source factory to contain fetch call, got: {}",
        source_val
    );
}

#[test]
fn ac1_stream_parser_null_source() {
    // OQ5 resolution: `source: () => null` is a valid no-op for agent-wired streams.
    let script = r#"
$stream: {
  reply: {
    source: () => null,
    describe: 'Agent streaming reply',
  }
}
"#;
    let macros = parse_macros(script);
    let stream_mac = macros
        .iter()
        .find(|m| matches!(m, StateMacro::Collection { kind: CollectionKind::Stream, .. }));
    assert!(stream_mac.is_some());

    let StateMacro::Collection { entries, .. } = stream_mac.unwrap() else { panic!() };
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].name, "reply");
    let source = entries[0].meta.iter().find(|(k, _)| k == "source");
    assert!(source.is_some());
}

// ─── AC2: $stream codegen signals ─────────────────────────────────────────────

#[test]
fn ac2_stream_codegen_creates_stream_call() {
    let sfc_src = r#"
@state {
  $stream: {
    chat: {
      source: () => fetch('/api/chat').then(r => r.body),
    }
  }
}
@template <div>{chat.value}</div>
"#;
    let source = sfc::parse(sfc_src).unwrap();
    let template_ast = source.template.map(|t| {
        aihu_compiler::parse_template(t).unwrap_or_default()
    });
    let unit = aihu_compiler::CompileUnit {
        source,
        template_ast,
        target: BuildTarget::Universal,
    };
    let result = emit(&unit, "chat-widget");
    let js = &result.js;

    // Should emit createStream() call
    assert!(
        js.contains("createStream("),
        "Expected createStream() in output. Got:\n{}",
        js
    );
    // Should import createStream from @aihu/runtime
    assert!(
        js.contains("createStream") && js.contains("@aihu/runtime"),
        "Expected createStream import from @aihu/runtime. Got:\n{}",
        js
    );
}

#[test]
fn ac2_stream_codegen_has_start_stop() {
    // AC2: The createStream function body (in runtime) has start/stop.
    // The codegen simply emits createStream(factory), so we verify the factory is passed.
    let sfc_src = r#"
@state {
  $stream: {
    chat: {
      source: () => fetch('/api').then(r => r.body),
    }
  }
}
@template <p>{chat.status}</p>
"#;
    let source = sfc::parse(sfc_src).unwrap();
    let template_ast = source.template.map(|t| {
        aihu_compiler::parse_template(t).unwrap_or_default()
    });
    let unit = aihu_compiler::CompileUnit {
        source,
        template_ast,
        target: BuildTarget::Universal,
    };
    let result = emit(&unit, "my-widget");
    let js = &result.js;

    assert!(js.contains("createStream("), "Expected createStream() call");
    assert!(js.contains("fetch('/api')"), "Expected source factory in output");
}

// ─── AC7: Multiple entries, no cross-contamination ───────────────────────────

#[test]
fn ac7_multiple_stream_entries_independent() {
    let script = r#"
$stream: {
  a: {
    source: () => fetch('/a').then(r => r.body),
  },
  b: {
    source: () => fetch('/b').then(r => r.body),
  }
}
"#;
    let macros = parse_macros(script);
    let stream_mac = macros
        .iter()
        .find(|m| matches!(m, StateMacro::Collection { kind: CollectionKind::Stream, .. }));
    assert!(stream_mac.is_some());

    let StateMacro::Collection { entries, .. } = stream_mac.unwrap() else { panic!() };
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].name, "a");
    assert_eq!(entries[1].name, "b");

    // Codegen should emit two independent createStream() calls.
    let sfc_src = r#"
@state {
  $stream: {
    a: {
      source: () => fetch('/a').then(r => r.body),
    },
    b: {
      source: () => fetch('/b').then(r => r.body),
    }
  }
}
@template <div>{a.status} {b.status}</div>
"#;
    let source = sfc::parse(sfc_src).unwrap();
    let template_ast = source.template.map(|t| {
        aihu_compiler::parse_template(t).unwrap_or_default()
    });
    let unit = aihu_compiler::CompileUnit {
        source,
        template_ast,
        target: BuildTarget::Universal,
    };
    let result = emit(&unit, "dual-stream");
    let js = &result.js;

    // Both entries should have their own createStream() calls.
    let count = js.matches("createStream(").count();
    assert_eq!(count, 2, "Expected 2 createStream() calls, found {}. JS:\n{}", count, js);

    // Both source factories should be present.
    assert!(js.contains("fetch('/a')"), "Expected /a factory");
    assert!(js.contains("fetch('/b')"), "Expected /b factory");
}

// ─── AC8: SFC without $stream unchanged ───────────────────────────────────────

#[test]
fn ac8_no_stream_no_create_stream_import() {
    let sfc_src = r#"
@state {
  $prop: {
    label: { default: 'hello' }
  }
}
@template <p>{label}</p>
"#;
    let source = sfc::parse(sfc_src).unwrap();
    let template_ast = source.template.map(|t| {
        aihu_compiler::parse_template(t).unwrap_or_default()
    });
    let unit = aihu_compiler::CompileUnit {
        source,
        template_ast,
        target: BuildTarget::Universal,
    };
    let result = emit(&unit, "no-stream");
    let js = &result.js;

    assert!(
        !js.contains("createStream"),
        "Expected NO createStream in output for SFC without $stream. Got:\n{}",
        js
    );
}

// ─── AC9: @stream block server artifact ───────────────────────────────────────

#[test]
fn ac9_stream_block_server_artifact() {
    use aihu_compiler::{CompileUnit, StreamBlock};

    let sfc_src = r#"
@state {
  $stream: {
    chat: {
      source: () => null,
    }
  }
}
@template <p>{chat.value}</p>
"#;
    let mut source = sfc::parse(sfc_src).unwrap();
    source.stream = Some(StreamBlock {
        output: "chat".to_string(),
        scope: Some("authenticated".to_string()),
        mime: None,
    });
    let template_ast = source.template.map(|t| {
        aihu_compiler::parse_template(t).unwrap_or_default()
    });
    let unit = CompileUnit {
        source,
        template_ast,
        target: BuildTarget::Server,
    };
    let result = emit(&unit, "chat-widget");
    let js = &result.js;

    assert!(
        js.contains("__streamBinding"),
        "Expected __streamBinding export in server artifact. Got:\n{}",
        js
    );
    assert!(js.contains("output: 'chat'"), "Expected output: 'chat'");
    assert!(js.contains("scope: 'authenticated'"), "Expected scope: 'authenticated'");
    assert!(
        js.contains("text/plain; charset=utf-8"),
        "Expected default mime type"
    );
}

// ─── AC10: @stream block client artifact elision ──────────────────────────────

#[test]
fn ac10_stream_block_client_elision() {
    use aihu_compiler::{CompileUnit, StreamBlock};

    let sfc_src = r#"
@state {
  $stream: {
    chat: {
      source: () => null,
    }
  }
}
@template <p>{chat.value}</p>
"#;
    let mut source = sfc::parse(sfc_src).unwrap();
    source.stream = Some(StreamBlock {
        output: "chat".to_string(),
        scope: None,
        mime: None,
    });
    let template_ast = source.template.map(|t| {
        aihu_compiler::parse_template(t).unwrap_or_default()
    });
    let unit = CompileUnit {
        source,
        template_ast,
        target: BuildTarget::Client,
    };
    let result = emit(&unit, "chat-widget");
    let js = &result.js;

    assert!(
        !js.contains("__streamBinding"),
        "Expected NO __streamBinding in client artifact. Got:\n{}",
        js
    );
    assert!(
        js.contains("// [client build] @stream block elided"),
        "Expected elision comment. Got:\n{}",
        js
    );
}

// ─── C550: $output references unknown $stream entry ──────────────────────────

#[test]
fn c550_output_references_unknown_entry() {
    use aihu_compiler::parser::stream_macros::{build_stream_block, parse_stream_macros};

    let state_macros = parse_macros(""); // no $stream entries
    let decls = parse_stream_macros("$output: nonexistent").unwrap();
    let err = build_stream_block(decls, &state_macros).unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C550"));
    assert!(err.message.contains("nonexistent"));
}

// ─── C551: @stream block missing $output ──────────────────────────────────────

#[test]
fn c551_missing_output() {
    use aihu_compiler::parser::stream_macros::{build_stream_block, parse_stream_macros};

    let state_macros = parse_macros(r#"$stream: { chat: { source: () => null } }"#);
    let decls = parse_stream_macros("$scope: authenticated").unwrap(); // no $output
    let err = build_stream_block(decls, &state_macros).unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C551"));
}

// ─── C553: $stream bare form rejected ─────────────────────────────────────────

#[test]
fn c553_stream_bare_form_rejected() {
    let script = r#"$stream: { chat: () => fetch('/api').then(r => r.body) }"#;
    let err = aihu_compiler::parse_state_macros(script).unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C553"));
    assert!(err.message.contains("chat"));
}

// ─── C554: $stream entry missing source key ───────────────────────────────────

#[test]
fn c554_stream_missing_source_key() {
    let script = r#"$stream: { chat: { describe: 'no source here' } }"#;
    let err = aihu_compiler::parse_state_macros(script).unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C554"));
    assert!(err.message.contains("chat"));
}
