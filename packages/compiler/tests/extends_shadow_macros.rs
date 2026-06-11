//! §9.4 recipe class-extension — `$extends:` + `$shadow:` macros.
//!
//! Acceptance:
//!   #1 `$extends: Ident` parses (NO C440) and threads `base: Ident` into the
//!      emitted `defineComponent({ base: Ident, ... })`.
//!   #2 `$shadow: 'none'` emits a leading `// @aihu:shadow none` marker.
//!   #3 `$extends` forces the options-form even with no `$prop`.
//!   #4 malformed `$extends` / `$shadow` are rejected (C470 / C471).
//!   #5 neither macro emits any setup-body JS (declaration-only).

use aihu_compiler::{emit, sfc, BuildTarget, CompileUnit};

fn emit_sfc(sfc_src: &str, tag: &str) -> String {
    let source = sfc::parse(sfc_src).unwrap();
    let template_ast = source
        .template
        .clone()
        .map(|t| aihu_compiler::parse_template(t).unwrap_or_default());
    let unit = CompileUnit {
        source,
        template_ast,
        target: BuildTarget::Universal,
    };
    emit(&unit, tag).js
}

const RECIPE: &str = r#"@state {
  import { AihuCheckboxRoot } from '@aihu/primitives/checkbox'
  $extends: AihuCheckboxRoot
  $shadow: 'none'
}
@template {
  <span class="indicator"></span>
}
"#;

#[test]
fn ac1_extends_threads_base_into_options() {
    let js = emit_sfc(RECIPE, "aihu-checkbox");
    assert!(
        js.contains("base: AihuCheckboxRoot,"),
        "expected `base: AihuCheckboxRoot,` in options; got:\n{js}"
    );
    assert!(
        js.contains("defineComponent({"),
        "expected options-form defineComponent; got:\n{js}"
    );
}

#[test]
fn ac2_shadow_emits_leading_marker() {
    let js = emit_sfc(RECIPE, "aihu-checkbox");
    assert!(
        js.starts_with("// @aihu:shadow none\n"),
        "expected leading `// @aihu:shadow none` marker; got:\n{}",
        &js[..js.len().min(80)]
    );
}

#[test]
fn ac3_extends_forces_options_form_without_prop() {
    // No `$prop` — `$extends` alone must still switch to the options-form so
    // `base` has a home (the bare-arrow function-form has no options object).
    let js = emit_sfc(RECIPE, "aihu-checkbox");
    assert!(
        js.contains("defineComponent({") && js.contains("setup: (ctx) =>"),
        "expected options-form with ctx setup; got:\n{js}"
    );
}

#[test]
fn ac4_malformed_extends_and_shadow_rejected() {
    let bad_extends = "$extends:";
    let err = aihu_compiler::parse_state_macros(bad_extends).unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C470"));

    let bad_shadow = "$shadow: 'sideways'";
    let err = aihu_compiler::parse_state_macros(bad_shadow).unwrap_err();
    assert_eq!(err.code.as_deref(), Some("C471"));
}

#[test]
fn ac5_macros_emit_no_setup_body_js() {
    let js = emit_sfc(RECIPE, "aihu-checkbox");
    // The declaration-only macros must not leak `$extends`/`$shadow` tokens or a
    // stray `const`/statement into the compiled setup body.
    assert!(
        !js.contains("$extends"),
        "leaked $extends into output:\n{js}"
    );
    assert!(!js.contains("$shadow"), "leaked $shadow into output:\n{js}");
}
