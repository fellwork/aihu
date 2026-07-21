//! GX Phase 4 (#466) — the `@route { data: ... }` governed-resource
//! declaration (spec: `docs/plans/governed-extractability/70-governed-data-access.md`
//! §2.1, §4.5, §5).
//!
//! This module is the ONE implementation of the `data:` value-shape parser,
//! shared by BOTH authoring-position parsers — the production `@route` body
//! parser (`parser/sfc.rs`) and the unit-test parser (`parser/route.rs`) — the
//! same two-position seam `extract:` rides (`extract.rs`), so the positions
//! cannot drift. The scanners themselves are the `extract.rs` ones
//! (`pub(crate)` re-use), so quoting/whitespace semantics are shared too.
//!
//! What the compiler does with a parsed [`DataDecl`]:
//!
//! 1. **Fan-out** — the declaration rides the `.route.json` sidecar beside
//!    `extract` (`emit_route_json`); the server runtime's registry boot
//!    validation and generated loader key off that artifact (spec §2.3, §3).
//! 2. **Type generation (§4.5)** — the type-check sidecar types the route's
//!    `route` prop so `route.data : Entitled<T> | Withheld<T>` (discriminated
//!    on `$gx.entitled`), making unguarded `route.data` field access a type
//!    error (G7g). See `emit_sidecar_ts` in `codegen/emit.rs`.
//!
//! Diagnostics owned here:
//!
//! * **C485** — malformed `data:` declaration shape (the `data:` mirror of
//!   `extract:`'s C483). A governed-resource declaration must never fail open,
//!   so every malformed shape is a hard error.
//! * **C487** — the reserved `$gx` discriminant namespace (spec §4.5): a
//!   `preview:` field or `type:` name carrying `$gx`, or (checked at the
//!   `compile_full` boundary, `lib.rs`) a governed route whose declared
//!   `route` prop type carries its own `$gx` member.
//!
//! NOT owned here — the sibling-file diagnostics the Rust compiler cannot see:
//!
//! * **C486** (spec §4.7) — `data:` AND a sibling `.loader.ts` on one route is
//!   a build ERROR ("one data source per route"). Sibling files are only
//!   visible to the router Vite integration (`@aihu/router`'s pages scan is
//!   where `*.loader.ts` siblings are discovered), so the conflict check lives
//!   there. SEAM (Phase-4 integration): the router layer reads the `data`
//!   member this compiler fans into `.route.json` / `--route-json` and refuses
//!   the build when the matched page also has a sibling loader module.
//! * **W482** (spec §4.7 "W48x") — a plain sibling `defineLoader` on a route
//!   whose resolved `extract.read` is hard-tier: advisory that the loader's
//!   output is NOT governed by the generated-loader pipeline (only the coarse
//!   T4 route-level fallback applies). Same sibling-visibility constraint,
//!   same Vite-layer seam, keyed off `.route.json`'s `extract` + absent `data`.

use crate::extract::{parse_ident, parse_quoted_word, skip_ws, skip_ws_and_commas, strip_outer_braces};
use crate::types::{CompileError, DataDecl};

// ─── Value-shape parsing (C485/C487) ─────────────────────────────────────────

/// Parse a `data` object literal — outer braces included, e.g.
/// `{ type: 'LexiconEntry', preview: ['headword'] }` — into a [`DataDecl`].
///
/// Accepted shape (spec §2.1, one canonical shape):
///
/// * `type:` — REQUIRED; a quoted, non-empty, whitespace-free resource-type
///   name (the provider key the server registry binds by name equality, §4.1).
/// * `preview:` — optional; an array of quoted, non-empty, whitespace-free
///   field names renderable in the locked/withheld state (§4.5).
///
/// Unknown keys, unquoted values, duplicate keys, an empty/whitespace name,
/// and a missing `type:` are all C485. Any `$gx`-carrying name is C487 — the
/// discriminant namespace is reserved for the generated emission shape.
pub fn parse_data_literal(literal: &str, line: usize) -> Result<DataDecl, CompileError> {
    let inner = strip_outer_braces(literal.trim()).ok_or_else(|| {
        c485(line, "the value must be an object literal `{ type: '<Name>', preview: [...] }`")
    })?;

    let mut type_name: Option<String> = None;
    let mut preview: Option<Vec<String>> = None;
    let bytes = inner.as_bytes();
    let mut i = 0usize;

    while i < bytes.len() {
        skip_ws_and_commas(bytes, &mut i);
        if i >= bytes.len() {
            break;
        }
        let key = parse_ident(inner, bytes, &mut i)
            .ok_or_else(|| c485(line, "expected an identifier key (`type` or `preview`)"))?;
        skip_ws(bytes, &mut i);
        if i >= bytes.len() || bytes[i] != b':' {
            return Err(c485(line, &format!("key `{}` is missing its `:` value", key)));
        }
        i += 1;
        skip_ws(bytes, &mut i);

        match key.as_str() {
            "type" => {
                if type_name.is_some() {
                    return Err(c485(line, "duplicate `type:` key in one `data` value"));
                }
                let name = parse_quoted_word(inner, bytes, &mut i).ok_or_else(|| {
                    c485(
                        line,
                        "`type:` must be a quoted resource-type name, e.g. type: 'LexiconEntry'",
                    )
                })?;
                validate_name(&name, "type", line)?;
                type_name = Some(name);
            }
            "preview" => {
                if preview.is_some() {
                    return Err(c485(line, "duplicate `preview:` key in one `data` value"));
                }
                preview = Some(parse_preview_array(inner, bytes, &mut i, line)?);
            }
            other => {
                return Err(c485(
                    line,
                    &format!(
                        "unknown key `{}` — the declaration has exactly two keys, `type` (the governed resource type, required) and `preview` (locked-state fields, optional)",
                        other
                    ),
                ));
            }
        }
    }

    let type_name = type_name
        .ok_or_else(|| c485(line, "`type:` is required — a governed route names its resource type"))?;

    Ok(DataDecl { type_name, preview: preview.unwrap_or_default() })
}

/// Parse the `preview:` value — an array literal of quoted field names,
/// e.g. `['headword', 'pos']`. An empty array is legal (same as omitting).
fn parse_preview_array(
    text: &str,
    bytes: &[u8],
    i: &mut usize,
    line: usize,
) -> Result<Vec<String>, CompileError> {
    if *i >= bytes.len() || bytes[*i] != b'[' {
        return Err(c485(
            line,
            "`preview:` must be an array of quoted field names, e.g. preview: ['headword']",
        ));
    }
    *i += 1;
    let mut fields: Vec<String> = Vec::new();
    loop {
        skip_ws_and_commas(bytes, i);
        if *i >= bytes.len() {
            return Err(c485(line, "`preview:` array is missing its closing `]`"));
        }
        if bytes[*i] == b']' {
            *i += 1;
            break;
        }
        let field = parse_quoted_word(text, bytes, i).ok_or_else(|| {
            c485(line, "`preview:` entries must be quoted field names, e.g. ['headword']")
        })?;
        validate_name(&field, "preview field", line)?;
        if fields.contains(&field) {
            return Err(c485(line, &format!("duplicate preview field '{}'", field)));
        }
        fields.push(field);
    }
    Ok(fields)
}

/// A resource-type or preview-field NAME must be non-empty, single-token (no
/// whitespace — it is rendered into `.route.json` and generated TS type keys),
/// and must not touch the reserved `$gx` discriminant namespace (C487).
fn validate_name(name: &str, what: &str, line: usize) -> Result<(), CompileError> {
    if name.is_empty() {
        return Err(c485(line, &format!("{} name is empty", what)));
    }
    if name.chars().any(|c| c.is_whitespace()) {
        return Err(c485(line, &format!("{} name '{}' must not contain whitespace", what, name)));
    }
    if name.contains("$gx") {
        return Err(c487(
            line,
            &format!("{} name '{}' uses the reserved `$gx` namespace", what, name),
        ));
    }
    // Names are spliced into JSON string literals verbatim; refuse the two
    // characters that could escape the literal rather than escaping them —
    // neither belongs in a type or field name.
    if name.contains('"') || name.contains('\\') {
        return Err(c485(
            line,
            &format!("{} name '{}' must not contain quotes or backslashes", what, name),
        ));
    }
    Ok(())
}

pub(crate) fn c485(line: usize, detail: &str) -> CompileError {
    CompileError {
        message: format!("C485: malformed `data:` declaration — {}", detail),
        line,
        col: 0,
        code: Some("C485".to_string()),
        hint: Some(
            "a governed route declares its resource in one shape: `data: { type: '<Name>', \
             preview: ['<field>', ...] }` — `type` names the server registry's provider key \
             (required), `preview` the fields renderable in the locked state (optional)"
                .to_string(),
        ),
        fix: Some("data: { type: 'LexiconEntry', preview: ['headword'] }".to_string()),
        ..Default::default()
    }
}

pub(crate) fn c487(line: usize, detail: &str) -> CompileError {
    CompileError {
        message: format!(
            "C487: `$gx` is the reserved governed-emission discriminant namespace — {}",
            detail
        ),
        line,
        col: 0,
        code: Some("C487".to_string()),
        hint: Some(
            "the framework generates the `$gx` member of `route.data` (`{ entitled, reason }`, \
             spec §4.5) from the `data:` declaration; a declared type carrying its own `$gx` \
             field would collide with the generated discriminant"
                .to_string(),
        ),
        ..Default::default()
    }
}

// ─── Rendering — the canonical forms the artifacts share ─────────────────────

impl DataDecl {
    /// The `"data": {...}` JSON object rendered into the `.route.json`
    /// sidecar (beside `extract` — spec §5 "same three-artifact machinery").
    /// `preview` is omitted entirely when no fields are declared, so a
    /// preview-less declaration adds no phantom member for consumers to
    /// interpret.
    pub fn json_object(&self) -> String {
        if self.preview.is_empty() {
            format!("{{ \"type\": \"{}\" }}", self.type_name)
        } else {
            let fields: Vec<String> =
                self.preview.iter().map(|f| format!("\"{}\"", f)).collect();
            format!(
                "{{ \"type\": \"{}\", \"preview\": [{}] }}",
                self.type_name,
                fields.join(", ")
            )
        }
    }

    /// The declared preview fields as a TS key-union type (`'headword' | 'pos'`),
    /// or `never` when no preview fields are declared. Spliced into the
    /// generated `Withheld<T>` sidecar types (spec §4.5) — the withheld shape
    /// carries NO key of `T` beyond this set.
    pub fn preview_keys_ts(&self) -> String {
        if self.preview.is_empty() {
            "never".to_string()
        } else {
            self.preview
                .iter()
                .map(|f| format!("'{}'", f))
                .collect::<Vec<_>>()
                .join(" | ")
        }
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ─── parse: the value shapes ────────────────────────────────────────────

    #[test]
    fn parse_type_and_preview() {
        let d = parse_data_literal("{ type: 'LexiconEntry', preview: ['headword'] }", 1).unwrap();
        assert_eq!(d.type_name, "LexiconEntry");
        assert_eq!(d.preview, vec!["headword".to_string()]);
    }

    #[test]
    fn parse_type_only_preview_defaults_empty() {
        let d = parse_data_literal("{ type: 'Report' }", 1).unwrap();
        assert_eq!(d.type_name, "Report");
        assert!(d.preview.is_empty());
    }

    #[test]
    fn parse_multi_field_preview_and_double_quotes_multiline() {
        let d = parse_data_literal(
            "{\n  type: \"LexiconEntry\",\n  preview: [\"headword\", \"pos\"],\n}",
            7,
        )
        .unwrap();
        assert_eq!(d.type_name, "LexiconEntry");
        assert_eq!(d.preview, vec!["headword".to_string(), "pos".to_string()]);
    }

    #[test]
    fn parse_empty_preview_array_is_legal() {
        let d = parse_data_literal("{ type: 'X', preview: [] }", 1).unwrap();
        assert!(d.preview.is_empty());
    }

    // ─── parse: C485 malformed shapes ───────────────────────────────────────

    #[test]
    fn c485_missing_type() {
        let e = parse_data_literal("{ preview: ['headword'] }", 3).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C485"));
        assert_eq!(e.line, 3);
        assert!(e.message.contains("`type:` is required"));
        assert!(e.fix.is_some(), "C485 carries a fix: like the extract C483 pattern");
    }

    #[test]
    fn c485_not_an_object() {
        let e = parse_data_literal("'LexiconEntry'", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C485"));
    }

    #[test]
    fn c485_unknown_key() {
        let e = parse_data_literal("{ type: 'X', types: 'Y' }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C485"));
        assert!(e.message.contains("unknown key"));
    }

    #[test]
    fn c485_unquoted_type() {
        let e = parse_data_literal("{ type: LexiconEntry }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C485"));
    }

    #[test]
    fn c485_duplicate_type_key() {
        let e = parse_data_literal("{ type: 'A', type: 'B' }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C485"));
        assert!(e.message.contains("duplicate"));
    }

    #[test]
    fn c485_empty_type_name() {
        let e = parse_data_literal("{ type: '' }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C485"));
    }

    #[test]
    fn c485_type_name_with_whitespace() {
        let e = parse_data_literal("{ type: 'Lexicon Entry' }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C485"));
    }

    #[test]
    fn c485_preview_not_an_array() {
        let e = parse_data_literal("{ type: 'X', preview: 'headword' }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C485"));
    }

    #[test]
    fn c485_preview_unclosed_array() {
        let e = parse_data_literal("{ type: 'X', preview: ['headword' }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C485"));
    }

    #[test]
    fn c485_preview_unquoted_entry() {
        let e = parse_data_literal("{ type: 'X', preview: [headword] }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C485"));
    }

    #[test]
    fn c485_duplicate_preview_field() {
        let e = parse_data_literal("{ type: 'X', preview: ['a', 'a'] }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C485"));
        assert!(e.message.contains("duplicate"));
    }

    // ─── parse: C487 — the reserved $gx namespace ───────────────────────────

    #[test]
    fn c487_gx_preview_field() {
        let e = parse_data_literal("{ type: 'X', preview: ['$gx'] }", 5).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C487"));
        assert_eq!(e.line, 5);
        assert!(e.message.contains("reserved"));
    }

    #[test]
    fn c487_gx_type_name() {
        let e = parse_data_literal("{ type: '$gxThing' }", 1).unwrap_err();
        assert_eq!(e.code.as_deref(), Some("C487"));
    }

    // ─── rendering: the canonical forms ─────────────────────────────────────

    #[test]
    fn json_object_with_and_without_preview() {
        let with = DataDecl {
            type_name: "LexiconEntry".to_string(),
            preview: vec!["headword".to_string(), "pos".to_string()],
        };
        assert_eq!(
            with.json_object(),
            "{ \"type\": \"LexiconEntry\", \"preview\": [\"headword\", \"pos\"] }"
        );
        let without = DataDecl { type_name: "Report".to_string(), preview: vec![] };
        assert_eq!(without.json_object(), "{ \"type\": \"Report\" }");
    }

    #[test]
    fn preview_keys_ts_union_and_never() {
        let with = DataDecl {
            type_name: "X".to_string(),
            preview: vec!["a".to_string(), "b".to_string()],
        };
        assert_eq!(with.preview_keys_ts(), "'a' | 'b'");
        let without = DataDecl { type_name: "X".to_string(), preview: vec![] };
        assert_eq!(without.preview_keys_ts(), "never");
    }
}
