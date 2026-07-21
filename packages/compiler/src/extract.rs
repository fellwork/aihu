//! GX Phase 1 (#437-GX) — the `extract:` governed-extractability vocabulary.
//!
//! Spec: `docs/plans/governed-extractability/40-spec.md` §2–§3. This module is
//! the ONE implementation of:
//!
//! 1. the value-shape parser (`parse_extract_literal`) shared by BOTH authoring
//!    positions — `@route { extract: {...} }` (production parser in `sfc.rs`
//!    AND unit-test parser in `route.rs`) and the `$extract` state macro
//!    (`state_macros.rs`) — so the two positions cannot drift; and
//! 2. the resolution chain (`resolve_extract`) that turns a parsed (or absent)
//!    declaration into the ONE effective policy the emitter fans out to all
//!    three artifacts (code marker, `.route.json`, agent-meta sidecar). The
//!    three artifacts agree by construction because each is rendered from the
//!    same `ResolvedExtract` value computed once per compile.
//!
//! Phase 1 parses, validates, stores, and fans out. It enforces NOTHING: the
//! principal gate (Phase 2), compliance derivation (Phase 3), and the
//! bundle/data boundary (Phase 4) are later phases. The resolved default
//! (`read: 'agents'`, `call: 'anonymous'`) is byte-identical in behavior to
//! today for humans, search, and user-directed fetchers.

use crate::types::{AihuSource, CompileError, ExtractCall, ExtractDecl, ExtractRead, StateMacro};

// ─── Value-shape parsing (C483) ──────────────────────────────────────────────

/// Parse an `extract` object literal — outer braces included, e.g.
/// `{ read: 'agents', call: 'anonymous' }` — into an [`ExtractDecl`].
///
/// Accepted shape (spec §2.1, one canonical shape — single-string sugar is
/// deferred):
///
/// * `read:` ∈ `'all' | 'agents' | 'search' | 'none' | 'verified' | 'human'`
///   or `{ scope: '<name>' }`
/// * `call:` ∈ `'none' | 'anonymous' | 'verified'` or `{ scope: '<name>' }`
///
/// Either axis may be omitted (it resolves through the derivation/default
/// chain); unknown keys, unquoted values, unknown enum words, and empty or
/// whitespace-carrying scope names are all C483 (the mirror of `$shadow`'s
/// C471). The `{ scope }` value shape carries its scope by construction —
/// design A's C482 ("gated without a scope") is unrepresentable, not checked.
pub fn parse_extract_literal(literal: &str, line: usize) -> Result<ExtractDecl, CompileError> {
    let inner = strip_outer_braces(literal.trim())
        .ok_or_else(|| c483(line, "the value must be an object literal `{ read: ..., call: ... }`"))?;

    let mut decl = ExtractDecl::default();
    let bytes = inner.as_bytes();
    let mut i = 0usize;

    while i < bytes.len() {
        skip_ws_and_commas(bytes, &mut i);
        if i >= bytes.len() {
            break;
        }
        let key = parse_ident(inner, bytes, &mut i)
            .ok_or_else(|| c483(line, "expected an identifier key (`read` or `call`)"))?;
        skip_ws(bytes, &mut i);
        if i >= bytes.len() || bytes[i] != b':' {
            return Err(c483(line, &format!("key `{}` is missing its `:` value", key)));
        }
        i += 1;
        skip_ws(bytes, &mut i);

        match key.as_str() {
            "read" => {
                if decl.read.is_some() {
                    return Err(c484(line, "duplicate `read:` key in one `extract` value"));
                }
                decl.read = Some(parse_read_value(inner, bytes, &mut i, line)?);
            }
            "call" => {
                if decl.call.is_some() {
                    return Err(c484(line, "duplicate `call:` key in one `extract` value"));
                }
                decl.call = Some(parse_call_value(inner, bytes, &mut i, line)?);
            }
            other => {
                return Err(c483(
                    line,
                    &format!(
                        "unknown key `{}` — the policy has exactly two axes, `read` (crawl-visibility) and `call` (agent-callability)",
                        other
                    ),
                ));
            }
        }
    }

    Ok(decl)
}

fn parse_read_value(
    text: &str,
    bytes: &[u8],
    i: &mut usize,
    line: usize,
) -> Result<ExtractRead, CompileError> {
    if let Some(scope) = try_parse_scope_object(text, bytes, i, line)? {
        return Ok(ExtractRead::Scope(scope));
    }
    let word = parse_quoted_word(text, bytes, i).ok_or_else(|| {
        c483(
            line,
            "`read:` must be a quoted value ('all' | 'agents' | 'search' | 'none' | 'verified' | 'human') or `{ scope: '<name>' }`",
        )
    })?;
    match word.as_str() {
        "all" => Ok(ExtractRead::All),
        "agents" => Ok(ExtractRead::Agents),
        "search" => Ok(ExtractRead::Search),
        "none" => Ok(ExtractRead::None),
        "verified" => Ok(ExtractRead::Verified),
        "human" => Ok(ExtractRead::Human),
        other => Err(c483(
            line,
            &format!(
                "unknown `read:` value '{}' — expected 'all' | 'agents' | 'search' | 'none' | 'verified' | 'human' | {{ scope: '<name>' }}",
                other
            ),
        )),
    }
}

fn parse_call_value(
    text: &str,
    bytes: &[u8],
    i: &mut usize,
    line: usize,
) -> Result<ExtractCall, CompileError> {
    if let Some(scope) = try_parse_scope_object(text, bytes, i, line)? {
        return Ok(ExtractCall::Scope(scope));
    }
    let word = parse_quoted_word(text, bytes, i).ok_or_else(|| {
        c483(
            line,
            "`call:` must be a quoted value ('none' | 'anonymous' | 'verified') or `{ scope: '<name>' }`",
        )
    })?;
    match word.as_str() {
        "none" => Ok(ExtractCall::None),
        "anonymous" => Ok(ExtractCall::Anonymous),
        "verified" => Ok(ExtractCall::Verified),
        other => Err(c483(
            line,
            &format!(
                "unknown `call:` value '{}' — expected 'none' | 'anonymous' | 'verified' | {{ scope: '<name>' }}",
                other
            ),
        )),
    }
}

/// If the value at `*i` opens a `{ ... }` object, parse it as the ONE legal
/// object shape `{ scope: '<name>' }` and return the validated scope name.
/// Returns `Ok(None)` when the value is not an object (caller tries the quoted
/// enum form next).
fn try_parse_scope_object(
    text: &str,
    bytes: &[u8],
    i: &mut usize,
    line: usize,
) -> Result<Option<String>, CompileError> {
    if *i >= bytes.len() || bytes[*i] != b'{' {
        return Ok(None);
    }
    *i += 1;
    skip_ws(bytes, i);
    let key = parse_ident(text, bytes, i)
        .ok_or_else(|| c483(line, "an object policy value has exactly one shape: `{ scope: '<name>' }`"))?;
    if key != "scope" {
        return Err(c483(
            line,
            &format!("unknown object-value key `{}` — the one object shape is `{{ scope: '<name>' }}`", key),
        ));
    }
    skip_ws(bytes, i);
    if *i >= bytes.len() || bytes[*i] != b':' {
        return Err(c483(line, "`scope` is missing its `:` value"));
    }
    *i += 1;
    skip_ws(bytes, i);
    let scope = parse_quoted_word(text, bytes, i)
        .ok_or_else(|| c483(line, "`scope:` must be a quoted scope name, e.g. { scope: 'reports:read' }"))?;
    skip_ws(bytes, i);
    // Tolerate a trailing comma before the close.
    if *i < bytes.len() && bytes[*i] == b',' {
        *i += 1;
        skip_ws(bytes, i);
    }
    if *i >= bytes.len() || bytes[*i] != b'}' {
        return Err(c483(line, "`{ scope: '<name>' }` carries exactly one key"));
    }
    *i += 1;

    validate_scope_name(&scope, line)?;
    Ok(Some(scope))
}

/// A scope NAME must be non-empty and single-token (no whitespace — it is
/// rendered into the single-token `// @aihu:extract` marker), and must not
/// use the reserved `@` class-scope namespace: on the `read` axis the class
/// intents are the `'human'`/`'verified'` enum values (spec §2.3), and the
/// `@human`/`@verified` class-scopes live on the member `$scope` axis.
fn validate_scope_name(scope: &str, line: usize) -> Result<(), CompileError> {
    if scope.is_empty() {
        return Err(c483(line, "`scope:` name is empty — a scope value names its scope, e.g. { scope: 'reports:read' }"));
    }
    if scope.chars().any(|c| c.is_whitespace()) {
        return Err(c483(line, &format!("scope name '{}' must not contain whitespace", scope)));
    }
    if scope.starts_with('@') {
        return Err(c483(
            line,
            &format!(
                "scope name '{}' uses the reserved `@` class-scope namespace — on the extract axes the class intents are the enum values ('human'/'verified' on `read:`, 'verified' on `call:`); `@human`/`@verified` belong to the member `$scope` axis",
                scope
            ),
        ));
    }
    Ok(())
}

fn c483(line: usize, detail: &str) -> CompileError {
    CompileError {
        message: format!("C483: malformed `extract` policy value — {}", detail),
        line,
        col: 0,
        code: Some("C483".to_string()),
        hint: Some(
            "the declaration has two independent axes: `read:` ∈ 'all' | 'agents' | 'search' | \
             'none' | 'verified' | 'human' | { scope: '<name>' } and `call:` ∈ 'none' | \
             'anonymous' | 'verified' | { scope: '<name>' }"
                .to_string(),
        ),
        fix: Some("extract: { read: 'agents', call: 'anonymous' }".to_string()),
        ..Default::default()
    }
}

pub(crate) fn c484(line: usize, detail: &str) -> CompileError {
    CompileError {
        message: format!("C484: one `extract` declaration per surface — {}", detail),
        line,
        col: 0,
        code: Some("C484".to_string()),
        hint: Some(
            "a surface declares its extractability policy exactly once: routes in the `@route` \
             block (`extract: {...}`), non-route components in `@state` (`$extract: {...}`)"
                .to_string(),
        ),
        ..Default::default()
    }
}

// ─── Resolution — one declaration, one effective policy ──────────────────────

/// Where each resolved axis value came from — surfaced in the census so the
/// migration story ("no declarations → the ratified default") is visible in
/// every build rather than silent.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExtractOrigin {
    /// The author wrote the value (`extract:` or `$extract`).
    Declared,
    /// `read` derived fail-closed from a component-level `$scope` (spec §2.3):
    /// declared at the tool gate must not silently leak at the content surface.
    DerivedFromScope,
    /// The ratified default posture: `read: 'agents'`, `call: 'anonymous'`.
    Default,
}

/// The ONE effective policy for a surface, resolved from declaration →
/// derivation → default. Everything the emitter fans out (marker, route-json,
/// agent-meta) renders from a single value of this type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedExtract {
    pub read: ExtractRead,
    pub call: ExtractCall,
    pub read_origin: ExtractOrigin,
    pub call_origin: ExtractOrigin,
}

impl ResolvedExtract {
    /// The `// @aihu:extract read=<v> call=<v>` code-marker line (no trailing
    /// newline). Consumed by the Vite plugin's per-file seam — in Phase 1 only
    /// for the build census; in Phase 4 for governed chunk routing.
    pub fn marker_line(&self) -> String {
        format!(
            "// @aihu:extract read={} call={}",
            self.read.marker_value(),
            self.call.marker_value()
        )
    }

    /// The `"extract": {...}` JSON object rendered into BOTH sidecars.
    pub fn json_object(&self) -> String {
        format!(
            "{{ \"read\": {}, \"call\": {} }}",
            self.read.json_value(),
            self.call.json_value()
        )
    }
}

/// The authored declaration for a source file, if any. `@route { extract }`
/// and `$extract` are the same declaration in two positions; C484 (raised at
/// the `compile_full` boundary) guarantees at most one is present, so the
/// route position winning here is a determinism backstop, not a precedence.
pub fn declared_extract(source: &AihuSource) -> Option<ExtractDecl> {
    if let Some(decl) = source.route.as_ref().and_then(|r| r.extract.as_ref()) {
        return Some(decl.clone());
    }
    state_extract_decl(source)
}

/// The `$extract` declaration from `@state`, if the script parses and carries
/// one. A script that fails to parse yields `None` — `compile_full` surfaces
/// the hard parse error first, so nothing downstream acts on the `None`.
pub fn state_extract_decl(source: &AihuSource) -> Option<ExtractDecl> {
    let script = source.script?;
    let macros = crate::parser::state_macros::parse_state_macros(script).ok()?;
    macros.iter().find_map(|m| match m {
        StateMacro::Extract { decl } => Some(decl.clone()),
        _ => None,
    })
}

/// The component-level `$scope` value from the `@agent` block, if declared.
/// This is the SURFACE-level scope (policy for the whole component), the
/// input to the fail-closed `component-$scope → read` derivation.
pub fn component_scope(source: &AihuSource) -> Option<String> {
    use crate::types::AgentMacroDecl;
    source.agent.as_ref().and_then(|agent| {
        agent.agent_macros.iter().find_map(|m| match m {
            AgentMacroDecl::Scope(v) => Some(v.clone()),
            _ => None,
        })
    })
}

/// Resolve the effective policy for a source file (spec §2.3 + §9):
///
/// * `read`: explicit declaration wins; else a component-level `$scope: 'x'`
///   derives the fail-closed `{ scope: 'x' }` (unless it is a reserved
///   `@human`/`@verified` class-scope, which maps to the matching enum value);
///   else the ratified default `'agents'`.
/// * `call`: explicit declaration wins; else the ratified default
///   `'anonymous'` (already per-member opt-in via `expose:` — not a loosening).
pub fn resolve_extract(source: &AihuSource) -> ResolvedExtract {
    let decl = declared_extract(source).unwrap_or_default();

    let (read, read_origin) = match decl.read {
        Some(r) => (r, ExtractOrigin::Declared),
        None => match component_scope(source) {
            Some(scope) => {
                let derived = match scope.as_str() {
                    // Reserved class-scopes map to the read axis's enum values
                    // (spec §2.3: on the read axis the same intents are the
                    // 'human' / 'verified' values).
                    "@human" => ExtractRead::Human,
                    "@verified" => ExtractRead::Verified,
                    _ => ExtractRead::Scope(scope),
                };
                (derived, ExtractOrigin::DerivedFromScope)
            }
            None => (ExtractRead::Agents, ExtractOrigin::Default),
        },
    };

    let (call, call_origin) = match decl.call {
        Some(c) => (c, ExtractOrigin::Declared),
        None => (ExtractCall::Anonymous, ExtractOrigin::Default),
    };

    ResolvedExtract { read, call, read_origin, call_origin }
}

// ─── Tiny scanner helpers (local so this module is dependency-free) ──────────
//
// `pub(crate)` since GX Phase 4: the sibling `data:` declaration parser
// (`data.rs`) shares these exact scanners so the two GX value grammars cannot
// drift on whitespace/quoting semantics.

pub(crate) fn strip_outer_braces(literal: &str) -> Option<&str> {
    let t = literal.trim();
    let inner = t.strip_prefix('{')?.strip_suffix('}')?;
    Some(inner)
}

pub(crate) fn skip_ws(bytes: &[u8], i: &mut usize) {
    while *i < bytes.len() && matches!(bytes[*i], b' ' | b'\t' | b'\n' | b'\r') {
        *i += 1;
    }
}

pub(crate) fn skip_ws_and_commas(bytes: &[u8], i: &mut usize) {
    while *i < bytes.len() && matches!(bytes[*i], b' ' | b'\t' | b'\n' | b'\r' | b',') {
        *i += 1;
    }
}

pub(crate) fn parse_ident(text: &str, bytes: &[u8], i: &mut usize) -> Option<String> {
    let start = *i;
    while *i < bytes.len() && (bytes[*i].is_ascii_alphanumeric() || bytes[*i] == b'_') {
        *i += 1;
    }
    if *i == start {
        return None;
    }
    Some(text[start..*i].to_string())
}

/// Parse a single- or double-quoted string value at `*i`; advances past the
/// closing quote. Returns `None` when the value is not quoted.
pub(crate) fn parse_quoted_word(text: &str, bytes: &[u8], i: &mut usize) -> Option<String> {
    if *i >= bytes.len() {
        return None;
    }
    let quote = bytes[*i];
    if quote != b'\'' && quote != b'"' {
        return None;
    }
    let start = *i + 1;
    let mut j = start;
    while j < bytes.len() && bytes[j] != quote {
        j += 1;
    }
    if j >= bytes.len() {
        return None;
    }
    *i = j + 1;
    Some(text[start..j].to_string())
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ─── parse: the value shapes ────────────────────────────────────────────

    #[test]
    fn parse_both_axes_enum_values() {
        let d = parse_extract_literal("{ read: 'agents', call: 'anonymous' }", 1).unwrap();
        assert_eq!(d.read, Some(ExtractRead::Agents));
        assert_eq!(d.call, Some(ExtractCall::Anonymous));
    }

    #[test]
    fn parse_every_read_enum_word() {
        for (word, expected) in [
            ("all", ExtractRead::All),
            ("agents", ExtractRead::Agents),
            ("search", ExtractRead::Search),
            ("none", ExtractRead::None),
            ("verified", ExtractRead::Verified),
            ("human", ExtractRead::Human),
        ] {
            let d = parse_extract_literal(&format!("{{ read: '{}' }}", word), 1).unwrap();
            assert_eq!(d.read, Some(expected), "read: '{}'", word);
        }
    }

    #[test]
    fn parse_every_call_enum_word() {
        for (word, expected) in [
            ("none", ExtractCall::None),
            ("anonymous", ExtractCall::Anonymous),
            ("verified", ExtractCall::Verified),
        ] {
            let d = parse_extract_literal(&format!("{{ call: '{}' }}", word), 1).unwrap();
            assert_eq!(d.call, Some(expected), "call: '{}'", word);
        }
    }

    #[test]
    fn parse_scope_shape_on_both_axes() {
        let d = parse_extract_literal(
            "{ read: { scope: 'reports:read' }, call: { scope: 'reports:read' } }",
            1,
        )
        .unwrap();
        assert_eq!(d.read, Some(ExtractRead::Scope("reports:read".to_string())));
        assert_eq!(d.call, Some(ExtractCall::Scope("reports:read".to_string())));
    }

    #[test]
    fn parse_partial_declaration_one_axis() {
        let d = parse_extract_literal("{ read: 'human' }", 1).unwrap();
        assert_eq!(d.read, Some(ExtractRead::Human));
        assert_eq!(d.call, None);
    }

    #[test]
    fn parse_empty_object_is_both_axes_unset() {
        let d = parse_extract_literal("{}", 1).unwrap();
        assert_eq!(d, ExtractDecl::default());
    }

    #[test]
    fn parse_double_quotes_and_multiline() {
        let d = parse_extract_literal("{\n  read: \"search\",\n  call: \"verified\",\n}", 7).unwrap();
        assert_eq!(d.read, Some(ExtractRead::Search));
        assert_eq!(d.call, Some(ExtractCall::Verified));
    }

    // ─── parse: C483 malformed values ───────────────────────────────────────

    #[test]
    fn c483_unknown_read_word() {
        let e = parse_extract_literal("{ read: 'everyone' }", 3).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C483"));
        assert_eq!(e.line, 3);
    }

    #[test]
    fn c483_unknown_call_word() {
        // 'agents' is a READ-axis word — not valid on `call:`.
        let e = parse_extract_literal("{ call: 'agents' }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C483"));
    }

    #[test]
    fn c483_unquoted_value() {
        let e = parse_extract_literal("{ read: agents }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C483"));
    }

    #[test]
    fn c483_unknown_key() {
        let e = parse_extract_literal("{ crawl: 'agents' }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C483"));
        assert!(e.message.contains("unknown key"));
    }

    #[test]
    fn c483_empty_scope_name_not_c482() {
        // Design A's C482 ("gated without a scope") is unrepresentable: an
        // empty scope NAME is a malformed VALUE (C483), not a policy state.
        let e = parse_extract_literal("{ read: { scope: '' } }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C483"));
    }

    #[test]
    fn c483_scope_object_with_wrong_key() {
        let e = parse_extract_literal("{ read: { level: 'x' } }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C483"));
    }

    #[test]
    fn c483_scope_name_with_whitespace() {
        let e = parse_extract_literal("{ call: { scope: 'a b' } }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C483"));
    }

    #[test]
    fn c483_reserved_class_scope_in_extract_value() {
        let e = parse_extract_literal("{ read: { scope: '@human' } }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C483"));
        assert!(e.message.contains("reserved"));
    }

    #[test]
    fn c484_duplicate_axis_key() {
        let e = parse_extract_literal("{ read: 'all', read: 'none' }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C484"));
    }

    // ─── resolution: declaration → derivation → default ─────────────────────

    fn src(script: Option<&'static str>) -> AihuSource<'static> {
        AihuSource {
            script,
            script_line: 0,
            template: None,
            template_line: 0,
            style: None,
            meta: crate::types::ScriptMeta { name: None },
            agent: None,
            route: None,
            stream: None,
            sfc_meta: None,
        }
    }

    #[test]
    fn resolve_default_posture_when_nothing_declared() {
        let r = resolve_extract(&src(None));
        assert_eq!(r.read, ExtractRead::Agents);
        assert_eq!(r.call, ExtractCall::Anonymous);
        assert_eq!(r.read_origin, ExtractOrigin::Default);
        assert_eq!(r.call_origin, ExtractOrigin::Default);
    }

    #[test]
    fn resolve_component_scope_derives_fail_closed_read() {
        use crate::types::{AgentBlock, AgentMacroDecl};
        let mut s = src(None);
        s.agent = Some(AgentBlock {
            agent_macros: vec![AgentMacroDecl::Scope("reports:read".to_string())],
            ..Default::default()
        });
        let r = resolve_extract(&s);
        assert_eq!(r.read, ExtractRead::Scope("reports:read".to_string()));
        assert_eq!(r.read_origin, ExtractOrigin::DerivedFromScope);
        // The call axis does NOT derive from component $scope — member $scope
        // gates calls at the member level already; the default stands.
        assert_eq!(r.call, ExtractCall::Anonymous);
        assert_eq!(r.call_origin, ExtractOrigin::Default);
    }

    #[test]
    fn resolve_reserved_class_scope_derives_enum_read() {
        use crate::types::{AgentBlock, AgentMacroDecl};
        let mut s = src(None);
        s.agent = Some(AgentBlock {
            agent_macros: vec![AgentMacroDecl::Scope("@human".to_string())],
            ..Default::default()
        });
        let r = resolve_extract(&s);
        assert_eq!(r.read, ExtractRead::Human);
        assert_eq!(r.read_origin, ExtractOrigin::DerivedFromScope);
    }

    #[test]
    fn resolve_explicit_read_wins_over_scope_derivation() {
        use crate::types::{AgentBlock, AgentMacroDecl, RouteBlock};
        let mut s = src(None);
        s.agent = Some(AgentBlock {
            agent_macros: vec![AgentMacroDecl::Scope("x".to_string())],
            ..Default::default()
        });
        s.route = Some(RouteBlock {
            extract: Some(ExtractDecl { read: Some(ExtractRead::Agents), call: None }),
            ..Default::default()
        });
        let r = resolve_extract(&s);
        assert_eq!(r.read, ExtractRead::Agents);
        assert_eq!(r.read_origin, ExtractOrigin::Declared);
    }

    #[test]
    fn resolve_state_extract_position() {
        let s = src(Some("$extract: { read: 'verified', call: 'verified' }\nlet balance = 0"));
        let r = resolve_extract(&s);
        assert_eq!(r.read, ExtractRead::Verified);
        assert_eq!(r.call, ExtractCall::Verified);
    }

    // ─── rendering: the canonical forms all three artifacts share ───────────

    #[test]
    fn marker_and_json_render_enum_and_scope_shapes() {
        let r = ResolvedExtract {
            read: ExtractRead::Scope("reports:read".to_string()),
            call: ExtractCall::Anonymous,
            read_origin: ExtractOrigin::Declared,
            call_origin: ExtractOrigin::Default,
        };
        assert_eq!(r.marker_line(), "// @aihu:extract read=scope:reports:read call=anonymous");
        assert_eq!(
            r.json_object(),
            "{ \"read\": { \"scope\": \"reports:read\" }, \"call\": \"anonymous\" }"
        );
    }
}
