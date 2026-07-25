//! #487 — the `@state` reactive-declaration model (state-model spec, Phase 1).
//!
//! Recognizes the NEW wrapper dialect inside an `@state { }` body and lowers it
//! onto the SAME `StateMacro` IR the `$`-collection macros produce, so every
//! downstream consumer (codegen, GX member collection, aria/form wiring, the
//! sidecar's `$emit` typing) serves both dialects through one path.
//!
//! Recognized constructs (spec §1.1 recognition rules):
//!
//! - **Binding wrappers** (§2): `const|let <name> = <wrapper><G>?(args)` at
//!   `@state` top level, where `<wrapper>` is one of the compiler-intrinsic
//!   identifiers `state`, `prop`, `derived`, `action`, `resource`, `stream`,
//!   `controller`, `route`, `consume` — a bare identifier not shadowed by an
//!   authored import.
//! - **Statement-position calls** (§3.2): `effect(…)`, `onMount(…)`,
//!   `onDispose(…)`, `onAdopt(…)`, `onAttributeChange(…)`, `aria(…)`,
//!   `provide(…)`, `form(…)`, `event(…)`, `beforeNavigate(…)`,
//!   `afterNavigate(…)`. To keep OLD-dialect files byte-identical (a plain
//!   `effect(fn)` over an imported `effect` is legal plain JS today), these
//!   are honored only when the file also declares at least one binding
//!   wrapper or naked directive — i.e. when the file IS new-dialect.
//! - **Naked directives** (§6.4): `base: Ident`, `shadow: 'light'|'shadow'`,
//!   `extract: { … }` — lines with a leading directive keyword, a `:`, and NO
//!   top-level `=` (which would make them the aihu bare typed declaration).
//!
//! One signature everywhere: `wrapper(config?, valueOrFn)` — the optional
//! metadata bag FIRST (§1.3). Swapped arguments are C622 with a machine
//! `from`/`to` auto-fix (§4.5); nature/role mismatches are C624 (§4.6);
//! malformed wrapper calls are C629.

use crate::parser::state_macros::{
    find_paren_close, is_fn_expr, parse_meta_pairs_pub, split_top_level_commas_pub,
};
use crate::types::{CollectionEntry, CollectionKind, CompileError, StateMacro};
use std::collections::BTreeSet;

/// The binding-position intrinsic names (spec §2 + §3.3.1 + §3.2.4).
const BINDING_INTRINSICS: &[&str] = &[
    "state",
    "prop",
    "derived",
    "action",
    "resource",
    "stream",
    "controller",
    "route",
    "consume",
];

/// The statement-position intrinsic names (spec §3.2 + §3.3.3).
const STATEMENT_INTRINSICS: &[&str] = &[
    "effect",
    "onMount",
    "onDispose",
    "onAdopt",
    "onAttributeChange",
    "aria",
    "provide",
    "form",
    "event",
    "beforeNavigate",
    "afterNavigate",
];

/// Result of scanning an `@state` body for new-dialect constructs.
#[derive(Debug, Default)]
pub struct WrapperScan {
    /// Wrapper-derived macros, in source order. Lowered by the SAME emit
    /// paths as `$`-macro-derived ones.
    pub macros: Vec<StateMacro>,
    /// Byte spans (into the `@state` body) of every recognized construct —
    /// the plain-body scanner skips these exactly as it skips `$`-macro spans.
    pub spans: Vec<(usize, usize)>,
    /// True when at least one BINDING wrapper or naked directive was found —
    /// the "this file is new-dialect" predicate that gates statement-call
    /// recognition and the §4.2/§4.3 read/write rewrites.
    pub has_bindings: bool,
}

impl WrapperScan {
    pub fn is_empty(&self) -> bool {
        self.macros.is_empty()
    }

    /// Byte offset the plain-body scanner should skip to when `pos` falls
    /// inside a recognized construct span (`None` otherwise).
    pub fn skip_to(&self, pos: usize) -> Option<usize> {
        self.spans
            .iter()
            .find(|(s, e)| pos >= *s && pos < *e)
            .map(|(_, e)| *e)
    }

    /// The macro whose recognized span contains `pos` (`None` otherwise).
    /// `spans` and `macros` are parallel (built together in `scan_state_wrappers`
    /// via `for (mac, span) in all { out.macros.push(mac); out.spans.push(span); }`),
    /// so the matching index is shared. Used by the Bug 9 TDZ fix (`StateLet`
    /// inline-splice, see `process_state_body` in `codegen/state_emit.rs`) to
    /// look up WHICH construct is being skipped, not just where it ends.
    pub fn macro_for(&self, pos: usize) -> Option<&StateMacro> {
        self.spans
            .iter()
            .position(|(s, e)| pos >= *s && pos < *e)
            .and_then(|idx| self.macros.get(idx))
    }
}

/// Scan an `@state` body for new-dialect wrapper constructs.
///
/// Old-dialect bodies (no wrappers) return an empty scan — strictly zero
/// behavioral change for them. Errors are the spec's own diagnostics (C622,
/// C624, C629, plus the carried-over C445/C446/C470/C471/C483 checks).
pub fn scan_state_wrappers(body: &str) -> Result<WrapperScan, CompileError> {
    let shadowed = collect_import_shadow_names(body);
    let bytes = body.as_bytes();

    let mut bindings: Vec<(StateMacro, (usize, usize))> = Vec::new();
    let mut statements: Vec<(StateMacro, (usize, usize))> = Vec::new();
    let mut effect_counter = 0usize;

    let mut i = 0usize;
    while i < bytes.len() {
        let nl = body[i..].find('\n').map(|r| i + r).unwrap_or(body.len());
        let line_raw = &body[i..nl];
        let line = line_raw.trim();

        // Skip `$`-macro lines and their multi-line bodies (mirrors
        // `plain_state_lines`) so a `state(...)`-looking call INSIDE a macro
        // body is never mis-recognized. Also skip import lines.
        if line.starts_with('$') {
            i = skip_dollar_macro(body, i, nl);
            continue;
        }
        if line.starts_with("import ") || line.starts_with("import\t") {
            i = nl + 1;
            continue;
        }

        let indent = line_raw.len() - line_raw.trim_start().len();
        let line_start = i + indent;

        // ── Binding wrappers: `const|let name = intrinsic<G>?( … )` ─────────
        if let Some((mac, span)) = try_parse_binding(body, line_start, line, &shadowed)? {
            i = advance_past(body, span.1);
            bindings.push((mac, span));
            continue;
        }

        // ── Naked directives: `base:` / `shadow:` / `extract:` ──────────────
        if let Some((mac, span)) = try_parse_directive(body, line_start, line, nl)? {
            i = advance_past(body, span.1);
            bindings.push((mac, span));
            continue;
        }

        // ── Statement-position calls ─────────────────────────────────────────
        if let Some((mac, span)) =
            try_parse_statement_call(body, line_start, line, &shadowed, &mut effect_counter)?
        {
            i = advance_past(body, span.1);
            statements.push((mac, span));
            continue;
        }

        i = nl + 1;
    }

    let has_bindings = !bindings.is_empty();
    let mut out = WrapperScan {
        has_bindings,
        ..Default::default()
    };

    // Statement calls are honored only in a new-dialect file (see module doc):
    // a lone `effect(fn)` over an imported/auto-imported `effect` in an OLD
    // file keeps compiling verbatim as plain JS.
    let mut all: Vec<(StateMacro, (usize, usize))> = bindings;
    if has_bindings {
        all.extend(statements);
    }
    all.sort_by_key(|(_, (s, _))| *s);

    for (mac, span) in all {
        out.macros.push(mac);
        out.spans.push(span);
    }

    // Carried-over `$prop` config checks on the wrapper dialect: C446
    // attribute-name collisions (C445 is checked per-entry at parse below).
    if let Some(err) = crate::parser::state_macros::check_prop_attribute_collisions_pub(&out.macros)
    {
        return Err(err);
    }

    Ok(out)
}

fn advance_past(body: &str, end: usize) -> usize {
    let mut i = end;
    let bytes = body.as_bytes();
    if i < bytes.len() && bytes[i] == b'\n' {
        i += 1;
    }
    i
}

/// Names bound by `import` lines in the body — an authored import SHADOWS an
/// intrinsic (spec §1 point 2), turning the call back into plain JS.
fn collect_import_shadow_names(body: &str) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    for line in body.lines() {
        let t = line.trim();
        if !(t.starts_with("import ") || t.starts_with("import\t")) {
            continue;
        }
        // Named imports: `import { a, b as c } from '…'`.
        if let (Some(open), Some(close)) = (t.find('{'), t.find('}')) {
            if open < close {
                for part in t[open + 1..close].split(',') {
                    let p = part.trim();
                    if p.is_empty() {
                        continue;
                    }
                    let bound = p.rsplit(" as ").next().unwrap_or(p).trim();
                    if !bound.is_empty() {
                        names.insert(bound.to_string());
                    }
                }
            }
        }
        // Default / namespace imports: `import X from`, `import * as X from`.
        let after = t.trim_start_matches("import").trim_start();
        if let Some(rest) = after.strip_prefix("* as ") {
            if let Some(id) = leading_ident(rest) {
                names.insert(id);
            }
        } else if !after.starts_with('{') && !after.starts_with('\'') && !after.starts_with('"') {
            if let Some(id) = leading_ident(after) {
                names.insert(id);
            }
        }
    }
    names
}

fn leading_ident(s: &str) -> Option<String> {
    let first = s.chars().next()?;
    if !(first.is_ascii_alphabetic() || first == '_' || first == '$') {
        return None;
    }
    let end = s
        .char_indices()
        .take_while(|(_, c)| c.is_ascii_alphanumeric() || *c == '_' || *c == '$')
        .last()
        .map(|(i, c)| i + c.len_utf8())?;
    Some(s[..end].to_string())
}

/// Skip a `$`-macro's full span (collection body, preserved form, router
/// call). Mirrors the skipping in `codegen::signals::plain_state_lines`.
fn skip_dollar_macro(body: &str, i: usize, nl: usize) -> usize {
    let bytes = body.as_bytes();
    let line = body[i..nl].trim();
    let stripped = line.trim_start_matches('$');
    let keyword = stripped.split_ascii_whitespace().next();
    let is_collection = matches!(
        keyword.map(|k| k.trim_end_matches(':')),
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
            | Some("form")
            | Some("extract")
    ) && stripped.contains(':');
    let is_preserved = stripped.starts_with("effect.on(") || matches!(keyword, Some("watch"));
    let is_call = stripped.starts_with("beforeNavigate(") || stripped.starts_with("afterNavigate(");

    if is_collection {
        if let Some(colon_rel) = body[i..].find(':') {
            let mut p = i + colon_rel + 1;
            while p < body.len() && matches!(bytes[p], b' ' | b'\t' | b'\n' | b'\r') {
                p += 1;
            }
            if p < body.len() && bytes[p] == b'{' {
                if let Some(close) = crate::parser::state_macros::find_brace_close_js(body, p + 1) {
                    return advance_past(body, close + 1);
                }
            } else if p < body.len() && bytes[p] == b'(' {
                // Anonymous `$effect: () => …`.
                if let Some(cp) = find_paren_close(body, p + 1) {
                    let mut q = cp + 1;
                    while q < body.len() && matches!(bytes[q], b' ' | b'\t') {
                        q += 1;
                    }
                    if q + 1 < body.len() && bytes[q] == b'=' && bytes[q + 1] == b'>' {
                        q += 2;
                        while q < body.len() && matches!(bytes[q], b' ' | b'\t' | b'\n' | b'\r') {
                            q += 1;
                        }
                        if q < body.len() && bytes[q] == b'{' {
                            if let Some(close) =
                                crate::parser::state_macros::find_brace_close_js(body, q + 1)
                            {
                                return advance_past(body, close + 1);
                            }
                        } else {
                            let nl2 = body[q..].find('\n').map(|r| q + r).unwrap_or(body.len());
                            return nl2 + 1;
                        }
                    }
                }
            }
        }
    }
    if is_preserved {
        let brace = body[i..].find('{').map(|r| i + r);
        let first_nl = body[i..].find('\n').map(|r| i + r);
        if let Some(b) = brace.filter(|&b| first_nl.map_or(true, |n| b < n)) {
            if let Some(close) = crate::parser::state_macros::find_brace_close_js(body, b + 1) {
                return advance_past(body, close + 1);
            }
        }
    }
    if is_call {
        if let Some(p) = body[i..].find('(').map(|r| i + r) {
            if let Some(close) = find_paren_close(body, p + 1) {
                let mut j = close + 1;
                if j < body.len() && bytes[j] == b';' {
                    j += 1;
                }
                return advance_past(body, j);
            }
        }
    }
    nl + 1
}

/// A parsed wrapper call: optional generic text, argument list, span end.
struct WrapperCall {
    generic: Option<String>,
    args: Vec<String>,
    end: usize,
}

/// Parse `<G>?( … )` starting just past the intrinsic name at `pos`.
/// Returns `None` when the shape is not a call (→ plain JS, not recognized).
fn parse_call_tail(body: &str, pos: usize) -> Option<WrapperCall> {
    let bytes = body.as_bytes();
    let mut p = pos;
    let mut generic = None;
    if p < bytes.len() && bytes[p] == b'<' {
        let close = find_angle_close(body, p + 1)?;
        generic = Some(body[p + 1..close].trim().to_string());
        p = close + 1;
    }
    while p < bytes.len() && matches!(bytes[p], b' ' | b'\t') {
        p += 1;
    }
    if p >= bytes.len() || bytes[p] != b'(' {
        return None;
    }
    let close = find_paren_close(body, p + 1)?;
    let inner = &body[p + 1..close];
    let args: Vec<String> = split_top_level_commas_pub(inner)
        .into_iter()
        .map(|a| a.trim().to_string())
        .filter(|a| !a.is_empty())
        .collect();
    let mut end = close + 1;
    if end < bytes.len() && bytes[end] == b';' {
        end += 1;
    }
    Some(WrapperCall { generic, args, end })
}

/// Find the matching `>` for an already-opened generic parameter list. The
/// `>` of a `=>` arrow (preceded by `=`) is payload, not structure.
fn find_angle_close(s: &str, start: usize) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut depth = 1usize;
    let mut i = start;
    while i < bytes.len() {
        match bytes[i] {
            b'<' => depth += 1,
            b'>' if i > 0 && bytes[i - 1] == b'=' => {} // `=>`
            b'>' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            b'(' => {
                i = find_paren_close(s, i + 1)?;
            }
            b'"' | b'\'' | b'`' => {
                let q = bytes[i];
                i += 1;
                while i < bytes.len() && bytes[i] != q {
                    if bytes[i] == b'\\' {
                        i += 1;
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

fn c622(wrapper: &str, args: &[String]) -> CompileError {
    let from = format!("{}({})", wrapper, args.join(", "));
    let mut swapped: Vec<String> = args.to_vec();
    swapped.swap(0, 1);
    let to = format!("{}({})", wrapper, swapped.join(", "));
    CompileError {
        message: format!(
            "C622: `{wrapper}` takes its config bag FIRST — `{wrapper}(config?, fn)`. The first \
             argument here is a function and a second argument follows; swap them."
        ),
        line: 0,
        col: 0,
        code: Some("C622".to_string()),
        hint: Some(
            "one signature everywhere: `wrapper(config?, valueOrFn)` — metadata first, running \
             code last (the node:test / Deno.test convention)"
                .to_string(),
        ),
        fix: Some(to.clone()),
        from: Some(from),
        to: Some(to),
    }
}

fn c624(msg: String, fix: &str) -> CompileError {
    CompileError {
        message: format!("C624: {}", msg),
        line: 0,
        col: 0,
        code: Some("C624".to_string()),
        fix: Some(fix.to_string()),
        ..Default::default()
    }
}

fn c629(wrapper: &str, msg: &str) -> CompileError {
    CompileError {
        message: format!("C629: malformed `{}(…)` wrapper call — {}", wrapper, msg),
        line: 0,
        col: 0,
        code: Some("C629".to_string()),
        ..Default::default()
    }
}

/// Split a wrapper's argument list into `(config, valueOrFn)` per the one
/// signature (§1.3), raising C622 on the swapped order.
fn split_config_fn(
    wrapper: &str,
    args: &[String],
) -> Result<(Option<Vec<(String, String)>>, Option<String>), CompileError> {
    match args.len() {
        0 => Ok((None, None)),
        1 => {
            if args[0].starts_with('{') {
                Ok((Some(parse_config(wrapper, &args[0])?), None))
            } else {
                Ok((None, Some(args[0].clone())))
            }
        }
        2 => {
            if is_fn_expr(&args[0]) && !args[0].starts_with('{') {
                return Err(c622(wrapper, args));
            }
            if !args[0].starts_with('{') {
                return Err(c629(
                    wrapper,
                    "the first of two arguments must be a config object literal",
                ));
            }
            Ok((Some(parse_config(wrapper, &args[0])?), Some(args[1].clone())))
        }
        n => Err(c629(wrapper, &format!("expected at most 2 arguments, got {n}"))),
    }
}

fn parse_config(wrapper: &str, raw: &str) -> Result<Vec<(String, String)>, CompileError> {
    let inner = raw
        .trim()
        .strip_prefix('{')
        .and_then(|s| s.strip_suffix('}'))
        .ok_or_else(|| c629(wrapper, "unclosed `{` in config object"))?;
    parse_meta_pairs_pub(inner)
}

/// Per-wrapper allowed config keys (spec §2 per-wrapper "Config keys").
fn allowed_config_keys(wrapper: &str) -> &'static [&'static str] {
    match wrapper {
        // Reserved bag — parses, but every key is unknown today (§2.1).
        "state" => &[],
        "prop" => &["default", "describe", "expose", "attribute", "reflect", "required"],
        "derived" => &["describe", "expose"],
        "action" => &["describe", "expose"],
        "resource" => &["describe", "expose"],
        "stream" => &["describe"],
        "controller" => &["describe"],
        "event" => &["describe", "bubbles", "composed"],
        _ => &[],
    }
}

fn check_config_keys(
    wrapper: &str,
    config: &[(String, String)],
) -> Result<(), CompileError> {
    let allowed = allowed_config_keys(wrapper);
    for (k, _) in config {
        if !allowed.contains(&k.as_str()) {
            return Err(c629(
                wrapper,
                &format!(
                    "unknown config key `{}:` (allowed: {})",
                    k,
                    if allowed.is_empty() {
                        "none — the bag is reserved".to_string()
                    } else {
                        allowed.join(", ")
                    }
                ),
            ));
        }
    }
    Ok(())
}

/// Try to recognize a binding-wrapper declaration starting at `line_start`.
fn try_parse_binding(
    body: &str,
    line_start: usize,
    line: &str,
    shadowed: &BTreeSet<String>,
) -> Result<Option<(StateMacro, (usize, usize))>, CompileError> {
    let (nature_len, mutable) = if line.starts_with("const ") {
        (6usize, false)
    } else if line.starts_with("let ") {
        (4usize, true)
    } else {
        return Ok(None);
    };
    let rest = &line[nature_len..];
    let Some(name) = leading_ident(rest.trim_start()) else {
        return Ok(None);
    };
    let after_name = rest.trim_start()[name.len()..].trim_start();
    let Some(after_eq) = after_name.strip_prefix('=') else {
        return Ok(None);
    };
    let rhs = after_eq.trim_start();
    let Some(callee) = leading_ident(rhs) else {
        return Ok(None);
    };
    if !BINDING_INTRINSICS.contains(&callee.as_str()) || shadowed.contains(&callee) {
        return Ok(None);
    }
    // Absolute byte position of the character right after the callee name.
    let rhs_off = line_start + (line.len() - rhs.len());
    let tail_pos = rhs_off + callee.len();
    let Some(call) = parse_call_tail(body, tail_pos) else {
        // `const x = state` (no call) — plain JS, not recognized.
        return Ok(None);
    };
    let span = (line_start, call.end);
    let w = callee.as_str();

    // Nature axis (§4.6): `let` only on `state` (and `prop`, which takes
    // both); `const` on everything else.
    match w {
        "state" if !mutable => {
            return Err(c624(
                format!(
                    "`const {name} = state(…)` — a state that never changes is not state; \
                     `state` declares a MUTABLE reactive value and takes `let`"
                ),
                &format!("use a plain `const {name} = …` (or `let {name} = state(…)` if it mutates)"),
            ));
        }
        "prop" | "state" => {}
        _ if mutable => {
            return Err(c624(
                format!(
                    "`let {name} = {w}(…)` — a `{w}` binding is not assignable; declare it `const`"
                ),
                &format!("const {name} = {w}(…)"),
            ));
        }
        _ => {}
    }

    let mac = match w {
        "state" => {
            let (config, init) = split_config_fn(w, &call.args)?;
            if let Some(cfg) = &config {
                check_config_keys(w, cfg)?;
            }
            let init = init.ok_or_else(|| c629(w, "missing the initial value: `state(initial)`"))?;
            let numeric_init = init.trim().parse::<f64>().is_ok();
            StateMacro::StateLet {
                name,
                init,
                numeric_init,
            }
        }
        "prop" => {
            let (config, extra) = split_config_fn(w, &call.args)?;
            if extra.is_some() {
                return Err(c629(w, "`prop` takes only a config object: `prop<T>(config?)`"));
            }
            let mut meta = config.unwrap_or_default();
            check_config_keys(w, &meta)?;
            // C445 (carried over): attribute:false + reflect:true is rejected.
            let attr = meta.iter().find(|(k, _)| k == "attribute").map(|(_, v)| v.trim());
            let refl = meta.iter().find(|(k, _)| k == "reflect").map(|(_, v)| v.trim());
            if attr == Some("false") && refl == Some("true") {
                return Err(CompileError {
                    message: format!(
                        "prop `{}`: `attribute: false` is incompatible with `reflect: true` (nothing to reflect to)",
                        name
                    ),
                    line: 0,
                    col: 0,
                    code: Some("C445".to_string()),
                    ..Default::default()
                });
            }
            // The generic parameter IS the type (§2.2 — the v2 `type:` key
            // retires; the sidecar checks the generic, and the runtime
            // coercion hint derives from it).
            if let Some(g) = call.generic {
                meta.push(("type".to_string(), format!("'{}'", g)));
            }
            StateMacro::Collection {
                kind: CollectionKind::Prop,
                entries: vec![CollectionEntry {
                    name,
                    is_wrapped: true,
                    value_raw: String::new(),
                    meta,
                    wrapper: true,
                    mutable,
                }],
            }
        }
        "derived" | "action" | "resource" => {
            let (config, f) = split_config_fn(w, &call.args)?;
            if let Some(cfg) = &config {
                check_config_keys(w, cfg)?;
            }
            let f = f.ok_or_else(|| c629(w, "missing the function argument"))?;
            let kind = match w {
                "derived" => CollectionKind::Computed,
                "action" => CollectionKind::Action,
                _ => CollectionKind::Resource,
            };
            let entry = match config {
                Some(mut meta) => {
                    let code_key = if kind == CollectionKind::Action { "handler" } else { "value" };
                    meta.push((code_key.to_string(), f));
                    CollectionEntry {
                        name,
                        is_wrapped: true,
                        value_raw: String::new(),
                        meta,
                        wrapper: true,
                        mutable: false,
                    }
                }
                None => CollectionEntry {
                    name,
                    is_wrapped: false,
                    value_raw: f,
                    meta: Vec::new(),
                    wrapper: true,
                    mutable: false,
                },
            };
            StateMacro::Collection {
                kind,
                entries: vec![entry],
            }
        }
        "stream" | "controller" => {
            let (config, f) = split_config_fn(w, &call.args)?;
            if let Some(cfg) = &config {
                check_config_keys(w, cfg)?;
            }
            let f = f.ok_or_else(|| {
                c629(
                    w,
                    if w == "stream" { "missing the source function" } else { "missing the factory function" },
                )
            })?;
            let mut meta = config.unwrap_or_default();
            let code_key = if w == "stream" { "source" } else { "value" };
            meta.push((code_key.to_string(), f));
            StateMacro::Collection {
                kind: if w == "stream" { CollectionKind::Stream } else { CollectionKind::Controller },
                entries: vec![CollectionEntry {
                    name,
                    is_wrapped: true,
                    value_raw: String::new(),
                    meta,
                    wrapper: true,
                    mutable: false,
                }],
            }
        }
        "route" => {
            if !call.args.is_empty() {
                return Err(c629(w, "`route()` takes no arguments"));
            }
            StateMacro::Route { name }
        }
        "consume" => {
            if call.args.len() != 1 {
                return Err(c629(w, "`consume<T>(key)` takes exactly one key argument"));
            }
            let raw_key = call.args[0].trim();
            let key = raw_key.trim_matches(|c| c == '\'' || c == '"').to_string();
            if key.is_empty() || key.len() == raw_key.len() {
                return Err(c629(w, "the context key must be a string literal"));
            }
            StateMacro::ConsumeBinding { name, key }
        }
        _ => unreachable!(),
    };
    Ok(Some((mac, span)))
}

/// Try to recognize a naked directive (`base:` / `shadow:` / `extract:`).
fn try_parse_directive(
    body: &str,
    line_start: usize,
    line: &str,
    nl: usize,
) -> Result<Option<(StateMacro, (usize, usize))>, CompileError> {
    for kw in ["base", "shadow", "extract"] {
        let Some(after) = line.strip_prefix(kw) else {
            continue;
        };
        let after = after.trim_start();
        let Some(value) = after.strip_prefix(':') else {
            continue;
        };
        // A top-level `=` means this is the aihu bare typed declaration
        // (`base: SomeType = x`), NOT a directive.
        if kw != "extract" && value.contains('=') {
            return Ok(None);
        }
        let value = value.trim();
        match kw {
            "base" => {
                let base = value.trim_end_matches(';').trim().to_string();
                let valid = !base.is_empty()
                    && base.chars().next().is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
                    && base.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
                if !valid {
                    return Err(CompileError {
                        message: format!(
                            "`base:` requires a class identifier — expected `base: AihuCheckboxRoot`, got `base: {}`",
                            value
                        ),
                        line: 0,
                        col: 0,
                        code: Some("C470".to_string()),
                        ..Default::default()
                    });
                }
                return Ok(Some((StateMacro::Extends { base }, (line_start, nl))));
            }
            "shadow" => {
                let mode = value
                    .trim_end_matches(';')
                    .trim()
                    .trim_matches(|c| c == '\'' || c == '"')
                    .to_string();
                if !matches!(mode.as_str(), "light" | "shadow") {
                    return Err(CompileError {
                        message: format!("`shadow:` must be 'light' or 'shadow' — got `shadow: {}`", value),
                        line: 0,
                        col: 0,
                        code: Some("C471".to_string()),
                        ..Default::default()
                    });
                }
                return Ok(Some((StateMacro::Shadow { mode }, (line_start, nl))));
            }
            "extract" => {
                // The value is a balanced `{…}` object literal (may span
                // lines), parsed by the SHARED `extract::parse_extract_literal`.
                let colon_abs = line_start + line.find(':').unwrap_or(0);
                let bytes = body.as_bytes();
                let mut p = colon_abs + 1;
                while p < body.len() && matches!(bytes[p], b' ' | b'\t' | b'\n' | b'\r') {
                    p += 1;
                }
                if p >= body.len() || bytes[p] != b'{' {
                    // Not the directive shape (could be a bare typed decl).
                    return Ok(None);
                }
                let close = crate::parser::state_macros::find_brace_close_js(body, p + 1)
                    .ok_or_else(|| CompileError {
                        message: "C483: malformed `extract` policy value — unbalanced `{`".to_string(),
                        line: 0,
                        col: 0,
                        code: Some("C483".to_string()),
                        ..Default::default()
                    })?;
                let decl = crate::extract::parse_extract_literal(&body[p..=close], 0)?;
                return Ok(Some((StateMacro::Extract { decl }, (line_start, close + 1))));
            }
            _ => unreachable!(),
        }
    }
    Ok(None)
}

/// Try to recognize a statement-position intrinsic call.
fn try_parse_statement_call(
    body: &str,
    line_start: usize,
    line: &str,
    shadowed: &BTreeSet<String>,
    effect_counter: &mut usize,
) -> Result<Option<(StateMacro, (usize, usize))>, CompileError> {
    let Some(callee) = leading_ident(line) else {
        return Ok(None);
    };
    if !STATEMENT_INTRINSICS.contains(&callee.as_str()) || shadowed.contains(&callee) {
        return Ok(None);
    }
    let after = &line[callee.len()..];
    // `event<Payload>('name', …)` carries a generic; the others must open
    // with `(` directly (allow whitespace).
    if !(after.trim_start().starts_with('(')
        || (callee == "event" && after.trim_start().starts_with('<')))
    {
        return Ok(None);
    }
    let tail_pos = line_start + callee.len();
    let Some(call) = parse_call_tail(body, tail_pos) else {
        return Ok(None);
    };
    let span = (line_start, call.end);
    let w = callee.as_str();

    let mac = match w {
        "effect" => {
            let (config, f) = split_config_fn(w, &call.args)?;
            let f = f.ok_or_else(|| c629(w, "missing the effect function"))?;
            let name = format!("__effect{}", *effect_counter);
            *effect_counter += 1;
            let entry = match config {
                Some(mut meta) => {
                    // `effect({ on: [deps] }, fn)` — only `on:` is meaningful.
                    for (k, _) in &meta {
                        if k != "on" {
                            return Err(c629(w, &format!("unknown config key `{}:` (allowed: on)", k)));
                        }
                    }
                    meta.push(("value".to_string(), f));
                    CollectionEntry {
                        name,
                        is_wrapped: true,
                        value_raw: String::new(),
                        meta,
                        wrapper: true,
                        mutable: false,
                    }
                }
                None => CollectionEntry {
                    name,
                    is_wrapped: false,
                    value_raw: f,
                    meta: Vec::new(),
                    wrapper: true,
                    mutable: false,
                },
            };
            StateMacro::Collection {
                kind: CollectionKind::Effect,
                entries: vec![entry],
            }
        }
        "onMount" | "onDispose" | "onAdopt" | "onAttributeChange" => {
            if call.args.len() != 1 {
                return Err(c629(w, "takes exactly one callback"));
            }
            let key = match w {
                "onMount" => "mount",
                "onDispose" => "dispose",
                "onAdopt" => "adopt",
                _ => "attributeChange",
            };
            StateMacro::Collection {
                kind: CollectionKind::Lifecycle,
                entries: vec![CollectionEntry {
                    name: key.to_string(),
                    is_wrapped: false,
                    value_raw: call.args[0].clone(),
                    meta: Vec::new(),
                    wrapper: true,
                    mutable: false,
                }],
            }
        }
        "aria" | "form" => {
            if call.args.len() != 1 || !call.args[0].starts_with('{') {
                return Err(c629(w, "takes exactly one config object"));
            }
            let inner = call.args[0]
                .strip_prefix('{')
                .and_then(|s| s.strip_suffix('}'))
                .ok_or_else(|| c629(w, "unclosed `{` in config object"))?;
            let kind = if w == "aria" { CollectionKind::Aria } else { CollectionKind::Form };
            let entries = crate::parser::state_macros::parse_object_collection_pub(inner, kind)?;
            StateMacro::Collection { kind, entries }
        }
        "provide" => {
            if call.args.len() != 2 {
                return Err(c629(w, "`provide(key, value)` takes exactly two arguments"));
            }
            let raw_key = call.args[0].trim();
            let key = raw_key.trim_matches(|c| c == '\'' || c == '"').to_string();
            if key.is_empty() || key.len() == raw_key.len() {
                return Err(c629(w, "the context key must be a string literal"));
            }
            StateMacro::Collection {
                kind: CollectionKind::Context,
                entries: vec![CollectionEntry {
                    name: "provide".to_string(),
                    is_wrapped: true,
                    value_raw: String::new(),
                    meta: vec![(key, format!("{{ value: {} }}", call.args[1]))],
                    wrapper: true,
                    mutable: false,
                }],
            }
        }
        "event" => {
            if call.args.is_empty() {
                return Err(c629(w, "`event<Payload>('name', config?)` needs the event name"));
            }
            let raw_name = call.args[0].trim();
            let ev_name = raw_name.trim_matches(|c| c == '\'' || c == '"').to_string();
            if ev_name.is_empty() || ev_name.len() == raw_name.len() {
                return Err(c629(w, "the event name must be a string literal"));
            }
            let mut meta: Vec<(String, String)> = Vec::new();
            if let Some(g) = call.generic {
                meta.push(("payload".to_string(), g));
            }
            if let Some(cfg_raw) = call.args.get(1) {
                if !cfg_raw.starts_with('{') {
                    return Err(c629(w, "the second argument must be a config object"));
                }
                let cfg = parse_config(w, cfg_raw)?;
                check_config_keys(w, &cfg)?;
                meta.extend(cfg);
            }
            StateMacro::Collection {
                kind: CollectionKind::Event,
                entries: vec![CollectionEntry {
                    name: ev_name,
                    is_wrapped: true,
                    value_raw: String::new(),
                    meta,
                    wrapper: true,
                    mutable: false,
                }],
            }
        }
        "beforeNavigate" | "afterNavigate" => {
            if call.args.len() != 1 {
                return Err(c629(w, "takes exactly one guard function"));
            }
            if w == "beforeNavigate" {
                StateMacro::BeforeNavigate { expr: call.args[0].clone() }
            } else {
                StateMacro::AfterNavigate { expr: call.args[0].clone() }
            }
        }
        _ => unreachable!(),
    };
    Ok(Some((mac, span)))
}

// ─── Wrapper-target extraction (consumed by the §4.2/§4.3 rewrites) ──────────

/// The rewrite target sets the state-model read/write pass needs, derived
/// from a scanned macro list. Empty for old-dialect files by construction.
#[derive(Debug, Default, Clone)]
pub struct WrapperTargets {
    /// `let x = state(v)` names → (setter name, numeric-literal initializer).
    pub states: std::collections::HashMap<String, (String, bool)>,
    /// `let x = prop(…)` names → numeric-literal `default:` (the CO1 fast-path
    /// proof obligation).
    pub prop_lets: std::collections::HashMap<String, bool>,
    /// `const x = prop(…)` names — writes to these are C624.
    pub prop_consts: BTreeSet<String>,
    /// Every wrapper-declared READABLE reactive getter: states + props +
    /// derived + route bindings. Bare reads in `@state`-scope code splice `()`.
    pub reads: BTreeSet<String>,
}

impl WrapperTargets {
    pub fn is_empty(&self) -> bool {
        self.states.is_empty() && self.prop_lets.is_empty() && self.prop_consts.is_empty()
    }

    pub fn has_writes(&self) -> bool {
        !self.states.is_empty() || !self.prop_lets.is_empty() || !self.prop_consts.is_empty()
    }
}

/// The canonical setter name for a `state`-declared binding.
pub fn state_setter_name(name: &str) -> String {
    format!("__{}_set", name)
}

/// Build the rewrite target sets from a (unified or wrapper-only) macro list.
/// Only wrapper-origin entries contribute; a pure `$`-macro list yields an
/// empty set, keeping the old dialect byte-identical.
pub fn collect_wrapper_targets(macros: &[StateMacro]) -> WrapperTargets {
    let mut t = WrapperTargets::default();
    let mut any_wrapper = false;
    for m in macros {
        match m {
            StateMacro::StateLet { name, numeric_init, .. } => {
                any_wrapper = true;
                t.states
                    .insert(name.clone(), (state_setter_name(name), *numeric_init));
                t.reads.insert(name.clone());
            }
            StateMacro::Collection { kind, entries } => {
                for e in entries {
                    if !e.wrapper {
                        continue;
                    }
                    any_wrapper = true;
                    match kind {
                        CollectionKind::Prop => {
                            let numeric = crate::parser::state_macros::meta_get(e, "default")
                                .map(|d| d.trim().parse::<f64>().is_ok())
                                .unwrap_or(false);
                            if e.mutable {
                                t.prop_lets.insert(e.name.clone(), numeric);
                            } else {
                                t.prop_consts.insert(e.name.clone());
                            }
                            t.reads.insert(e.name.clone());
                        }
                        CollectionKind::Computed => {
                            t.reads.insert(e.name.clone());
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
    if any_wrapper {
        // `route()` bindings are callable getters too; register their reads
        // only in a wrapper-dialect file (the variant carries no origin flag,
        // and C625 bars mixing, so file-level gating is exact).
        for m in macros {
            if let StateMacro::Route { name } = m {
                t.reads.insert(name.clone());
            }
        }
    }
    t
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scan(body: &str) -> WrapperScan {
        scan_state_wrappers(body).expect("scan must succeed")
    }

    #[test]
    fn old_dialect_yields_empty_scan() {
        let body = "\
const [count, setCount] = signal(0)
$prop: { hue: { default: 215 } }
$action: { inc: () => { count = count + 1 } }
let plain = 1
";
        let s = scan(body);
        assert!(s.is_empty(), "old dialect must not be recognized: {:?}", s.macros);
    }

    #[test]
    fn state_let_parses() {
        let s = scan("let loading = state(false)\nlet count = state(0)");
        assert_eq!(s.macros.len(), 2);
        match &s.macros[0] {
            StateMacro::StateLet { name, init, numeric_init } => {
                assert_eq!(name, "loading");
                assert_eq!(init, "false");
                assert!(!numeric_init);
            }
            other => panic!("expected StateLet, got {:?}", other),
        }
        match &s.macros[1] {
            StateMacro::StateLet { name, numeric_init, .. } => {
                assert_eq!(name, "count");
                assert!(*numeric_init);
            }
            other => panic!("expected StateLet, got {:?}", other),
        }
    }

    #[test]
    fn const_state_is_c624() {
        let err = scan_state_wrappers("const x = state(0)").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C624"));
    }

    #[test]
    fn let_derived_is_c624() {
        let err = scan_state_wrappers("let y = derived(() => 1)").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C624"));
    }

    #[test]
    fn prop_with_config_and_generic() {
        let s = scan("const city = prop<string>({ default: 'London', describe: 'City', expose: 'read' })");
        match &s.macros[0] {
            StateMacro::Collection { kind: CollectionKind::Prop, entries } => {
                let e = &entries[0];
                assert_eq!(e.name, "city");
                assert!(e.wrapper);
                assert!(!e.mutable);
                assert_eq!(
                    crate::parser::state_macros::meta_get(e, "default"),
                    Some("'London'")
                );
                assert_eq!(crate::parser::state_macros::meta_get(e, "type"), Some("'string'"));
            }
            other => panic!("expected Prop, got {:?}", other),
        }
    }

    #[test]
    fn let_prop_is_mutable() {
        let s = scan("let count = prop<number>({ default: 0 })");
        match &s.macros[0] {
            StateMacro::Collection { kind: CollectionKind::Prop, entries } => {
                assert!(entries[0].mutable);
            }
            other => panic!("expected Prop, got {:?}", other),
        }
    }

    #[test]
    fn derived_bare_and_configured() {
        let s = scan(
            "const withTax = derived(() => price * 1.2)\nconst status = derived({ describe: 'S', expose: 'read' }, () => statusValue)",
        );
        assert_eq!(s.macros.len(), 2);
        match &s.macros[0] {
            StateMacro::Collection { kind: CollectionKind::Computed, entries } => {
                assert!(!entries[0].is_wrapped);
                assert_eq!(entries[0].value_raw, "() => price * 1.2");
            }
            other => panic!("expected Computed, got {:?}", other),
        }
        match &s.macros[1] {
            StateMacro::Collection { kind: CollectionKind::Computed, entries } => {
                assert!(entries[0].is_wrapped);
                assert_eq!(
                    crate::parser::state_macros::meta_get(&entries[0], "value"),
                    Some("() => statusValue")
                );
                assert_eq!(
                    crate::parser::state_macros::meta_get(&entries[0], "expose"),
                    Some("'read'")
                );
            }
            other => panic!("expected Computed, got {:?}", other),
        }
    }

    #[test]
    fn action_swapped_args_is_c622_with_fix() {
        let err = scan_state_wrappers("const f = action(async () => { go() }, { describe: 'x' })")
            .unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C622"));
        assert!(err.from.as_deref().unwrap().starts_with("action(async () =>"));
        assert!(err.to.as_deref().unwrap().starts_with("action({ describe: 'x' }"));
    }

    #[test]
    fn multiline_action_parses() {
        let body = "\
const fetchForecast = action(
  { describe: 'Fetch', expose: 'public' },
  async () => {
    loading = true
    try { await go() } finally { loading = false }
  })
let loading = state(false)
";
        let s = scan(body);
        assert_eq!(s.macros.len(), 2);
        match &s.macros[0] {
            StateMacro::Collection { kind: CollectionKind::Action, entries } => {
                let handler = crate::parser::state_macros::meta_get(&entries[0], "handler").unwrap();
                assert!(handler.starts_with("async ()"));
                assert!(handler.contains("loading = true"));
            }
            other => panic!("expected Action, got {:?}", other),
        }
    }

    #[test]
    fn statement_calls_gated_on_bindings() {
        // No binding wrappers → statement call NOT recognized (old-dialect
        // files calling an imported `effect` stay byte-identical).
        let s = scan("effect(() => { console.log(1) })");
        assert!(s.is_empty());
        // With a binding wrapper present → recognized.
        let s = scan("let x = state(0)\neffect(() => { console.log(x) })");
        assert_eq!(s.macros.len(), 2);
        assert!(matches!(
            &s.macros[1],
            StateMacro::Collection { kind: CollectionKind::Effect, .. }
        ));
    }

    #[test]
    fn shadowed_intrinsic_is_not_recognized() {
        let s = scan("import { state } from './my-lib'\nlet x = state(0)");
        assert!(s.is_empty(), "an authored import shadows the intrinsic");
    }

    #[test]
    fn lifecycle_and_nav_statement_calls() {
        let body = "\
let x = state(0)
onMount(() => { init() })
onDispose(() => { cleanup() })
beforeNavigate((to, from, next) => next())
";
        let s = scan(body);
        assert_eq!(s.macros.len(), 4);
        assert!(matches!(
            &s.macros[1],
            StateMacro::Collection { kind: CollectionKind::Lifecycle, .. }
        ));
        assert!(matches!(&s.macros[3], StateMacro::BeforeNavigate { .. }));
    }

    #[test]
    fn route_and_consume_bindings() {
        let s = scan("const r = route()\nconst locale = consume<Locale>('locale')");
        assert_eq!(s.macros.len(), 2);
        assert!(matches!(&s.macros[0], StateMacro::Route { name } if name == "r"));
        assert!(matches!(
            &s.macros[1],
            StateMacro::ConsumeBinding { name, key } if name == "locale" && key == "locale"
        ));
    }

    #[test]
    fn provide_and_event_statement_calls() {
        let body = "\
let x = state(0)
provide('theme', () => themeSignal)
event<{ id: string }>('select', { bubbles: true, composed: true })
";
        let s = scan(body);
        assert_eq!(s.macros.len(), 3);
        match &s.macros[1] {
            StateMacro::Collection { kind: CollectionKind::Context, entries } => {
                assert_eq!(entries[0].name, "provide");
                assert_eq!(entries[0].meta[0].0, "theme");
                assert!(entries[0].meta[0].1.contains("value: () => themeSignal"));
            }
            other => panic!("expected Context, got {:?}", other),
        }
        match &s.macros[2] {
            StateMacro::Collection { kind: CollectionKind::Event, entries } => {
                assert_eq!(entries[0].name, "select");
                assert_eq!(
                    crate::parser::state_macros::meta_get(&entries[0], "payload"),
                    Some("{ id: string }")
                );
                assert_eq!(crate::parser::state_macros::meta_get(&entries[0], "bubbles"), Some("true"));
            }
            other => panic!("expected Event, got {:?}", other),
        }
    }

    #[test]
    fn naked_directives() {
        let s = scan("base: AihuCheckboxRoot\nshadow: 'light'\nextract: { read: 'agents', call: 'anonymous' }");
        assert_eq!(s.macros.len(), 3);
        assert!(matches!(&s.macros[0], StateMacro::Extends { base } if base == "AihuCheckboxRoot"));
        assert!(matches!(&s.macros[1], StateMacro::Shadow { mode } if mode == "light"));
        assert!(matches!(&s.macros[2], StateMacro::Extract { .. }));
    }

    #[test]
    fn bare_typed_decl_named_like_directive_is_not_a_directive() {
        // `base: string = 'x'` is the aihu bare typed declaration, not `base:`.
        let s = scan("base: string = 'x'\nshadow: boolean = false");
        assert!(s.is_empty());
    }

    #[test]
    fn plain_lets_and_helpers_are_not_recognized() {
        let s = scan("let rowKey = null\nconst FMT = { unit: 'F' }\nfunction helper() { return 1 }");
        assert!(s.is_empty());
    }

    #[test]
    fn wrapper_call_inside_macro_body_is_not_recognized() {
        let body = "$action: {\n  go: () => {\n    const x = state(0)\n  },\n}";
        let s = scan(body);
        assert!(s.is_empty(), "inside a $macro body is not statement level");
    }

    #[test]
    fn state_config_bag_reserved_keys_error() {
        let err = scan_state_wrappers("let x = state({ describe: 'x' }, 0)").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C629"));
    }

    #[test]
    fn targets_collected() {
        let s = scan(
            "let count = state(0)\nlet n = prop<number>({ default: 1 })\nconst city = prop<string>({ default: 'x' })\nconst d = derived(() => count * 2)",
        );
        let t = collect_wrapper_targets(&s.macros);
        assert_eq!(t.states.get("count").unwrap(), &("__count_set".to_string(), true));
        assert!(t.prop_lets.contains_key("n"));
        assert!(t.prop_consts.contains("city"));
        for name in ["count", "n", "city", "d"] {
            assert!(t.reads.contains(name), "{} must be a read target", name);
        }
    }

    #[test]
    fn c446_collision_carried_over() {
        let err = scan_state_wrappers(
            "const foo = prop({ default: 0, attribute: 'data-x' })\nconst bar = prop({ default: 0, attribute: 'data-x' })",
        )
        .unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C446"));
    }

    #[test]
    fn c445_carried_over() {
        let err = scan_state_wrappers("const x = prop({ default: 0, attribute: false, reflect: true })")
            .unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C445"));
    }
}
