//! Scanner tests — proves the three class-forms (Static / Binding / Macro) are
//! distinguished and that non-class macros never enter the utility set. The
//! fixture is REAL `aihu-compile --ast-json` output (not hand-authored).

use aihu_css_core::{parse_ast, scan, scan_ast, SfcAst};

fn fixture_ast() -> SfcAst {
    // From `aihu-compile --ast-json` for:
    //   <button class="base" class={cn('btn', size)} class:loading={busy} on:click={go}>Go</button>
    parse_ast(include_str!("fixtures/button.ast.json")).unwrap()
}

#[test]
fn extracts_static_form_a() {
    let set = scan_ast(&fixture_ast());
    assert!(set.contains("base"), "Form A static class missing: {set:?}");
}

#[test]
fn extracts_binding_string_literals_form_b() {
    let set = scan_ast(&fixture_ast());
    assert!(set.contains("btn"), "string literal in cn('btn', size) missing");
    assert!(!set.contains("size"), "bare identifier `size` must NOT be a utility");
}

#[test]
fn flags_unresolved_binding_identifiers() {
    let result = scan(&fixture_ast());
    assert!(
        result.unresolved.contains("size"),
        "unresolved identifier `size` should be flagged for diagnostics: {:?}",
        result.unresolved
    );
}

#[test]
fn extracts_macro_class_toggle_form_c() {
    let set = scan_ast(&fixture_ast());
    assert!(set.contains("loading"), "Form C $class:loading toggle missing");
}

#[test]
fn skips_non_class_macros() {
    // $on.click / $if must never enter the utility set.
    let set = scan_ast(&fixture_ast());
    assert!(
        !set.iter().any(|c| c.contains("click") || c == "if" || c.contains("on:")),
        "non-class macro leaked into utility set: {set:?}"
    );
}

#[test]
fn rejects_unsupported_ast_version() {
    let json = r#"{"tag":"X","astVersion":2,"style":null,"template":null,"meta":{"name":"X"}}"#;
    assert!(parse_ast(json).is_err(), "astVersion 2 must be rejected");
}

#[test]
fn empty_template_yields_empty_set() {
    let json = r#"{"tag":"X","astVersion":1,"style":null,"template":null,"meta":{"name":"X"}}"#;
    let ast = parse_ast(json).unwrap();
    assert!(scan_ast(&ast).is_empty(), "no @template → empty utility set (edge E5)");
}

#[test]
fn skips_component_node_class_attrs_edge_e10() {
    // A macroElement (component) node owns its own shadow scope; its class
    // attrs must not be compiled into the parent sheet.
    let json = r#"{
      "tag":"Parent","astVersion":1,"style":null,"meta":{"name":"Parent"},
      "template":[
        {"kind":"macroElement","name":"UserCard","attrs":[
          {"kind":"static","name":"class","value":"should-not-appear"}
        ],"children":[
          {"kind":"element","tag":"span","attrs":[
            {"kind":"static","name":"class","value":"slotted-content"}
          ],"children":[]}
        ]}
      ]}"#;
    let ast = parse_ast(json).unwrap();
    let set = scan_ast(&ast);
    assert!(!set.contains("should-not-appear"), "component class must be skipped (E10)");
    assert!(set.contains("slotted-content"), "child HTML element class should still scan");
}

#[test]
fn array_binding_extracts_literals_edge_e2() {
    // class={['a', cond && 'b']} → 'a','b' utilities, `cond` unresolved.
    let json = r#"{
      "tag":"X","astVersion":1,"style":null,"meta":{"name":"X"},
      "template":[{"kind":"element","tag":"div","attrs":[
        {"kind":"binding","name":"class","expr":"['a', cond && 'b']"}
      ],"children":[]}]}"#;
    let ast = parse_ast(json).unwrap();
    let result = scan(&ast);
    assert!(result.utilities.contains("a"));
    assert!(result.utilities.contains("b"));
    assert!(result.unresolved.contains("cond"));
}
