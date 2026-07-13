/// v2 — `@state` macro declarations parser (object-literal collection-form).
///
/// Parses `$macro` declarations inside an `@state { }` block body and lowers
/// them to JS via `emit_state_macros`.
///
/// **The 6 changing macros** (`$prop`, `$computed`, `$action`, `$resource`,
/// `$effect`, `$lifecycle`) take the v2 collection-form: a single object
/// literal whose keys are entry names and whose values are either bare
/// function expressions (implicit handler/value/callback) or wrapped
/// metadata-bag object literals carrying `describe`, `expose`, `default`,
/// `type`, `value`, `handler`, `on`. v1 per-line forms (e.g. `$prop name:
/// Type`, `$action name(args) { body }`) are **rejected with C440** — the
/// migration codemod (`packages/compiler/codemods/macro-simplification/`)
/// upgrades v1 source to v2.
///
/// **Anonymous `$effect`** (§2.5) is `$effect: () => { body }` — the macro
/// keyword takes a single function directly, distinct from `$effect: { ... }`
/// (the named-collection form). Both shapes MAY coexist in a single `@state`
/// block (one anonymous + one named-collection); two anonymous forms is
/// rejected with C441.
///
/// **Preserved from v1 (out of v2 redesign scope):** `$watch`,
/// `$effect.on(...)`, `$route`, `$beforeNavigate`, `$afterNavigate`.

use crate::types::{AuthMacroKind, CollectionEntry, CollectionKind, CompileError, StateMacro};

/// Parse `$macro` declarations from the body of an `@state { }` block.
///
/// Returns a list of parsed `StateMacro` declarations (in order of appearance).
/// Lines that are not macro declarations are ignored (they remain as plain JS).
pub fn parse_state_macros(body: &str) -> Result<Vec<StateMacro>, CompileError> {
    let mut result = Vec::new();
    let bytes = body.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        let nl = body[i..].find('\n').map(|r| i + r).unwrap_or(body.len());
        let line = body[i..nl].trim();

        if let Some(rest) = line.strip_prefix('$') {
            // The trimmed `line` may have leading whitespace in the original
            // body (indented inside `@state { ... }`). `try_parse_macro`'s
            // offset math assumes `$` lives exactly at `line_offset`, so
            // skip past leading whitespace before computing the offset.
            let mut dollar_pos = i;
            while dollar_pos < nl
                && matches!(bytes[dollar_pos], b' ' | b'\t')
            {
                dollar_pos += 1;
            }
            if let Some((mac, advance_to)) = try_parse_macro(rest, body, dollar_pos)? {
                result.push(mac);
                if advance_to > i {
                    i = advance_to;
                    if i < body.len() && body.as_bytes()[i] == b'\n' {
                        i += 1;
                    }
                    continue;
                }
            }
        }

        i = nl + 1;
    }

    // Multiplicity check (spec §2.5): at most one anonymous `$effect: () => ...`
    // line per `@state` block. Multiple named-collection `$effect: { ... }`
    // entries inside the same collection block are forbidden by JS object-
    // literal syntax (duplicate keys), so this only need check the anonymous
    // form. Two anonymous-form lines collide → C441.
    let anon_count = result
        .iter()
        .filter(|m| matches!(m, StateMacro::EffectAnon { .. }))
        .count();
    if anon_count > 1 {
        return Err(CompileError {
            message: "C441: two anonymous `$effect: () => {...}` lines in the same `@state` block. \
                Replace all anonymous effects with the named-collection form: \
                `$effect: { effectName: () => { body }, otherEffect: () => { body } }`. \
                Example: `$effect: () => { a() }` + `$effect: () => { b() }` \
                → `$effect: { syncA: () => { a() }, syncB: () => { b() } }`"
                .to_string(),
            line: 0,
            col: 0,
            code: Some("C441".to_string()),
            from: Some("$effect: () => { ... } (multiple anonymous)".to_string()),
            to: Some("$effect: { <name1>: () => { ... }, <name2>: () => { ... } }".to_string()),
            ..Default::default()
        });
    }

    // Q4 (Director r6 §2.Q4): observedAttributes name-collision compile-time
    // check. After parsing every `$prop` collection, walk all entries and
    // compute the resolved attribute name (explicit `attribute:` override OR
    // auto-kebab-cased prop name). Two props that map to the same attribute
    // name → C446 with both prop names cited and the conflicting attribute
    // named in the diagnostic. `attribute: false` (property-only) participates
    // in NO collision because it's not in observedAttributes.
    if let Some(err) = check_prop_attribute_collisions(&result) {
        return Err(err);
    }

    Ok(result)
}

/// Q4 — detect prop-attribute name collisions across all `$prop` entries in
/// an `@state` block. Returns `Some(CompileError)` with code `C446` when two
/// props map to the same observed-attribute name; `None` when no collision.
///
/// Rules (Director r6 §2.Q4):
/// - `attribute: false` props are excluded (not observed).
/// - Explicit `attribute: 'name'` wins over the auto-kebab default.
/// - Two distinct prop names with the same explicit `attribute:` collide.
/// - Two distinct prop names that auto-kebab to the same attribute collide
///   (in practice rare since identifiers must be valid TS, but defensive).
/// - One explicit + one auto-kebab to the same attribute collide.
fn check_prop_attribute_collisions(macros: &[StateMacro]) -> Option<CompileError> {
    // Collect (prop_name, resolved_attr_name) for every `$prop` entry where
    // the attribute is observed (i.e. `attribute: false` is excluded).
    let mut by_attr: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    for mac in macros {
        let StateMacro::Collection { kind, entries } = mac else {
            continue;
        };
        if !matches!(kind, CollectionKind::Prop) {
            continue;
        }
        for entry in entries {
            // Resolve the attribute key. `attribute:` is in the metadata bag
            // (parse_meta_pairs strips outer quotes from the KEY but preserves
            // the raw VALUE text including any surrounding quotes).
            let attr_meta = entry
                .meta
                .iter()
                .find(|(k, _)| k == "attribute")
                .map(|(_, v)| v.trim());

            let resolved = match attr_meta {
                Some("false") => continue, // property-only, not observed
                Some(raw) => {
                    // Strip optional surrounding quotes ('foo', "foo").
                    let stripped = raw
                        .trim_matches(|c| c == '\'' || c == '"')
                        .to_string();
                    if stripped == "true" {
                        // attribute: true — fall through to auto-kebab.
                        kebab_case(&entry.name)
                    } else {
                        stripped
                    }
                }
                None => kebab_case(&entry.name),
            };
            by_attr
                .entry(resolved)
                .or_default()
                .push(entry.name.clone());
        }
    }
    for (attr, props) in &by_attr {
        if props.len() > 1 {
            // Stable order — first two collisions cited explicitly.
            let (a, b) = (&props[0], &props[1]);
            return Some(CompileError {
                message: format!(
                    "C446 — `$prop` attribute name collision: `{}` and `{}` both map to observed attribute `{}`",
                    a, b, attr
                ),
                line: 0,
                col: 0,
                code: Some("C446".to_string()),
                hint: Some(format!(
                    "specify `attribute:` explicitly on at least one to disambiguate (e.g. `{}: {{ attribute: 'data-{}' }}`)",
                    a, attr
                )),
                fix: Some(
                    "see docs/superpowers/specs/2026-05-06-spec-template-syntax-v2-platform-audit.md §3.6"
                        .to_string(),
                ),
                ..Default::default()
            });
        }
    }
    None
}

/// kebab-case a camelCase identifier (`myProp` → `my-prop`). Mirrors the
/// runtime-side `_kebab` in packages/runtime/src/define-component.ts so the
/// compile-time collision check uses the SAME mapping the runtime uses.
fn kebab_case(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 4);
    for (i, ch) in s.chars().enumerate() {
        if ch.is_ascii_uppercase() {
            if i == 0 {
                out.push(ch.to_ascii_lowercase());
            } else {
                out.push('-');
                out.push(ch.to_ascii_lowercase());
            }
        } else {
            out.push(ch);
        }
    }
    out
}

/// Try to parse a single macro declaration. `rest` is the line content
/// after the leading `$`; `full_body` and `line_offset` index into the
/// `@state` body so multi-line bodies can be captured. Returns `(macro,
/// advance_to)` where `advance_to` is the byte offset in `full_body` past
/// the consumed macro (caller skips to that position).
fn try_parse_macro(
    rest: &str,
    full_body: &str,
    line_offset: usize,
) -> Result<Option<(StateMacro, usize)>, CompileError> {
    // ─── v2 collection-form: $<keyword>: { ... } or $effect: () => { ... } ────
    //
    // Six keywords accept the collection-form: prop, computed, action, resource,
    // effect, lifecycle. `effect` additionally accepts the anonymous form
    // (`$effect: () => { body }`).

    // v1 form `$lifecycle.mount` / `$lifecycle.dispose` — C440 (the dot
    // discriminator means this is NOT the v2 collection form).
    if rest.starts_with("lifecycle.mount") || rest.starts_with("lifecycle.dispose") {
        return Err(c440(rest, CollectionKind::Lifecycle));
    }

    // ─── recipe class-extension: `$extends: Identifier` (master spec §9.4) ────
    //
    // Dedicated `:`-shorthand parallel to `$query`/`$route`, NOT collection-form
    // (so NOT subject to C440). Captures the base-class identifier (a user
    // import in `@state` scope) which codegen threads into
    // `defineComponent({ base: <Ident>, ... })`. Accepts `$extends: Foo` and
    // `$extends Foo`. Malformed → C470.
    if let Some(decl) = rest.strip_prefix("extends") {
        let nl = full_body[line_offset..]
            .find('\n')
            .map(|r| line_offset + r)
            .unwrap_or(full_body.len());
        let decl = decl.trim_start();
        let decl = decl.strip_prefix(':').map(|d| d.trim_start()).unwrap_or(decl);
        let base = decl.trim().trim_end_matches(';').trim().to_string();
        let valid_ident = !base.is_empty()
            && base
                .chars()
                .next()
                .is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
            && base
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
        if !valid_ident {
            return Err(CompileError {
                message: format!(
                    "$extends requires a class identifier — expected '$extends: AihuCheckboxRoot', got '$extends {}'",
                    decl.trim()
                ),
                line: 0,
                col: 0,
                code: Some("C470".to_string()),
                ..Default::default()
            });
        }
        return Ok(Some((StateMacro::Extends { base }, nl)));
    }

    // ─── per-file shadow mode: `$shadow: 'open' | 'closed' | 'none'` ──────────
    //
    // Dedicated `:`-shorthand. Codegen emits a `// @aihu:shadow <mode>` marker
    // the Vite plugin reads to override the global shadow mode per file.
    // Malformed → C471.
    if let Some(decl) = rest.strip_prefix("shadow") {
        let nl = full_body[line_offset..]
            .find('\n')
            .map(|r| line_offset + r)
            .unwrap_or(full_body.len());
        let decl = decl.trim_start();
        let decl = decl.strip_prefix(':').map(|d| d.trim_start()).unwrap_or(decl);
        let mode = decl
            .trim()
            .trim_end_matches(';')
            .trim()
            .trim_matches(|c| c == '\'' || c == '"')
            .to_string();
        if !matches!(mode.as_str(), "open" | "closed" | "none") {
            return Err(CompileError {
                message: format!(
                    "$shadow must be 'open', 'closed', or 'none' — got '$shadow {}'",
                    decl.trim()
                ),
                line: 0,
                col: 0,
                code: Some("C471".to_string()),
                ..Default::default()
            });
        }
        return Ok(Some((StateMacro::Shadow { mode }, nl)));
    }

    // ─── arch-3 M2 — magna `$query` macro (RFC-003) ──────────────────────────
    //
    // `$query name = data.X.query(vars)` — dedicated `=`-shorthand parallel to
    // `$route`/`$watch`, NOT collection-form (so it is NOT subject to C440).
    // `query` is NOT in the collection-keyword list, so this branch lives
    // alongside the other dedicated/preserved forms. Always lowers to
    // `createMagnaResource(...)` (it is magna-only by definition).
    if let Some(decl) = rest.strip_prefix("query ") {
        // Capture the RHS expression verbatim to end-of-line.
        let nl = full_body[line_offset..]
            .find('\n')
            .map(|r| line_offset + r)
            .unwrap_or(full_body.len());
        let eq = decl.find('=').ok_or_else(|| CompileError {
            message: format!(
                "$query declaration requires `=` — expected '$query name = data.X.query(vars)', got '$query {}'",
                decl.trim()
            ),
            line: 0,
            col: 0,
            code: Some("C460".to_string()),
            ..Default::default()
        })?;
        let name = decl[..eq].trim().to_string();
        let expr = decl[eq + 1..].trim().trim_end_matches(';').trim().to_string();
        if name.is_empty() {
            return Err(CompileError {
                message: "$query declaration has an empty name — expected '$query name = data.X.query(vars)'".to_string(),
                line: 0,
                col: 0,
                code: Some("C460".to_string()),
                ..Default::default()
            });
        }
        if expr.is_empty() {
            return Err(CompileError {
                message: format!(
                    "$query `{}` has an empty right-hand side — expected '$query {} = data.X.query(vars)'",
                    name, name
                ),
                line: 0,
                col: 0,
                code: Some("C460".to_string()),
                ..Default::default()
            });
        }
        return Ok(Some((StateMacro::Query { name, expr }, nl)));
    }

    // ─── arch-3 M2 / A3 G2 — auth `$auth.*` macro family (RFC-001) ────────────
    //
    // `$auth name = $auth.session()` / `$auth name = $auth.currentUser()` —
    // dedicated `=`-shorthand parallel to `$query`, NOT collection-form (so it
    // is NOT subject to C440). `auth` is NOT in the collection-keyword list, so
    // this branch lives alongside `$query`. Both methods lower to
    // `const <name> = useCurrentUser()` from `@aihu/auth`; `session()`
    // additionally emits the deferred-SSR M3 TODO marker (see
    // `auth_session_todo`). Malformed forms → C461.
    if let Some(decl) = rest.strip_prefix("auth ") {
        // Capture the RHS expression verbatim to end-of-line.
        let nl = full_body[line_offset..]
            .find('\n')
            .map(|r| line_offset + r)
            .unwrap_or(full_body.len());
        let eq = decl.find('=').ok_or_else(|| CompileError {
            message: format!(
                "$auth declaration requires `=` — expected '$auth name = $auth.session()', got '$auth {}'",
                decl.trim()
            ),
            line: 0,
            col: 0,
            code: Some("C461".to_string()),
            ..Default::default()
        })?;
        let name = decl[..eq].trim().to_string();
        let rhs = decl[eq + 1..].trim().trim_end_matches(';').trim();
        if name.is_empty() {
            return Err(CompileError {
                message: "$auth declaration has an empty name — expected '$auth name = $auth.session()'".to_string(),
                line: 0,
                col: 0,
                code: Some("C461".to_string()),
                ..Default::default()
            });
        }
        let method = if rhs == "$auth.session()" {
            AuthMacroKind::Session
        } else if rhs == "$auth.currentUser()" {
            AuthMacroKind::CurrentUser
        } else {
            return Err(CompileError {
                message: format!(
                    "unknown $auth method — expected $auth.session() or $auth.currentUser(), got '{}'",
                    rhs
                ),
                line: 0,
                col: 0,
                code: Some("C461".to_string()),
                ..Default::default()
            });
        };
        return Ok(Some((StateMacro::Auth { name, method }, nl)));
    }

    if let Some(kind) = match_collection_keyword(rest) {
        let kw_len = collection_keyword_len(kind);
        // Position in full_body just past `$<keyword>`.
        let after_kw = line_offset + 1 /* $ */ + kw_len;
        // Skip whitespace.
        let mut p = after_kw;
        while p < full_body.len()
            && matches!(full_body.as_bytes()[p], b' ' | b'\t')
        {
            p += 1;
        }
        // Expect `:` next (collection-form). Anything else (e.g. `$prop name:`,
        // `$computed name =`, `$action name(`, `$resource name =`)
        // is the old v1 form → C440.
        if p >= full_body.len() || full_body.as_bytes()[p] != b':' {
            return Err(c440(rest, kind));
        }
        p += 1; // past ':'
        // Skip whitespace (incl. newlines).
        while p < full_body.len()
            && matches!(full_body.as_bytes()[p], b' ' | b'\t' | b'\n' | b'\r')
        {
            p += 1;
        }
        if p >= full_body.len() {
            return Err(CompileError {
                message: format!(
                    "${}: expected `{{` or function expression after `:`",
                    keyword_name(kind)
                ),
                line: 0,
                col: 0,
                code: Some("C442".to_string()),
                ..Default::default()
            });
        }

        // `$effect: () => ...` — anonymous effect form (only valid for $effect).
        if matches!(kind, CollectionKind::Effect) && full_body.as_bytes()[p] == b'(' {
            // Parse the arrow-function. Find `(` ... `)` then `=>` then expr/block.
            let close_paren = find_paren_close(full_body, p + 1).ok_or_else(|| CompileError {
                message: "$effect anonymous form: unclosed `(` in arrow params".to_string(),
                line: 0,
                col: 0,
                code: Some("C442".to_string()),
                ..Default::default()
            })?;
            // After ')' skip whitespace, expect `=>`.
            let mut q = close_paren + 1;
            while q < full_body.len()
                && matches!(full_body.as_bytes()[q], b' ' | b'\t')
            {
                q += 1;
            }
            if q + 1 >= full_body.len()
                || full_body.as_bytes()[q] != b'='
                || full_body.as_bytes()[q + 1] != b'>'
            {
                return Err(CompileError {
                    message: "$effect anonymous form: expected `=>` after `()`".to_string(),
                    line: 0,
                    col: 0,
                    code: Some("C442".to_string()),
                    ..Default::default()
                });
            }
            q += 2; // past '=>'
            while q < full_body.len()
                && matches!(full_body.as_bytes()[q], b' ' | b'\t' | b'\n' | b'\r')
            {
                q += 1;
            }
            if q >= full_body.len() {
                return Err(CompileError {
                    message: "$effect anonymous form: missing arrow body".to_string(),
                    line: 0,
                    col: 0,
                    code: Some("C442".to_string()),
                    ..Default::default()
                });
            }
            let (body, advance) = if full_body.as_bytes()[q] == b'{' {
                let close = find_brace_close_js(full_body, q + 1).ok_or_else(|| CompileError {
                    message: "$effect anonymous form: unclosed `{` in arrow body".to_string(),
                    line: 0,
                    col: 0,
                    code: Some("C442".to_string()),
                    ..Default::default()
                })?;
                (full_body[q + 1..close].trim().to_string(), close + 1)
            } else {
                // Expression body — read to end of line / statement.
                let nl = full_body[q..].find('\n').map(|r| q + r).unwrap_or(full_body.len());
                (full_body[q..nl].trim().trim_end_matches(';').trim().to_string(), nl)
            };
            return Ok(Some((StateMacro::EffectAnon { body }, advance)));
        }

        // Otherwise expect `{` opening the collection body.
        if full_body.as_bytes()[p] != b'{' {
            return Err(c440(rest, kind));
        }
        let close = find_brace_close_js(full_body, p + 1).ok_or_else(|| CompileError {
            message: format!("${}: unclosed `{{` in collection body", keyword_name(kind)),
            line: 0,
            col: 0,
            code: Some("C442".to_string()),
            ..Default::default()
        })?;
        let inner = &full_body[p + 1..close];
        let entries = parse_object_collection(inner, kind)?;
        return Ok(Some((StateMacro::Collection { kind, entries }, close + 1)));
    }

    // ─── Preserved-from-v1 macros (out of v2 redesign scope) ─────────────────

    // arch-5 M1: $route name (RFC-A5-010). Prefix-match BEFORE other keywords.
    if let Some(decl) = rest.strip_prefix("route ") {
        let name = decl.trim();
        if name.contains('=') || name.is_empty() {
            return Err(CompileError {
                message: format!(
                    "$route declaration takes no rhs — expected '$route name', got '$route {}'",
                    decl
                ),
                line: 0,
                col: 0,
                code: Some("C406".to_string()),
                ..Default::default()
            });
        }
        let nl = full_body[line_offset..]
            .find('\n')
            .map(|r| line_offset + r)
            .unwrap_or(full_body.len());
        return Ok(Some((StateMacro::Route { name: name.to_string() }, nl)));
    }

    // arch-5 M1: $beforeNavigate(fn) — RFC-A5-015
    if let Some(after_kw) = rest.strip_prefix("beforeNavigate") {
        let kw_len = "$beforeNavigate".len();
        let mut p = line_offset + kw_len;
        while p < full_body.len()
            && matches!(full_body.as_bytes()[p], b' ' | b'\t' | b'\n' | b'\r')
        {
            p += 1;
        }
        if p >= full_body.len() || full_body.as_bytes()[p] != b'(' {
            return Err(CompileError {
                message: format!(
                    "$beforeNavigate expects '(' — got '$beforeNavigate{}'",
                    after_kw
                ),
                line: 0,
                col: 0,
                code: Some("C407".to_string()),
                ..Default::default()
            });
        }
        let close = find_paren_close(full_body, p + 1).ok_or_else(|| CompileError {
            message: "$beforeNavigate — unclosed '('".to_string(),
            line: 0,
            col: 0,
            code: Some("C407".to_string()),
            ..Default::default()
        })?;
        let expr = full_body[p + 1..close].trim().to_string();
        return Ok(Some((StateMacro::BeforeNavigate { expr }, close + 1)));
    }

    // arch-5 M1: $afterNavigate(fn) — RFC-A5-016
    if let Some(after_kw) = rest.strip_prefix("afterNavigate") {
        let kw_len = "$afterNavigate".len();
        let mut p = line_offset + kw_len;
        while p < full_body.len()
            && matches!(full_body.as_bytes()[p], b' ' | b'\t' | b'\n' | b'\r')
        {
            p += 1;
        }
        if p >= full_body.len() || full_body.as_bytes()[p] != b'(' {
            return Err(CompileError {
                message: format!("$afterNavigate expects '(' — got '$afterNavigate{}'", after_kw),
                line: 0,
                col: 0,
                code: Some("C408".to_string()),
                ..Default::default()
            });
        }
        let close = find_paren_close(full_body, p + 1).ok_or_else(|| CompileError {
            message: "$afterNavigate — unclosed '('".to_string(),
            line: 0,
            col: 0,
            code: Some("C408".to_string()),
            ..Default::default()
        })?;
        let expr = full_body[p + 1..close].trim().to_string();
        return Ok(Some((StateMacro::AfterNavigate { expr }, close + 1)));
    }

    // $effect.on(dep) { body } — out of v2 redesign scope, kept as-is.
    if let Some(decl) = rest.strip_prefix("effect.on(") {
        let close_paren = decl.find(')').ok_or_else(|| CompileError {
            message: "$effect.on() — missing closing ')'".to_string(),
            line: 0,
            col: 0,
            code: Some("C403".to_string()),
            ..Default::default()
        })?;
        let dep = decl[..close_paren].trim().to_string();
        let (body, advance) = extract_brace_body_with_pos(full_body, line_offset)?;
        return Ok(Some((StateMacro::EffectOn { dep, body }, advance)));
    }

    // $watch name { body } — out of v2 redesign scope, kept as-is.
    if let Some(decl) = rest.strip_prefix("watch ") {
        let decl = decl.trim();
        let end = decl
            .find(|c: char| c.is_whitespace() || c == '{')
            .unwrap_or(decl.len());
        let name = decl[..end].trim().to_string();
        let (body, advance) = extract_brace_body_with_pos(full_body, line_offset)?;
        return Ok(Some((StateMacro::Watch { name, body }, advance)));
    }

    Ok(None)
}

/// Match the leading keyword for the collection-form macros. Returns
/// `Some(kind)` when `rest` (line content after `$`) starts with one of
/// `prop`, `computed`, `action`, `resource`, `effect`, `lifecycle`, `event`,
/// `aria`, `controller`, `context` followed by `:` or whitespace. `effect.on`
/// and `lifecycle.mount` / `lifecycle.dispose` (with a `.`) do NOT match here
/// — those are either preserved v1 forms (`$effect.on`) or v1 forms rejected
/// via C440 (when reached through the next-character check).
fn match_collection_keyword(rest: &str) -> Option<CollectionKind> {
    // Order matters: longer prefixes first so `lifecycle` wins over a
    // hypothetical shorter prefix.
    let keywords = [
        ("lifecycle", CollectionKind::Lifecycle),
        ("controller", CollectionKind::Controller),
        ("computed", CollectionKind::Computed),
        ("resource", CollectionKind::Resource),
        ("context", CollectionKind::Context),
        ("action", CollectionKind::Action),
        ("effect", CollectionKind::Effect),
        ("stream", CollectionKind::Stream),
        ("event", CollectionKind::Event),
        ("prop", CollectionKind::Prop),
        // B4 — R5: `$aria` collection (declarative ARIA via ElementInternals).
        ("aria", CollectionKind::Aria),
        // D5 — `$form` collection (form-associated custom element APIs).
        ("form", CollectionKind::Form),
    ];
    for (kw, kind) in keywords {
        if let Some(after) = rest.strip_prefix(kw) {
            // Must be followed by `:`, whitespace, or end-of-string. If the
            // next char is `.` or alpha, this is a different keyword (e.g.
            // `effect.on`, `lifecycle.mount`).
            let next = after.chars().next();
            match next {
                None | Some(':') | Some(' ') | Some('\t') => return Some(kind),
                _ => continue,
            }
        }
    }
    None
}

fn collection_keyword_len(kind: CollectionKind) -> usize {
    match kind {
        CollectionKind::Prop => 4,
        CollectionKind::Computed => 8,
        CollectionKind::Action => 6,
        CollectionKind::Resource => 8,
        CollectionKind::Effect => 6,
        CollectionKind::Lifecycle => 9,
        CollectionKind::Event => 5,
        CollectionKind::Aria => 4,
        // B5
        CollectionKind::Controller => 10,
        CollectionKind::Context => 7,
        // v0.4.0
        CollectionKind::Stream => 6,
        // D5
        CollectionKind::Form => 4,
    }
}

fn keyword_name(kind: CollectionKind) -> &'static str {
    match kind {
        CollectionKind::Prop => "prop",
        CollectionKind::Computed => "computed",
        CollectionKind::Action => "action",
        CollectionKind::Resource => "resource",
        CollectionKind::Effect => "effect",
        CollectionKind::Lifecycle => "lifecycle",
        CollectionKind::Event => "event",
        CollectionKind::Aria => "aria",
        // B5
        CollectionKind::Controller => "controller",
        CollectionKind::Context => "context",
        // v0.4.0
        CollectionKind::Stream => "stream",
        // D5
        CollectionKind::Form => "form",
    }
}

/// Build the C440 error pointing at the migration codemod (per spec §6).
/// Each kind includes an inline corrected form so agents can apply the fix
/// without reading external docs.
fn c440(rest: &str, kind: CollectionKind) -> CompileError {
    let kw = keyword_name(kind);
    let got = rest.trim_end();

    let (corrected_form, from_text, to_text) = match kind {
        CollectionKind::Prop => (
            "Replace `$prop name: Type = default` with `$prop: { name: { type: Type, default: <default> } }`. \
             Example: `$prop label: String = ''` → `$prop: { label: { type: String, default: '' } }`",
            format!("$prop {}", got.trim_start_matches("prop").trim_start()),
            "$prop: { <name>: { type: <Type>, default: <default> } }".to_string(),
        ),
        CollectionKind::Computed => (
            "Replace `$computed name = expr` with `$computed: { name: () => expr }`. \
             Example: `$computed upper = label.toUpperCase()` → `$computed: { upper: () => label.toUpperCase() }`",
            format!("$computed {}", got.trim_start_matches("computed").trim_start()),
            "$computed: { <name>: () => <expr> }".to_string(),
        ),
        CollectionKind::Action => (
            "Replace `$action name(args) { body }` with `$action: { name: (args) => { body } }`. \
             Example: `$action submit(data) { send(data) }` → `$action: { submit: (data) => { send(data) } }`",
            format!("$action {}", got.trim_start_matches("action").trim_start()),
            "$action: { <name>: (<args>) => { <body> } }".to_string(),
        ),
        CollectionKind::Resource => (
            "Replace `$resource name = expr` with `$resource: { name: () => expr }`. \
             Example: `$resource data = fetchUsers()` → `$resource: { data: () => fetchUsers() }`",
            format!("$resource {}", got.trim_start_matches("resource").trim_start()),
            "$resource: { <name>: () => <expr> }".to_string(),
        ),
        CollectionKind::Effect => (
            "Replace `$effect(fn)` with `$effect: () => { body }` (anonymous) or \
             `$effect: { name: () => { body } }` (named collection). \
             Example: `$effect(() => { sync() })` → `$effect: () => { sync() }`",
            format!("$effect {}", got.trim_start_matches("effect").trim_start()),
            "$effect: () => { <body> }".to_string(),
        ),
        CollectionKind::Lifecycle => (
            "Replace `$lifecycle.mount { body }` / `$lifecycle.dispose { body }` with \
             `$lifecycle: { mount: () => { body }, dispose: () => { body } }`. \
             Example: `$lifecycle.mount { init() }` → `$lifecycle: { mount: () => { init() } }`",
            format!("$lifecycle.{}", got.trim_start_matches("lifecycle.").split_at(got.trim_start_matches("lifecycle.").find(|c: char| c.is_whitespace() || c == '{').unwrap_or(got.trim_start_matches("lifecycle.").len())).0.to_string()),
            "$lifecycle: { mount: () => { <body> } }".to_string(),
        ),
        CollectionKind::Event => (
            "Replace `$event name: Type` with `$event: { name: { payload: Type } }`. \
             Example: `$event click: MouseEvent` → `$event: { click: { payload: MouseEvent } }`",
            format!("$event {}", got.trim_start_matches("event").trim_start()),
            "$event: { <name>: { payload: <Type> } }".to_string(),
        ),
        CollectionKind::Aria => (
            "Use `$aria: { role: 'button', label: () => '...' }` to declare ARIA properties. \
             Example: `$aria: { role: 'button', label: () => myLabel() }`",
            format!("$aria {}", got.trim_start_matches("aria").trim_start()),
            "$aria: { role: '<role>', label: () => <expr> }".to_string(),
        ),
        // B5 — $controller and $context are new in v2; no v1 migration path.
        CollectionKind::Controller => (
            "Use `$controller: { name: { value: () => new MyController() } }` to declare a Reactive Controller.",
            format!("$controller {}", got.trim_start_matches("controller").trim_start()),
            "$controller: { <name>: { value: () => new <Controller>() } }".to_string(),
        ),
        CollectionKind::Context => (
            "Use `$context: { provide: { key: { value: () => signal } }, consume: { key: { type: 'T' } } }` to declare context.",
            format!("$context {}", got.trim_start_matches("context").trim_start()),
            "$context: { provide: { <key>: { value: () => <expr> } }, consume: { <key>: { type: '<T>' } } }".to_string(),
        ),
        // v0.4.0 — $stream is new in v0.4.0; no v1 migration path.
        CollectionKind::Stream => (
            "$stream: { <name>: { source: () => ..., describe?: '...' } }",
            format!("$stream {}", got.trim_start_matches("stream").trim_start()),
            "$stream name = ...".to_string(),
        ),
        // D5 — $form: no v1 migration path; new in this release.
        CollectionKind::Form => (
            "Use `$form: { value: <expr>, validity: () => ({ valueMissing: !<expr> }) }` to declare form-associated APIs. \
             Example: `$form: { value: name, validity: () => ({ valueMissing: !name.trim() }) }`",
            format!("$form {}", got.trim_start_matches("form").trim_start()),
            "$form: { value: <expr>, validity: () => (<validity-object>) }".to_string(),
        ),
    };

    CompileError {
        message: format!(
            "C440: `${}` v1 form is not valid in v2. {} \
             Run the migration codemod: packages/compiler/js/codemods/macro-simplification/migrate.ts. \
             Got: `${}`",
            kw, corrected_form, got
        ),
        line: 0,
        col: 0,
        code: Some("C440".to_string()),
        hint: Some(format!(
            "v2 grammar: `$<macro>: {{ name: {{ ... }}, ... }}` — see packages/compiler/js/codemods/macro-simplification/migrate.ts"
        )),
        fix: Some(
            "see docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md".to_string(),
        ),
        from: Some(from_text),
        to: Some(to_text),
    }
}

/// Parse the inside of a collection-form macro body — `<name>: <value>, ...`.
/// `inner` is the text between the outer `{` and `}`; `kind` is used for
/// per-macro validation per spec §3 (e.g. `$prop` forbids bare; `$lifecycle`
/// forbids wrapped).
fn parse_object_collection(
    inner: &str,
    kind: CollectionKind,
) -> Result<Vec<CollectionEntry>, CompileError> {
    let mut entries = Vec::new();

    for raw_entry in split_top_level_commas(inner) {
        let trimmed = strip_line_comments(&raw_entry);
        let trimmed = trimmed.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Find the `:` separating name from value (skip top-level only —
        // the value may contain `:` inside type annotations or generics).
        let colon = find_top_level_colon(trimmed).ok_or_else(|| CompileError {
            message: format!(
                "${} entry missing `:` between name and value: `{}`",
                keyword_name(kind),
                trimmed.chars().take(60).collect::<String>()
            ),
            line: 0,
            col: 0,
            code: Some("C443".to_string()),
            ..Default::default()
        })?;
        let name = trimmed[..colon].trim().to_string();
        let value = trimmed[colon + 1..].trim().to_string();

        if name.is_empty() {
            return Err(CompileError {
                message: format!("${} entry has empty name", keyword_name(kind)),
                line: 0,
                col: 0,
                code: Some("C443".to_string()),
                ..Default::default()
            });
        }

        // Decide bare vs wrapped: a wrapped value is `{ ... }` carrying
        // metadata-bag keys (`describe`, `expose`, `default`, `type`,
        // `value`, `handler`, `on`). A bare value is anything else (a
        // function expression like `() => ...` or `(args) => { body }`).
        let is_wrapped = value.starts_with('{');

        // Missing-comma guard. Collection entries are comma-separated (JS object
        // syntax — every canonical example uses commas). Without a comma the
        // top-level splitter collapses adjacent entries into one chunk and the
        // parser keeps only the first `name: value`, SILENTLY DROPPING the rest
        // — which produces wrong runtime codegen (referenced handlers become
        // undefined → ReferenceError) and broken type-check sidecars, with no
        // diagnostic. Detect it for the wrapped form (the common metadata-bag
        // case, e.g. `$action: { a: { … } b: { … } }`): a wrapped value must BE
        // the whole value, so any non-whitespace after its closing brace is a
        // glued-on entry. (Bare function values can't be delimited unambiguously
        // — `(t): string => …` has a legitimate top-level `:` — so they are not
        // guarded here; the canonical comma form always parses correctly.)
        if is_wrapped {
            if let Some(close) = find_brace_close_js(&value, 1) {
                let trailing = value[close + 1..].trim();
                if !trailing.is_empty() {
                    let next = trailing
                        .split(|c: char| c == ':' || c.is_whitespace())
                        .find(|s| !s.is_empty())
                        .unwrap_or("<next entry>");
                    return Err(CompileError {
                        message: format!(
                            "C447: `${}` collection entries must be separated by commas. \
                             Entry `{}` is immediately followed by `{}` with no comma between \
                             them — add a comma after the closing `}}` of `{}`. Without it the \
                             parser silently drops `{}` and every entry after it.",
                            keyword_name(kind),
                            name,
                            next,
                            name,
                            next
                        ),
                        line: 0,
                        col: 0,
                        code: Some("C447".to_string()),
                        ..Default::default()
                    });
                }
            }
        }

        // Per-kind rules per spec §2.4:
        //   $prop       — always wrapped (no running code to imply)
        //   $lifecycle  — always bare (no metadata-bag form, per D.3)
        //   $event      — always wrapped (per spec §5.a; required: payload)
        //   $controller — always wrapped (requires `value:` factory key)
        //   $context    — keys must be `provide` or `consume`, values are wrapped
        if matches!(kind, CollectionKind::Controller) && !is_wrapped {
            return Err(CompileError {
                message: format!(
                    "C444: `$controller` entry `{}` must use the wrapped object form with a `value:` factory. \
                     Replace `{}: <expr>` with `{}: {{ value: () => new MyController() }}`.",
                    name, name, name
                ),
                line: 0,
                col: 0,
                code: Some("C444".to_string()),
                from: Some(format!("{}: {}", name, value)),
                to: Some(format!("{}: {{ value: () => new Controller() }}", name)),
                ..Default::default()
            });
        }
        if matches!(kind, CollectionKind::Context) && name != "provide" && name != "consume" {
            return Err(CompileError {
                message: format!(
                    "C444: `$context` only accepts `provide` and `consume` keys, got `{}`. \
                     Use `$context: {{ provide: {{ ... }}, consume: {{ ... }} }}`.",
                    name
                ),
                line: 0,
                col: 0,
                code: Some("C444".to_string()),
                ..Default::default()
            });
        }
        if matches!(kind, CollectionKind::Prop) && !is_wrapped {
            return Err(CompileError {
                message: format!(
                    "C444: `$prop` entry `{}` must use the wrapped object form. \
                     Replace `{}: <value>` with `{}: {{ default: <default>, type?: <Type>, describe?: '...', expose?: {{ read: true }} }}`. \
                     Example: `{}: 215` → `{}: {{ default: 215 }}`",
                    name, name, name, name, name
                ),
                line: 0,
                col: 0,
                code: Some("C444".to_string()),
                from: Some(format!("{}: {}", name, value)),
                to: Some(format!("{}: {{ default: {} }}", name, value)),
                ..Default::default()
            });
        }
        if matches!(kind, CollectionKind::Event) && !is_wrapped {
            return Err(CompileError {
                message: format!(
                    "$event entries are always wrapped — `{}` must be `{{ payload: <type>, describe?: ..., bubbles?: ..., composed?: ... }}`",
                    name
                ),
                line: 0,
                col: 0,
                code: Some("C444".to_string()),
                ..Default::default()
            });
        }
        // v0.4.0 — $stream validation.
        if matches!(kind, CollectionKind::Stream) {
            if !is_wrapped {
                return Err(CompileError {
                    message: format!(
                        "C553: $stream entry '{}' must use wrapped form {{ source: () => ... }}. \
                         Bare form `{}: <expr>` is not supported for $stream. \
                         Use `{}: {{ source: () => <factory>, describe?: '...' }}`.",
                        name, name, name
                    ),
                    line: 0,
                    col: 0,
                    code: Some("C553".to_string()),
                    from: Some(format!("{}: {}", name, value)),
                    to: Some(format!("{}: {{ source: () => <factory> }}", name)),
                    ..Default::default()
                });
            }
            // Will parse meta pairs below; check for `source:` key after meta parse.
            // We defer to after the meta parse block below.
        }
        if matches!(kind, CollectionKind::Lifecycle) && is_wrapped {
            return Err(CompileError {
                message: format!(
                    "C444: `$lifecycle` entry `{}` must be a bare function expression, not a metadata-bag. \
                     Replace `{}: {{ handler: () => {{ body }} }}` with `{}: () => {{ body }}`. \
                     Example: `{}: {{ handler: () => init() }}` → `{}: () => init()`",
                    name, name, name, name, name
                ),
                line: 0,
                col: 0,
                code: Some("C444".to_string()),
                from: Some(format!("{}: {{ ... }}", name)),
                to: Some(format!("{}: () => {{ ... }}", name)),
                ..Default::default()
            });
        }
        // $lifecycle keys must be one of `mount`, `dispose`, `adopt`,
        // `attributeChange` (spec §3.6 + R2 four-callback extension per
        // Director r6 §3). `mount` and `dispose` are the v1 surface;
        // `adopt` and `attributeChange` were added in R2 to wire
        // adoptedCallback and attributeChangedCallback respectively.
        if matches!(kind, CollectionKind::Lifecycle)
            && name != "mount"
            && name != "dispose"
            && name != "adopt"
            && name != "attributeChange"
        {
            return Err(CompileError {
                message: format!(
                    "C444: `$lifecycle` key `{}` is not valid. \
                     Only `mount`, `dispose`, `adopt`, and `attributeChange` are allowed. \
                     Replace `{}: ...` with one of: `mount: () => {{ ... }}`, `dispose: () => {{ ... }}`, \
                     `adopt: (oldEl) => {{ ... }}`, `attributeChange: (name, old, next) => {{ ... }}`",
                    name, name
                ),
                line: 0,
                col: 0,
                code: Some("C444".to_string()),
                from: Some(format!("{}: ...", name)),
                to: Some("mount: () => { ... }".to_string()),
                ..Default::default()
            });
        }
        // D5 — $form: only `value` and `validity` keys are valid.
        if matches!(kind, CollectionKind::Form)
            && name != "value"
            && name != "validity"
        {
            return Err(CompileError {
                message: format!(
                    "C444: `$form` key `{}` is not valid. \
                     Only `value` and `validity` are allowed. \
                     Use `$form: {{ value: <expr>, validity: () => ({{ valueMissing: !<expr> }}) }}`.",
                    name
                ),
                line: 0,
                col: 0,
                code: Some("C444".to_string()),
                from: Some(format!("{}: ...", name)),
                to: Some("value: <expr>".to_string()),
                ..Default::default()
            });
        }

        let (value_raw, meta) = if is_wrapped {
            // Strip the outer `{` … `}` and split into `key: source` pairs.
            let body = strip_outer_braces(&value).ok_or_else(|| CompileError {
                message: format!(
                    "${} entry `{}`: unclosed `{{` in metadata-bag",
                    keyword_name(kind),
                    name
                ),
                line: 0,
                col: 0,
                code: Some("C443".to_string()),
                ..Default::default()
            })?;
            let pairs = parse_meta_pairs(body)?;
            (String::new(), pairs)
        } else {
            (value, Vec::new())
        };

        // v0.4.0 — C554: $stream entries must have a `source:` key.
        if matches!(kind, CollectionKind::Stream) && is_wrapped {
            let has_source = meta.iter().any(|(k, _)| k == "source");
            if !has_source {
                return Err(CompileError {
                    message: format!(
                        "C554: $stream entry '{}' missing required 'source' key. \
                         Add `source: () => <factory>` to the metadata bag.",
                        name
                    ),
                    line: 0,
                    col: 0,
                    code: Some("C554".to_string()),
                    hint: Some(format!(
                        "Example: `{}: {{ source: () => fetch('/api/stream').then(r => r.body), describe: '...' }}`",
                        name
                    )),
                    ..Default::default()
                });
            }
        }

        // R1 — validate $prop optional keys at compile time. The
        // `attribute: false + reflect: true` combination is meaningless
        // (nothing to reflect to) and is rejected here as C445 instead of
        // surfacing as a runtime SCR-R0004. Lit's reactive-element rejects
        // the same combination at decorator-eval; we mirror that behavior.
        if matches!(kind, CollectionKind::Prop) && is_wrapped {
            let attribute = meta
                .iter()
                .find(|(k, _)| k == "attribute")
                .map(|(_, v)| v.trim());
            let reflect = meta
                .iter()
                .find(|(k, _)| k == "reflect")
                .map(|(_, v)| v.trim());
            if let (Some(attr), Some(refl)) = (attribute, reflect) {
                if attr == "false" && refl == "true" {
                    return Err(CompileError {
                        message: format!(
                            "$prop entry `{}`: `attribute: false` is incompatible with `reflect: true` (nothing to reflect to)",
                            name
                        ),
                        line: 0,
                        col: 0,
                        code: Some("C445".to_string()),
                        hint: Some(
                            "remove either `attribute: false` (keeps observed attribute + reflect) or `reflect: true` (keeps property-only)"
                                .to_string(),
                        ),
                        ..Default::default()
                    });
                }
            }
        }

        entries.push(CollectionEntry {
            name,
            is_wrapped,
            value_raw,
            meta,
        });
    }

    Ok(entries)
}

/// Strip leading `{` and trailing `}` from a wrapped value, returning the
/// inner text. Returns `None` if the input is malformed.
fn strip_outer_braces(s: &str) -> Option<&str> {
    let s = s.trim();
    let inner = s.strip_prefix('{')?.strip_suffix('}')?;
    Some(inner)
}

/// Public wrapper for `strip_outer_braces` — used by `codegen/emit.rs` for
/// B5 `$context` sub-object parsing.
pub fn strip_outer_braces_pub(s: &str) -> Option<String> {
    strip_outer_braces(s).map(|s| s.to_string())
}

/// Public wrapper for `parse_meta_pairs` — used by `codegen/emit.rs` for
/// B5 `$context` sub-object parsing.
pub fn parse_meta_pairs_pub(body: &str) -> Result<Vec<(String, String)>, crate::types::CompileError> {
    parse_meta_pairs(body)
}

/// Split a metadata-bag body into `(key, raw-value)` pairs. The body is
/// the inside of `{ ... }`. Top-level commas separate pairs; the first
/// `:` at depth-0 in each pair separates the key from the value.
fn parse_meta_pairs(body: &str) -> Result<Vec<(String, String)>, CompileError> {
    let mut pairs = Vec::new();
    for raw in split_top_level_commas(body) {
        let trimmed = strip_line_comments(&raw);
        let trimmed = trimmed.trim();
        if trimmed.is_empty() {
            continue;
        }
        let colon = find_top_level_colon(trimmed).ok_or_else(|| CompileError {
            message: format!(
                "metadata-bag entry missing `:`: `{}`",
                trimmed.chars().take(60).collect::<String>()
            ),
            line: 0,
            col: 0,
            code: Some("C443".to_string()),
            ..Default::default()
        })?;
        let key = trimmed[..colon].trim();
        let key = key.trim_matches(|c| c == '"' || c == '\'').to_string();
        let value = trimmed[colon + 1..].trim().to_string();
        pairs.push((key, value));
    }
    Ok(pairs)
}

/// Split `s` at top-level commas (respecting nested `{}`/`[]`/`()` and
/// string/template literals). Trailing-comma-only entries (empty between
/// commas) are skipped.
fn split_top_level_commas(s: &str) -> Vec<String> {
    // Over the shared scanner's code-byte stream, a naive bracket count is
    // lexically correct: a comma, brace or quote inside a string, comment or
    // regex literal never reaches us. Counting raw bytes instead meant a handler
    // like `s.replace(/['"]/g, '')` opened string mode on the regex's quote and
    // ran the split straight past the comma that ends the entry.
    let mut scanner = crate::parser::expr_scan::CodeScanner::new(s);
    let mut out = Vec::new();
    let mut start = 0usize;
    let mut depth_brace = 0i32;
    let mut depth_paren = 0i32;
    let mut depth_bracket = 0i32;
    while let Some((i, b)) = scanner.next_code_byte() {
        match b {
            b'{' => depth_brace += 1,
            b'}' => depth_brace = (depth_brace - 1).max(0),
            b'(' => depth_paren += 1,
            b')' => depth_paren = (depth_paren - 1).max(0),
            b'[' => depth_bracket += 1,
            b']' => depth_bracket = (depth_bracket - 1).max(0),
            b',' if depth_brace == 0 && depth_paren == 0 && depth_bracket == 0 => {
                out.push(s[start..i].to_string());
                start = i + 1;
            }
            _ => {}
        }
    }
    if start < s.len() {
        out.push(s[start..].to_string());
    }
    out
}

/// Find the first `:` at depth 0 (not inside `{}`/`[]`/`()`/`<>` or
/// strings/template literals). The collection-form's name-key separator.
fn find_top_level_colon(s: &str) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut depth_brace = 0i32;
    let mut depth_paren = 0i32;
    let mut depth_bracket = 0i32;
    let mut depth_angle = 0i32;
    let mut i = 0usize;
    while i < bytes.len() {
        match bytes[i] {
            b'{' => depth_brace += 1,
            b'}' => depth_brace = (depth_brace - 1).max(0),
            b'(' => depth_paren += 1,
            b')' => depth_paren = (depth_paren - 1).max(0),
            b'[' => depth_bracket += 1,
            b']' => depth_bracket = (depth_bracket - 1).max(0),
            b'<' => depth_angle += 1,
            b'>' if depth_angle > 0 => depth_angle = (depth_angle - 1).max(0),
            b'"' | b'\'' | b'`' => {
                let q = bytes[i];
                i += 1;
                while i < bytes.len() {
                    if bytes[i] == b'\\' && i + 1 < bytes.len() {
                        i += 2;
                        continue;
                    }
                    if bytes[i] == q {
                        break;
                    }
                    i += 1;
                }
            }
            b':' if depth_brace == 0
                && depth_paren == 0
                && depth_bracket == 0
                && depth_angle == 0 =>
            {
                return Some(i);
            }
            _ => {}
        }
        i += 1;
    }
    None
}

/// Strip JS line comments (`// ...`) — used to clean entry text before
/// further parsing. Block comments (`/* ... */`) are not handled here;
/// they're rare inside metadata bags and pass through opaquely.
fn strip_line_comments(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        match bytes[i] {
            b'"' | b'\'' | b'`' => {
                let q = bytes[i];
                out.push(q as char);
                i += 1;
                while i < bytes.len() {
                    out.push(bytes[i] as char);
                    if bytes[i] == b'\\' && i + 1 < bytes.len() {
                        i += 1;
                        out.push(bytes[i] as char);
                        i += 1;
                        continue;
                    }
                    if bytes[i] == q {
                        i += 1;
                        break;
                    }
                    i += 1;
                }
                continue;
            }
            _ => {
                out.push(bytes[i] as char);
                i += 1;
            }
        }
    }
    out
}

/// Extract the body of a brace-delimited block `{ ... }` starting from the
/// first `{` at or after `search_from` in `full_body`. Returns the trimmed
/// body and the byte offset just past the closing `}`.
fn extract_brace_body_with_pos(
    full_body: &str,
    search_from: usize,
) -> Result<(String, usize), CompileError> {
    let open_pos =
        full_body[search_from..]
            .find('{')
            .map(|r| search_from + r)
            .ok_or_else(|| CompileError {
                message: "expected '{' for macro body".to_string(),
                line: 0,
                col: 0,
                code: Some("C405".to_string()),
                ..Default::default()
            })?;
    let close_pos =
        find_brace_close_js(full_body, open_pos + 1).ok_or_else(|| CompileError {
            message: "unclosed '{' in macro body".to_string(),
            line: 0,
            col: 0,
            code: Some("C405".to_string()),
            ..Default::default()
        })?;
    Ok((
        full_body[open_pos + 1..close_pos].trim().to_string(),
        close_pos + 1,
    ))
}

/// Find the matching `)` for an already-opened parenthesis. `body_start`
/// is the byte just past the opening `(`. Honors brace, bracket, and
/// string nesting.
pub fn find_paren_close(s: &str, body_start: usize) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut depth: usize = 1;
    let mut i = body_start;
    while i < bytes.len() {
        match bytes[i] {
            b'(' => depth += 1,
            b')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            b'"' | b'\'' | b'`' => {
                let q = bytes[i];
                i += 1;
                while i < bytes.len() {
                    if bytes[i] == b'\\' && i + 1 < bytes.len() {
                        i += 2;
                        continue;
                    }
                    if bytes[i] == q {
                        break;
                    }
                    i += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

/// Find the matching `}` for an already-opened JS body — a macro body, an
/// `$effect` arrow, a collection entry. `body_start` is the byte just past the
/// opening `{`.
///
/// Defers to the shared lexical scanner, so braces inside strings, template
/// literals, comments and regex literals are payload rather than structure. The
/// hand-rolled scan below knows strings but not regexes, which is why a handler
/// like `s.replace(/['"]/g, '')` used to leave the body "unclosed".
pub fn find_brace_close_js(s: &str, body_start: usize) -> Option<usize> {
    crate::parser::expr_scan::find_matching_close_brace(s, body_start)
}

/// Find the matching `}` for an already-opened CSS body (`$media`, `$when`,
/// `$global`). `body_start` is the byte just past the opening `{`.
///
/// CSS is not JS: it has strings, but no regex literals and no `//` comments.
pub fn find_brace_close(s: &str, body_start: usize) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut depth: usize = 1;
    let mut i = body_start;
    while i < bytes.len() {
        match bytes[i] {
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            b'"' | b'\'' | b'`' => {
                let q = bytes[i];
                i += 1;
                while i < bytes.len() {
                    if bytes[i] == b'\\' && i + 1 < bytes.len() {
                        i += 2;
                        continue;
                    }
                    if bytes[i] == q {
                        break;
                    }
                    i += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

// ─── Codegen helpers used by emit.rs ────────────────────────────────────────
//
// Codegen pulls per-entry metadata (`describe`, `expose`, `default`, `type`,
// `value`, `handler`, `on`) and the running-code expression. These helpers
// implement the bare/wrapped duality at the lowering boundary so the JS
// calls emitted are byte-identical to v1 output (per AC-6).

/// Look up a key in the entry's metadata bag (wrapped form). Returns the
/// raw source string for the key's value, or `None` if absent.
pub fn meta_get<'a>(entry: &'a CollectionEntry, key: &str) -> Option<&'a str> {
    entry
        .meta
        .iter()
        .find_map(|(k, v)| if k == key { Some(v.as_str()) } else { None })
}

/// Resolve the running-code source for an entry. For bare entries, it's the
/// `value_raw` (a function expression). For wrapped entries, it's the
/// `value:` or `handler:` key.
pub fn running_code<'a>(entry: &'a CollectionEntry) -> Option<&'a str> {
    if !entry.is_wrapped {
        return Some(entry.value_raw.as_str());
    }
    meta_get(entry, "value").or_else(|| meta_get(entry, "handler"))
}

/// Extract the body text from an arrow function `(args) => body`. For
/// `() => { stmts }`, returns `stmts`. For `() => expr`, returns `expr`.
/// Returns `None` if the input is not recognizable as an arrow.
pub fn arrow_body(arrow: &str) -> Option<String> {
    let trimmed = arrow.trim();
    // Find the `=>` at depth 0 (not inside parens/braces/strings).
    let bytes = trimmed.as_bytes();
    let mut depth_paren = 0i32;
    let mut depth_brace = 0i32;
    let mut depth_bracket = 0i32;
    let mut i = 0usize;
    while i + 1 < bytes.len() {
        match bytes[i] {
            b'(' => depth_paren += 1,
            b')' => depth_paren = (depth_paren - 1).max(0),
            b'{' => depth_brace += 1,
            b'}' => depth_brace = (depth_brace - 1).max(0),
            b'[' => depth_bracket += 1,
            b']' => depth_bracket = (depth_bracket - 1).max(0),
            b'"' | b'\'' | b'`' => {
                let q = bytes[i];
                i += 1;
                while i < bytes.len() {
                    if bytes[i] == b'\\' && i + 1 < bytes.len() {
                        i += 2;
                        continue;
                    }
                    if bytes[i] == q {
                        break;
                    }
                    i += 1;
                }
            }
            b'=' if bytes[i + 1] == b'>'
                && depth_paren == 0
                && depth_brace == 0
                && depth_bracket == 0 =>
            {
                let after = trimmed[i + 2..].trim();
                if let Some(stripped) = after.strip_prefix('{') {
                    if let Some(stripped) = stripped.strip_suffix('}') {
                        return Some(stripped.trim().to_string());
                    }
                }
                // Expression body — return as-is.
                return Some(after.to_string());
            }
            _ => {}
        }
        i += 1;
    }
    None
}

/// Extract the parameter list `(args)` from an arrow function. Returns the
/// args text (between the outermost `(` and `)`), or `None` if unrecognizable.
pub fn arrow_args(arrow: &str) -> Option<String> {
    let trimmed = arrow.trim();
    let bytes = trimmed.as_bytes();
    if bytes.first() != Some(&b'(') {
        // Single-identifier param form: `x => body`.
        let arrow_pos = trimmed.find("=>")?;
        return Some(trimmed[..arrow_pos].trim().to_string());
    }
    let close = find_paren_close(trimmed, 1)?;
    Some(trimmed[1..close].trim().to_string())
}

/// arch-3 M2 (RFC-003) — detect whether a `$resource` running-code thunk
/// body is a magna-origin query so it can be lowered to `createMagnaResource`
/// instead of the plain `createResource`.
///
/// "Magna origin" is signalled SYNTACTICALLY (the Rust compiler has no
/// plugin-config passthrough): the expression must reference the magna typed
/// client `data.<IDENT>.query(`. The matcher is deliberately conservative —
/// it requires the literal `data.` prefix followed by a single identifier and
/// `.query(`, so common non-magna code like `db.query(...)` or
/// `el.querySelector(...)` does NOT match.
pub fn is_magna_origin(thunk_body: &str) -> bool {
    let trimmed = thunk_body.trim();
    let Some(after_data) = trimmed.strip_prefix("data.") else {
        return false;
    };
    // Read the identifier following `data.`.
    let mut idx = 0usize;
    let bytes = after_data.as_bytes();
    while idx < bytes.len() {
        let c = bytes[idx];
        let is_ident = c.is_ascii_alphanumeric() || c == b'_' || c == b'$';
        if !is_ident {
            break;
        }
        idx += 1;
    }
    // Require at least one identifier char, then exactly `.query(`.
    idx != 0 && after_data[idx..].starts_with(".query(")
}

/// The deferred-SSR M3 codegen marker appended to a `$auth.session()` lowering.
///
/// RFC-001's intent is that `$auth.session()` lowers to a `$shared` signal
/// seeded server-side from `getAuthState(request, config)`. The compiler has
/// no request-context/config passthrough at the `@state` lowering boundary
/// today, so the SSR pre-seed is deferred to M3 — `$auth.session()` lowers to
/// the client-resolvable `useCurrentUser()` form PLUS this TODO marker.
/// `$auth.currentUser()` lowers cleanly with no marker (empty string). All
/// three emit sites share this single source of the TODO text.
pub fn auth_session_todo(method: AuthMacroKind) -> &'static str {
    match method {
        AuthMacroKind::Session => " /* TODO(M3-auth-ssr): seed this $shared session from getAuthState(request, config) once the SSR request-context passthrough lands — RFC-001 §SSR-seed; see arch-3-plugins.md §6 RFC-001 */",
        AuthMacroKind::CurrentUser => "",
    }
}

/// Emit JS for a list of `StateMacro` declarations (no per-line indent).
/// Used by the simple emit path; the indented variant lives in
/// `codegen/emit.rs`.
pub fn emit_state_macros(macros: &[StateMacro]) -> String {
    let mut lines: Vec<String> = Vec::new();
    for mac in macros {
        match mac {
            StateMacro::Collection { kind, entries } => {
                for entry in entries {
                    if let Some(line) = emit_collection_entry(*kind, entry, "") {
                        lines.push(line);
                    }
                }
            }
            StateMacro::EffectAnon { body } => {
                lines.push(format!("effect(() => {{ {} }});", body));
            }
            StateMacro::EffectOn { dep, body } => {
                lines.push(format!("effect(() => {{ {}; {} }});", dep, body));
            }
            StateMacro::Watch { name, body } => {
                lines.push(format!("effect(() => {{ {}; {} }});", name, body));
            }
            StateMacro::Route { name } => {
                lines.push(format!(
                    "const {} = computed(() => __aihuRouter.useRoute());",
                    name
                ));
            }
            StateMacro::BeforeNavigate { expr } => {
                lines.push(format!(
                    "__aihuRouter.__router_registerBeforeGuard({});",
                    expr
                ));
            }
            StateMacro::AfterNavigate { expr } => {
                lines.push(format!(
                    "__aihuRouter.__router_registerAfterGuard({});",
                    expr
                ));
            }
            StateMacro::Query { name, expr } => {
                lines.push(format!(
                    "const {} = createMagnaResource(inject(MagnaFetchToken), {});",
                    name, expr
                ));
            }
            // arch-3 M2 / A3 G2 (RFC-001) — auth `$auth.*` shorthand.
            StateMacro::Auth { name, method } => {
                lines.push(format!(
                    "const {name} = useCurrentUser();{}",
                    auth_session_todo(*method)
                ));
            }
            // §9.4 recipe class-extension + per-file shadow mode: consumed by
            // codegen::emit (threaded into the defineComponent options / emitted
            // as a `// @aihu:shadow` marker), so they produce NO setup-body JS.
            StateMacro::Extends { .. } | StateMacro::Shadow { .. } => {}
        }
    }
    lines.join("\n")
}

/// Emit the lowered JS for a single collection entry. Returns `None` when
/// the entry produces no JS at this level (e.g. `$prop` lowering is more
/// involved and lives in `codegen/emit.rs`).
fn emit_collection_entry(
    kind: CollectionKind,
    entry: &CollectionEntry,
    indent: &str,
) -> Option<String> {
    match kind {
        CollectionKind::Prop => {
            // Simple lowering used by emit_state_macros: signal-style ctx.attrs
            // path. The richer typed lowering is in codegen::emit.
            Some(format!(
                "{indent}const {name} = computed(() => ctx.attrs.{name});",
                indent = indent,
                name = entry.name
            ))
        }
        CollectionKind::Computed => {
            let thunk = running_code(entry)?;
            let body = arrow_body(thunk).unwrap_or_else(|| thunk.to_string());
            Some(format!(
                "{indent}const {name} = computed(() => {body});",
                indent = indent,
                name = entry.name,
                body = body
            ))
        }
        CollectionKind::Resource => {
            let thunk = running_code(entry)?;
            let body = arrow_body(thunk).unwrap_or_else(|| thunk.to_string());
            // arch-3 M2 (RFC-003): magna-origin `$resource` (body is
            // `data.X.query(...)`) lowers to `createMagnaResource`; everything
            // else keeps the plain `createResource` lowering (no regression).
            if is_magna_origin(&body) {
                Some(format!(
                    "{indent}const {name} = createMagnaResource(inject(MagnaFetchToken), {body});",
                    indent = indent,
                    name = entry.name,
                    body = body
                ))
            } else {
                Some(format!(
                    "{indent}const {name} = createResource(() => {body});",
                    indent = indent,
                    name = entry.name,
                    body = body
                ))
            }
        }
        CollectionKind::Action => {
            let arrow = running_code(entry)?;
            let args = arrow_args(arrow).unwrap_or_default();
            let body = arrow_body(arrow).unwrap_or_default();
            Some(format!(
                "{indent}function {name}({args}) {{ return batch(() => {{ {body} }}) }}",
                indent = indent,
                name = entry.name,
                args = args,
                body = body
            ))
        }
        CollectionKind::Effect => {
            let thunk = running_code(entry)?;
            let body = arrow_body(thunk).unwrap_or_else(|| thunk.to_string());
            // If `on:` is present, prepend deps as a no-op statement to
            // force tracking (byte-identical to v1 `effect.on(dep) { body }`
            // lowering).
            if let Some(deps_raw) = meta_get(entry, "on") {
                let deps_inner = deps_raw
                    .trim()
                    .strip_prefix('[')
                    .and_then(|s| s.strip_suffix(']'))
                    .unwrap_or(deps_raw);
                Some(format!(
                    "{indent}effect(() => {{ {deps}; {body} }});",
                    indent = indent,
                    deps = deps_inner.trim(),
                    body = body
                ))
            } else {
                Some(format!(
                    "{indent}effect(() => {{ {body} }});",
                    indent = indent,
                    body = body
                ))
            }
        }
        CollectionKind::Event => {
            // B3b — `$event` declarations are compile-time-only metadata. They
            // contribute to (a) `$emit.<name>` resolution at the call site, and
            // (b) the per-SFC `.aihu.ts` sidecar's typed-payload interface.
            // No runtime code is emitted here.
            None
        }
        CollectionKind::Aria => {
            // B4 — `$aria` ARIA wiring is emitted by codegen/emit.rs (emit_aria_wiring)
            // at the SFC level (not per entry), because the pattern requires
            // `attachInternals()` once + per-key mountEffect calls in the setup body.
            // Individual entry lowering is handled there; nothing to emit here.
            None
        }
        CollectionKind::Form => {
            // D5 — `$form` wiring is emitted by codegen/emit.rs (emit_form_wiring)
            // at the SFC level. Individual entry lowering is handled there.
            None
        }
        CollectionKind::Controller => {
            // B5 — `$controller` entries: each entry's `value:` factory is called
            // once; if the result has `hostConnected`/`hostDisconnected` they are
            // wired into onMount/onCleanup respectively.
            let factory = meta_get(entry, "value")?;
            let name = &entry.name;
            Some(format!(
                "{indent}const {name} = (() => {{\n\
                 {indent}  const _ctrl = ({factory})()\n\
                 {indent}  if (typeof _ctrl.hostConnected === 'function') onMount(() => _ctrl.hostConnected())\n\
                 {indent}  if (typeof _ctrl.hostDisconnected === 'function') onCleanup(() => _ctrl.hostDisconnected())\n\
                 {indent}  return _ctrl\n\
                 {indent}}})()",
                indent = indent,
                name = name,
                factory = factory.trim(),
            ))
        }
        CollectionKind::Context => {
            // B5 — `$context` entries are either `provide` or `consume`.
            // The entry is always wrapped: `meta` holds the context keys and their
            // sub-metadata bag strings (parsed by `parse_object_collection`).
            //
            // Example: provide entry → meta: [("theme", "{ value: () => themeSignal }")]
            //          consume entry → meta: [("locale", "{ type: 'Locale' }")]
            let mut lines: Vec<String> = Vec::new();
            for (ctx_key, ctx_val) in &entry.meta {
                let v_trimmed = ctx_val.trim();
                if entry.name == "provide" {
                    // provide: ctx_key → { value: () => factory_expr }
                    let inner2 = strip_outer_braces(v_trimmed)?;
                    let meta2 = parse_meta_pairs(inner2).ok()?;
                    let val_factory = meta2.iter().find(|(mk, _)| mk == "value").map(|(_, mv)| mv.trim())?;
                    lines.push(format!(
                        "{indent}onMount(() => {{\n\
                         {indent}  this.dispatchEvent(new CustomEvent('__aihu_ctx_provide', {{ bubbles: true, composed: true, detail: {{ key: '{key}', value: ({factory})() }} }}))\n\
                         {indent}}})",
                        indent = indent,
                        key = ctx_key,
                        factory = val_factory,
                    ));
                } else {
                    // consume: ctx_key → { type: 'T' }
                    lines.push(format!(
                        "{indent}let {key} = undefined\n\
                         {indent}onMount(() => {{\n\
                         {indent}  this.addEventListener('__aihu_ctx_provide', (e) => {{\n\
                         {indent}    if (e.detail?.key === '{key}') {key} = e.detail.value\n\
                         {indent}  }})\n\
                         {indent}  this.dispatchEvent(new Event('__aihu_ctx_request', {{ bubbles: true, composed: true }}))\n\
                         {indent}}})",
                        indent = indent,
                        key = ctx_key,
                    ));
                    let _ = v_trimmed;
                }
            }
            if lines.is_empty() { None } else { Some(lines.join("\n")) }
        }
        CollectionKind::Lifecycle => {
            // R2 (Director r6 §3): four-callback extension. `mount` → onMount,
            // `dispose` → onCleanup, `adopt` → onAdopt, `attributeChange` →
            // onAttributeChange. Each entry value is always a bare arrow per
            // spec §3.6. The two new callbacks are forwarded to the host
            // element's adoptedCallback / attributeChangedCallback by the
            // runtime (see packages/runtime/src/define-component.ts).
            let arrow = running_code(entry)?;
            let body = arrow_body(arrow).unwrap_or_else(|| arrow.to_string());
            let call = match entry.name.as_str() {
                "mount" => "onMount",
                "dispose" => "onCleanup",
                "adopt" => "onAdopt",
                "attributeChange" => {
                    // attributeChange takes (name, oldValue, newValue, ctx).
                    // Preserve the user-supplied param list verbatim — fall
                    // back to a generic 4-arg shape if we cannot extract it.
                    let args = arrow_args(arrow).unwrap_or_else(|| {
                        "_name, _oldValue, _newValue, _ctx".to_string()
                    });
                    return Some(format!(
                        "{indent}onAttributeChange(({args}) => {{ {body} }});",
                        indent = indent,
                        args = args,
                        body = body
                    ));
                }
                _ => return None,
            };
            Some(format!(
                "{indent}{call}(() => {{ {body} }});",
                indent = indent,
                call = call,
                body = body
            ))
        }
        CollectionKind::Stream => {
            // v0.4.0 — `$stream` entries lower to `createStream(source_factory)`.
            // The primary codegen is in codegen/emit.rs (emit_state_macro_code);
            // this branch handles the legacy `emit_state_macros_indented` path.
            let source_factory = entry
                .meta
                .iter()
                .find(|(k, _)| k == "source")
                .map(|(_, v)| v.trim())
                .unwrap_or("() => null");
            Some(format!(
                "{indent}const {name} = createStream({source_factory});",
                indent = indent,
                name = entry.name,
            ))
        }
    }
}

/// Indented emit used by `codegen/emit.rs` (2-space indent prefix).
pub fn emit_state_macros_indented(macros: &[StateMacro], indent: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    for mac in macros {
        match mac {
            StateMacro::Collection { kind, entries } => {
                for entry in entries {
                    if matches!(kind, CollectionKind::Prop) {
                        // R1 — $prop now lowers to `const <name> = ctx.props.<name>`,
                        // a callable signal getter. The runtime allocates per-prop
                        // signals at connect time and wires observedAttributes +
                        // attributeChangedCallback. See codegen::emit::emit_state_macro_code
                        // for the canonical comment + the runtime side in
                        // packages/runtime/src/define-component.ts.
                        lines.push(format!(
                            "{indent}const {name} = ctx.props.{name}",
                            indent = indent,
                            name = entry.name
                        ));
                    } else if let Some(line) = emit_collection_entry(*kind, entry, indent) {
                        lines.push(line);
                    }
                }
            }
            StateMacro::EffectAnon { body } => {
                lines.push(format!("{indent}effect(() => {{ {body} }});"));
            }
            StateMacro::EffectOn { dep, body } => {
                lines.push(format!("{indent}effect(() => {{ {dep}; {body} }});"));
            }
            StateMacro::Watch { name, body } => {
                lines.push(format!("{indent}effect(() => {{ {name}; {body} }});"));
            }
            StateMacro::Route { name } => {
                lines.push(format!(
                    "{indent}const {name} = computed(() => __aihuRouter.useRoute());"
                ));
            }
            StateMacro::BeforeNavigate { expr } => {
                lines.push(format!(
                    "{indent}__aihuRouter.__router_registerBeforeGuard({expr});"
                ));
            }
            StateMacro::AfterNavigate { expr } => {
                lines.push(format!(
                    "{indent}__aihuRouter.__router_registerAfterGuard({expr});"
                ));
            }
            // arch-3 M2 (RFC-003) — magna `$query` shorthand.
            StateMacro::Query { name, expr } => {
                lines.push(format!(
                    "{indent}const {name} = createMagnaResource(inject(MagnaFetchToken), {expr});"
                ));
            }
            // arch-3 M2 / A3 G2 (RFC-001) — auth `$auth.*` shorthand.
            StateMacro::Auth { name, method } => {
                lines.push(format!(
                    "{indent}const {name} = useCurrentUser();{}",
                    auth_session_todo(*method)
                ));
            }
            // §9.4 — consumed by codegen::emit, no setup-body JS (see above).
            StateMacro::Extends { .. } | StateMacro::Shadow { .. } => {}
        }
    }
    if lines.is_empty() {
        String::new()
    } else {
        lines.join("\n") + "\n"
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn first_collection(macros: &[StateMacro]) -> (&CollectionKind, &Vec<CollectionEntry>) {
        match &macros[0] {
            StateMacro::Collection { kind, entries } => (kind, entries),
            other => panic!("expected Collection, got {:?}", other),
        }
    }

    // ─── v2 collection-form parsing ──────────────────────────────────────────

    #[test]
    fn parse_prop_collection_wrapped() {
        let src = "$prop: { hue: { default: 215, describe: 'Hue (0-360)' } }";
        let macros = parse_state_macros(src).unwrap();
        assert_eq!(macros.len(), 1);
        let (kind, entries) = first_collection(&macros);
        assert_eq!(*kind, CollectionKind::Prop);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "hue");
        assert!(entries[0].is_wrapped);
        assert_eq!(meta_get(&entries[0], "default"), Some("215"));
        assert_eq!(meta_get(&entries[0], "describe"), Some("'Hue (0-360)'"));
    }

    #[test]
    fn parse_prop_multi_entry() {
        let src = "$prop: {\n  hue: { default: 215 },\n  saturation: { default: 70 },\n  lightness: { default: 55 },\n}";
        let macros = parse_state_macros(src).unwrap();
        let (_, entries) = first_collection(&macros);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].name, "hue");
        assert_eq!(entries[1].name, "saturation");
        assert_eq!(entries[2].name, "lightness");
    }

    #[test]
    fn parse_computed_bare() {
        let src = "$computed: { onPrimary: () => lightness < 60 ? 'a' : 'b' }";
        let macros = parse_state_macros(src).unwrap();
        let (kind, entries) = first_collection(&macros);
        assert_eq!(*kind, CollectionKind::Computed);
        assert_eq!(entries[0].name, "onPrimary");
        assert!(!entries[0].is_wrapped);
        assert!(entries[0].value_raw.starts_with("() =>"));
    }

    #[test]
    fn parse_computed_wrapped_with_metadata() {
        let src = "$computed: { primary: { describe: 'P', expose: { read: true }, value: () => 'x' } }";
        let macros = parse_state_macros(src).unwrap();
        let (_, entries) = first_collection(&macros);
        assert_eq!(entries[0].name, "primary");
        assert!(entries[0].is_wrapped);
        assert_eq!(meta_get(&entries[0], "describe"), Some("'P'"));
        assert_eq!(meta_get(&entries[0], "expose"), Some("{ read: true }"));
        assert!(meta_get(&entries[0], "value").unwrap().starts_with("() =>"));
    }

    #[test]
    fn parse_computed_mix_bare_and_wrapped() {
        // Spec §3.2 canonical example — mixed bare + wrapped in same block.
        let src = "$computed: {\n  primary: { value: () => 'a' },\n  onPrimary: () => 'b',\n  surface: () => 'c',\n}";
        let macros = parse_state_macros(src).unwrap();
        let (_, entries) = first_collection(&macros);
        assert_eq!(entries.len(), 3);
        assert!(entries[0].is_wrapped);
        assert!(!entries[1].is_wrapped);
        assert!(!entries[2].is_wrapped);
    }

    #[test]
    fn parse_action_wrapped() {
        let src = "$action: { setHue: { describe: 'Set hue', handler: (h: number) => { hue = h } } }";
        let macros = parse_state_macros(src).unwrap();
        let (kind, entries) = first_collection(&macros);
        assert_eq!(*kind, CollectionKind::Action);
        assert_eq!(entries[0].name, "setHue");
        let handler = meta_get(&entries[0], "handler").unwrap();
        assert!(handler.contains("h: number"));
    }

    #[test]
    fn parse_action_bare() {
        let src = "$action: { setHue: (h: number) => { hue = h } }";
        let macros = parse_state_macros(src).unwrap();
        let (_, entries) = first_collection(&macros);
        assert_eq!(entries[0].name, "setHue");
        assert!(!entries[0].is_wrapped);
        assert!(entries[0].value_raw.contains("h: number"));
    }

    #[test]
    fn parse_resource_collection() {
        let src = "$resource: { data: () => fetchUsers() }";
        let macros = parse_state_macros(src).unwrap();
        let (kind, _) = first_collection(&macros);
        assert_eq!(*kind, CollectionKind::Resource);
    }

    #[test]
    fn parse_effect_named_collection() {
        let src = "$effect: { logData: () => { console.log(data()) } }";
        let macros = parse_state_macros(src).unwrap();
        let (kind, entries) = first_collection(&macros);
        assert_eq!(*kind, CollectionKind::Effect);
        assert_eq!(entries[0].name, "logData");
    }

    #[test]
    fn parse_effect_with_on_deps() {
        let src = "$effect: { updateList: { on: [data], value: () => updateList(data()) } }";
        let macros = parse_state_macros(src).unwrap();
        let (_, entries) = first_collection(&macros);
        assert_eq!(meta_get(&entries[0], "on"), Some("[data]"));
    }

    #[test]
    fn parse_effect_anonymous() {
        let src = "$effect: () => { persist(state) }";
        let macros = parse_state_macros(src).unwrap();
        assert_eq!(macros.len(), 1);
        match &macros[0] {
            StateMacro::EffectAnon { body } => assert_eq!(body, "persist(state)"),
            other => panic!("expected EffectAnon, got {:?}", other),
        }
    }

    #[test]
    fn parse_lifecycle_collection() {
        let src = "$lifecycle: { mount: () => initializeWidget(), dispose: () => cleanup() }";
        let macros = parse_state_macros(src).unwrap();
        let (kind, entries) = first_collection(&macros);
        assert_eq!(*kind, CollectionKind::Lifecycle);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "mount");
        assert_eq!(entries[1].name, "dispose");
    }

    // ─── R2 ($lifecycle four-callback extension, Director r6 §3.R2) ──────────

    #[test]
    fn r2_ac1_lifecycle_four_callbacks_parse() {
        let src = "$lifecycle: {\n  mount: () => init(),\n  dispose: () => cleanup(),\n  adopt: () => onMoved(),\n  attributeChange: (name, oldV, newV) => log(name),\n}";
        let macros = parse_state_macros(src).unwrap();
        let (kind, entries) = first_collection(&macros);
        assert_eq!(*kind, CollectionKind::Lifecycle);
        assert_eq!(entries.len(), 4);
        assert_eq!(entries[0].name, "mount");
        assert_eq!(entries[1].name, "dispose");
        assert_eq!(entries[2].name, "adopt");
        assert_eq!(entries[3].name, "attributeChange");
        // Each is bare (per spec §3.6 + R2: $lifecycle entries are always bare).
        for e in entries {
            assert!(!e.is_wrapped, "{} should be bare", e.name);
        }
    }

    #[test]
    fn r2_ac4_lifecycle_back_compat_mount_dispose() {
        // The pre-R2 surface (mount + dispose only) must still parse.
        let src = "$lifecycle: { mount: () => init(), dispose: () => cleanup() }";
        let macros = parse_state_macros(src).unwrap();
        let (_, entries) = first_collection(&macros);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "mount");
        assert_eq!(entries[1].name, "dispose");
    }

    #[test]
    fn r2_ac1_lifecycle_emit_adopt() {
        let src = "$lifecycle: { adopt: () => onMoved() }";
        let macros = parse_state_macros(src).unwrap();
        let js = emit_state_macros(&macros);
        assert_eq!(js, "onAdopt(() => { onMoved() });");
    }

    #[test]
    fn r2_ac1_lifecycle_emit_attribute_change() {
        let src = "$lifecycle: { attributeChange: (name, oldV, newV) => log(name) }";
        let macros = parse_state_macros(src).unwrap();
        let js = emit_state_macros(&macros);
        // Param list preserved verbatim from the user-authored arrow.
        assert_eq!(
            js,
            "onAttributeChange((name, oldV, newV) => { log(name) });"
        );
    }

    #[test]
    fn r2_ac1_lifecycle_emit_all_four() {
        let src = "$lifecycle: {\n  mount: () => init(),\n  dispose: () => done(),\n  adopt: () => move(),\n  attributeChange: (n, o, v) => log(n, o, v),\n}";
        let macros = parse_state_macros(src).unwrap();
        let js = emit_state_macros(&macros);
        assert!(js.contains("onMount(() => { init() });"));
        assert!(js.contains("onCleanup(() => { done() });"));
        assert!(js.contains("onAdopt(() => { move() });"));
        assert!(js.contains("onAttributeChange((n, o, v) => { log(n, o, v) });"));
    }

    #[test]
    fn r2_invalid_lifecycle_key_rejected() {
        // Keys other than mount/dispose/adopt/attributeChange remain C444.
        let err = parse_state_macros("$lifecycle: { foo: () => bar() }").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C444"));
    }

    // ─── Q4 (observedAttributes collision compile-time error C446) ────────────

    #[test]
    fn q4_collision_two_explicit_attributes() {
        // Two $props with the same explicit `attribute:` → collision.
        let src = "$prop: { foo: { default: 0, attribute: 'data-x' }, bar: { default: 0, attribute: 'data-x' } }";
        let err = parse_state_macros(src).unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C446"));
        assert!(err.message.contains("data-x"), "got: {}", err.message);
        assert!(err.message.contains("foo"), "got: {}", err.message);
        assert!(err.message.contains("bar"), "got: {}", err.message);
    }

    #[test]
    fn q4_collision_explicit_vs_default_kebab() {
        // `dataX` auto-kebabs to `data-x`; another prop explicitly sets
        // `attribute: 'data-x'` → collision.
        let src = "$prop: { dataX: { default: 0 }, other: { default: 0, attribute: 'data-x' } }";
        let err = parse_state_macros(src).unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C446"));
        assert!(err.message.contains("data-x"), "got: {}", err.message);
    }

    #[test]
    fn q4_collision_suggestion_in_hint() {
        let src = "$prop: { a: { default: 0, attribute: 'shared' }, b: { default: 0, attribute: 'shared' } }";
        let err = parse_state_macros(src).unwrap_err();
        assert!(
            err.hint
                .as_deref()
                .unwrap_or("")
                .contains("specify `attribute:`"),
            "expected hint to contain 'specify `attribute:`', got: {:?}",
            err.hint
        );
    }

    #[test]
    fn q4_attribute_false_does_not_collide() {
        // `attribute: false` props are property-only — they never participate
        // in observedAttributes, so they cannot collide.
        let src = "$prop: { foo: { default: 0, attribute: false }, bar: { default: 0, attribute: 'foo' } }";
        let macros = parse_state_macros(src).unwrap();
        assert_eq!(macros.len(), 1);
    }

    #[test]
    fn q4_no_collision_distinct_attributes() {
        // Two props with distinct attributes — no collision.
        let src = "$prop: { foo: { default: 0 }, bar: { default: 0 } }";
        let macros = parse_state_macros(src).unwrap();
        assert_eq!(macros.len(), 1);
    }

    #[test]
    fn q4_no_collision_attribute_true_uses_kebab() {
        // `attribute: true` is the explicit form of "use auto-kebab default".
        // Two props that resolve to different kebab strings — no collision.
        let src = "$prop: { foo: { default: 0, attribute: true }, bar: { default: 0 } }";
        let macros = parse_state_macros(src).unwrap();
        assert_eq!(macros.len(), 1);
    }

    #[test]
    fn q4_kebab_helper_matches_runtime() {
        // The compile-time kebab-case must mirror the runtime `_kebab` so the
        // collision check uses the SAME mapping the runtime applies. Mirror
        // a handful of cases from runtime tests.
        assert_eq!(kebab_case("myProp"), "my-prop");
        assert_eq!(kebab_case("themeMode"), "theme-mode");
        assert_eq!(kebab_case("a"), "a");
        assert_eq!(kebab_case("ABC"), "a-b-c");
    }

    // ─── C440 — old v1 forms rejected ─────────────────────────────────────────

    #[test]
    fn c440_old_prop_form_rejected() {
        let err = parse_state_macros("$prop label: String").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
        assert!(err.message.contains("migrate.ts"));
    }

    #[test]
    fn c440_old_computed_form_rejected() {
        let err = parse_state_macros("$computed upper = label.toUpperCase()").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
    }

    #[test]
    fn c440_old_resource_form_rejected() {
        let err = parse_state_macros("$resource data = fetchUsers()").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
    }

    #[test]
    fn c440_old_action_form_rejected() {
        let err = parse_state_macros("$action submit(data) { sendForm(data) }").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
    }

    #[test]
    fn c440_old_lifecycle_mount_rejected() {
        let err = parse_state_macros("$lifecycle.mount { initializeWidget() }").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
    }

    #[test]
    fn c440_old_lifecycle_dispose_rejected() {
        let err = parse_state_macros("$lifecycle.dispose { cleanup() }").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C440"));
    }

    // ─── Per-kind validation ──────────────────────────────────────────────────

    #[test]
    fn c444_prop_must_be_wrapped() {
        let err = parse_state_macros("$prop: { hue: 215 }").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C444"));
    }

    #[test]
    fn c444_lifecycle_must_be_bare() {
        let err = parse_state_macros("$lifecycle: { mount: { handler: () => init() } }").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C444"));
    }

    #[test]
    fn c444_lifecycle_only_mount_dispose() {
        let err = parse_state_macros("$lifecycle: { foo: () => bar() }").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C444"));
    }

    // ─── Multiplicity (§2.5) ──────────────────────────────────────────────────

    #[test]
    fn c441_two_anonymous_effects_rejected() {
        let src = "$effect: () => { a() }\n$effect: () => { b() }";
        let err = parse_state_macros(src).unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C441"));
    }

    #[test]
    fn anonymous_and_named_effect_coexist() {
        let src = "$effect: { logData: () => { log() } }\n$effect: () => { persist() }";
        let macros = parse_state_macros(src).unwrap();
        assert_eq!(macros.len(), 2);
        assert!(matches!(macros[0], StateMacro::Collection { kind: CollectionKind::Effect, .. }));
        assert!(matches!(macros[1], StateMacro::EffectAnon { .. }));
    }

    // ─── Indented-line offset regression — keyword math relative to `$`, ─────
    // not relative to start-of-line. Previously the second indented line
    // mis-aligned and was rejected as v1 syntax.
    #[test]
    fn parse_indented_macros_in_block() {
        let src = "  $effect: () => { a() }\n  $prop: { x: { default: 0 } }";
        let macros = parse_state_macros(src).unwrap();
        assert_eq!(macros.len(), 2);
        assert!(matches!(macros[0], StateMacro::EffectAnon { .. }));
        assert!(matches!(
            macros[1],
            StateMacro::Collection { kind: CollectionKind::Prop, .. }
        ));
    }

    #[test]
    fn c441_indented_two_anonymous_effects() {
        // Same C441 path, but with leading indentation on each line —
        // canonical example shape inside `@state { ... }`.
        let src = "  $effect: () => { a() }\n  $effect: () => { b() }";
        let err = parse_state_macros(src).unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C441"));
    }

    // ─── Preserved-from-v1 macros ─────────────────────────────────────────────

    #[test]
    fn parse_effect_on_block() {
        let macros = parse_state_macros("$effect.on(count) { console.log(count) }").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            StateMacro::EffectOn {
                dep: "count".to_string(),
                body: "console.log(count)".to_string()
            }
        );
    }

    #[test]
    fn parse_watch_block() {
        let macros = parse_state_macros("$watch count { update() }").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            StateMacro::Watch {
                name: "count".to_string(),
                body: "update()".to_string()
            }
        );
    }

    #[test]
    fn parse_route_declaration() {
        let macros = parse_state_macros("$route currentRoute").unwrap();
        assert_eq!(macros.len(), 1);
        assert_eq!(
            macros[0],
            StateMacro::Route { name: "currentRoute".to_string() }
        );
    }

    #[test]
    fn parse_route_rejects_rhs() {
        let err = parse_state_macros("$route currentRoute = 5").unwrap_err();
        assert!(err.message.contains("$route declaration takes no rhs"));
    }

    #[test]
    fn parse_before_navigate_inline() {
        let macros = parse_state_macros("$beforeNavigate((to, from, next) => next())").unwrap();
        assert_eq!(macros.len(), 1);
        match &macros[0] {
            StateMacro::BeforeNavigate { expr } => {
                assert_eq!(expr, "(to, from, next) => next()");
            }
            _ => panic!("expected BeforeNavigate"),
        }
    }

    #[test]
    fn parse_after_navigate_inline() {
        let macros = parse_state_macros("$afterNavigate((to) => log(to))").unwrap();
        assert_eq!(macros.len(), 1);
        match &macros[0] {
            StateMacro::AfterNavigate { expr } => {
                assert_eq!(expr, "(to) => log(to)");
            }
            _ => panic!("expected AfterNavigate"),
        }
    }

    #[test]
    fn parse_before_navigate_multiline_arrow() {
        let body = "$beforeNavigate((to, from, next) => {\n  if (dirty) return next(false)\n  next()\n})";
        let macros = parse_state_macros(body).unwrap();
        assert_eq!(macros.len(), 1);
        match &macros[0] {
            StateMacro::BeforeNavigate { expr } => {
                assert!(expr.contains("if (dirty)"));
                assert!(expr.contains("next(false)"));
            }
            _ => panic!("expected BeforeNavigate"),
        }
    }

    // ─── Emit byte-identical to v1 ────────────────────────────────────────────

    #[test]
    fn emit_prop_collection() {
        let macros = parse_state_macros("$prop: { label: { default: '' } }").unwrap();
        let js = emit_state_macros(&macros);
        assert_eq!(js, "const label = computed(() => ctx.attrs.label);");
    }

    #[test]
    fn emit_computed_bare() {
        let macros = parse_state_macros("$computed: { doubled: () => count * 2 }").unwrap();
        let js = emit_state_macros(&macros);
        assert_eq!(js, "const doubled = computed(() => count * 2);");
    }

    #[test]
    fn emit_resource_bare() {
        let macros = parse_state_macros("$resource: { data: () => fetchData() }").unwrap();
        let js = emit_state_macros(&macros);
        assert_eq!(js, "const data = createResource(() => fetchData());");
    }

    #[test]
    fn emit_action_wrapped() {
        let macros =
            parse_state_macros("$action: { increment: { handler: (n) => { count += n } } }")
                .unwrap();
        let js = emit_state_macros(&macros);
        assert_eq!(
            js,
            "function increment(n) { return batch(() => { count += n }) }"
        );
    }

    #[test]
    fn emit_effect_anonymous() {
        let macros = parse_state_macros("$effect: () => { persist(state) }").unwrap();
        let js = emit_state_macros(&macros);
        assert_eq!(js, "effect(() => { persist(state) });");
    }

    #[test]
    fn emit_lifecycle_collection() {
        let macros =
            parse_state_macros("$lifecycle: { mount: () => init(), dispose: () => cleanup() }")
                .unwrap();
        let js = emit_state_macros(&macros);
        assert_eq!(
            js,
            "onMount(() => { init() });\nonCleanup(() => { cleanup() });"
        );
    }

    #[test]
    fn emit_route_macro() {
        let macros = parse_state_macros("$route currentRoute").unwrap();
        let js = emit_state_macros(&macros);
        assert_eq!(
            js,
            "const currentRoute = computed(() => __aihuRouter.useRoute());"
        );
    }

    // ─── Canonical example (color-theme @state block) — every name must lower ─

    #[test]
    fn parse_canonical_color_theme_state_block() {
        // examples/_shared/macro-test.aihu lines 28–72 (active substance —
        // commented stretch at lines 74–99 omitted).
        let src = "\
$prop: {
  hue:        { default: 215, describe: 'Hue channel (0-360)',        expose: { read: true, write: true } },
  saturation: { default: 70,  describe: 'Saturation channel (0-100)', expose: { read: true, write: true } },
  lightness:  { default: 55,  describe: 'Lightness channel (0-100)',  expose: { read: true, write: true } },
}

$computed: {
  primary: {
    describe: 'Computed HSL primary color string',
    expose: { read: true },
    value: () => `hsl(${hue} ${saturation}% ${lightness}%)`,
  },
  onPrimary: () => lightness < 60 ? '#ffffff' : '#111111',
  surface:   () => `hsl(${hue} ${Math.max(saturation - 60, 5)}% 96%)`,
}

$action: {
  setPreset: {
    describe: 'Set a named color preset by hue value',
    expose: { read: true, write: true },
    handler: (h: number) => {
      hue = h
      saturation = 70
      lightness = 55
    },
  },
  setHue: {
    describe: 'Set hue directly (0-360)',
    expose: { read: true, write: true },
    handler: (h: number) => { hue = h },
  },
  setSaturation: {
    describe: 'Set saturation directly (0-100)',
    expose: { read: true, write: true },
    handler: (s: number) => { saturation = s },
  },
  setLightness: {
    describe: 'Set lightness directly (0-100)',
    expose: { read: true, write: true },
    handler: (l: number) => { lightness = l },
  },
}
";
        let macros = parse_state_macros(src).unwrap();
        // Expect 3 Collections: Prop, Computed, Action.
        assert_eq!(macros.len(), 3);

        // Prop: 3 entries
        match &macros[0] {
            StateMacro::Collection { kind: CollectionKind::Prop, entries } => {
                let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
                assert_eq!(names, vec!["hue", "saturation", "lightness"]);
            }
            other => panic!("expected Prop collection, got {:?}", other),
        }

        // Computed: 3 entries (mixed bare + wrapped)
        match &macros[1] {
            StateMacro::Collection { kind: CollectionKind::Computed, entries } => {
                let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
                assert_eq!(names, vec!["primary", "onPrimary", "surface"]);
                assert!(entries[0].is_wrapped);
                assert!(!entries[1].is_wrapped);
                assert!(!entries[2].is_wrapped);
            }
            other => panic!("expected Computed collection, got {:?}", other),
        }

        // Action: 4 entries, all wrapped
        match &macros[2] {
            StateMacro::Collection { kind: CollectionKind::Action, entries } => {
                let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
                assert_eq!(names, vec!["setPreset", "setHue", "setSaturation", "setLightness"]);
                for e in entries {
                    assert!(e.is_wrapped);
                }
            }
            other => panic!("expected Action collection, got {:?}", other),
        }
    }
}
