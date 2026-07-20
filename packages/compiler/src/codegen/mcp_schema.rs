//! DE5 — derive an MCP `inputSchema` fragment from a `$action` handler signature.
//!
//! The agent surface must be **Derived** (thesis §2): the schema an LLM reads
//! to call a tool comes from the SAME authored handler signature the compiler
//! already parses, never a hand-maintained second declaration. Before this,
//! every action tool shipped `inputSchema: { properties: { args: { type:
//! 'array' } } }` — no arity, no names, no types, so the model had to guess.
//!
//! This module turns a parsed [`HandlerParam`] list (from
//! [`crate::expr::handler_params`], the shared CO1 parse) into the `params`
//! fragment emitted into `ActionSchema`:
//!
//! ```text
//! { properties: { <name>: <json-schema>, … }, required: [ '<name>', … ] }
//! ```
//!
//! `@aihu/agent-server`'s `buildToolDefinitions` lifts that straight into the
//! MCP `inputSchema`. The RUNTIME still dispatches positionally (the action is
//! `(args) => name(args)`); the server marshals the named arguments back into
//! declared order, so only the SCHEMA changes, not the calling convention.
//!
//! ## Type mapping (TS annotation → JSON Schema)
//!
//! | TS annotation                     | JSON Schema fragment                       |
//! |-----------------------------------|--------------------------------------------|
//! | `string`                          | `{ type: 'string' }`                       |
//! | `number`                          | `{ type: 'number' }`                       |
//! | `boolean`                         | `{ type: 'boolean' }`                      |
//! | `string[]` / `Array<string>`      | `{ type: 'array', items: { type: 'string' } }` |
//! | `number[]` / `boolean[]` (idem)   | typed-item array                           |
//! | any other `T[]` / `Array<T>`      | `{ type: 'array' }`  (items degraded)      |
//! | `object`                          | `{ type: 'object' }`                       |
//! | *(no annotation)*                 | `{}`  (permissive — nothing to assert)     |
//! | union / literal-union / generic / imported / `Record<…>` / anything else | `{}`  (**degraded — never guess a shape**) |
//!
//! Degradation is deliberate and one-directional: an unmappable annotation
//! yields a permissive schema, never an invented shape. A rest param collects a
//! variadic tail, so it is `{ type: 'array' }` and never `required`. If a
//! parameter cannot be NAMED at all (a destructuring pattern), the whole action
//! degrades to the legacy positional `args` schema ([`param_schema_json`]
//! returns `None`) rather than inventing property names.

use crate::expr::HandlerParam;

/// Map a verbatim TS type annotation to a JSON-Schema fragment, rendered as a
/// JS object-literal string.
///
/// Returns the permissive `{}` for a missing annotation or any type not
/// trivially mappable (union, generic, imported, literal-union, …). It NEVER
/// guesses a shape — an unmappable annotation degrades, it does not fabricate.
pub fn ts_type_to_json_schema(type_text: Option<&str>) -> String {
    let Some(raw) = type_text else {
        // No annotation: nothing to assert. Permissive, not invented.
        return "{}".to_string();
    };
    let t = raw.trim();
    match t {
        "string" => "{ type: 'string' }".to_string(),
        "number" => "{ type: 'number' }".to_string(),
        "boolean" => "{ type: 'boolean' }".to_string(),
        "object" => "{ type: 'object' }".to_string(),
        _ => {
            if let Some(inner) = array_element_type(t) {
                match inner {
                    "string" | "number" | "boolean" => {
                        format!("{{ type: 'array', items: {{ type: '{inner}' }} }}")
                    }
                    // A known array whose element type is not trivially
                    // mappable: assert the array, degrade the items.
                    _ => "{ type: 'array' }".to_string(),
                }
            } else {
                // union (`a | b`), generic (`Foo<T>`), imported/named type,
                // `Record<…>`, literal-union — degrade. Do NOT guess.
                "{}".to_string()
            }
        }
    }
}

/// The element type of a trivially-recognizable array annotation, or `None`.
///
/// Recognizes the two surface spellings authors use: `T[]` and `Array<T>`
/// (also `ReadonlyArray<T>`). Anything with a `|` is a union and is rejected
/// here so it degrades in the caller rather than being mistaken for an array.
fn array_element_type(t: &str) -> Option<&str> {
    if t.contains('|') {
        return None;
    }
    if let Some(inner) = t.strip_suffix("[]") {
        return Some(inner.trim());
    }
    for prefix in ["Array<", "ReadonlyArray<"] {
        if let Some(rest) = t.strip_prefix(prefix) {
            if let Some(inner) = rest.strip_suffix('>') {
                return Some(inner.trim());
            }
        }
    }
    None
}

/// Build the `params` object-literal fragment for one action's handler
/// signature, or `None` when the action must degrade to the legacy positional
/// `args` schema.
///
/// `None` is returned when any parameter cannot be NAMED (a destructuring
/// pattern): a named-property schema cannot describe it without inventing a
/// name, which the Derived property forbids. The caller then omits `params`,
/// and `@aihu/agent-server` falls back to the legacy `args: { type: 'array' }`
/// shape for that tool — the runtime dispatch is unchanged either way.
///
/// A parameter is `required` unless it is optional (`x?`), defaulted (`x = …`),
/// or a rest param.
pub fn param_schema_json(params: &[HandlerParam]) -> Option<String> {
    let mut props: Vec<String> = Vec::new();
    let mut required: Vec<String> = Vec::new();

    for p in params {
        // Cannot name a destructuring pattern → degrade the whole action.
        let name = p.name.as_deref()?;

        let schema = if p.rest {
            // A rest param collects a variadic tail: an array, never required,
            // element type unknown from the signature alone.
            "{ type: 'array' }".to_string()
        } else {
            ts_type_to_json_schema(p.type_text.as_deref())
        };
        props.push(format!("{name}: {schema}"));

        if !p.optional && !p.has_default && !p.rest {
            required.push(format!("'{name}'"));
        }
    }

    Some(format!(
        "{{ properties: {{ {} }}, required: [{}] }}",
        props.join(", "),
        required.join(", ")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn param(name: &str, ty: Option<&str>, optional: bool, has_default: bool) -> HandlerParam {
        HandlerParam {
            name: Some(name.to_string()),
            type_text: ty.map(str::to_string),
            optional,
            has_default,
            rest: false,
        }
    }

    // ─── Type mapping ────────────────────────────────────────────────────────

    #[test]
    fn primitive_types_map_to_json_schema() {
        assert_eq!(ts_type_to_json_schema(Some("string")), "{ type: 'string' }");
        assert_eq!(ts_type_to_json_schema(Some("number")), "{ type: 'number' }");
        assert_eq!(ts_type_to_json_schema(Some("boolean")), "{ type: 'boolean' }");
        assert_eq!(ts_type_to_json_schema(Some("object")), "{ type: 'object' }");
        // Whitespace around the annotation is tolerated.
        assert_eq!(ts_type_to_json_schema(Some("  number ")), "{ type: 'number' }");
    }

    #[test]
    fn primitive_arrays_map_to_typed_item_arrays() {
        assert_eq!(
            ts_type_to_json_schema(Some("string[]")),
            "{ type: 'array', items: { type: 'string' } }"
        );
        assert_eq!(
            ts_type_to_json_schema(Some("Array<number>")),
            "{ type: 'array', items: { type: 'number' } }"
        );
        assert_eq!(
            ts_type_to_json_schema(Some("ReadonlyArray<boolean>")),
            "{ type: 'array', items: { type: 'boolean' } }"
        );
    }

    #[test]
    fn non_primitive_array_keeps_array_but_degrades_items() {
        // The array-ness is known; the element type is not trivially mappable.
        assert_eq!(ts_type_to_json_schema(Some("Foo[]")), "{ type: 'array' }");
        assert_eq!(ts_type_to_json_schema(Some("Array<Widget>")), "{ type: 'array' }");
    }

    #[test]
    fn no_annotation_degrades_to_permissive_empty() {
        // (c) — the permissive side. Nothing to assert, so `{}`, not a guess.
        assert_eq!(ts_type_to_json_schema(None), "{}");
    }

    #[test]
    fn non_mappable_types_degrade_and_do_not_invent_a_shape() {
        // (c) — the bidirectional guarantee. Each of these degrades to the
        // permissive `{}`; none is mistaken for a concrete shape.
        for ty in [
            "'all' | 'active' | 'completed'", // literal union
            "string | number",               // primitive union
            "Foo",                            // imported / named type
            "Map<string, number>",           // generic
            "Record<string, unknown>",        // record
            "{ x: number }",                  // inline object type
            "() => void",                     // function type
        ] {
            assert_eq!(
                ts_type_to_json_schema(Some(ty)),
                "{}",
                "`{ty}` must degrade to permissive, never invent a shape"
            );
        }
    }

    // ─── Full signature → params fragment ────────────────────────────────────

    #[test]
    fn required_typed_params_emit_named_properties_both_required() {
        // (a) — `(id: string, count: number)` → named, typed, both required.
        let params = vec![
            param("id", Some("string"), false, false),
            param("count", Some("number"), false, false),
        ];
        let out = param_schema_json(&params).unwrap();
        assert_eq!(
            out,
            "{ properties: { id: { type: 'string' }, count: { type: 'number' } }, \
             required: ['id', 'count'] }"
        );
        // The `args: { type: 'array' }` shape is gone: real names, real types.
        assert!(out.contains("id: { type: 'string' }"));
        assert!(out.contains("count: { type: 'number' }"));
        assert!(out.contains("required: ['id', 'count']"));
        assert!(!out.contains("args"));
    }

    #[test]
    fn optional_param_is_not_required() {
        // (b) — `(x?: string)` is a named property but NOT in `required`.
        let params = vec![param("x", Some("string"), true, false)];
        let out = param_schema_json(&params).unwrap();
        assert_eq!(
            out,
            "{ properties: { x: { type: 'string' } }, required: [] }"
        );
        assert!(out.contains("x: { type: 'string' }"));
        assert!(out.contains("required: []"), "optional param must not be required");
    }

    #[test]
    fn defaulted_param_is_optional_but_still_typed() {
        // A default value makes a param optional in practice.
        let params = vec![
            param("a", Some("number"), false, false),
            param("b", Some("string"), false, true),
        ];
        let out = param_schema_json(&params).unwrap();
        assert!(out.contains("a: { type: 'number' }"));
        assert!(out.contains("b: { type: 'string' }"));
        assert!(out.contains("required: ['a']"), "defaulted `b` must not be required");
    }

    #[test]
    fn non_mappable_param_type_degrades_within_a_full_signature() {
        // (c) in context — a required union-typed param keeps its name and stays
        // required, but its schema is the permissive `{}`, not an invented enum.
        let params = vec![param("filter", Some("'all' | 'done'"), false, false)];
        let out = param_schema_json(&params).unwrap();
        assert_eq!(out, "{ properties: { filter: {} }, required: ['filter'] }");
    }

    #[test]
    fn rest_param_is_a_non_required_array() {
        let params = vec![HandlerParam {
            name: Some("rest".to_string()),
            type_text: None,
            optional: false,
            has_default: false,
            rest: true,
        }];
        let out = param_schema_json(&params).unwrap();
        assert_eq!(
            out,
            "{ properties: { rest: { type: 'array' } }, required: [] }"
        );
    }

    #[test]
    fn zero_arg_handler_emits_an_empty_but_present_schema() {
        // A derived empty schema, not a phantom `args` field.
        assert_eq!(
            param_schema_json(&[]).unwrap(),
            "{ properties: {  }, required: [] }"
        );
    }

    #[test]
    fn unnameable_param_degrades_whole_action_to_legacy() {
        // A destructuring pattern has no name; rather than invent one, the whole
        // action degrades (None) → agent-server keeps the legacy `args` schema.
        let params = vec![HandlerParam {
            name: None,
            type_text: None,
            optional: false,
            has_default: false,
            rest: false,
        }];
        assert!(param_schema_json(&params).is_none());
    }
}
