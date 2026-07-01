use std::collections::{BTreeMap, BTreeSet};

/// Maps reactive names to their setter name (for `[getter, setter] = signal(...)` pairs)
/// or to an empty string (for computed signals emitted via `$computed name = expr`).
///
/// Template emission uses this map to decide whether to emit a reactive leaf
/// (`leaf([getter, setter])` or `leaf([() => name[0]().prop, () => {}])`) or a
/// plain leaf (`leaf(expr)`).
#[derive(Debug, Default, PartialEq)]
pub struct SignalMap(pub BTreeMap<String, String>);

/// All identifiers declared in `@state` — the union of signals + computed
/// values + plain class-property declarations like
/// `view: 'week' | 'month' = 'week'`.
///
/// R2 (Defect B): the template emitter consults this set to decide whether
/// an attribute binding (`class={view === 'week' ? 'active' : ''}`,
/// `events={events}`) references reactive state and must therefore be lowered
/// to a `[() => (expr)]` thunk array so arbor's `_applyAttrs` takes its
/// reactive Path 2 (Array.isArray + getter[0]) instead of treating the value
/// as a static primitive — or worse, mistaking a `[]`-initialized array for
/// a Signal tuple and trying to invoke `value[0] as () => unknown`.
///
/// Lives outside `SignalMap` so the existing `Debug` snapshot serialization
/// of `SignalMap` (a single-field tuple struct) stays byte-for-byte identical.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct StateNames(pub BTreeSet<String>);

impl StateNames {
    pub fn insert(&mut self, name: &str) {
        self.0.insert(name.to_string());
    }
    pub fn contains(&self, name: &str) -> bool {
        self.0.contains(name)
    }
}

impl SignalMap {
    /// Returns true if `name` is a reactive value (signal or computed signal).
    pub fn is_reactive(&self, name: &str) -> bool {
        self.0.contains_key(name)
    }

    /// Returns true if `name` is a computed signal (no setter, just a getter tuple).
    pub fn is_computed(&self, name: &str) -> bool {
        matches!(self.0.get(name), Some(s) if s.is_empty())
    }

    /// Register a computed signal name (no setter).
    pub fn insert_computed(&mut self, name: &str) {
        self.0.insert(name.to_string(), String::new());
    }

    /// Register a signal with getter and setter names.
    pub fn insert_signal(&mut self, getter: &str, setter: &str) {
        self.0.insert(getter.to_string(), setter.to_string());
    }
}

/// The set of binding names a `@state` block introduces, plus the subset that
/// are `$prop:` keys.
///
/// Built from the SAME `parse_state_macros` machinery the codegen `emit` pass
/// uses (`process_state_body`), so the cross-block warning pass (Bug 7) and the
/// plain-const-reads-prop diagnostic (Bug 8) agree byte-for-byte with what the
/// emitter actually declares. `all` includes: `$prop:` keys, `$computed:` keys,
/// `$action`/`$resource`/`$stream`/`$controller` keys, `$route` names, and
/// plain `@state` `const`/`let` bindings. `props` is exactly the `$prop:` keys.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct StateDecls {
    /// Every binding name declared in `@state` (all forms).
    pub all: BTreeSet<String>,
    /// The `$prop:` collection keys only (used to detect prop reads in plain consts).
    pub props: BTreeSet<String>,
}

/// Collect every binding name declared in a `@state` block, and separately the
/// `$prop:` key names. Reuses `parse_state_macros` (so it stays in lockstep with
/// codegen) and the same plain-decl scan as `process_state_body`.
///
/// Bare/unparseable macros are tolerated — this is a best-effort symbol scan for
/// diagnostics, never a grammar gate (grammar errors are raised elsewhere).
pub fn collect_state_decls(script: &str) -> StateDecls {
    use crate::types::{CollectionKind, StateMacro};

    let mut decls = StateDecls::default();

    // Legacy v0/v1 forms: `const [g, s] = signal(...)` and `const c = computed(...)`
    // are lifted by `resolve_signals`. Seed from it so signal/computed names count
    // as declared (process_state_body seeds StateNames the same way).
    for k in resolve_signals(script).0.keys() {
        decls.all.insert(k.clone());
    }

    let macros = crate::parser::state_macros::parse_state_macros(script).unwrap_or_default();
    for mac in &macros {
        match mac {
            StateMacro::Collection { kind, entries } => match kind {
                // These collection forms introduce binding names readable from
                // template/state. (Effect/Lifecycle/Event/Aria/Context/Form do
                // not introduce reference-able bindings — see process_state_body.)
                CollectionKind::Prop => {
                    for e in entries {
                        decls.all.insert(e.name.clone());
                        decls.props.insert(e.name.clone());
                    }
                }
                CollectionKind::Computed
                | CollectionKind::Action
                | CollectionKind::Resource
                | CollectionKind::Stream
                | CollectionKind::Controller => {
                    for e in entries {
                        decls.all.insert(e.name.clone());
                    }
                }
                // `$context` provide/consume keys ARE reference-able bindings:
                // the template reads them directly (`{theme}`) and `$action`
                // mutates them. The key names live in each entry's `meta`
                // (entry.name is "provide"/"consume"; the meta keys are the
                // context binding names — mirrors the emitter's extraction in
                // parser/state_macros.rs CollectionKind::Context). Without this
                // they TS2304 in the type-check sidecar and trip the
                // "references X not declared in @state" cross-block warning
                // (which becomes a hard error in v0.4).
                CollectionKind::Context => {
                    for e in entries {
                        for (ctx_key, _) in &e.meta {
                            decls.all.insert(ctx_key.clone());
                        }
                    }
                }
                CollectionKind::Effect
                | CollectionKind::Lifecycle
                | CollectionKind::Event
                | CollectionKind::Aria
                | CollectionKind::Form => {}
            },
            StateMacro::Route { name } => {
                decls.all.insert(name.clone());
            }
            // arch-3 M2 (RFC-003): `$query name` introduces a binding name.
            StateMacro::Query { name, .. } => {
                decls.all.insert(name.clone());
            }
            // arch-3 M2 / A3 G2 (RFC-001): `$auth name` introduces a binding name.
            StateMacro::Auth { name, .. } => {
                decls.all.insert(name.clone());
            }
            StateMacro::EffectAnon { .. }
            | StateMacro::EffectOn { .. }
            | StateMacro::Watch { .. }
            | StateMacro::BeforeNavigate { .. }
            | StateMacro::AfterNavigate { .. }
            // §9.4 — declaration-only; introduce no reference-able binding name.
            | StateMacro::Extends { .. }
            | StateMacro::Shadow { .. } => {}
        }
    }

    // Plain `@state` `const`/`let` bindings: every TOP-LEVEL (not inside a
    // `$macro` body) declaration line. `plain_state_lines` skips `$macro` bodies
    // and imports exactly as `process_state_body` does, so a `const data = ...`
    // INSIDE a `$action`/`$effect` arrow body is NOT mistaken for a top-level
    // @state const.
    for line in plain_state_lines(script) {
        let lt = line.trim();
        if let Some(name) = extract_decl_name(lt) {
            decls.all.insert(name);
        }
        // Destructuring bindings: `const [showLine] = signal(false)` (single
        // element — `resolve_signals` only seeds two-element getter/setter
        // pairs), `const [a, b, c] = …`, and `const { x, y } = …`. Every bound
        // name is a referenceable @state binding.
        for name in extract_destructure_names(lt) {
            decls.all.insert(name);
        }
    }

    decls
}

/// Extract every simple binding name from a destructuring `const`/`let`:
/// `const [a, b] = …` → a, b; `const [only] = …` → only; `const { x, y: z } = …`
/// → x, z; defaults (`a = 1`) and object renames (`y: z`) yield the bound name.
/// Best-effort, flat (does not recurse into nested patterns) — over-collection
/// is harmless for the callers that filter by template reference.
fn extract_destructure_names(line: &str) -> Vec<String> {
    let rest = match line.strip_prefix("const ").or_else(|| line.strip_prefix("let ")) {
        Some(r) => r.trim_start(),
        None => return Vec::new(),
    };
    let close = match rest.chars().next() {
        Some('[') => ']',
        Some('{') => '}',
        _ => return Vec::new(),
    };
    let Some(close_idx) = rest.find(close) else {
        return Vec::new();
    };
    let inner = &rest[1..close_idx];
    let mut names = Vec::new();
    for part in inner.split(',') {
        // strip default value (`a = 1`) then object rename (`key: binding`).
        let no_default = part.split('=').next().unwrap_or("").trim();
        let binding = no_default
            .split_once(':')
            .map(|(_, b)| b.trim())
            .unwrap_or(no_default);
        if let Some(id) = leading_ident(binding) {
            names.push(id);
        }
    }
    names
}

/// Return the TOP-LEVEL plain lines of a `@state` body — every line that is NOT
/// part of a `$macro` body and NOT an `import`. Mirrors the macro-body / import
/// skipping in `process_state_body` (emit.rs) so diagnostics agree with codegen
/// about which lines are top-level `@state` declarations.
///
/// Returns trimmed line slices' owned copies. Read-only; never mutates codegen.
fn plain_state_lines(raw_script: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let bytes = raw_script.as_bytes();
    let mut i = 0usize;
    let mut in_import = false;
    while i < bytes.len() {
        let nl = raw_script[i..].find('\n').map(|r| i + r).unwrap_or(raw_script.len());
        let line_raw = &raw_script[i..nl];
        let line = line_raw.trim();

        // Import lines (and continued multi-line imports) — skip.
        if line.starts_with("import ") || line.starts_with("import\t") {
            let opens_block = line.contains('{') && !line.contains('}');
            in_import = opens_block && !line.contains(" from ");
            i = nl + 1;
            continue;
        }
        if in_import {
            if line.contains(" from ") || line.ends_with(';') {
                in_import = false;
            }
            i = nl + 1;
            continue;
        }

        // `$macro` lines + their multi-line bodies — skip (mirrors emit.rs).
        if line.starts_with('$') {
            let stripped = line.trim_start_matches('$');
            let macro_keyword = stripped.split_ascii_whitespace().next();
            let is_collection_macro = matches!(
                macro_keyword.map(|k| k.trim_end_matches(':')),
                Some("prop")
                    | Some("computed")
                    | Some("action")
                    | Some("resource")
                    | Some("effect")
                    | Some("lifecycle")
                    | Some("event")
                    | Some("aria")
                    | Some("controller")
                    | Some("context")
                    | Some("stream")
            ) && stripped.contains(':');
            let is_preserved_macro =
                stripped.starts_with("effect.on(") || matches!(macro_keyword, Some("watch"));

            if is_collection_macro {
                if let Some(colon_rel) = raw_script[i..].find(':') {
                    let mut p = i + colon_rel + 1;
                    while p < raw_script.len()
                        && matches!(bytes[p], b' ' | b'\t' | b'\n' | b'\r')
                    {
                        p += 1;
                    }
                    if p < raw_script.len() {
                        if bytes[p] == b'{' {
                            if let Some(close) =
                                crate::parser::state_macros::find_brace_close(raw_script, p + 1)
                            {
                                i = close + 1;
                                if i < bytes.len() && bytes[i] == b'\n' {
                                    i += 1;
                                }
                                continue;
                            }
                        } else if bytes[p] == b'(' {
                            if let Some(close_paren) =
                                crate::parser::state_macros::find_paren_close(raw_script, p + 1)
                            {
                                let mut q = close_paren + 1;
                                while q < raw_script.len() && matches!(bytes[q], b' ' | b'\t') {
                                    q += 1;
                                }
                                if q + 1 < raw_script.len()
                                    && bytes[q] == b'='
                                    && bytes[q + 1] == b'>'
                                {
                                    q += 2;
                                    while q < raw_script.len()
                                        && matches!(bytes[q], b' ' | b'\t' | b'\n' | b'\r')
                                    {
                                        q += 1;
                                    }
                                    if q < raw_script.len() && bytes[q] == b'{' {
                                        if let Some(close) =
                                            crate::parser::state_macros::find_brace_close(
                                                raw_script,
                                                q + 1,
                                            )
                                        {
                                            i = close + 1;
                                            if i < bytes.len() && bytes[i] == b'\n' {
                                                i += 1;
                                            }
                                            continue;
                                        }
                                    } else {
                                        let nl2 = raw_script[q..]
                                            .find('\n')
                                            .map(|r| q + r)
                                            .unwrap_or(raw_script.len());
                                        i = nl2 + 1;
                                        continue;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if is_preserved_macro {
                let has_brace = raw_script[i..].find('{').map(|r| i + r);
                let has_nl_first = raw_script[i..].find('\n').map(|r| i + r);
                let brace_start_opt =
                    has_brace.filter(|&b| has_nl_first.map_or(true, |nl2| b < nl2));
                if let Some(brace_start) = brace_start_opt {
                    if let Some(close) =
                        crate::parser::state_macros::find_brace_close(raw_script, brace_start + 1)
                    {
                        i = close + 1;
                        if i < bytes.len() && bytes[i] == b'\n' {
                            i += 1;
                        }
                        continue;
                    }
                }
            }

            i = nl + 1;
            continue;
        }

        out.push(line.to_string());
        i = nl + 1;
    }
    out
}

/// Bug 8 (06cb46b1 / 17f5394b, defect #3): a plain `@state` `const`/`let` whose
/// initializer reads a `$prop:` name TDZ-throws at runtime, because the
/// `const <name> = ctx.props.<name>` shadow is emitted AFTER the plain `@state`
/// body (emit.rs plain_body-before-macro_code ordering, guarded by the
/// documented effect/onMount-capture invariant). Rather than re-order codegen
/// (reactive-correctness risk — user decision), detect the pattern at compile
/// time and surface a clear diagnostic pointing at `$computed`.
///
/// Scans plain `const`/`let` lines (not `$`-macros, not imports) and returns the
/// first `(decl_name, prop_name)` whose RHS initializer references a `$prop` key.
/// Returns `None` when there is no such read.
///
/// `props` must be the `$prop:` key set (from `collect_state_decls(...).props`).
pub fn find_plain_const_prop_read(script: &str, props: &BTreeSet<String>) -> Option<(String, String)> {
    if props.is_empty() {
        return None;
    }
    // Only TOP-LEVEL plain @state const/let lines — NOT lines inside `$action`/
    // `$effect`/etc. bodies (those run lazily, after the prop shadow exists, so
    // they do NOT TDZ-throw). `plain_state_lines` does the macro-body skipping.
    for line in plain_state_lines(script) {
        let trimmed = line.trim();
        let Some(decl_name) = extract_decl_name(trimmed) else {
            continue;
        };
        // Initializer = everything after the first top-level `=`. (No top-level
        // `=` → a bare type-annotated declaration with no initializer → cannot
        // read a prop.)
        let Some(init) = initializer_rhs(trimmed) else {
            continue;
        };
        if let Some(prop) = first_referenced_ident(init, props) {
            return Some((decl_name, prop));
        }
    }
    None
}

/// Return the initializer RHS of a `const`/`let` line — the text after the first
/// top-level `=` (ignoring `==`, `=>`, `<=`, `>=`, `!=`, and `=` inside strings).
/// Returns `None` when there is no top-level assignment `=`.
fn initializer_rhs(line: &str) -> Option<&str> {
    let bytes = line.as_bytes();
    let mut i = 0usize;
    let mut depth_paren = 0i32;
    let mut depth_brace = 0i32;
    let mut depth_bracket = 0i32;
    while i < bytes.len() {
        let c = bytes[i];
        match c {
            b'\'' | b'"' | b'`' => {
                let quote = c;
                i += 1;
                while i < bytes.len() {
                    if bytes[i] == b'\\' && i + 1 < bytes.len() {
                        i += 2;
                        continue;
                    }
                    if bytes[i] == quote {
                        i += 1;
                        break;
                    }
                    i += 1;
                }
                continue;
            }
            b'(' => depth_paren += 1,
            b')' => depth_paren -= 1,
            b'{' => depth_brace += 1,
            b'}' => depth_brace -= 1,
            b'[' => depth_bracket += 1,
            b']' => depth_bracket -= 1,
            b'=' if depth_paren == 0 && depth_brace == 0 && depth_bracket == 0 => {
                let prev = if i > 0 { bytes[i - 1] } else { 0 };
                let next = bytes.get(i + 1).copied().unwrap_or(0);
                // Skip `==`, `===`, `=>`, `<=`, `>=`, `!=`.
                let is_compare_or_arrow = next == b'='
                    || next == b'>'
                    || matches!(prev, b'<' | b'>' | b'!' | b'=');
                if !is_compare_or_arrow {
                    return Some(line[i + 1..].trim());
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

/// Scan `expr` for the first identifier that is a member of `names`, ignoring
/// string/template literals, comments, and member-access positions (`obj.name`).
/// Mirrors emit.rs `expr_references_state`'s tokenizer.
fn first_referenced_ident(expr: &str, names: &BTreeSet<String>) -> Option<String> {
    let bytes = expr.as_bytes();
    let mut i = 0usize;
    let mut prev_significant: u8 = 0;
    while i < bytes.len() {
        let c = bytes[i];
        if c == b'\'' || c == b'"' || c == b'`' {
            let quote = c;
            i += 1;
            while i < bytes.len() {
                if bytes[i] == b'\\' && i + 1 < bytes.len() {
                    i += 2;
                    continue;
                }
                if bytes[i] == quote {
                    i += 1;
                    break;
                }
                i += 1;
            }
            prev_significant = quote;
            continue;
        }
        if c == b'/' && i + 1 < bytes.len() {
            if bytes[i + 1] == b'/' {
                while i < bytes.len() && bytes[i] != b'\n' {
                    i += 1;
                }
                continue;
            }
            if bytes[i + 1] == b'*' {
                i += 2;
                while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                    i += 1;
                }
                if i + 1 < bytes.len() {
                    i += 2;
                }
                continue;
            }
        }
        if c.is_ascii_alphabetic() || c == b'_' || c == b'$' {
            let start = i;
            while i < bytes.len()
                && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_' || bytes[i] == b'$')
            {
                i += 1;
            }
            let ident = &expr[start..i];
            let is_member_access = prev_significant == b'.';
            if !is_member_access && names.contains(ident) {
                return Some(ident.to_string());
            }
            prev_significant = b'a';
            continue;
        }
        if !c.is_ascii_whitespace() {
            prev_significant = c;
        }
        i += 1;
    }
    None
}

/// Extract the binding name from a top-level `@state` declaration line.
/// Recognizes `const <name>` / `let <name>` AND the bare class-property form
/// `<name>: <type> = <value>` (which codegen rewrites to a `let` via
/// `transform_bare_declaration`). Returns `None` for destructuring patterns,
/// control-flow, and non-declarations.
fn extract_decl_name(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if let Some(rest) = trimmed
        .strip_prefix("const ")
        .or_else(|| trimmed.strip_prefix("let "))
    {
        return leading_ident(rest.trim_start());
    }
    // Bare class-property form: `<name>: <type> = <value>` — a top-level colon
    // AND an `=`, with `<name>` a simple identifier (mirrors
    // transform_bare_declaration's acceptance rule). Excludes control-flow,
    // comments, macros, and block punctuation by requiring an alphabetic/`_`
    // first char and rejecting reserved-leading keywords.
    let first = trimmed.chars().next()?;
    if !(first.is_ascii_alphabetic() || first == '_') {
        return None;
    }
    for kw in [
        "const ", "let ", "var ", "function ", "class ", "return ", "if ", "else", "for ",
        "while ",
    ] {
        if trimmed.starts_with(kw) {
            return None;
        }
    }
    let colon_pos = find_top_level_colon(trimmed)?;
    if !trimmed.contains('=') {
        return None;
    }
    let name_part = trimmed[..colon_pos].trim();
    if name_part.is_empty()
        || name_part
            .chars()
            .any(|c| c.is_whitespace() || c == '.' || c == '[')
    {
        return None;
    }
    leading_ident(name_part)
}

/// Read the leading `[A-Za-z_$][A-Za-z0-9_$]*` identifier from `s`.
fn leading_ident(s: &str) -> Option<String> {
    let first = s.chars().next()?;
    if !(first.is_ascii_alphabetic() || first == '_' || first == '$') {
        return None;
    }
    let mut end = 0usize;
    for (i, c) in s.char_indices() {
        if c.is_ascii_alphanumeric() || c == '_' || c == '$' {
            end = i + c.len_utf8();
        } else {
            break;
        }
    }
    if end == 0 {
        return None;
    }
    Some(s[..end].to_string())
}

/// Find the first `:` at bracket-depth 0 (not inside `<>`, `{}`, `[]`, `()`).
/// Mirrors emit.rs `find_top_level_colon`.
fn find_top_level_colon(s: &str) -> Option<usize> {
    let mut depth_angle = 0i32;
    let mut depth_brace = 0i32;
    let mut depth_paren = 0i32;
    let mut depth_bracket = 0i32;
    for (i, c) in s.char_indices() {
        match c {
            '<' => depth_angle += 1,
            '>' if depth_angle > 0 => depth_angle -= 1,
            '{' => depth_brace += 1,
            '}' => depth_brace = (depth_brace - 1).max(0),
            '(' => depth_paren += 1,
            ')' => depth_paren = (depth_paren - 1).max(0),
            '[' => depth_bracket += 1,
            ']' => depth_bracket = (depth_bracket - 1).max(0),
            ':' if depth_angle == 0 && depth_brace == 0 && depth_paren == 0 && depth_bracket == 0 => {
                return Some(i);
            }
            _ => {}
        }
    }
    None
}

pub fn resolve_signals(script: &str) -> SignalMap {
    let mut map = SignalMap::default();
    for line in script.lines() {
        let trimmed = line.trim();
        // `const [getter, setter] = signal(...)` — regular signal.
        // Also accepts `signal<T>(...)` (TS-type-parameterized form).
        if trimmed.starts_with("const [") {
            let bracket_end = trimmed.find("] = signal").filter(|&pos| {
                let after = &trimmed[pos + "] = signal".len()..];
                after.starts_with('(') || after.starts_with('<')
            });
            if let Some(bracket_end) = bracket_end {
                let inner = &trimmed[7..bracket_end];
                let parts: Vec<&str> = inner.split(',').map(|s| s.trim()).collect();
                if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
                    map.insert_signal(parts[0], parts[1]);
                }
            }
        }
        // `const name = computed(...)` — computed signal (read-only, no setter name)
        if trimmed.starts_with("const ") {
            if let Some(eq_pos) = trimmed.find(" = computed(") {
                let name_part = &trimmed["const ".len()..eq_pos];
                let name = name_part.trim();
                // Must be a simple identifier (no brackets → not a destructure)
                if !name.is_empty() && !name.contains('[') && !name.contains(',') {
                    map.insert_computed(name);
                }
            }
        }
    }
    map
}

#[cfg(test)]
mod decl_tests {
    use super::*;

    // ─── Bug 7 — collect_state_decls recognizes every declaration form ───────

    #[test]
    fn collects_prop_and_computed_keys() {
        let script = "\
$prop: { active: { default: '', type: \"string\" } }
$computed: { cls: () => active() === 'home' ? 'on' : '' }
";
        let decls = collect_state_decls(script);
        assert!(decls.all.contains("active"), "prop key 'active' must be declared");
        assert!(decls.all.contains("cls"), "computed key 'cls' must be declared");
        assert!(decls.props.contains("active"), "'active' must be a $prop name");
        assert!(!decls.props.contains("cls"), "'cls' is computed, not a prop");
    }

    #[test]
    fn collects_plain_const_and_bare_class_property() {
        let script = "\
const greeting = 'hi'
errorMessage: string = ''
mockData: Record<string, number> = { a: 1 }
";
        let decls = collect_state_decls(script);
        assert!(decls.all.contains("greeting"));
        assert!(decls.all.contains("errorMessage"));
        assert!(decls.all.contains("mockData"));
    }

    #[test]
    fn collects_action_and_legacy_signal_names() {
        let script = "\
const [count, setCount] = signal(0)
$action: { inc: () => { count = count + 1 } }
";
        let decls = collect_state_decls(script);
        assert!(decls.all.contains("count"), "legacy signal getter declared");
        assert!(decls.all.contains("inc"), "$action name declared");
    }

    // Fix A — `$context` provide/consume keys are reference-able bindings a
    // template reads directly (`{theme}`); harvest them so they land in the
    // type-check sidecar scope AND clear the "not declared in @state"
    // cross-block warning (which shares this decl set).
    #[test]
    fn collects_context_provide_and_consume_keys() {
        let script = "\
$context: {
  provide: { theme: { value: 'light', type: 'string' } },
  consume: { locale: { type: 'Locale' } },
}
";
        let decls = collect_state_decls(script);
        assert!(decls.all.contains("theme"), "$context provide key 'theme' must be declared");
        assert!(decls.all.contains("locale"), "$context consume key 'locale' must be declared");
    }

    #[test]
    fn const_inside_action_body_is_not_a_top_level_decl() {
        // Regression: a const INSIDE a $action arrow body must NOT be mistaken
        // for a top-level @state decl (it would also falsely trip Bug 8).
        let script = "\
$prop: { location: { default: '' } }
$action: { go: () => { const data = location } }
";
        let decls = collect_state_decls(script);
        assert!(!decls.all.contains("data"), "'data' lives inside $action body");
    }

    // ─── Bug 8 — find_plain_const_prop_read ──────────────────────────────────

    #[test]
    fn detects_plain_const_reading_prop() {
        let script = "\
$prop: { active: { default: '', type: \"string\" } }
const cls = active() ?? ''
";
        let decls = collect_state_decls(script);
        let hit = find_plain_const_prop_read(script, &decls.props);
        assert_eq!(hit, Some(("cls".to_string(), "active".to_string())));
    }

    #[test]
    fn computed_reading_prop_is_clean() {
        // The $computed form reads the prop in a thunk — no top-level const, so
        // find_plain_const_prop_read must NOT flag it.
        let script = "\
$prop: { active: { default: '', type: \"string\" } }
$computed: { cls: () => active() ?? '' }
";
        let decls = collect_state_decls(script);
        assert_eq!(find_plain_const_prop_read(script, &decls.props), None);
    }

    #[test]
    fn const_reading_prop_inside_action_does_not_trip_bug8() {
        // A const that reads a prop INSIDE a $action body runs lazily (after the
        // prop shadow exists) — no TDZ, must not flag.
        let script = "\
$prop: { location: { default: '' } }
$action: { go: () => { const data = location() } }
";
        let decls = collect_state_decls(script);
        assert_eq!(find_plain_const_prop_read(script, &decls.props), None);
    }

    #[test]
    fn const_not_reading_a_prop_is_clean() {
        let script = "\
$prop: { active: { default: '' } }
const unrelated = 1 + 2
";
        let decls = collect_state_decls(script);
        assert_eq!(find_plain_const_prop_read(script, &decls.props), None);
    }

    #[test]
    fn prop_name_in_string_literal_is_not_a_read() {
        // 'active' appearing inside a string literal must not count as a read.
        let script = "\
$prop: { active: { default: '' } }
const label = 'active state'
";
        let decls = collect_state_decls(script);
        assert_eq!(find_plain_const_prop_read(script, &decls.props), None);
    }

    #[test]
    fn member_access_of_prop_name_is_not_a_read() {
        // `obj.active` must not match the prop `active` (member-access position).
        let script = "\
$prop: { active: { default: '' } }
const x = state.active
";
        let decls = collect_state_decls(script);
        assert_eq!(find_plain_const_prop_read(script, &decls.props), None);
    }
}
