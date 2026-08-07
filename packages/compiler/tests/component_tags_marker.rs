//! §22 — the `// @aihu:component-tags` marker: every component tag the
//! TEMPLATE references, as opposed to every tag the SSR renderer will look up.
//!
//! The distinction is the entire point of the marker, so the tests below assert
//! it DIFFERENTIALLY wherever they can: a reference the v1 child boundaries
//! decline must appear in the marker AND produce no `__aihu_schild` call site.
//! A test that only checked "the marker contains the tag" would pass just as
//! well against a marker derived from the call sites — i.e. against the set
//! that is already wrong for the diagnostics that consume this.
//!
//! Background: `<weather-demo city="London">` in `apps/docs/src/pages/index.aihu`
//! carries an attribute, so it is declined, so `weather-demo` appears in no
//! `__aihu_child_tags__` anywhere — and `@aihu/app`'s two prerender diagnostics
//! (the §18 warn-gate and the §3 unresolved-tag warning) both concluded "not
//! referenced" for a component that fails to load under SSR.

use aihu_compiler::{compile_full_with_target, emit, sfc, BuildTarget};

/// The marker's payload, or `None` when no marker line is present.
///
/// Anchored to the start of a line and to the end of that line, mirroring
/// `_parseIslandMarker`'s `^…$/m` in `packages/compiler/js/index.ts` — the
/// consumer this is a contract with.
fn marker_tags(js: &str) -> Option<Vec<String>> {
    let line = js
        .lines()
        .find(|l| l.starts_with("// @aihu:component-tags "))?;
    let payload = line.trim_start_matches("// @aihu:component-tags ");
    Some(payload.split(',').map(str::to_string).collect())
}

fn compile(src: &str, tag: &str, target: BuildTarget) -> String {
    let parsed = sfc::parse_with_path(src, Some("src/components/x-host.aihu"))
        .expect("fixture must parse");
    let unit =
        compile_full_with_target(&parsed, target).expect("fixture must compile");
    emit(&unit, tag).js
}

// ─── the differential the marker exists for ─────────────────────────────────

/// A reference the SSR child emitter DECLINES still reaches the marker.
///
/// `city="London"` makes `attrs.is_empty()` false, so `ssr_string_emit` never
/// lowers the reference into `__aihu_schild`. Both halves are asserted: without
/// the "no call site" half this would not distinguish the template-derived set
/// from the call-site-derived one.
#[test]
fn declined_reference_is_still_reported() {
    let js = compile(
        r#"
@template {
  <div>
    <weather-demo city="London"></weather-demo>
  </div>
}
"#,
        "x-host",
        BuildTarget::Server,
    );
    assert!(
        !js.contains("__aihu_schild('weather-demo'"),
        "fixture invalid: the emitter was expected to DECLINE an attribute-carrying \
         reference, so this test would not be differential. Emitted:\n{js}"
    );
    assert_eq!(
        marker_tags(&js).as_deref(),
        Some(["weather-demo".to_string()].as_slice()),
        "a declined reference must still appear in the marker"
    );
}

/// A reference with CHILDREN is likewise declined, and likewise reported.
#[test]
fn reference_with_children_is_still_reported() {
    let js = compile(
        r#"
@template {
  <div>
    <x-kid>hello</x-kid>
  </div>
}
"#,
        "x-host",
        BuildTarget::Server,
    );
    assert!(
        !js.contains("__aihu_schild('x-kid'"),
        "fixture invalid: a reference with children was expected to be declined. \
         Emitted:\n{js}"
    );
    assert_eq!(
        marker_tags(&js).as_deref(),
        Some(["x-kid".to_string()].as_slice()),
    );
}

/// A reference the emitter ACCEPTS is reported too — the marker is a superset
/// of the call-site set, never a disjoint one.
#[test]
fn accepted_reference_is_reported_as_well() {
    let js = compile(
        r#"
@template {
  <div>
    <x-kid></x-kid>
  </div>
}
"#,
        "x-host",
        BuildTarget::Server,
    );
    assert!(
        js.contains("__aihu_schild('x-kid'"),
        "fixture invalid: a bare, non-root reference was expected to be ACCEPTED, \
         so this test would not prove the superset relation. Emitted:\n{js}"
    );
    assert_eq!(
        marker_tags(&js).as_deref(),
        Some(["x-kid".to_string()].as_slice()),
    );
}

// ─── shape of the payload ───────────────────────────────────────────────────

/// Sorted, de-duplicated, and normalized to the custom-element name — the same
/// `kebab_component_tag` normalization `route.json`'s `components` array uses,
/// because both come from `collect_component_tags`.
#[test]
fn payload_is_sorted_deduped_and_kebab_normalized() {
    let js = compile(
        r#"
@template {
  <div>
    <ZebraCard></ZebraCard>
    <x-kid></x-kid>
    <ZebraCard></ZebraCard>
    <alpha-thing></alpha-thing>
  </div>
}
"#,
        "x-host",
        BuildTarget::Server,
    );
    assert_eq!(
        marker_tags(&js).as_deref(),
        Some(
            [
                "alpha-thing".to_string(),
                "x-kid".to_string(),
                "zebra-card".to_string(),
            ]
            .as_slice()
        ),
        "PascalCase must kebab, duplicates must collapse, order must be sorted"
    );
}

/// Structural containers are walked: `if=` branches, `each=` bodies and
/// framework-element (`<group>`) children all contribute, and the framework
/// element names themselves never do.
#[test]
fn structural_containers_are_walked_and_intrinsics_excluded() {
    let js = compile(
        r#"
@template {
  <div>
    <x-one if={flag}></x-one>
    <x-two each={item of items}></x-two>
    <group><x-three></x-three></group>
  </div>
}
"#,
        "x-host",
        BuildTarget::Server,
    );
    assert_eq!(
        marker_tags(&js).as_deref(),
        Some(
            [
                "x-one".to_string(),
                "x-three".to_string(),
                "x-two".to_string(),
            ]
            .as_slice()
        ),
    );
}

/// Plain HTML/SVG elements are not component tags, so a template made only of
/// them carries NO marker at all — "absent" and "empty" mean the same thing,
/// exactly as with `__aihu_child_tags__`.
#[test]
fn no_marker_when_the_template_references_no_component() {
    let js = compile(
        r#"
@template {
  <div><span>hi</span><svg><linearGradient></linearGradient></svg></div>
}
"#,
        "x-host",
        BuildTarget::Server,
    );
    assert_eq!(marker_tags(&js), None, "emitted:\n{js}");
}

/// Target-independent by construction: the set comes from the template AST,
/// which no build target changes. Pinned so a future target-specific emit
/// cannot silently make the client and server disagree about what a page
/// references.
#[test]
fn marker_is_identical_across_build_targets() {
    let src = r#"
@template {
  <div><x-kid city="London"></x-kid><other-thing></other-thing></div>
}
"#;
    let server = marker_tags(&compile(src, "x-host", BuildTarget::Server));
    let client = marker_tags(&compile(src, "x-host", BuildTarget::Client));
    let universal = marker_tags(&compile(src, "x-host", BuildTarget::Universal));
    let expected = Some(vec!["other-thing".to_string(), "x-kid".to_string()]);
    assert_eq!(server, expected);
    assert_eq!(client, expected);
    assert_eq!(universal, expected);
}

/// The marker occupies its own line and does not disturb the markers already on
/// this channel (`// @aihu:island`, which `_parseIslandMarker` reads with an
/// `^…$/m` anchor).
#[test]
fn marker_shares_the_channel_without_displacing_the_island_marker() {
    let js = compile(
        r#"
@template {
  <div><x-kid></x-kid></div>
}
"#,
        "x-host",
        BuildTarget::Client,
    );
    assert!(
        js.lines()
            .any(|l| l == "// @aihu:component-tags x-kid"),
        "the marker must be a whole line of its own. Emitted:\n{js}"
    );
    assert!(
        js.lines()
            .any(|l| l == "// @aihu:island static" || l == "// @aihu:island interactive"),
        "the island marker must survive on its own line. Emitted:\n{js}"
    );
}
