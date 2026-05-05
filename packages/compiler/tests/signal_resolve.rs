use insta::assert_debug_snapshot;
use aihu_compiler::codegen::signals::resolve_signals;

#[test]
fn single_signal() {
    assert_debug_snapshot!(resolve_signals("const [count, setCount] = signal(0)"));
}

#[test]
fn multiple_signals() {
    assert_debug_snapshot!(resolve_signals(
        "const [count, setCount] = signal(0)\nconst [name, setName] = signal(\"\")"
    ));
}

#[test]
fn non_signal_var_excluded() {
    assert_debug_snapshot!(resolve_signals("const x = 1\nconst y = foo()"));
}

#[test]
fn mixed_vars_and_signals() {
    assert_debug_snapshot!(resolve_signals(
        "import { signal } from '@aihu/signals'\nconst x = 1\nconst [count, setCount] = signal(0)\nconst increment = () => setCount(c => c + 1)"
    ));
}

#[test]
fn empty_script() {
    assert_debug_snapshot!(resolve_signals(""));
}

#[test]
fn name_attr_script_meta() {
    assert_debug_snapshot!(resolve_signals(
        "// @name x-counter\nconst [foo, setFoo] = signal(true)"
    ));
}
