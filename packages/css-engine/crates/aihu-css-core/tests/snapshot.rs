use aihu_css_core::compile_classes;

#[test]
fn compiles_basic_class() {
    let output = compile_classes(&["bg-primary".to_string()]);
    insta::assert_snapshot!(output);
}

#[test]
fn compiles_multiple_classes() {
    let output = compile_classes(&[
        "bg-primary".to_string(),
        "text-primary-foreground".to_string(),
        "rounded-md".to_string(),
        "p-4".to_string(),
    ]);
    insta::assert_snapshot!(output);
}

#[test]
fn unknown_class_returns_empty_string() {
    let output = compile_classes(&["this-class-does-not-exist".to_string()]);
    assert_eq!(output, "");
}
