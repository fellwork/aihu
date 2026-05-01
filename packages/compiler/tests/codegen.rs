use scribe_compiler::{compile_full, emit, sfc};

fn counter_source() -> &'static str {
    concat!(
        "<script setup>
",
        "import { signal } from '@scribe/signals'
",
        "
",
        "const [count, setCount] = signal(0)
",
        "const increment = () => setCount(c => c + 1)
",
        "</script>
",
        "
",
        "<template>
",
        "  <div class=\"counter\">
",
        "    <span>{{ count }}</span>
",
        "    <button @click=\"increment\">+</button>
",
        "  </div>
",
        "</template>"
    )
}

#[test]
fn counter_full() {
    let parsed = sfc::parse(counter_source()).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "counter");
    insta::assert_snapshot!(output.js);
}

#[test]
fn no_signals_plain_leaf() {
    let src = concat!(
        "<script setup>
",
        "const message = 'hello'
",
        "</script>
",
        "<template><p>{{ message }}</p></template>"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-msg");
    insta::assert_snapshot!(output.js);
}

#[test]
fn event_attr_onclick() {
    let src = concat!(
        "<script setup>
",
        "const handler = () => {}
",
        "</script>
",
        "<template><button @click=\"handler\">click</button></template>"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-btn");
    insta::assert_snapshot!(output.js);
}

#[test]
fn signal_leaf_cast() {
    let src = concat!(
        "<script setup>
",
        "const [val, setVal] = signal(0)
",
        "</script>
",
        "<template><span>{{ val }}</span></template>"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-val");
    insta::assert_snapshot!(output.js);
}

#[test]
fn plain_var_no_cast() {
    let src = concat!(
        "<script setup>
",
        "const title = 'hello'
",
        "</script>
",
        "<template><h1>{{ title }}</h1></template>"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-head");
    insta::assert_snapshot!(output.js);
}

#[test]
fn style_block_warning() {
    let src = concat!(
        "<script setup>
",
        "const [count, setCount] = signal(0)
",
        "</script>
",
        "<template><span>{{ count }}</span></template>
",
        "<style>
",
        "span { color: red; }
",
        "</style>"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-styled");
    insta::assert_snapshot!(output.js);
}

#[test]
fn ctx_param_present() {
    let src = concat!(
        "<script setup>
",
        "const [val, setVal] = signal(0)
",
        "</script>
",
        "<template><span>{{ val }}</span></template>"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-ctx");
    assert!(
        output.js.contains("defineComponent((_ctx)"),
        "output must contain defineComponent((_ctx)"
    );
    insta::assert_snapshot!(output.js);
}

#[test]
fn import_type_signal_present() {
    let src = concat!(
        "<script setup>
",
        "const [val, setVal] = signal(0)
",
        "</script>
",
        "<template><span>{{ val }}</span></template>"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-sig");
    assert!(
        output.js.contains("import type { Signal }"),
        "output must contain import type {{ Signal }}"
    );
    insta::assert_snapshot!(output.js);
}

#[test]
fn no_export_default() {
    let src = concat!(
        "<script setup>
",
        "const [val, setVal] = signal(0)
",
        "</script>
",
        "<template><span>{{ val }}</span></template>"
    );
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-noexp");
    assert!(
        !output.js.contains("export default"),
        "output must not contain export default"
    );
    insta::assert_snapshot!(output.js);
}

#[test]
fn static_attr_passthrough() {
    let src = "<template><div class=\"counter\"></div></template>";
    let parsed = sfc::parse(src).unwrap();
    let unit = compile_full(&parsed).unwrap();
    let output = emit(&unit, "x-div");
    insta::assert_snapshot!(output.js);
}
