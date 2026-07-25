use crate::codegen::signals::{SignalMap, StateNames};
use crate::types::{Attr, CollectionKind, TemplateNode};
use super::emit::StateImports;
// ─── State macro processing ───────────────────────────────────────────────────

pub(crate) fn process_state_body(
    raw_script: &str,
    signal_map: &mut SignalMap,
) -> (StateImports, Vec<crate::types::StateMacro>, String, Vec<String>, StateNames) {
    use crate::parser::state_macros::parse_state_macros;
    use crate::types::StateMacro;

    let mut macros = parse_state_macros(raw_script).unwrap_or_default();
    // #487 — the new wrapper dialect lowers onto the SAME `StateMacro` IR
    // (state-model spec §2/§3), so one macros list serves both dialects.
    // Scan errors were already raised at the compile_full boundary; here the
    // non-regressive default is an empty scan. Wrapper construct spans are
    // excluded from the plain body exactly as `$`-macro spans are.
    let wrapper_scan =
        crate::parser::state_wrappers::scan_state_wrappers(raw_script).unwrap_or_default();
    macros.extend(wrapper_scan.macros.iter().cloned());
    let mut si = StateImports::default();

    // R2 (Defect B): collect every identifier declared in `@state`. Includes
    // signals + computed + bare class-property declarations + $prop entries +
    // $resource entries + $action function names + $route bindings. The
    // template emitter consults this set in `emit_attrs` to decide whether
    // a binding expression references state and must therefore be lowered
    // to a `[() => (expr)]` thunk array.
    let mut state_names = StateNames::default();

    // Seed from any bindings already in signal_map (signals lifted by
    // `resolve_signals` from authored `const [g, s] = signal(...)` forms).
    for k in signal_map.0.keys() {
        state_names.insert(k);
    }

    for mac in &macros {
        match mac {
            StateMacro::Collection { kind, entries } => match kind {
                CollectionKind::Computed => {
                    si.needs_computed = true;
                    for e in entries {
                        signal_map.insert_computed(&e.name);
                        state_names.insert(&e.name);
                    }
                }
                CollectionKind::Prop => {
                    // R1 — register prop names as computed-style signals so
                    // template binding sites (`{name}`) lower through the
                    // reactive `signal_map.is_reactive` path. The body-side
                    // declaration `const <name> = ctx.props.<name>` is emitted
                    // as a callable signal-getter by `emit_state_macro_code`.
                    for e in entries {
                        signal_map.insert_computed(&e.name);
                        state_names.insert(&e.name);
                    }
                }
                CollectionKind::Action => {
                    si.needs_batch = true;
                    for e in entries {
                        state_names.insert(&e.name);
                    }
                }
                CollectionKind::Resource => {
                    use crate::parser::state_macros::{arrow_body, is_magna_origin, running_code};
                    for e in entries {
                        // arch-3 M2 (RFC-003): a `$resource` whose running-code
                        // thunk body is a magna client call (`data.X.query(...)`)
                        // lowers to `createMagnaResource`; any other `$resource`
                        // keeps the plain `createResource` lowering (no regression).
                        let is_magna = running_code(e)
                            .map(|thunk| {
                                let body =
                                    arrow_body(thunk).unwrap_or_else(|| thunk.to_string());
                                is_magna_origin(&body)
                            })
                            .unwrap_or(false);
                        if is_magna {
                            si.needs_create_magna_resource = true;
                        } else {
                            si.needs_create_resource = true;
                        }
                        state_names.insert(&e.name);
                    }
                }
                CollectionKind::Stream => {
                    si.needs_create_stream = true;
                    si.needs_on_cleanup = true; // onCleanup registered by createStream
                    for e in entries {
                        state_names.insert(&e.name);
                    }
                }
                CollectionKind::Effect => {
                    si.needs_effect_for_macros = true;
                    // $effect entries don't declare bindings; nothing to track.
                }
                CollectionKind::Lifecycle => {
                    for e in entries {
                        match e.name.as_str() {
                            "mount" => si.needs_on_mount = true,
                            "dispose" => si.needs_on_cleanup = true,
                            // R2: adopt + attributeChange callbacks.
                            "adopt" => si.needs_on_adopt = true,
                            "attributeChange" => si.needs_on_attribute_change = true,
                            _ => {}
                        }
                    }
                }
                CollectionKind::Event => {
                    // B3b — $event declarations are compile-time-only.
                    // They surface to the sidecar typer + $emit resolution; no
                    // runtime signal/binding side-effects.
                }
                CollectionKind::Aria => {
                    // B4 — $aria declarations are handled by emit_aria_wiring()
                    // at SFC-body level. No signal/binding side-effects here.
                }
                CollectionKind::Controller => {
                    // B5 — $controller entries lower to IIFE-factories with
                    // onMount/onCleanup lifecycle wiring. Mark needs_controller
                    // so the runtime imports are included.
                    si.needs_controller = true;
                    si.needs_on_mount = true;
                    si.needs_on_cleanup = true;
                    for e in entries {
                        state_names.insert(&e.name);
                    }
                }
                CollectionKind::Context => {
                    // B5/O2 — $context provide/consume entries lower to
                    // synchronous provide()/inject() setup-body calls (see
                    // CollectionKind::Context in the lowering below). Mark
                    // needs_context so the @aihu/context import is emitted.
                    // No onMount: provide/inject must run DURING setup so the
                    // prototype-chain scope entered at connect captures them.
                    si.needs_context = true;
                }
                CollectionKind::Form => {
                    // D5 — $form wiring is handled by emit_form_wiring() at
                    // SFC-body level. No signal/binding side-effects here.
                }
            },
            StateMacro::EffectAnon { .. }
            | StateMacro::EffectOn { .. }
            | StateMacro::Watch { .. } => {
                si.needs_effect_for_macros = true;
            }
            StateMacro::Route { name } => {
                si.needs_aihu_router = true;
                si.needs_computed = true;
                signal_map.insert_computed(name);
                state_names.insert(name);
            }
            StateMacro::BeforeNavigate { .. } | StateMacro::AfterNavigate { .. } => {
                si.needs_aihu_router = true;
            }
            StateMacro::Query { name, .. } => {
                // arch-3 M2 (RFC-003): `$query` always lowers to
                // `createMagnaResource(inject(MagnaFetchToken), <expr>)`.
                si.needs_create_magna_resource = true;
                state_names.insert(name);
            }
            StateMacro::Auth { name, .. } => {
                // arch-3 M2 / A3 G2 (RFC-001): `$auth.*` lowers to
                // `const <name> = useCurrentUser()` from `@aihu/auth`.
                si.needs_use_current_user = true;
                state_names.insert(name);
            }
            // §9.4 / GX Phase 1 — declaration-only macros consumed at the
            // defineComponent assembly layer (or, for $extract, resolved into
            // the artifact fan-out); they introduce no state binding here.
            StateMacro::Extends { .. } | StateMacro::Shadow { .. } | StateMacro::Extract { .. } => {}
            // #487 — `let x = state(v)` registers a REAL signal (getter named
            // `x`, setter `__x_set`), so template reads flow through the
            // shipped signal-read rewrite and `bind:` write-backs find the
            // setter (state-model spec §2.1/§4.2).
            StateMacro::StateLet { name, .. } => {
                signal_map.insert_signal(
                    name,
                    &crate::parser::state_wrappers::state_setter_name(name),
                );
                state_names.insert(name);
            }
            // #487 — `const x = consume(key)` lowers through @aihu/context.
            StateMacro::ConsumeBinding { name, .. } => {
                si.needs_context = true;
                state_names.insert(name);
            }
        }
    }

    let mut plain_lines: Vec<String> = Vec::new();
    let mut user_imports: Vec<String> = Vec::new();
    let mut i = 0usize;
    let mut in_import = false;
    let mut current_import: Vec<String> = Vec::new();
    // Scratch buffer reused across iterations to own an `export `-stripped line
    // (the borrow checker needs a binding outliving the per-iteration `&str`).
    let mut stripped_export_line;
    let bytes = raw_script.as_bytes();
    while i < bytes.len() {
        let nl = raw_script[i..].find('\n').map(|r| i + r).unwrap_or(raw_script.len());
        let line_raw = &raw_script[i..nl];
        let line = line_raw.trim();

        // #487 — skip recognized wrapper-construct spans (they are lowered
        // from `macros`, exactly like `$`-macro spans below). Spans start at
        // the construct's first non-whitespace byte.
        let lead = line_raw.len() - line_raw.trim_start().len();
        let line_start = i + lead;
        if let Some(end) = wrapper_scan.skip_to(line_start) {
            // Bug 9 TDZ fix: `let x = state(init)` is NOT excised like every
            // other wrapper span — its signal-tuple declaration is spliced
            // back into `plain_body` INLINE, at this exact source position,
            // instead of being deferred to `macro_code` (emitted, as a block,
            // after ALL of plain_body — see `emit_state_macro_code`'s now-dead
            // `StateMacro::StateLet` arm and the body-assembly comment in
            // `codegen/emit.rs`).
            //
            // Why not just hoist it above plain_body wholesale, the way the
            // Bug 8 `$prop`-binding fix does? `signal(init)` EAGERLY evaluates
            // `init` at declaration time, and `init` may call an earlier
            // plain-body helper (e.g. `pageFromLocation()` in
            // apps/docs/src/components/docs-shell.aihu) that hasn't been
            // spliced back in yet — hoisting the signal above ALL of
            // plain_body would just relocate the TDZ ReferenceError onto that
            // helper instead of fixing it. `$prop` bindings are safe to
            // blanket-hoist because they are PURE reads of `ctx.props.<name>`
            // with zero dependency on anything else in the body; `state()`
            // inits carry no such guarantee.
            //
            // Splicing in place instead preserves the author's ordering in
            // BOTH directions: anything plain_body defines earlier (like
            // `pageFromLocation`) is already initialized by the time
            // `signal(init)` runs, and anything plain_body defines later
            // (like a synchronously-invoked `seedFromPrerender()` that reads
            // the signal) finds the declaration already in scope — exactly
            // matching what the source ordering promised.
            //
            // The raw `init` is spliced VERBATIM (unrewritten). The
            // whole-plain_body §4.2/§4.3 read/write rewrite pass
            // (`rewrite_state_body`, run by the caller in `codegen/emit.rs`
            // right after `process_state_body` returns) walks a real
            // scope-aware oxc AST over the assembled plain_body text, so it
            // rewrites bare reads/writes of OTHER wrapper targets inside
            // `init` exactly as it already does for the rest of plain_body —
            // and correctly leaves the `[name, setter]` destructuring
            // pattern's BindingIdentifiers alone (they are declarations, not
            // references), so it can't mistake this splice for a read site
            // (see the matching `visit_variable_declarator` override in
            // `expr/state_rw.rs`, which keeps the visitor's own scope-shadow
            // tracking from making the SAME mistake).
            if let Some(crate::types::StateMacro::StateLet { name, init, .. }) =
                wrapper_scan.macro_for(line_start)
            {
                let setter = crate::parser::state_wrappers::state_setter_name(name);
                plain_lines.push(format!(
                    "{}const [{name}, {setter}] = signal({init});",
                    &line_raw[..lead]
                ));
            }
            i = end;
            if i < bytes.len() && bytes[i] == b'\n' {
                i += 1;
            }
            continue;
        }

        // Collect import lines from @state and lift them to module scope.
        if line.starts_with("import ") || line.starts_with("import\t") {
            // Skip type-only imports — they are erased at runtime.
            if line.starts_with("import type ") || line.starts_with("import type\t") {
                i = nl + 1;
                continue;
            }
            let opens_block = line.contains('{') && !line.contains('}');
            // #487 §3.3.2 (ratified §9.5) — `$auth` retired to the plain
            // runtime import; the deferred-SSR marker is now keyed on the
            // `useCurrentUser` import itself (kept until the M3 SSR work).
            // Wrapper-dialect files only, so old-dialect emission stays
            // byte-identical.
            if !wrapper_scan.macros.is_empty()
                && line.contains("useCurrentUser")
                && line.contains("@aihu/auth")
            {
                plain_lines.push(
                    crate::parser::state_macros::auth_session_todo(
                        crate::types::AuthMacroKind::Session,
                    )
                    .trim()
                    .to_string(),
                );
            }
            current_import.push(line_raw.to_string());
            if opens_block {
                in_import = true;
            } else {
                user_imports.push(current_import.join("\n"));
                current_import.clear();
            }
            i = nl + 1;
            continue;
        }
        if in_import {
            current_import.push(line_raw.to_string());
            if line.contains(" from ") || line.ends_with(';') {
                in_import = false;
                user_imports.push(current_import.join("\n"));
                current_import.clear();
            }
            i = nl + 1;
            continue;
        }

        // Skip $macro lines (and their multi-line bodies).
        //
        // v2 collection-form: `$<keyword>: { ... }` — skip past the matching
        // `}`. Anonymous `$effect: () => { ... }` — skip past the matching
        // `}` of the arrow body. Preserved-from-v1 `$effect.on(...)`,
        // `$watch <name> { ... }` — skip past the matching `}`.
        if line.starts_with('$') {
            let stripped = line.trim_start_matches('$');
            let macro_keyword = stripped.split_ascii_whitespace().next();
            let is_collection_macro = matches!(
                macro_keyword.map(|k| {
                    // Strip trailing `:` for keyword comparison.
                    k.trim_end_matches(':')
                }),
                Some("prop")
                    | Some("computed")
                    | Some("action")
                    | Some("resource")
                    | Some("effect")
                    | Some("lifecycle")
                    | Some("event")
                    | Some("aria")
                    // B5
                    | Some("controller")
                    | Some("context")
                    // v0.4.0
                    | Some("stream")
                    // D5 — `$form` entries are lowered by emit_form_wiring() at
                    // the SFC-body level, not per-entry. It still has to be
                    // SKIPPED here: without this arm its body leaked into
                    // plain_body, where the `name: type` declaration scanner
                    // rewrote `value: () => value,` into
                    // `let value: () => value,` and left a dangling `}`.
                    // Every other CollectionKind variant is listed above; keep
                    // this arm in sync when adding one.
                    | Some("form")
            ) && stripped.contains(':');
            let is_preserved_macro = stripped.starts_with("effect.on(")
                || matches!(macro_keyword, Some("watch"));
            // arch-5 M1 router call-macros: `$beforeNavigate(fn)` / `$afterNavigate(fn)`.
            // These are the call form (`$name(...)`), not the collection form
            // (`$name: {...}`) nor the preserved `{...}`-body form — so neither
            // branch above matches them, and without this one only the macro's
            // FIRST line is skipped while the rest of a multi-line callback body
            // (and its closing `})`) leaks into plain_body as dangling JS (#426).
            // They are lowered from `macros` at the `StateMacro::AfterNavigate`
            // emit branch; here we only need to skip their full source span.
            let is_router_call_macro = stripped.starts_with("beforeNavigate(")
                || stripped.starts_with("afterNavigate(");

            if is_collection_macro {
                // For v2 collection-form, the body opens with `:` followed by
                // `{` (named-collection) or `(` (anonymous `$effect`). Find
                // the colon, skip whitespace, then jump past the matching
                // closing brace / paren.
                if let Some(colon_rel) = raw_script[i..].find(':') {
                    let mut p = i + colon_rel + 1;
                    while p < raw_script.len()
                        && matches!(bytes[p], b' ' | b'\t' | b'\n' | b'\r')
                    {
                        p += 1;
                    }
                    if p < raw_script.len() {
                        if bytes[p] == b'{' {
                            if let Some(close) = crate::parser::state_macros::find_brace_close_js(
                                raw_script,
                                p + 1,
                            ) {
                                i = close + 1;
                                if i < bytes.len() && bytes[i] == b'\n' {
                                    i += 1;
                                }
                                continue;
                            }
                        } else if bytes[p] == b'(' {
                            // Anonymous `$effect: () => { ... }` — skip past
                            // the closing `)`, then `=>`, then the body.
                            if let Some(close_paren) =
                                crate::parser::state_macros::find_paren_close(raw_script, p + 1)
                            {
                                let mut q = close_paren + 1;
                                while q < raw_script.len()
                                    && matches!(bytes[q], b' ' | b'\t')
                                {
                                    q += 1;
                                }
                                if q + 1 < raw_script.len()
                                    && bytes[q] == b'='
                                    && bytes[q + 1] == b'>'
                                {
                                    q += 2;
                                    while q < raw_script.len()
                                        && matches!(
                                            bytes[q],
                                            b' ' | b'\t' | b'\n' | b'\r'
                                        )
                                    {
                                        q += 1;
                                    }
                                    if q < raw_script.len() && bytes[q] == b'{' {
                                        if let Some(close) =
                                            crate::parser::state_macros::find_brace_close_js(
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
                                        // Expression body — skip to end of line.
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
                // Find the body `{`. For `$effect.on(dep) { body }`, the `{`
                // is after the closing `)`; for `$watch name { body }` the
                // `{` is the next one on the line.
                let has_brace = raw_script[i..].find('{').map(|r| i + r);
                let has_nl_first = raw_script[i..].find('\n').map(|r| i + r);
                let brace_start_opt =
                    has_brace.filter(|&b| has_nl_first.map_or(true, |nl2| b < nl2));
                if let Some(brace_start) = brace_start_opt {
                    if let Some(close) = crate::parser::state_macros::find_brace_close_js(
                        raw_script,
                        brace_start + 1,
                    ) {
                        i = close + 1;
                        if i < bytes.len() && bytes[i] == b'\n' {
                            i += 1;
                        }
                        continue;
                    }
                }
            }

            if is_router_call_macro {
                // The call-macro opens with `(` right after the keyword; skip
                // past the matching `)` (which spans any multi-line callback),
                // then an optional trailing `;` and newline. Mirrors the span
                // skip the collection/preserved forms already perform, so no
                // fragment of the callback body reaches plain_body.
                if let Some(paren_rel) = raw_script[i..].find('(') {
                    let open = i + paren_rel;
                    if let Some(close) =
                        crate::parser::state_macros::find_paren_close(raw_script, open + 1)
                    {
                        let mut j = close + 1;
                        if j < bytes.len() && bytes[j] == b';' {
                            j += 1;
                        }
                        if j < bytes.len() && bytes[j] == b'\n' {
                            j += 1;
                        }
                        i = j;
                        continue;
                    }
                }
            }

            i = nl + 1;
            continue;
        }

        // Strip a leading top-level `export ` keyword: when the user writes
        // `export function quote() { … }` in <script setup>, the body is injected
        // inside `setup(ctx)` where `export` is a syntax error. Preserve leading
        // indentation. (Previously handled by the now-removed `extract_script_body`
        // in the legacy options form; folded into the unified path.)
        let line_for_body: &str = {
            let lead_len = line_raw.len() - line_raw.trim_start().len();
            let (lead, rest) = line_raw.split_at(lead_len);
            if let Some(after) = rest.strip_prefix("export ") {
                // Re-leak the stripped string into an owned line below.
                stripped_export_line = format!("{}{}", lead, after);
                stripped_export_line.as_str()
            } else {
                line_raw
            }
        };
        let transformed = transform_bare_declaration(line_for_body);
        // R2 (Defect B): when a bare class-property declaration becomes a
        // `let <name>: <type> = ...`, capture <name> as a state identifier so
        // the template emitter wraps references in `[() => expr]` thunks.
        if let Some(name) = extract_state_decl_name(&transformed) {
            state_names.insert(&name);
        }
        plain_lines.push(transformed);
        i = nl + 1;
    }

    // Trim leading/trailing blank lines and add 2-space indent
    let trimmed: Vec<_> = plain_lines
        .iter()
        .skip_while(|l| l.trim().is_empty())
        .cloned()
        .collect();
    let mut trimmed: Vec<_> = trimmed
        .iter()
        .rev()
        .skip_while(|l| l.trim().is_empty())
        .cloned()
        .collect();
    trimmed.reverse();

    let plain_body = if trimmed.is_empty() {
        String::new()
    } else {
        trimmed
            .iter()
            .map(|l| {
                if l.trim().is_empty() {
                    String::new()
                } else {
                    format!("  {}", l)
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    // Auto-import `@aihu/use` composables (ON by default, v1). Scans the RAW
    // @state script — plain lines AND `$action`/`$effect`/`$lifecycle` macro
    // bodies, everywhere author JS runs — for bare `useX(...)` calls whose
    // names the author neither imported (from any source) nor bound locally,
    // and injects the per-subpath import. `detect_composables` is the SAME
    // decision function the TS sidecar keys its ambient declarations on, so
    // JS emit and sidecar can never disagree. Routed through `user_imports`
    // so `merge_imports` collapses an identical author import to a single
    // line. See codegen/use_registry.rs.
    for (name, source) in crate::codegen::use_registry::detect_composables(raw_script) {
        user_imports.push(format!("import {{ {name} }} from '{source}'"));
    }

    (si, macros, plain_body, user_imports, state_names)
}

/// Extract the binding name from a `let <name>...` / `const <name>...` line
/// produced by `transform_bare_declaration`. Returns `None` for any line that
/// is not a simple top-level declaration (e.g. destructuring patterns, arrow
/// fn bodies, control-flow). R2 (Defect B): used to populate `StateNames`.
fn extract_state_decl_name(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let rest = trimmed
        .strip_prefix("let ")
        .or_else(|| trimmed.strip_prefix("const ")) ?;
    let head = rest.trim_start();
    // Must start with a simple identifier (not `[`, `{`, etc.).
    let first = head.chars().next()?;
    if !(first.is_ascii_alphabetic() || first == '_' || first == '$') {
        return None;
    }
    // Walk while the char is a valid identifier continuation.
    let mut end = 0usize;
    for (i, c) in head.char_indices() {
        if c.is_ascii_alphanumeric() || c == '_' || c == '$' {
            end = i + c.len_utf8();
        } else {
            break;
        }
    }
    if end == 0 {
        return None;
    }
    Some(head[..end].to_string())
}

/// Transform a bare TypeScript class-property declaration to a `let` declaration.
///
/// R2 (Defect A): emit `let`, not `const`. State declarations in `@state` are
/// frequently reassigned from action / effect / lifecycle bodies (e.g.
/// `loading = false` after a fetch resolves). Emitting `const` causes
/// `Assignment to constant variable` at runtime; `let` is universally safe and
/// the bundle-size delta is trivial.
pub(crate) fn transform_bare_declaration(line: &str) -> String {
    let trimmed = line.trim();

    if trimmed.is_empty()
        || trimmed.starts_with("const ")
        || trimmed.starts_with("let ")
        || trimmed.starts_with("var ")
        || trimmed.starts_with("function ")
        || trimmed.starts_with("class ")
        || trimmed.starts_with("return ")
        || trimmed.starts_with("if ")
        || trimmed.starts_with("else")
        || trimmed.starts_with("for ")
        || trimmed.starts_with("while ")
        || trimmed.starts_with("//")
        || trimmed.starts_with("/*")
        || trimmed.starts_with('*')
        || trimmed.starts_with('}')
        || trimmed.starts_with('{')
        || trimmed.starts_with('$')
        || trimmed.starts_with('@')
    {
        return line.to_string();
    }

    let first_char = trimmed.chars().next().unwrap_or(' ');
    if !(first_char.is_ascii_alphabetic() || first_char == '_') {
        return line.to_string();
    }

    let colon_pos = find_top_level_colon(trimmed);
    let has_eq = trimmed.contains('=');

    if colon_pos.is_none() || !has_eq {
        return line.to_string();
    }

    let colon_pos = colon_pos.unwrap();
    let name_part = trimmed[..colon_pos].trim();
    if name_part.is_empty() || name_part.chars().any(|c| c.is_whitespace() || c == '.' || c == '[') {
        return line.to_string();
    }

    let leading_ws: String = line.chars().take_while(|c| c.is_whitespace()).collect();
    format!("{}let {}", leading_ws, trimmed)
}

/// Find the position of the first `:` at depth 0 (not inside `<>`, `{}`, `[]`, `()`).
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

/// CO1: `$prop` name -> "the entry's `default:` is a numeric literal".
///
/// The key set is `collect_prop_entries`, NOT the `SignalMap` (spec §6.1):
/// `process_state_body` registers prop names into `signal_map` alongside real
/// `$computed` entries and lifted `signal()` bindings, so keying the write
/// rewrite off it would rewrite a plain writable `let` and break working code.
///
/// The bool proves `ToNumeric` is identity for that prop, which is one of the
/// two conditions for the `++`/`--` inline fast path.
fn collect_prop_write_targets(
    macros: &[crate::types::StateMacro],
) -> std::collections::HashMap<String, bool> {
    use crate::parser::state_macros::meta_get;
    let mut out = std::collections::HashMap::new();
    for entry in collect_prop_entries(macros) {
        // #487 — wrapper-origin props take the state-model §4.3 pass instead
        // (which honors the nature axis: `.set` for `let`-props, C624 for
        // `const`-props); running CO1 over them too would double-rewrite.
        if entry.wrapper {
            continue;
        }
        let numeric_default = meta_get(entry, "default")
            .map(|d| d.trim().parse::<f64>().is_ok())
            .unwrap_or(false);
        out.insert(entry.name.clone(), numeric_default);
    }
    out
}

/// #487 — pre-rewrite a wrapper-origin running-code expression (an arrow or
/// thunk, WHOLE expression text) through the state-model read/write pass
/// (spec §4.2/§4.3). The arrow's own params shadow via the oxc scope model
/// (they are inside the parsed text). Non-regressive: errors and parse
/// failures splice the code as authored (they were raised as hard errors at
/// the compile_full boundary already).
fn rewrite_wrapper_code(
    code: &str,
    targets: &crate::parser::state_wrappers::WrapperTargets,
    needs_state_helper: &mut bool,
    needs_prop_helper: &mut bool,
) -> String {
    match crate::expr::rewrite_state_body(code, "", false, targets, true) {
        Ok(Some(r)) => {
            if r.needs_state_update_helper {
                *needs_state_helper = true;
            }
            if r.needs_prop_update_helper {
                *needs_prop_helper = true;
            }
            r.source
        }
        _ => code.to_string(),
    }
}

/// CO1: rewrite `$prop` writes inside one macro body, or return it unchanged.
///
/// Infallible by design. C560 (destructuring into a prop) is raised as a hard
/// error by `validate_prop_writes` in `lib.rs`, which runs BEFORE emit and can
/// return `Result`; by the time emit runs, such a body has already been
/// rejected. Here an error can only mean the two passes disagreed, so the
/// non-regressive move is to splice the body exactly as authored.
fn rewrite_prop_writes_in(
    body: &str,
    params: &str,
    is_async: bool,
    props: &std::collections::HashMap<String, bool>,
    needs_helper: &mut bool,
) -> String {
    let targets = crate::expr::PropWriteTargets { props };
    match crate::expr::rewrite_prop_writes(body, params, is_async, &targets) {
        Ok(Some(res)) => {
            if res.needs_update_helper {
                *needs_helper = true;
            }
            res.source
        }
        _ => body.to_string(),
    }
}

/// Returns the emitted `@state` macro code, whether it needs the lazily
/// declared `__aihu_prop_upd` helper (spec §4.5), and whether it needs the
/// #487 `__aihu_state_upd` helper (state-model spec §4.3).
pub(crate) fn emit_state_macro_code(
    macros: &[crate::types::StateMacro],
    signal_map: &SignalMap,
) -> (String, bool, bool) {
    use crate::parser::state_macros::{
        arrow_args, arrow_async_prefix, arrow_body, arrow_body_spliceable, meta_get, running_code,
    };
    use crate::types::{CollectionKind, StateMacro};
    let mut lines: Vec<String> = Vec::new();
    let indent = "  ";
    // CO1: collected once for the whole component, threaded into every
    // imperative-position macro body below.
    let prop_targets = collect_prop_write_targets(macros);
    let mut needs_prop_upd_helper = false;
    // #487 — wrapper-dialect rewrite targets (empty for old-dialect files).
    let wrapper_targets = crate::parser::state_wrappers::collect_wrapper_targets(macros);
    let mut needs_state_upd_helper = false;
    for mac in macros {
        match mac {
            StateMacro::Collection { kind, entries } => {
                for entry in entries {
                    match kind {
                        CollectionKind::Prop => {
                            // R1 (template-syntax-v2 round 5, Builder B1): $prop
                            // entries lower to a callable signal getter exposed via
                            // `ctx.props.<name>`. The runtime allocates the signal,
                            // wires `observedAttributes` + `attributeChangedCallback`,
                            // and (when `reflect: true`) writes the signal value back
                            // to the attribute. See packages/runtime/src/define-component.ts.
                            //
                            // The body-side declaration `const <name> = ctx.props.<name>`
                            // makes `<name>` a function that returns the current value.
                            // Template binding sites (e.g. `{name}`) lower through the
                            // `signal_map` reactive path because we register the prop
                            // name as a "computed" entry in `process_state_body`.
                            //
                            // NOTE (issue #279): the body-side prop binding is NOT
                            // emitted here anymore. It is hoisted ahead of `plain_body`
                            // via `emit_prop_bindings` (see the body-assembly block) so
                            // a synchronously-running `effect()` / const initializer in
                            // @state that reads the prop getter does not hit the
                            // temporal dead zone. Emitting it here (after `plain_body`)
                            // was the root cause of the TDZ ReferenceError.
                        }
                        CollectionKind::Computed => {
                            let thunk_raw = match running_code(entry) {
                                Some(t) => t,
                                None => continue,
                            };
                            // #487 — wrapper `derived` thunks read bindings
                            // BARE (§4.2); splice getter calls before lowering.
                            let thunk_owned;
                            let thunk: &str = if entry.wrapper {
                                thunk_owned = rewrite_wrapper_code(
                                    thunk_raw,
                                    &wrapper_targets,
                                    &mut needs_state_upd_helper,
                                    &mut needs_prop_upd_helper,
                                );
                                &thunk_owned
                            } else {
                                thunk_raw
                            };
                            let body = arrow_body_spliceable(thunk)
                                .unwrap_or_else(|| thunk.to_string());
                            let am = arrow_async_prefix(thunk);
                            lines.push(format!(
                                "{indent}const {} = computed({am}() => {body});",
                                entry.name
                            ));
                        }
                        CollectionKind::Resource => {
                            let thunk_raw = match running_code(entry) {
                                Some(t) => t,
                                None => continue,
                            };
                            let thunk_owned;
                            let thunk: &str = if entry.wrapper {
                                thunk_owned = rewrite_wrapper_code(
                                    thunk_raw,
                                    &wrapper_targets,
                                    &mut needs_state_upd_helper,
                                    &mut needs_prop_upd_helper,
                                );
                                &thunk_owned
                            } else {
                                thunk_raw
                            };
                            let am = arrow_async_prefix(thunk);
                            let body = arrow_body_spliceable(thunk)
                                .unwrap_or_else(|| thunk.to_string());
                            // arch-3 M2 (RFC-003): magna-origin `$resource`
                            // (body is `data.X.query(...)`) lowers to
                            // `createMagnaResource`; everything else keeps the
                            // plain `createResource` lowering (no regression).
                            if crate::parser::state_macros::is_magna_origin(&body) {
                                lines.push(format!(
                                    "{indent}const {} = createMagnaResource(inject(MagnaFetchToken), {body});",
                                    entry.name
                                ));
                            } else {
                                lines.push(format!(
                                    "{indent}const {} = createResource({am}() => {body});",
                                    entry.name
                                ));
                            }
                        }
                        CollectionKind::Stream => {
                            // v0.4.0 — emit `const <name> = createStream(<source_factory>)`
                            // The source factory is the verbatim value from the `source:` key.
                            let source_raw = entry
                                .meta
                                .iter()
                                .find(|(k, _)| k == "source")
                                .map(|(_, v)| v.trim())
                                .unwrap_or("() => null");
                            let source_owned;
                            let source_factory: &str = if entry.wrapper {
                                source_owned = rewrite_wrapper_code(
                                    source_raw,
                                    &wrapper_targets,
                                    &mut needs_state_upd_helper,
                                    &mut needs_prop_upd_helper,
                                );
                                &source_owned
                            } else {
                                source_raw
                            };
                            lines.push(format!(
                                "{indent}const {} = createStream({source_factory});",
                                entry.name
                            ));
                        }
                        CollectionKind::Action => {
                            let arrow_raw = match running_code(entry) {
                                Some(t) => t,
                                None => continue,
                            };
                            // #487 — wrapper `action` bodies take the §4.2/§4.3
                            // read/write pass over the WHOLE arrow (its params
                            // shadow via the oxc scope model); the CO1
                            // `$prop`-write pass below then sees no wrapper
                            // props (collect_prop_write_targets excludes them).
                            let arrow_owned;
                            let arrow: &str = if entry.wrapper {
                                arrow_owned = rewrite_wrapper_code(
                                    arrow_raw,
                                    &wrapper_targets,
                                    &mut needs_state_upd_helper,
                                    &mut needs_prop_upd_helper,
                                );
                                &arrow_owned
                            } else {
                                arrow_raw
                            };
                            let args = arrow_args(arrow).unwrap_or_default();
                            let body = arrow_body(arrow).unwrap_or_default();
                            let is_async = crate::parser::state_macros::arrow_is_async(arrow);
                            // CO1: rewrite `$prop` writes FIRST (spec §4.11).
                            // The `$announce(` replace below is a raw string
                            // substitution that invalidates byte offsets, so it
                            // MUST run after the span-based splice. `args` is
                            // passed so the action's own params shadow
                            // correctly — that shadow lives outside the body
                            // text, and missing it silently corrupts
                            // `(count) => { count = 5 }`.
                            let body = rewrite_prop_writes_in(
                                &body,
                                &args,
                                is_async,
                                &prop_targets,
                                &mut needs_prop_upd_helper,
                            );
                            // arch-5 M1: rewrite $announce(...) call sites in
                            // action bodies to the runtime-imported alias.
                            let body = body.replace("$announce(", "__a11y_announce(");
                            if is_async {
                                // Async handlers are NOT wrapped in `batch`.
                                // Two reasons, both correctness rather than
                                // preference:
                                //  1. `batch` takes a plain arrow, so an
                                //     `await` in the body is a syntax error.
                                //  2. `batch` flushes synchronously, so even if
                                //     it accepted an async callback it would
                                //     cover only the prefix before the first
                                //     `await` — the later writes would escape
                                //     it silently. A partial batch is worse
                                //     than none, because it looks atomic.
                                // The return contract still holds: an async
                                // function returns a promise, so `$action`
                                // callers awaiting the result get the body's
                                // value as before.
                                lines.push(format!(
                                    "{indent}async function {}({args}) {{ {body} }}",
                                    entry.name
                                ));
                            } else {
                                lines.push(format!(
                                    "{indent}function {}({args}) {{ return batch(() => {{ {body} }}) }}",
                                    entry.name
                                ));
                            }
                        }
                        CollectionKind::Effect => {
                            let thunk_raw = match running_code(entry) {
                                Some(t) => t,
                                None => continue,
                            };
                            let thunk_owned;
                            let thunk: &str = if entry.wrapper {
                                thunk_owned = rewrite_wrapper_code(
                                    thunk_raw,
                                    &wrapper_targets,
                                    &mut needs_state_upd_helper,
                                    &mut needs_prop_upd_helper,
                                );
                                &thunk_owned
                            } else {
                                thunk_raw
                            };
                            let body =
                                arrow_body(thunk).unwrap_or_else(|| thunk.to_string());
                            // CO1: `$effect` is an imperative position, so a
                            // `$prop` write there is legitimate and rewritten.
                            let body = rewrite_prop_writes_in(
                                &body,
                                arrow_args(thunk).unwrap_or_default().as_str(),
                                crate::parser::state_macros::arrow_is_async(thunk),
                                &prop_targets,
                                &mut needs_prop_upd_helper,
                            );
                            // Async effects track dependencies only up to the
                            // first `await` (the signals graph collects reads
                            // synchronously). That is a real caveat, but it is
                            // the author's to make — emitting a non-async arrow
                            // around an awaiting body is just a syntax error.
                            let am = arrow_async_prefix(thunk);
                            if let Some(deps_raw) = meta_get(entry, "on") {
                                let deps_inner = deps_raw
                                    .trim()
                                    .strip_prefix('[')
                                    .and_then(|s| s.strip_suffix(']'))
                                    .unwrap_or(deps_raw)
                                    .trim()
                                    .to_string();
                                // #487 — wrapper `effect({ on: [x] }, …)` deps
                                // are VALUE reads; splice the getter calls so
                                // the tracking read actually subscribes.
                                let deps_inner = if entry.wrapper {
                                    rewrite_wrapper_code(
                                        &deps_inner,
                                        &wrapper_targets,
                                        &mut needs_state_upd_helper,
                                        &mut needs_prop_upd_helper,
                                    )
                                } else {
                                    deps_inner
                                };
                                lines.push(format!(
                                    "{indent}effect({am}() => {{ {dep}; {body} }});",
                                    dep = deps_inner
                                ));
                            } else {
                                lines.push(format!("{indent}effect({am}() => {{ {body} }});"));
                            }
                        }
                        CollectionKind::Lifecycle => {
                            // R2 (Director r6 §3): four-callback extension.
                            // mount → onMount, dispose → onCleanup,
                            // adopt → onAdopt, attributeChange → onAttributeChange.
                            // The two new callbacks are forwarded to the host
                            // element's adoptedCallback / attributeChangedCallback
                            // by the runtime; userland's attributeChange runs
                            // AFTER R1's $prop signal-update (Director r6 §3.R2).
                            let arrow_raw = match running_code(entry) {
                                Some(t) => t,
                                None => continue,
                            };
                            let arrow_owned;
                            let arrow: &str = if entry.wrapper {
                                arrow_owned = rewrite_wrapper_code(
                                    arrow_raw,
                                    &wrapper_targets,
                                    &mut needs_state_upd_helper,
                                    &mut needs_prop_upd_helper,
                                );
                                &arrow_owned
                            } else {
                                arrow_raw
                            };
                            let body =
                                arrow_body(arrow).unwrap_or_else(|| arrow.to_string());
                            // CO1: `$lifecycle` callbacks are imperative
                            // positions too — `cookbook/ssr-hydration.aihu`
                            // writes `greeting`/`name` from `mount`. The
                            // callback's own params are passed so
                            // `attributeChange(name, old, new)` shadows a
                            // like-named prop correctly.
                            let body = rewrite_prop_writes_in(
                                &body,
                                arrow_args(arrow).unwrap_or_default().as_str(),
                                crate::parser::state_macros::arrow_is_async(arrow),
                                &prop_targets,
                                &mut needs_prop_upd_helper,
                            );
                            let am = arrow_async_prefix(arrow);
                            match entry.name.as_str() {
                                "mount" => lines
                                    .push(format!("{indent}onMount({am}() => {{ {body} }});")),
                                "dispose" => lines
                                    .push(format!("{indent}onCleanup({am}() => {{ {body} }});")),
                                "adopt" => lines
                                    .push(format!("{indent}onAdopt({am}() => {{ {body} }});")),
                                "attributeChange" => {
                                    // Preserve the user-supplied param list so
                                    // names match what the user authored.
                                    let args = crate::parser::state_macros::arrow_args(arrow)
                                        .unwrap_or_else(|| {
                                            "_name, _oldValue, _newValue, _ctx".to_string()
                                        });
                                    lines.push(format!(
                                        "{indent}onAttributeChange(({args}) => {{ {body} }});"
                                    ));
                                }
                                _ => {}
                            }
                        }
                        CollectionKind::Event => {
                            // B3b — $event entries don't emit runtime code.
                            // Event names are surfaced for sidecar typing
                            // and validated against $emit.<name> call sites
                            // separately (see collect_event_names + emit_node).
                        }
                        CollectionKind::Aria => {
                            // B4 — $aria wiring is emitted by emit_aria_wiring()
                            // at the SFC-body level (called from emit_function_form).
                            // Individual entries are not lowered here.
                        }
                        CollectionKind::Controller => {
                            // B5 — $controller: each entry's `value:` factory is
                            // called once; if the returned object has
                            // `hostConnected`/`hostDisconnected` methods they are
                            // wired into onMount/onCleanup respectively.
                            let factory_raw = match crate::parser::state_macros::meta_get(entry, "value") {
                                Some(f) => f.trim(),
                                None => continue,
                            };
                            let factory_owned;
                            let factory: &str = if entry.wrapper {
                                factory_owned = rewrite_wrapper_code(
                                    factory_raw,
                                    &wrapper_targets,
                                    &mut needs_state_upd_helper,
                                    &mut needs_prop_upd_helper,
                                );
                                &factory_owned
                            } else {
                                factory_raw
                            };
                            let name = &entry.name;
                            lines.push(format!(
                                "{indent}const {name} = (() => {{\n\
                                 {indent}  const _ctrl = ({factory})()\n\
                                 {indent}  if (typeof _ctrl.hostConnected === 'function') onMount(() => _ctrl.hostConnected())\n\
                                 {indent}  if (typeof _ctrl.hostDisconnected === 'function') onCleanup(() => _ctrl.hostDisconnected())\n\
                                 {indent}  return _ctrl\n\
                                 {indent}}})()",
                                indent = indent,
                                name = name,
                                factory = factory,
                            ));
                        }
                        CollectionKind::Form => {
                            // D5 — $form wiring is emitted by emit_form_wiring()
                            // at the SFC-body level (called from emit_function_form).
                            // Individual entries are not lowered here.
                        }
                        CollectionKind::Context => {
                            // B5/O2 — $context entries are `provide` or `consume`.
                            // Each is a wrapped entry whose `meta` pairs hold
                            // the context keys and their sub-metadata objects.
                            //
                            // Example:
                            //   provide entry → meta: [("theme", "{ value: () => themeSignal }")]
                            //   consume entry → meta: [("locale", "{ type: 'Locale' }")]
                            //
                            // Lowering (O2): synchronous setup-body calls onto the
                            // prototype-chain DI in @aihu/context — NOT wrapped in
                            // onMount, because the runtime enters the component's
                            // context scope for the duration of setup (a parent
                            // provides during its setup; a child injects during its
                            // own, after connect-time parent resolution).
                            // `contextKey` interns one shared token per string key
                            // so separately compiled SFCs meet. Works under SSR too
                            // (flat-map fallback), unlike the removed client-only
                            // CustomEvent path.
                            for (ctx_key, ctx_val) in &entry.meta {
                                let v_trimmed = ctx_val.trim();
                                if entry.name == "provide" {
                                    // Parse the sub-object { value: () => expr } to extract factory.
                                    let inner = match crate::parser::state_macros::strip_outer_braces_pub(v_trimmed) {
                                        Some(s) => s,
                                        None => continue,
                                    };
                                    let sub_meta = match crate::parser::state_macros::parse_meta_pairs_pub(&inner) {
                                        Ok(p) => p,
                                        Err(_) => continue,
                                    };
                                    let val_factory = match sub_meta.iter().find(|(mk, _)| mk == "value").map(|(_, mv)| mv.trim().to_string()) {
                                        Some(f) => f,
                                        None => continue,
                                    };
                                    // #487 — wrapper `provide(key, factory)`:
                                    // bare reads in the factory are VALUE
                                    // reads (§4.2).
                                    let val_factory = if entry.wrapper {
                                        rewrite_wrapper_code(
                                            &val_factory,
                                            &wrapper_targets,
                                            &mut needs_state_upd_helper,
                                            &mut needs_prop_upd_helper,
                                        )
                                    } else {
                                        val_factory
                                    };
                                    // Function-shaped values are factories:
                                    // wrap-and-call. Static values
                                    // (`value: 'light'`, `value: themeSignal`)
                                    // are provided verbatim — calling them
                                    // would TypeError at runtime.
                                    if crate::parser::state_macros::is_fn_expr(&val_factory) {
                                        lines.push(format!(
                                            "{indent}provide(contextKey('{key}'), ({factory})())",
                                            indent = indent,
                                            key = ctx_key,
                                            factory = val_factory,
                                        ));
                                    } else {
                                        lines.push(format!(
                                            "{indent}provide(contextKey('{key}'), {value})",
                                            indent = indent,
                                            key = ctx_key,
                                            value = val_factory,
                                        ));
                                    }
                                } else {
                                    // consume: ctx_key -> { type: 'T' }. The
                                    // injected value is whatever was provided
                                    // (typically a signal), so template reads
                                    // like `{key()}` keep working identically.
                                    lines.push(format!(
                                        "{indent}const {key} = inject(contextKey('{key}'))",
                                        indent = indent,
                                        key = ctx_key,
                                    ));
                                }
                            }
                        }
                    }
                }
            }
            StateMacro::EffectAnon { body } => {
                lines.push(format!("{indent}effect(() => {{ {body} }});"));
            }
            StateMacro::EffectOn { dep, body } => {
                // R5c: if dep is a simple signal identifier, call the getter
                // so the effect actually subscribes (`name;` would just read
                // the function reference and not track).
                let trimmed = dep.trim();
                let is_simple_ident = !trimmed.is_empty()
                    && trimmed
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
                let dep_expr = if is_simple_ident && signal_map.is_reactive(trimmed) {
                    format!("{}()", trimmed)
                } else {
                    dep.to_string()
                };
                lines.push(format!("{indent}effect(() => {{ {dep_expr}; {body} }});"));
            }
            StateMacro::Watch { name, body } => {
                let is_simple_ident = !name.is_empty()
                    && name
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
                let dep_expr = if is_simple_ident && signal_map.is_reactive(name) {
                    format!("{}()", name)
                } else {
                    name.to_string()
                };
                lines.push(format!("{indent}effect(() => {{ {dep_expr}; {body} }});"));
            }
            // arch-5 M1 — routing macros.
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
                    crate::parser::state_macros::auth_session_todo(*method)
                ));
            }
            // §9.4 / GX — consumed at the assembly/fan-out layer; no body JS.
            StateMacro::Extends { .. } | StateMacro::Shadow { .. } | StateMacro::Extract { .. } => {}
            // #487 — `let x = state(v)` lowers to the signal tuple the runtime
            // already serves (state-model spec §2.1).
            //
            // Bug 9 TDZ fix: the body-side declaration is NOT emitted here
            // anymore. `signal(init)` runs eagerly, so emitting it here (in
            // `macro_code`, a block spliced AFTER the entire `plain_body`)
            // meant any plain-body statement that synchronously ran BEFORE
            // the end of plain_body and read the getter — e.g.
            // `seedFromPrerender()` in apps/docs/src/components/docs-shell.aihu
            // calling `cacheSet(activePage(), ...)` — hit
            // `ReferenceError: Cannot access 'activePage' before
            // initialization`. It is now spliced into `plain_body` INLINE, at
            // its original source position, by `process_state_body` (see the
            // wrapper-span-skip branch in this file). See also the `$prop`
            // hoist above (issue #279 / Bug 8) for the sibling fix — that one
            // is a global hoist because a prop read has zero ordering
            // dependency; this one must stay positional because `init` can
            // depend on earlier plain-body code.
            StateMacro::StateLet { .. } => {}
            // #487 — `const x = consume(key)`: the shipped synchronous
            // prototype-chain DI, binding name decoupled from the key.
            StateMacro::ConsumeBinding { name, key } => {
                lines.push(format!("{indent}const {name} = inject(contextKey('{key}'))"));
            }
        }
    }
    let code = if lines.is_empty() {
        String::new()
    } else {
        lines.join("\n") + "\n"
    };
    (code, needs_prop_upd_helper, needs_state_upd_helper)
}

// ─── R1 — $prop options-form lowering helpers ───────────────────────────────

/// Collect the entries of all `$prop` collections across the SFC's @state
/// macros. R1 (template-syntax-v2 round 5, Builder B1): when this is
/// non-empty, the function-form switches to the options-form
/// `defineComponent({ props: { … }, setup: (ctx) => { … } })` shape so the
/// runtime can synthesize observedAttributes + attributeChangedCallback.
pub(crate) fn collect_prop_entries(macros: &[crate::types::StateMacro]) -> Vec<&crate::types::CollectionEntry> {
    let mut out = Vec::new();
    for m in macros {
        if let crate::types::StateMacro::Collection {
            kind: crate::types::CollectionKind::Prop,
            entries,
        } = m
        {
            for e in entries {
                out.push(e);
            }
        }
    }
    out
}

/// Emit the `props: { name: { value, attribute, reflect, converter }, ... }`
/// object literal passed to `defineComponent({ props, setup })`. Per-prop
/// keys are pulled verbatim from the metadata-bag (`default:` is renamed to
/// `value:` so the runtime side reads the same key universally).
///
/// Indent is applied to each top-level prop entry; the surrounding `props: {`
/// + `}` are emitted by the caller.
pub(crate) fn emit_props_config(prop_entries: &[&crate::types::CollectionEntry], indent: &str) -> String {
    use crate::parser::state_macros::meta_get;
    let mut lines: Vec<String> = Vec::new();
    for entry in prop_entries {
        let name = &entry.name;
        // Build the inner `{ value: ..., attribute: ..., reflect: ..., converter: ... }`
        // bag. Order matters only for snapshot stability; this canonical order
        // mirrors the spec sketch in §3.6 of the platform audit.
        let mut bag: Vec<String> = Vec::new();
        // value: comes from `default:` (existing key) per spec §3.6 + the
        // existing $prop entries in the wild (see examples/weather-card.aihu).
        if let Some(default_raw) = meta_get(entry, "default") {
            bag.push(format!("value: {}", default_raw.trim()));
        }
        if let Some(attr_raw) = meta_get(entry, "attribute") {
            bag.push(format!("attribute: {}", attr_raw.trim()));
        }
        if let Some(reflect_raw) = meta_get(entry, "reflect") {
            bag.push(format!("reflect: {}", reflect_raw.trim()));
        }
        if let Some(conv_raw) = meta_get(entry, "converter") {
            bag.push(format!("converter: {}", conv_raw.trim()));
        }
        let bag_str = if bag.is_empty() {
            "{}".to_string()
        } else {
            format!("{{ {} }}", bag.join(", "))
        };
        lines.push(format!("{indent}{name}: {bag_str}"));
    }
    lines.join(",\n")
}

/// Emit the body-side `$prop` shadow declarations
/// (`const <name> = ctx.props.<name>`), hoisted out of `macro_code` so they
/// precede the user's plain @state statements. These are PURE reads of
/// `ctx.props.<name>` — `ctx` is the setup arrow parameter, always in scope at
/// the top of the body — so they have no dependency on `plain_body` or any
/// other `macro_code` line. Hoisting them resolves the temporal-dead-zone
/// (TDZ) crash where a synchronously-running `effect()` (or a const
/// initializer) in @state reads a `$prop` getter before its declaration was
/// emitted. See issue #279 and the Defect-A note at the body-assembly block.
pub(crate) fn emit_prop_bindings(prop_entries: &[&crate::types::CollectionEntry], indent: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    for entry in prop_entries {
        let name = &entry.name;
        lines.push(format!("{indent}const {name} = ctx.props.{name}"));
    }
    if lines.is_empty() {
        String::new()
    } else {
        lines.join("\n") + "\n"
    }
}

// ─── B4 — $aria collection wiring (R5) ───────────────────────────────────────
//
// Lazy-attach: only emitted when the SFC declares `$aria`. Zero overhead for
// SFCs that don't use ARIA. Per spec §3.2: `attachInternals()` is called once,
// then per-key mountEffect calls wire the reactive ARIA properties.

/// ARIA key → ElementInternals IDL property name. Static string values
/// are written once at connect; thunks are wrapped in `mountEffect`.
fn aria_idl_prop(key: &str) -> &'static str {
    match key {
        "role" => "role",
        "label" => "ariaLabel",
        "pressed" => "ariaPressed",
        "expanded" => "ariaExpanded",
        "disabled" => "ariaDisabled",
        "hidden" => "ariaHidden",
        "selected" => "ariaSelected",
        "checked" => "ariaChecked",
        "invalid" => "ariaInvalid",
        "required" => "ariaRequired",
        "level" => "ariaLevel",
        "live" => "ariaLive",
        "controls" => "ariaControls",
        "current" => "ariaCurrent",
        "keyShortcuts" => "ariaKeyShortcuts",
        "modal" => "ariaModal",
        "multiline" => "ariaMultiline",
        "multiSelectable" => "ariaMultiSelectable",
        "orientation" => "ariaOrientation",
        "placeholder" => "ariaPlaceholder",
        "posInSet" => "ariaPosInSet",
        "readOnly" => "ariaReadOnly",
        "roleDescription" => "ariaRoleDescription",
        "setSize" => "ariaSetSize",
        "sort" => "ariaSort",
        "valueMax" => "ariaValueMax",
        "valueMin" => "ariaValueMin",
        "valueNow" => "ariaValueNow",
        "valueText" => "ariaValueText",
        // Any unrecognized key is passed through with "aria" prefix + capitalize.
        _ => "",
    }
}

/// Returns true when `value_raw` looks like a thunk (arrow function `() => ...`
/// or `(args) => ...`). Static string literals like `'button'` are not thunks.
fn is_thunk(value_raw: &str) -> bool {
    let v = value_raw.trim();
    // Starts with `(` followed by `)` => ...  OR starts with a direct `=>`
    // after possibly a param. Common patterns: `() => expr`, `(x) => expr`, `x => expr`.
    v.contains("=>")
}

/// Roles that get auto-keyboard-promotion (Enter+Space activation) per spec §3.2.
const KEYBOARD_ROLES: &[&str] = &["button", "link", "menuitem", "tab"];

/// Roles that require tabindex="0" injection unless already declared.
const FOCUSABLE_ROLES: &[&str] = &[
    "button", "link", "menuitem", "tab",
    "menuitemcheckbox", "menuitemradio", "option", "switch",
    "checkbox", "radio", "slider", "spinbutton", "textbox",
];

/// Native HTML tags that already handle keyboard interaction natively — the
/// auto-keyboard handler is suppressed when the root element is one of these.
const NATIVE_INTERACTIVE_TAGS: &[&str] = &["button", "a", "input", "select", "textarea"];

/// Emit the $aria wiring code for the SFC setup body.
/// Returns (setup_code, needs_mount_effect, tabindex_to_inject_on_root).
/// `needs_mount_effect` indicates whether `mountEffect` must be imported.
/// `tabindex_to_inject` is `Some("0")` when the compiler should add tabindex
/// to the root template element.
pub(crate) fn emit_aria_wiring(
    macros: &[crate::types::StateMacro],
    template_nodes: &[TemplateNode],
) -> (String, bool, bool) {
    use crate::parser::state_macros::running_code;
    use crate::types::{CollectionKind, StateMacro};

    // Find the $aria collection. Distinguish "not present" from "present but empty".
    let has_aria_collection = macros.iter().any(|m| {
        matches!(m, StateMacro::Collection { kind: CollectionKind::Aria, .. })
    });
    if !has_aria_collection {
        return (String::new(), false, false);
    }

    let aria_entries: Vec<&crate::types::CollectionEntry> = macros
        .iter()
        .flat_map(|m| {
            if let StateMacro::Collection { kind: CollectionKind::Aria, entries } = m {
                entries.iter().collect::<Vec<_>>()
            } else {
                Vec::new()
            }
        })
        .collect();

    // Warn on empty collection (spec §3.2: "Empty $aria: {} is a parse warning").
    if aria_entries.is_empty() {
        eprintln!("warning: `$aria: {{}}` is empty — at least one ARIA property should be declared (role, label, etc.)");
        return (String::new(), false, false);
    }

    // Extract the role (static string, stripped of quotes).
    let role_entry = aria_entries.iter().find(|e| e.name == "role");
    let role_raw = role_entry.map(|e| {
        let v = if e.is_wrapped {
            running_code(e).unwrap_or("").to_string()
        } else {
            e.value_raw.clone()
        };
        // Strip surrounding quotes from static string literals.
        v.trim()
            .trim_matches(|c| c == '\'' || c == '"')
            .to_string()
    });
    let role_str = role_raw.as_deref().unwrap_or("");

    // Determine root template element tag and whether tabindex is already declared.
    let (root_tag, root_has_tabindex, root_has_click) = if let Some(first) = template_nodes.first() {
        match first {
            TemplateNode::Element { tag, attrs, .. } => {
                let has_tabindex = attrs.iter().any(|a| match a {
                    Attr::Static { name, .. } => name == "tabindex",
                    Attr::Binding { name, .. } => name == "tabindex",
                    _ => false,
                });
                let has_click = attrs.iter().any(|a| match a {
                    Attr::Macro { name, .. } => {
                        // $on.click={fn} is normalized to Macro { name: "on:click" } by the parser.
                        name == "on:click" || name.starts_with("on:click")
                    }
                    _ => false,
                });
                (tag.clone(), has_tabindex, has_click)
            }
            _ => (String::new(), false, false),
        }
    } else {
        (String::new(), false, false)
    };

    // Determine keyboard promotion eligibility per spec §3.2:
    // - Role must be a keyboard-interactive role (button/link/menuitem/tab).
    // - Root element must NOT be a native interactive element (browser handles keyboard).
    // - The template must declare a $on.click handler (otherwise there's nothing to promote).
    let is_keyboard_role = KEYBOARD_ROLES.contains(&role_str);
    let is_native_interactive = NATIVE_INTERACTIVE_TAGS.contains(&root_tag.to_lowercase().as_str());
    let should_promote_keyboard = is_keyboard_role && !is_native_interactive && root_has_click;

    // Determine tabindex injection.
    let should_inject_tabindex = FOCUSABLE_ROLES.contains(&role_str)
        && !root_has_tabindex
        && !root_tag.is_empty();

    let indent = "  ";
    let mut lines: Vec<String> = Vec::new();
    let mut needs_effect = false;

    // attachInternals — lazy-attach guard (only emitted when $aria is declared).
    lines.push(format!("{indent}if (!this._internals) this._internals = this.attachInternals();"));

    // Emit per-key ARIA wiring.
    for entry in &aria_entries {
        let key = entry.name.as_str();
        // Skip `describedBy` — special case handled below.
        if key == "describedBy" {
            let value = if entry.is_wrapped {
                running_code(entry).unwrap_or("").to_string()
            } else {
                entry.value_raw.clone()
            };
            if is_thunk(value.trim()) {
                needs_effect = true;
                lines.push(format!(
                    "{indent}effect(() => {{ this._internals.ariaDescribedByElements = [this.getRootNode().getElementById(({value})())]; }});",
                    indent = indent, value = value.trim()
                ));
            } else {
                // Static id string.
                let id_str = value.trim().trim_matches(|c| c == '\'' || c == '"');
                lines.push(format!(
                    "{indent}this._internals.ariaDescribedByElements = [this.getRootNode().getElementById('{id_str}')];",
                    indent = indent, id_str = id_str
                ));
            }
            continue;
        }

        let idl_prop = aria_idl_prop(key);
        let idl_prop_name = if idl_prop.is_empty() {
            // Unknown key: capitalize first letter and prefix with "aria".
            let mut chars = key.chars();
            match chars.next() {
                Some(c) => format!("aria{}{}", c.to_uppercase(), chars.as_str()),
                None => format!("aria{}", key),
            }
        } else {
            idl_prop.to_string()
        };

        let value = if entry.is_wrapped {
            running_code(entry).unwrap_or("").to_string()
        } else {
            entry.value_raw.clone()
        };
        let value_trimmed = value.trim();

        // Determine if this is a boolean-cast ARIA property.
        let is_bool_cast = matches!(
            key,
            "pressed" | "expanded" | "disabled" | "hidden" | "selected"
            | "checked" | "invalid" | "required" | "modal" | "multiline"
            | "multiSelectable" | "readOnly"
        );
        let is_number_cast = matches!(key, "level" | "posInSet" | "setSize" | "valueMax" | "valueMin" | "valueNow");

        if is_thunk(value_trimmed) {
            needs_effect = true;
            if is_bool_cast || is_number_cast {
                lines.push(format!(
                    "{indent}effect(() => {{ this._internals.{prop} = String(({value})()); }});",
                    indent = indent, prop = idl_prop_name, value = value_trimmed
                ));
            } else {
                lines.push(format!(
                    "{indent}effect(() => {{ this._internals.{prop} = ({value})(); }});",
                    indent = indent, prop = idl_prop_name, value = value_trimmed
                ));
            }
        } else {
            // Static value — write once at connect.
            let static_val = value_trimmed.to_string();
            lines.push(format!(
                "{indent}this._internals.{prop} = {val};",
                indent = indent, prop = idl_prop_name, val = static_val
            ));
        }
    }

    // Auto-keyboard-promotion (only when role is a keyboard role and root is not native interactive).
    if should_promote_keyboard {
        lines.push(format!(
            "{indent}this.addEventListener('keydown', (e) => {{ if (e.key === 'Enter' || e.key === ' ') {{ e.preventDefault(); this.click(); }} }});",
            indent = indent
        ));
    }

    // root_has_click is used in should_promote_keyboard above.

    (lines.join("\n"), needs_effect, should_inject_tabindex)
}

// ─── D5 — $form collection wiring ────────────────────────────────────────────
//
// Lazy-attach: only emitted when the SFC declares `$form`. Zero overhead for
// SFCs that don't use form-associated APIs. Shares the `attachInternals()`
// singleton guard with `$aria` — when both are declared, only one
// `attachInternals()` call is emitted (the guard pattern handles this).
//
// `static formAssociated = true` is emitted as a class field via the returned
// boolean flag. The setup-body wiring (effects) is returned as a string.

/// Emit the $form wiring code for the SFC setup body.
/// Returns (setup_code, has_form) where `has_form` indicates whether
/// `static formAssociated = true` must be emitted as a class field.
pub(crate) fn emit_form_wiring(macros: &[crate::types::StateMacro]) -> (String, bool) {
    use crate::types::{CollectionKind, StateMacro};

    // Find $form entries. Distinguish "not present" from "present but empty".
    let has_form_collection = macros.iter().any(|m| {
        matches!(m, StateMacro::Collection { kind: CollectionKind::Form, .. })
    });
    if !has_form_collection {
        return (String::new(), false);
    }

    let form_entries: Vec<&crate::types::CollectionEntry> = macros
        .iter()
        .filter_map(|m| {
            if let StateMacro::Collection { kind: CollectionKind::Form, entries } = m {
                Some(entries.iter())
            } else {
                None
            }
        })
        .flatten()
        .collect();

    if form_entries.is_empty() {
        return (String::new(), true);
    }

    let indent = "  ";
    let mut lines: Vec<String> = Vec::new();

    // attachInternals guard — lazy-attach (shared with $aria).
    lines.push(format!("{indent}if (!this._internals) this._internals = this.attachInternals();"));

    // Emit per-entry wiring.
    for entry in &form_entries {
        let value = if entry.is_wrapped {
            crate::parser::state_macros::running_code(entry)
                .unwrap_or("")
                .to_string()
        } else {
            entry.value_raw.clone()
        };
        let expr = value.trim();

        match entry.name.as_str() {
            "value" => {
                if is_thunk(expr) {
                    lines.push(format!(
                        "{indent}effect(() => {{ this._internals.setFormValue(({expr})()); }});",
                        indent = indent, expr = expr
                    ));
                } else {
                    lines.push(format!(
                        "{indent}effect(() => {{ this._internals.setFormValue({expr}); }});",
                        indent = indent, expr = expr
                    ));
                }
            }
            "validity" => {
                lines.push(format!(
                    "{indent}effect(() => {{ const _fv = {expr}; const _fk = _fv && Object.keys(_fv); this._internals.setValidity(_fk && _fk.length ? _fv : {{}}); }});",
                    indent = indent, expr = expr
                ));
            }
            _ => {} // already rejected in parse
        }
    }

    (lines.join("\n"), true)
}
