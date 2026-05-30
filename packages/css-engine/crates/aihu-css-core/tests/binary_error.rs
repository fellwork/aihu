//! Binary-level error propagation (R-RESULT): an induced emit error must exit
//! the `aihu-css-compile` binary non-zero AND print the message to stderr.
//! Cargo sets `CARGO_BIN_EXE_aihu-css-compile` for this integration test.

use std::io::Write;
use std::process::{Command, Stdio};

fn run_ast_mode(ast_json: &str) -> std::process::Output {
    let bin = env!("CARGO_BIN_EXE_aihu-css-compile");
    let mut child = Command::new(bin)
        .arg("--ast-json")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn aihu-css-compile");
    child
        .stdin
        .as_mut()
        .expect("stdin")
        .write_all(ast_json.as_bytes())
        .expect("write stdin");
    child.wait_with_output().expect("wait")
}

#[test]
fn malformed_theme_exits_nonzero_with_stderr_message() {
    // `@theme` with no `{` body → CompileError::MalformedTheme.
    let json = r#"{"tag":"X","astVersion":1,
      "style":{"content":"@theme --color-primary: red;","scope":"scoped"},
      "meta":{"name":"X"},"template":null}"#;
    let out = run_ast_mode(json);
    assert!(
        !out.status.success(),
        "binary must exit non-zero on emit error; status={:?}",
        out.status
    );
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(
        stderr.contains("aihu-css-compile:") && stderr.contains("malformed @theme"),
        "stderr must carry the actionable message, got: {stderr:?}"
    );
    assert!(
        out.stdout.is_empty(),
        "no CSS should be written on error; stdout={:?}",
        String::from_utf8_lossy(&out.stdout)
    );
}

#[test]
fn well_formed_input_exits_zero_and_emits_css() {
    let json = r#"{"tag":"X","astVersion":1,
      "style":{"content":"@theme { --color-primary: red; }","scope":"scoped"},
      "meta":{"name":"X"},
      "template":[{"kind":"element","tag":"div","attrs":[
        {"kind":"static","name":"class","value":"bg-primary"}],"children":[]}]}"#;
    let out = run_ast_mode(json);
    assert!(out.status.success(), "well-formed input exits zero");
    let css = String::from_utf8_lossy(&out.stdout);
    assert!(css.contains("background-color: var(--color-primary)"), "{css}");
}
