//! Golden-file coverage for the light-DOM selector-rewrite pass
//! (`light_scope.rs`, LDF §10 step 3): `@scope` root-wrapping,
//! `:host`/`:host()`/`:host-context()`/`::slotted()`/`::part()` lowering, and
//! `@keyframes` hash-suffixing. All fixtures compile with a `lightScopeId`
//! set, exercising the light-mode branch in `emit_sfc_scoped_channels`.

use aihu_css_core::{compile_sfc_scoped, parse_ast};

fn ast(json: &str) -> aihu_css_core::SfcAst {
    parse_ast(json).unwrap()
}

/// A component with the given authored `@style` content, compiled in light
/// mode with a fixed scope id (`a1b2c3d4`) so snapshots are stable.
fn light(style_content: &str) -> aihu_css_core::SfcAst {
    let json = format!(
        r#"{{"tag":"X","astVersion":1,"lightScopeId":"a1b2c3d4",
        "style":{{"content":{content},"scope":"scoped"}},
        "meta":{{"name":"X"}},"template":null}}"#,
        content = serde_json::to_string(style_content).unwrap()
    );
    ast(&json)
}

#[test]
fn plain_selectors_are_unchanged_inside_the_scope_wrapper() {
    insta::assert_snapshot!(
        compile_sfc_scoped(&light(".card { color: red; } .card > .title { font-weight: bold; }"))
            .unwrap()
    );
}

#[test]
fn bare_host_lowers_to_scope() {
    insta::assert_snapshot!(compile_sfc_scoped(&light(":host { display: block; }")).unwrap());
}

#[test]
fn host_with_arg_lowers_to_scope_compound() {
    insta::assert_snapshot!(
        compile_sfc_scoped(&light(":host(.open) { display: block; }")).unwrap()
    );
}

#[test]
fn host_context_lowers_to_ordinary_descendant() {
    insta::assert_snapshot!(
        compile_sfc_scoped(&light(":host-context(.dark) { color: white; }")).unwrap()
    );
}

#[test]
fn slotted_wildcard_lowers_to_the_marker_attribute() {
    insta::assert_snapshot!(
        compile_sfc_scoped(&light("::slotted(*) { margin: 0; }")).unwrap()
    );
}

#[test]
fn slotted_tag_compounds_with_the_marker_attribute() {
    insta::assert_snapshot!(compile_sfc_scoped(&light("::slotted(p) { margin: 0; }")).unwrap());
}

#[test]
fn part_lowers_to_a_plain_attribute_selector() {
    insta::assert_snapshot!(
        compile_sfc_scoped(&light("::part(thumb) { background: gray; }")).unwrap()
    );
}

#[test]
fn apply_synthesized_host_variant_is_lowered_too() {
    // `@apply host:bg-primary` inside `.btn {}` — apply.rs synthesizes a
    // NESTED `:host(&)`-shaped rule; this pass must catch it at that depth,
    // not just directly-authored top-level occurrences.
    insta::assert_snapshot!(
        compile_sfc_scoped(&light(".btn { @apply host:bg-primary; }")).unwrap()
    );
}

#[test]
fn dark_cascade_host_selector_is_lowered() {
    // apply.rs's dark-cascade path emits a literal `:host([data-theme="dark"])
    // &, :root.dark &` selector unconditionally (not mode-aware) — this pass
    // must lower the `:host(...)` half of it too.
    insta::assert_snapshot!(compile_sfc_scoped(&light(".btn { @apply dark:bg-surface; }")).unwrap());
}

#[test]
fn media_nested_top_level_rule_is_scoped_rule_nested_is_not_rescoped() {
    // `@media` at top level needs scoping (it's a sibling of the rule, not
    // nested inside one); a rule's OWN nested `@media` inherits scoping via
    // real CSS nesting and must not be independently re-scoped.
    insta::assert_snapshot!(compile_sfc_scoped(&light(
        "@media (min-width: 40rem) { .card { color: red; } } .card { @media (min-width: 40rem) { color: blue; } }"
    ))
    .unwrap());
}

#[test]
fn keyframes_are_hash_suffixed_and_references_rewritten() {
    insta::assert_snapshot!(compile_sfc_scoped(&light(
        "@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } } .card { animation: fade-in 1s ease; animation-name: fade-in; }"
    ))
    .unwrap());
}

#[test]
fn keyframes_global_escape_hatch_is_not_renamed() {
    insta::assert_snapshot!(compile_sfc_scoped(&light(
        "@keyframes $global fade-in { from { opacity: 0; } to { opacity: 1; } } .card { animation: fade-in 1s ease; }"
    ))
    .unwrap());
}

#[test]
fn renaming_a_short_keyframe_does_not_corrupt_a_longer_one_sharing_its_prefix() {
    // `fade` renamed must not corrupt the DISTINCT keyframe `fade-in` — the
    // token-level (not substring) match in rewrite_animation_value.
    insta::assert_snapshot!(compile_sfc_scoped(&light(
        "@keyframes fade { from { opacity: 0.5; } to { opacity: 1; } } \
         @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } } \
         .a { animation-name: fade; } .b { animation-name: fade-in; }"
    ))
    .unwrap());
}

#[test]
fn two_components_defining_the_same_keyframe_name_do_not_collide() {
    let a = compile_sfc_scoped(&light(
        "@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } } .card { animation-name: fade-in; }",
    ))
    .unwrap();
    let b_json = format!(
        r#"{{"tag":"Y","astVersion":1,"lightScopeId":"deadbeef",
        "style":{{"content":{content},"scope":"scoped"}},
        "meta":{{"name":"Y"}},"template":null}}"#,
        content = serde_json::to_string(
            "@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } } .card { animation-name: fade-in; }"
        )
        .unwrap()
    );
    let b = compile_sfc_scoped(&ast(&b_json)).unwrap();

    assert!(a.contains("fade-in-a1b2c3d4"));
    assert!(b.contains("fade-in-deadbeef"));
    assert_ne!(a, b);
    // Neither ships the bare, collidable name as a definition or reference.
    assert!(!a.contains("@keyframes fade-in {"));
    assert!(!b.contains("@keyframes fade-in {"));
}

#[test]
fn host_with_comma_list_arg_stays_one_selector_list_not_two() {
    // `:host(.a, .b)`'s inner comma must not be treated as a top-level
    // selector-list separator — a naive split would silently drop the `.b`
    // half from the :scope compound and emit it as an unscoped sibling.
    insta::assert_snapshot!(
        compile_sfc_scoped(&light(":host(.a, .b) { display: block; }")).unwrap()
    );
}

#[test]
fn slotted_with_comma_list_arg_stays_one_selector_list_not_two() {
    insta::assert_snapshot!(
        compile_sfc_scoped(&light("::slotted(p, span) { margin: 0; }")).unwrap()
    );
}

#[test]
fn comma_inside_an_attribute_value_does_not_split_the_selector_list() {
    // `style_parser.rs` keeps `StyleRule.selector` as raw author text — a
    // quoted attribute value's internal comma must not be mistaken for a
    // top-level selector-list separator.
    insta::assert_snapshot!(
        compile_sfc_scoped(&light("[title=\"a, b\"] .x { color: red; }")).unwrap()
    );
}

#[test]
fn global_keyframe_marker_is_stripped_in_shadow_mode_too() {
    // Regression: `@keyframes $global name` is only meaningful as an escape
    // hatch for the LIGHT-mode rewrite pass, but the marker must still be
    // stripped on every OTHER path (shadow mode — today's default for every
    // leaf) or it survives as literal, invalid CSS text
    // (`@keyframes $global fade-in {`) and the browser drops the whole
    // at-rule, silently killing the animation.
    let json = r#"{"tag":"X","astVersion":1,
      "style":{"content":"@keyframes $global fade-in { from { opacity: 0; } to { opacity: 1; } } .card { animation: fade-in 1s ease; }","scope":"scoped"},
      "meta":{"name":"X"},"template":null}"#;
    let out = compile_sfc_scoped(&ast(json)).unwrap();
    assert!(out.contains("@keyframes fade-in {"));
    assert!(!out.contains("$global"));
    assert!(out.contains("animation: fade-in 1s ease;"));
}

#[test]
fn global_keyframe_marker_is_stripped_in_a_global_style_block_too() {
    // Same regression, the OTHER untouched path: a `$global` @style block in
    // EITHER mode skips the light-DOM rewrite entirely (it's already
    // unscoped) but must still strip the keyframe marker.
    let json = r#"{"tag":"X","astVersion":1,"lightScopeId":"a1b2c3d4",
      "style":{"content":"@keyframes $global fade-in { from { opacity: 0; } to { opacity: 1; } } body { animation: fade-in 1s ease; }","scope":"global"},
      "meta":{"name":"X"},"template":null}"#;
    let out = compile_sfc_scoped(&ast(json)).unwrap();
    assert!(out.contains("@keyframes fade-in {"));
    // Not `!out.contains("$global")` — the surrounding `/* authored @style
    // ($global — unscoped) */` comment legitimately contains that substring;
    // check the specific marker-survival shape instead.
    assert!(!out.contains("@keyframes $global"));
}

#[test]
fn global_style_block_skips_the_pass_entirely_even_in_light_mode() {
    // $global @style is already intentionally unscoped — no @scope wrapper,
    // no lowering, regardless of light/shadow mode.
    let json = r#"{"tag":"X","astVersion":1,"lightScopeId":"a1b2c3d4",
      "style":{"content":"body { margin: 0; }","scope":"global"},
      "meta":{"name":"X"},"template":null}"#;
    let out = compile_sfc_scoped(&ast(json)).unwrap();
    assert!(out.contains("body {"));
    assert!(!out.contains("@scope"));
}

#[test]
fn shadow_mode_is_unaffected_host_and_slotted_pass_through_verbatim() {
    // No lightScopeId — the pre-existing shadow path, byte-for-byte unchanged.
    let json = r#"{"tag":"X","astVersion":1,
      "style":{"content":":host { display: block; } ::slotted(p) { margin: 0; }","scope":"scoped"},
      "meta":{"name":"X"},"template":null}"#;
    let out = compile_sfc_scoped(&ast(json)).unwrap();
    assert!(out.contains(":host {"));
    assert!(out.contains("::slotted(p)"));
    assert!(!out.contains("@scope"));
    assert!(!out.contains(":scope"));
}
