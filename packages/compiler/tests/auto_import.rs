//! Compiler auto-import of `@aihu/use` composables (codegen/use_registry.rs).
//!
//! A bare `useMouse()` in `@state` — no explicit import — injects
//! `import { useMouse } from '@aihu/use/useMouse'` into the emitted module,
//! per-subpath (never the barrel). Guards: author imports of the same name
//! (any source) and local declarations suppress the injection.

use aihu_compiler::{compile_full, emit, sfc};

fn compile_js(src: &str) -> String {
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    emit(&unit, "x-auto").js
}

const MOUSE_IMPORT: &str = "import { useMouse } from '@aihu/use/useMouse'";
const LISTENER_IMPORT: &str = "import { useEventListener } from '@aihu/use/useEventListener'";

#[test]
fn bare_call_injects_subpath_import_at_module_scope() {
    let js = compile_js(concat!(
        "@state {\n",
        "const { x, y } = useMouse()\n",
        "}\n",
        "@template { <p>{x()}</p> }"
    ));
    // Injected import present…
    let import_at = js.find(MOUSE_IMPORT).expect("auto-import missing");
    // …at module scope: ABOVE the defineElement call.
    let define_at = js.find("defineElement(").expect("defineElement missing");
    assert!(
        import_at < define_at,
        "auto-import must precede defineElement (module scope)"
    );
    // The setup body still carries the call itself.
    assert!(js.contains("useMouse()"), "setup body lost the useMouse() call");
}

#[test]
fn call_inside_effect_macro_body_still_injects() {
    let js = compile_js(concat!(
        "@state {\n",
        "const [armed, setArmed] = signal(false)\n",
        "$effect: () => {\n",
        "  if (armed()) { const { x } = useMouse() }\n",
        "}\n",
        "}\n",
        "@template { <p>{armed}</p> }"
    ));
    assert!(
        js.contains(MOUSE_IMPORT),
        "useMouse() inside a $effect body must still auto-import"
    );
}

#[test]
fn call_inside_action_macro_body_still_injects() {
    let js = compile_js(concat!(
        "@state {\n",
        "$action: {\n",
        "  track: () => { const { x } = useMouse() },\n",
        "}\n",
        "}\n",
        "@template { <button on:click={track}>t</button> }"
    ));
    assert!(
        js.contains(MOUSE_IMPORT),
        "useMouse() inside a $action body must still auto-import"
    );
}

#[test]
fn author_import_same_source_dedupes_to_one() {
    let js = compile_js(concat!(
        "@state {\n",
        "import { useMouse } from '@aihu/use/useMouse'\n",
        "\n",
        "const { x, y } = useMouse()\n",
        "}\n",
        "@template { <p>{x()}</p> }"
    ));
    assert_eq!(
        js.matches(MOUSE_IMPORT).count(),
        1,
        "author + auto import must collapse to exactly one line"
    );
}

#[test]
fn author_import_different_source_suppresses_injection() {
    let js = compile_js(concat!(
        "@state {\n",
        "import { useMouse } from './local'\n",
        "\n",
        "const { x, y } = useMouse()\n",
        "}\n",
        "@template { <p>{x()}</p> }"
    ));
    assert!(
        !js.contains("@aihu/use/useMouse"),
        "author's different-source import must win — no @aihu/use injection"
    );
    assert!(js.contains("from './local'"), "author import must be preserved");
}

#[test]
fn local_declaration_shadows_no_injection() {
    let js = compile_js(concat!(
        "@state {\n",
        "const useMouse = () => ({ x: () => 0, y: () => 0 })\n",
        "const { x, y } = useMouse()\n",
        "}\n",
        "@template { <p>{x()}</p> }"
    ));
    assert!(
        !js.contains("@aihu/use/useMouse"),
        "locally declared useMouse shadows the composable — no injection"
    );
}

#[test]
fn unknown_composable_not_injected() {
    let js = compile_js(concat!(
        "@state {\n",
        "const foo = useFoo()\n",
        "}\n",
        "@template { <p>{foo}</p> }"
    ));
    assert!(
        !js.contains("@aihu/use"),
        "useFoo is not in the registry — nothing to inject"
    );
}

#[test]
fn multiple_composables_all_injected() {
    let js = compile_js(concat!(
        "@state {\n",
        "const { x, y } = useMouse()\n",
        "useEventListener(window, 'resize', () => {})\n",
        "}\n",
        "@template { <p>{x()}</p> }"
    ));
    assert!(js.contains(MOUSE_IMPORT), "useMouse import missing");
    assert!(js.contains(LISTENER_IMPORT), "useEventListener import missing");
}

#[test]
fn suffixed_and_member_calls_do_not_match() {
    let js = compile_js(concat!(
        "@state {\n",
        "const a = useMouseFoo()\n",
        "const b = tracker.useMouse()\n",
        "}\n",
        "@template { <p>{a}</p> }"
    ));
    assert!(
        !js.contains("@aihu/use/useMouse"),
        "useMouseFoo( / obj.useMouse( are not bare useMouse( calls"
    );
}

#[test]
fn sidecar_declares_auto_imported_composable() {
    let src = concat!(
        "@state {\n",
        "const { x, y } = useMouse()\n",
        "}\n",
        "@template { <p>{x()}</p> }"
    );
    let parsed = aihu_compiler::sfc::parse(src).unwrap();
    let unit = aihu_compiler::compile_full(&parsed).unwrap();
    let out = aihu_compiler::emit(&unit, "x-auto");
    let sidecar = out.sidecar_ts.expect("sidecar expected");
    assert!(
        sidecar.contains("declare const useMouse: (...args: any[]) => any;"),
        "sidecar must ambiently declare the auto-imported composable"
    );
}

#[test]
fn sidecar_skips_declaration_when_author_imported() {
    let src = concat!(
        "@state {\n",
        "import { useMouse } from './local'\n",
        "\n",
        "const { x, y } = useMouse()\n",
        "}\n",
        "@template { <p>{x()}</p> }"
    );
    let parsed = aihu_compiler::sfc::parse(src).unwrap();
    let unit = aihu_compiler::compile_full(&parsed).unwrap();
    let out = aihu_compiler::emit(&unit, "x-auto");
    let sidecar = out.sidecar_ts.expect("sidecar expected");
    assert!(
        !sidecar.contains("declare const useMouse"),
        "authored import binds useMouse — an ambient re-declaration is a TS2440 conflict"
    );
}

// ── review fixes D1–D5: comment/string masking, unified shadow guard, ────────
// ── tab-form imports, wrapped calls, emit↔sidecar agreement ─────────────────

/// Compile and return (js, sidecar) so agreement can be asserted on both.
fn compile_both(src: &str) -> (String, Option<String>) {
    let parsed = aihu_compiler::sfc::parse(src).unwrap();
    let unit = aihu_compiler::compile_full(&parsed).unwrap();
    let out = aihu_compiler::emit(&unit, "x-auto");
    (out.js, out.sidecar_ts)
}

/// The emit-side import and the sidecar-side ambient declaration must always
/// agree — both present or both absent. Returns whether they are present.
fn assert_emit_sidecar_agree(src: &str, name: &str, source: &str) -> bool {
    let (js, sidecar) = compile_both(src);
    let injected = js.contains(&format!("import {{ {name} }} from '{source}'"));
    let declared = sidecar
        .as_deref()
        .map(|s| s.contains(&format!("declare const {name}")))
        .unwrap_or(false);
    assert_eq!(
        injected, declared,
        "emit ({injected}) and sidecar ({declared}) disagree for {name} on:\n{src}"
    );
    injected
}

#[test]
fn comment_mention_only_no_injection() {
    let src = concat!(
        "@state {\n",
        "// TODO: wire useMouse() here later\n",
        "/* maybe also useEventListener() */\n",
        "const label = 1\n",
        "}\n",
        "@template { <p>{label}</p> }"
    );
    let (js, _) = compile_both(src);
    assert!(
        !js.contains("@aihu/use"),
        "a commented-out call must not import from the optional @aihu/use package"
    );
    assert!(!assert_emit_sidecar_agree(src, "useMouse", "@aihu/use/useMouse"));
}

#[test]
fn string_literal_mention_no_injection() {
    let src = concat!(
        "@state {\n",
        "const hint = 'call useMouse() to track'\n",
        "const tpl = `useEventListener() docs`\n",
        "}\n",
        "@template { <p>{hint}</p> }"
    );
    let (js, _) = compile_both(src);
    assert!(
        !js.contains("@aihu/use"),
        "a name inside a string/template literal must not inject"
    );
    assert!(!assert_emit_sidecar_agree(src, "useMouse", "@aihu/use/useMouse"));
}

#[test]
fn function_shadow_no_injection_and_no_sidecar_declare() {
    let src = concat!(
        "@state {\n",
        "function useMouse() { return { x: () => 0, y: () => 0 } }\n",
        "const { x, y } = useMouse()\n",
        "}\n",
        "@template { <p>{x()}</p> }"
    );
    let (js, sidecar) = compile_both(src);
    assert!(!js.contains("@aihu/use"), "function decl shadows — no injection");
    assert!(
        !sidecar.unwrap().contains("declare const useMouse"),
        "declare beside function useMouse is a TS2440/2451 duplicate"
    );
}

#[test]
fn var_and_class_shadow_no_injection() {
    let src_var = concat!(
        "@state {\n",
        "var useMouse = () => ({ x: () => 0 })\n",
        "const { x } = useMouse()\n",
        "}\n",
        "@template { <p>{x()}</p> }"
    );
    assert!(!assert_emit_sidecar_agree(src_var, "useMouse", "@aihu/use/useMouse"));

    let src_class = concat!(
        "@state {\n",
        "class useMouse {}\n",
        "const m = new useMouse()\n",
        "}\n",
        "@template { <p>{m}</p> }"
    );
    assert!(!assert_emit_sidecar_agree(src_class, "useMouse", "@aihu/use/useMouse"));
}

#[test]
fn destructure_binding_no_injection() {
    let src = concat!(
        "@state {\n",
        "const { useMouse } = makeHelpers()\n",
        "const { x } = useMouse()\n",
        "}\n",
        "@template { <p>{x()}</p> }"
    );
    let (js, _) = compile_both(src);
    assert!(
        !js.contains("@aihu/use"),
        "a destructured binding named useMouse shadows the composable"
    );
    assert!(!assert_emit_sidecar_agree(src, "useMouse", "@aihu/use/useMouse"));
}

#[test]
fn default_and_aliased_imports_suppress_injection() {
    let src_default = concat!(
        "@state {\n",
        "import useMouse from '@aihu/use/useMouse'\n",
        "\n",
        "const { x } = useMouse()\n",
        "}\n",
        "@template { <p>{x()}</p> }"
    );
    let (js, _) = compile_both(src_default);
    assert_eq!(
        js.matches("from '@aihu/use/useMouse'").count(),
        1,
        "default import binds useMouse — no second (named) injection"
    );

    let src_alias = concat!(
        "@state {\n",
        "import { mouse as useMouse } from './local'\n",
        "\n",
        "const { x } = useMouse()\n",
        "}\n",
        "@template { <p>{x()}</p> }"
    );
    let (js, _) = compile_both(src_alias);
    assert!(
        !js.contains("@aihu/use"),
        "aliased import binds useMouse — no injection"
    );
    assert!(!assert_emit_sidecar_agree(src_alias, "useMouse", "@aihu/use/useMouse"));
}

#[test]
fn tab_form_import_no_duplicate_binding() {
    let src = concat!(
        "@state {\n",
        "import\t{ useMouse } from '@aihu/use/useMouse'\n",
        "\n",
        "const { x, y } = useMouse()\n",
        "}\n",
        "@template { <p>{x()}</p> }"
    );
    let (js, _) = compile_both(src);
    assert_eq!(
        js.matches("from '@aihu/use/useMouse'").count(),
        1,
        "tab-form author import + auto-import must not double-bind useMouse:\n{js}"
    );
}

#[test]
fn wrapped_call_newline_before_paren_injects() {
    let src = concat!(
        "@state {\n",
        "const pos = useMouse\n",
        "  ()\n",
        "}\n",
        "@template { <p>{pos}</p> }"
    );
    assert!(assert_emit_sidecar_agree(src, "useMouse", "@aihu/use/useMouse"));
}

#[test]
fn positive_case_emit_and_sidecar_agree() {
    let src = concat!(
        "@state {\n",
        "const { x, y } = useMouse()\n",
        "}\n",
        "@template { <p>{x()}</p> }"
    );
    assert!(assert_emit_sidecar_agree(src, "useMouse", "@aihu/use/useMouse"));
}
