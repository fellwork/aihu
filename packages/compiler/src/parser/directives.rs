use crate::types::{Attr, CompileError, MacroValue};

/// Boolean void attributes that are valid without a value.
const VOID_ATTRS: &[&str] = &[
    "disabled", "checked", "readonly", "required", "multiple",
    "autofocus", "autoplay", "controls", "default", "defer",
    "formnovalidate", "hidden", "ismap", "loop", "novalidate",
    "open", "reversed", "scoped", "seamless", "selected",
];

/// Reserved macro-name prefixes (and bare names) that MUST construct
/// `Attr::Macro` from `$<name>={expr}` / `$<name>="value"`.
///
/// Per Amendment 04 (v1.0.8) and Director r5-sup-2 §3.2 implementation
/// note: `$<plain-attr-name>={expr}` on an HTML attribute that is NOT
/// in this registry routes to `Attr::Binding { name, expr }` instead.
/// That preserves the existing emit.rs codegen at the 9 `Attr::Binding`
/// consumer sites and matches the spec posture that e.g. `$class={cls}`
/// IS the binding for the HTML `class` attribute, not a separate macro.
///
/// Entries are matched as either an exact bare name (e.g. `if`, `class`)
/// OR a namespaced prefix (e.g. `on:`, `bind:`, `class:`, `emit:`).
/// The colon-form here is the *internal-AST* form after parser
/// normalization at directives.rs (`$on.click` → `on:click`).
///
/// Note: bare `class` is NOT reserved — `$class={x}` (scalar) and
/// `$class={[a, b]}` (array) both route to `Attr::Binding`. The
/// `__aihu_cls` array-wrapping lives in emit.rs:3608 on the
/// `Attr::Binding` path (`expr.trim_start().starts_with('[')`).
/// The namespaced `$class:active={cond}` form IS reserved (via the
/// `class:` prefix) and routes to `Attr::Macro`.
const RESERVED_MACRO_NAMES: &[&str] = &[
    // Bare macro names — exact match.
    "if", "each", "key", "show", "once", "memo", "html", "raw", "ref",
];

const RESERVED_MACRO_PREFIXES: &[&str] = &[
    // Namespaced macros — `name` starts with `<prefix>:`.
    "on:", "bind:", "class:", "emit:",
];

/// Standard DOM event names (sans the `on` prefix) used by the Bug 9a
/// `$on.<name>` validation. This is a recognition allowlist, NOT an
/// exhaustive registry — its only purpose is to let the unknown-event
/// heuristic (see `is_suspicious_event_name`) AVOID false-positives on
/// real built-in events. Custom events that look intentional (hyphenated
/// or camelCase, e.g. `user-login`, `valueChanged`) are accepted without
/// being listed here.
const KNOWN_DOM_EVENTS: &[&str] = &[
    // Mouse / pointer
    "click", "dblclick", "mousedown", "mouseup", "mousemove", "mouseover",
    "mouseout", "mouseenter", "mouseleave", "contextmenu", "wheel",
    "pointerdown", "pointerup", "pointermove", "pointerover", "pointerout",
    "pointerenter", "pointerleave", "pointercancel", "gotpointercapture",
    "lostpointercapture", "auxclick",
    // Keyboard
    "keydown", "keyup", "keypress",
    // Form / input
    "input", "change", "submit", "reset", "invalid", "select", "beforeinput",
    "search", "formdata",
    // Focus
    "focus", "blur", "focusin", "focusout",
    // Clipboard
    "copy", "cut", "paste",
    // Drag & drop
    "drag", "dragstart", "dragend", "dragenter", "dragleave", "dragover",
    "drop",
    // Touch
    "touchstart", "touchend", "touchmove", "touchcancel",
    // Media
    "play", "playing", "pause", "ended", "volumechange", "timeupdate",
    "durationchange", "loadeddata", "loadedmetadata", "loadstart", "progress",
    "ratechange", "seeked", "seeking", "stalled", "suspend", "waiting",
    "canplay", "canplaythrough", "emptied",
    // Window / document / loading
    "load", "unload", "beforeunload", "error", "abort", "scroll", "scrollend",
    "resize", "hashchange", "popstate", "pageshow", "pagehide",
    "visibilitychange", "online", "offline", "message", "messageerror",
    "storage", "DOMContentLoaded",
    // Animation / transition
    "animationstart", "animationend", "animationiteration", "animationcancel",
    "transitionstart", "transitionend", "transitionrun", "transitioncancel",
    // Misc UI
    "toggle", "close", "cancel", "show", "open", "slotchange", "cuechange",
    "fullscreenchange", "fullscreenerror", "selectionchange", "selectstart",
    "beforematch",
];

/// Bug 9a — heuristic for "this `$on.<name>` almost certainly is NOT an
/// event handler." Returns `true` only for clearly-wrong names so we don't
/// false-positive on legitimate custom events.
///
/// Conservative by design (Director note 06cb46b1 §9a; lessons #1/#6):
/// - A name in `KNOWN_DOM_EVENTS` is fine (real built-in event).
/// - A name that contains a `-` (hyphenated, e.g. `user-login`) or an
///   uppercase letter (camelCase, e.g. `valueChanged`) is treated as an
///   intentional custom event and accepted — these are the dominant
///   custom-event naming conventions in the wild.
/// - That leaves all-lowercase single-word names that are NOT known DOM
///   events as suspicious (`html`, `innerhtml`, `text`, `raw`, `foo`).
///   These are the cases that silently compile to a dead `on<name>`
///   attribute. We flag those.
fn is_suspicious_event_name(event: &str) -> bool {
    if event.is_empty() {
        return false;
    }
    if KNOWN_DOM_EVENTS.contains(&event) {
        return false;
    }
    // Intentional-looking custom events: hyphenated or containing any
    // uppercase character. Accept without warning.
    if event.contains('-') || event.chars().any(|c| c.is_ascii_uppercase()) {
        return false;
    }
    // All-lowercase, single-word, not a known DOM event → suspicious.
    true
}

/// Bug 9a — emit the unknown-event warning for a suspicious `$on.<event>`.
/// The `html`/`innerhtml` cases additionally redirect to `$html={…}`,
/// which is the real raw-innerHTML directive (the dead `$on.html` was the
/// exact failure mode in the bug report cb666cc2).
fn warn_unknown_event(event: &str) {
    // Rich-diagnostic warning (r2 dx-tooling): message + hint + fix on
    // separate lines, mirroring the human-error renderer in `bin/main.rs`.
    // W210 is a non-fatal warning emitted during parse, so it does not flow
    // through the `CompileError` Result path — we format it inline here so it
    // shares the same visual shape as the rich errors.
    let (hint, fix) = if event == "html" || event == "innerhtml" {
        (
            format!(
                "`$on.{}` compiles to a dead `on{}` attribute that never fires",
                event, event
            ),
            "If you meant to set raw innerHTML, use `$html={…}` instead.".to_string(),
        )
    } else {
        (
            format!(
                "`$on.{}` compiles to a dead `on{}` handler that never fires",
                event, event
            ),
            "Did you mean a real DOM event (e.g. `$on.click`)?".to_string(),
        )
    };
    eprintln!(
        "warning: W210: `$on.{}` references '{}', which is not a known DOM event.",
        event, event
    );
    eprintln!("  hint: {}", hint);
    eprintln!("  fix:  {}", fix);
}

/// Returns `true` when `name` (an internal-AST macro name, post colon-normalization)
/// is a reserved macro and therefore MUST route to `Attr::Macro`.
fn is_reserved_macro_name(name: &str) -> bool {
    if RESERVED_MACRO_NAMES.contains(&name) {
        return true;
    }
    RESERVED_MACRO_PREFIXES.iter().any(|p| name.starts_with(p))
}

pub fn parse_attr(raw: &str, is_html_element: bool) -> Result<Attr, CompileError> {
    // Macro attributes: $name, $name="value", $name={expr}
    if let Some(macro_part) = raw.strip_prefix('$') {
        return parse_macro_attr(macro_part);
    }

    let (name, raw_value) = split_attr(raw);

    // Event binding: @event="handler" — REMOVED in v1.0 (C305).
    // Migration: `$on.event=` (dot-form macro). This applies to BOTH
    // HTML elements and components — `@event=` is never valid v1 surface.
    if let Some(event_name) = name.strip_prefix('@') {
        // Bug 9b — the `@html=`/`@innerHTML=` aliases are innerHTML intent,
        // NOT event handlers. Steering them to `$on.html` (a no-op for HTML)
        // was the misdirection in the bug report. Point innerHTML-intent
        // aliases at `$html={…}` (the real raw-HTML directive); keep genuine
        // event aliases (e.g. `@click=`) pointed at `$on.<event>`.
        let lower = event_name.to_ascii_lowercase();
        let (message, hint, to_form) = if lower == "html" || lower == "innerhtml" {
            (
                format!(
                    "C305: `@{}=` is removed in v1.0. For setting raw innerHTML, \
                     use `$html={{expr}}`. \
                     Run: npx aihu migrate <file>",
                    event_name
                ),
                format!(
                    "`@{}=` is innerHTML intent, not an event handler — \
                     the v1 raw-HTML directive is `$html`",
                    event_name
                ),
                "$html={expr}".to_string(),
            )
        } else {
            (
                format!(
                    "C305: `@{}=` event-binding alias is removed in v1.0. \
                     Use `$on.{}={{fn}}` for event handlers. \
                     Run: npx aihu migrate <file>",
                    event_name, event_name
                ),
                format!(
                    "v1 event handlers use the dot-form macro `$on.{}`, \
                     not the legacy `@{}=` alias",
                    event_name, event_name
                ),
                format!("$on.{}={{fn}}", event_name),
            )
        };
        return Err(CompileError {
            message,
            line: 0,
            col: 0,
            code: Some("C305".to_string()),
            hint: Some(hint),
            fix: Some("Run: npx aihu migrate <file>".to_string()),
            from: Some(format!("@{}=", event_name)),
            to: Some(to_form),
            ..Default::default()
        });
    }

    // Property binding: :prop="expr" — REMOVED in v1.0 (C304).
    // Migration: `$attr={expr}` (one-way) or `$bind.attr=` (two-way).
    if let Some(binding_name) = name.strip_prefix(':') {
        return Err(CompileError {
            message: format!(
                "C304: `:{}=` binding alias is removed in v1.0. \
                 Use `${}={{expr}}` for reactive bindings. \
                 Run: npx aihu migrate <file>",
                binding_name, binding_name
            ),
            line: 0,
            col: 0,
            code: Some("C304".to_string()),
            hint: Some(format!(
                "v1 reactive bindings use the `$`-prefixed macro `${}`, \
                 not the legacy `:{}=` alias",
                binding_name, binding_name
            )),
            fix: Some("Run: npx aihu migrate <file>".to_string()),
            from: Some(format!(":{}=", binding_name)),
            to: Some(format!("${}={{expr}}", binding_name)),
            ..Default::default()
        });
    }

    if name == "v-if" || name == "v-for" {
        return Err(CompileError {
            message: "v-if / v-for directives are not supported in v0; see v1 roadmap".to_string(),
            line: 0,
            col: 0,
            ..Default::default()
        });
    }

    if let Some(directive_name) = name.strip_prefix("v-") {
        return Err(CompileError {
            message: format!(
                "unknown directive 'v-{}'; aihu v0 supports @event, :attr, and {{ identifier }} only",
                directive_name
            ),
            line: 0,
            col: 0,
            ..Default::default()
        });
    }

    // Plain curly form: `attr={expr}`.
    // - On standard HTML elements (`is_html_element = true`): REMOVED in v1.0
    //   (C306). Reactive HTML attribute bindings MUST be `$`-prefixed:
    //   `$attr={expr}`.
    // - On components (`<UserCard user={u} />`) and structural macro elements
    //   (`<$focusTrap active={isOpen}>`): plain curly stays valid — it's
    //   JSX-style prop-passing, NOT reactive HTML attribute binding.
    //   Per Amendment 04 §11.2: component prop-passing is unaffected.
    if raw_value.starts_with('{') {
        if is_html_element {
            return Err(CompileError {
                message: format!(
                    "C306: `{}={{expr}}` plain-curly form is not permitted in v1.0; \
                     reactive HTML attribute bindings must be `$`-prefixed. \
                     Use `${}={{expr}}` (always prefix). \
                     Run: npx aihu migrate <file>",
                    name, name
                ),
                line: 0,
                col: 0,
                code: Some("C306".to_string()),
                hint: Some(format!(
                    "plain-curly `{}={{…}}` on an HTML element is ambiguous in v1 — \
                     reactive HTML attribute bindings must be `$`-prefixed (`${}`)",
                    name, name
                )),
                fix: Some("Run: npx aihu migrate <file>".to_string()),
                from: Some(format!("{}={{expr}}", name)),
                to: Some(format!("${}={{expr}}", name)),
                ..Default::default()
            });
        }
        // Component / structural-macro prop-pass: build Attr::Binding as before.
        let inner = extract_balanced_braces(raw_value).ok_or_else(|| CompileError {
            message: format!("unclosed '{{' in attribute value for '{}'", name),
            line: 0,
            col: 0,
            code: Some("C303".to_string()),
            ..Default::default()
        })?;
        return Ok(Attr::Binding {
            name: name.to_string(),
            expr: inner.to_string(),
        });
    }

    // Boolean HTML attribute (no `=` sign)
    if raw_value.is_empty() && (VOID_ATTRS.contains(&name) || name.starts_with("data-")) {
        return Ok(Attr::Static {
            name: name.to_string(),
            value: String::new(),
        });
    }

    // If there's a value, it must be quoted — bare values are C300
    // (curly `{expr}` form is already handled above)
    if !raw_value.is_empty() {
        if !raw_value.starts_with('"')
            && !raw_value.starts_with('\'')
        {
            return Err(CompileError {
                message: "bare attribute values are not supported; use quoted form or {expression}"
                    .to_string(),
                line: 0,
                col: 0,
                code: Some("C300".to_string()),
                ..Default::default()
            });
        }
    }

    let value = strip_quotes(raw_value);
    Ok(Attr::Static {
        name: name.to_string(),
        value: value.to_string(),
    })
}

/// Parse a `$macro` attribute (the `$` prefix has already been stripped).
///
/// Handles:
/// - `$name` (boolean)
/// - `$name="quoted_value"`
/// - `$name={arbitrary_expr}`
/// - `$name.sub="value"` (e.g. `$bind:prop`, `$on:event`)
///
/// B3 — global colon→dot transition. The canonical Variant B form uses `.`
/// as the namespace separator (`$on.click`, `$bind.value`). The colon form
/// (`$on:click`, `$bind:value`) is still parsed for back-compat during the
/// transition window; W202 is emitted to stderr. Internally, the AST stores
/// the COLON form (`on:click`, `bind:value`) so existing emit-side code paths
/// continue to work without churn — the colon-vs-dot distinction is purely a
/// surface concern.
fn parse_macro_attr(rest: &str) -> Result<Attr, CompileError> {
    // Split on `=` to find the value part (if any)
    // We need to handle `$name={...}` which contains `=` inside braces.
    let eq_pos = find_top_level_eq(rest);

    let (name_part, value_part) = match eq_pos {
        Some(pos) => (&rest[..pos], &rest[pos + 1..]),
        None => (rest, ""),
    };

    let raw_name = name_part.trim();

    // B3 — global colon→dot transition. Normalize `$on.click` → `on:click` and
    // `$bind.value` → `bind:value` (internally we keep the colon form so the
    // emit-side strip_prefix("on:") / strip_prefix("bind:") logic continues
    // working byte-identically). Other dotted directives (e.g. `$class:foo`
    // already uses colon) are unchanged. Emits W202 deprecation when the
    // colon-form is encountered — surface authors should migrate to dot-form.
    let (name, dot_normalized) = if let Some(idx) = raw_name.find('.') {
        let prefix = &raw_name[..idx];
        let suffix = &raw_name[idx + 1..];
        if prefix == "on" || prefix == "bind" {
            // Canonical dot-form — accept and normalize internally to colon-form.
            (format!("{}:{}", prefix, suffix), true)
        } else {
            (raw_name.to_string(), false)
        }
    } else if let Some(idx) = raw_name.find(':') {
        let prefix = &raw_name[..idx];
        if prefix == "on" || prefix == "bind" {
            // B3c Phase 2 — C500 hard error. The colon-form ($on:event, $bind:prop)
            // was tolerated with a W202 warning during the B3a/B3b transition window.
            // The corpus is now fully migrated; colon-form is a compile error.
            let dot_form = raw_name.replacen(':', ".", 1);
            return Err(CompileError {
                message: format!(
                    "C500: `${}` uses the deprecated colon-form syntax. \
                     Rename to `${}` (dot-form). \
                     Run: bun run --cwd packages/compiler codemod:template-syntax <glob>",
                    raw_name, dot_form
                ),
                line: 0,
                col: 0,
                code: Some("C500".to_string()),
                ..Default::default()
            });
        }
        (raw_name.to_string(), false)
    } else {
        (raw_name.to_string(), false)
    };
    let _ = dot_normalized;

    // Bug 9a — `$on.<non-event>` silently compiles to a dead `on<name>`
    // handler attribute that never fires (the bug report's `$on.html`).
    // Warn when the event name is clearly not a real DOM event, while
    // staying conservative about legitimate custom events. See
    // `is_suspicious_event_name` for the heuristic.
    if let Some(event) = name.strip_prefix("on:") {
        if is_suspicious_event_name(event) {
            warn_unknown_event(event);
        }
    }

    // Boolean macros: no `=`, or explicit boolean void attrs
    if value_part.is_empty() {
        return Ok(Attr::Macro {
            name,
            value: MacroValue::Boolean,
        });
    }

    let value_trimmed = value_part.trim();

    // Curly form: $attr={expr}
    if value_trimmed.starts_with('{') {
        let inner = extract_balanced_braces(value_trimmed).ok_or_else(|| CompileError {
            message: format!("unclosed '{{' in macro attribute ${}", name),
            line: 0,
            col: 0,
            code: Some("C301".to_string()),
            ..Default::default()
        })?;
        // Amendment 04 (v1.0.8): when `$<plain-attr-name>={expr}` is NOT a
        // reserved macro, route to `Attr::Binding { name, expr }` so the
        // 9 existing `Attr::Binding` consumer sites in emit.rs codegen fire
        // unchanged. `$class={[a, b]}`, `$on.click={fn}`, `$bind.value={x}`,
        // `$if={cond}`, etc. remain `Attr::Macro` per the reserved registry.
        if !is_reserved_macro_name(&name) {
            return Ok(Attr::Binding {
                name,
                expr: inner.to_string(),
            });
        }
        return Ok(Attr::Macro {
            name,
            value: MacroValue::Curly(inner.to_string()),
        });
    }

    // Quoted form: $attr="identifier_or_dotted.path"
    if value_trimmed.starts_with('"') || value_trimmed.starts_with('\'') {
        let inner = strip_quotes(value_trimmed);
        // $each uses a specialized parser that accepts "list as item[, idx]" form.
        if name == "each" {
            parse_each_value(inner)?;
            return Ok(Attr::Macro {
                name,
                value: MacroValue::Quoted(inner.to_string()),
            });
        }
        validate_macro_quoted_value(inner, &name)?;
        return Ok(Attr::Macro {
            name,
            value: MacroValue::Quoted(inner.to_string()),
        });
    }

    // Bare value — C300
    Err(CompileError {
        message: "bare attribute values are not supported; use quoted form or {expression}"
            .to_string(),
        line: 0,
        col: 0,
        code: Some("C300".to_string()),
        ..Default::default()
    })
}

/// Find the position of the top-level `=` in a macro attribute token,
/// skipping over brace-balanced regions.
fn find_top_level_eq(s: &str) -> Option<usize> {
    let mut depth = 0usize;
    for (i, c) in s.char_indices() {
        match c {
            '{' => depth += 1,
            '}' => depth = depth.saturating_sub(1),
            '=' if depth == 0 => return Some(i),
            _ => {}
        }
    }
    None
}

/// Extract the inner content of a brace-balanced `{...}` expression.
/// `s` must start with `{`.
fn extract_balanced_braces(s: &str) -> Option<&str> {
    let bytes = s.as_bytes();
    if bytes.first() != Some(&b'{') {
        return None;
    }
    let mut depth = 0usize;
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&s[1..i]);
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

/// Parse a `$each` quoted value in `"list as item"` or `"list as item, idx"` form.
/// Returns `(list_expr, item_alias, idx_alias)`.
/// Old-style `$each="items"` (no ` as `) is error C302.
fn parse_each_value(value: &str) -> Result<(String, String, Option<String>), CompileError> {
    let Some((list_part, rest)) = value.split_once(" as ") else {
        return Err(CompileError {
            message: "$each: expected 'list as item' or 'list as item, index'".to_string(),
            line: 0,
            col: 0,
            code: Some("C302".to_string()),
            ..Default::default()
        });
    };
    let list_expr = list_part.trim().to_string();
    let (item_alias, idx_alias) = if let Some((item, idx)) = rest.split_once(',') {
        (item.trim().to_string(), Some(idx.trim().to_string()))
    } else {
        (rest.trim().to_string(), None)
    };
    if list_expr.is_empty() || item_alias.is_empty() {
        return Err(CompileError {
            message: "$each: list expression and item alias must not be empty".to_string(),
            line: 0,
            col: 0,
            code: Some("C302".to_string()),
            ..Default::default()
        });
    }
    Ok((list_expr, item_alias, idx_alias))
}

/// Validate that a quoted macro value is a bare identifier or dotted path.
/// Rejects: whitespace, brackets `[]`, call parens `()`, optional-chains `?.`.
/// Validate the quoted-form value of a `$<name>="…"` macro attribute.
///
/// The quoted form has a deliberately narrow surface: it MUST be a bare
/// identifier or dotted path (e.g. `"loading"`, `"route.data.story.url"`).
/// Anything richer — negation, logical/comparison/arithmetic operators,
/// optional chains, calls, indexing, ternaries, literals — must use the
/// curly form (`${name}={expr}`), which reaches codegen as a JS expression
/// and gets the thunk-wrapping needed for reactive tracking.
///
/// The previous implementation rejected only whitespace, brackets, parens,
/// and `?`. That left `!`, `&`, `|`, `=`, `<`, `>`, `+`, `-`, `*`, `/`, `%`,
/// `,`, `;`, `:`, `~`, `^`, digits-as-first-char, etc. all silently allowed,
/// then the codegen path for non-simple-identifier `$if` values wrapped them
/// in `[() => (…)]`. For expressions referencing signals, the wrapped form
/// reads the getter as a function value (always truthy) instead of calling
/// it — silent-wrong-result. Tightening here matches the docstring contract
/// and surfaces the misuse as C302 at parse time with an actionable hint.
fn validate_macro_quoted_value(value: &str, macro_name: &str) -> Result<(), CompileError> {
    if value.is_empty() {
        return Err(CompileError {
            message: format!("${} quoted value must not be empty", macro_name),
            line: 0,
            col: 0,
            code: Some("C302".to_string()),
            ..Default::default()
        });
    }

    let reject_with = |reason: &str| CompileError {
        message: format!(
            "C302: ${} quoted value must be a bare identifier or dotted path (got '{}'). \
             {} For expressions (negation, comparison, arithmetic, calls, ternaries, \
             optional chains), use the curly form: `${}={{expr}}`.",
            macro_name, value, reason, macro_name
        ),
        line: 0,
        col: 0,
        code: Some("C302".to_string()),
        hint: Some(format!(
            "the quoted form is reserved for plain reactive-signal references; \
             everything else lives in `${}={{…}}`",
            macro_name
        )),
        fix: Some(format!(
            "rewrite as `${}={{{}}}` (call signal getters explicitly inside the braces)",
            macro_name, value
        )),
        from: Some(format!("${}=\"{}\"", macro_name, value)),
        to: Some(format!("${}={{…}}", macro_name)),
        ..Default::default()
    };

    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        // value.is_empty() already returned above; unreachable.
        unreachable!()
    };

    // First char: ASCII letter, `_`, or `$` (matches JS identifier-start, modulo
    // unicode — quoted-form identifiers in `.aihu` are ASCII-only by convention).
    if !(first.is_ascii_alphabetic() || first == '_' || first == '$') {
        let reason = if first.is_ascii_digit() {
            format!("'{}' cannot start an identifier", first)
        } else {
            format!("'{}' is not a valid identifier-start character", first)
        };
        return Err(reject_with(&reason));
    }

    // Subsequent chars: ASCII alphanumeric, `_`, `$`, or `.` (dotted path).
    // Reject runs of `..` to keep error messages sharp, and reject a trailing
    // `.` (e.g. `route.`) which would otherwise compile to a malformed path.
    let mut prev_dot = false;
    for ch in chars {
        let allowed =
            ch.is_ascii_alphanumeric() || ch == '_' || ch == '$' || ch == '.';
        if !allowed {
            let reason = format!("'{}' is not allowed in a dotted path", ch);
            return Err(reject_with(&reason));
        }
        if ch == '.' && prev_dot {
            return Err(reject_with("consecutive '.' separators are not allowed"));
        }
        prev_dot = ch == '.';
    }
    if prev_dot {
        return Err(reject_with("dotted path must not end with '.'"));
    }

    Ok(())
}

pub fn validate_identifier(input: &str) -> Result<String, CompileError> {
    let trimmed = input
        .trim()
        .trim_start_matches("{{")
        .trim_end_matches("}}")
        .trim();

    let mut chars = trimmed.chars();
    let Some(first) = chars.next() else {
        return Err(identifier_error());
    };

    if !(first.is_ascii_alphabetic() || first == '_') {
        return Err(identifier_error());
    }

    if chars.any(|ch| !(ch.is_ascii_alphanumeric() || ch == '_')) {
        return Err(identifier_error());
    }

    Ok(trimmed.to_string())
}

fn split_attr(raw: &str) -> (&str, &str) {
    if let Some((name, value)) = raw.split_once('=') {
        (name.trim(), value.trim())
    } else {
        (raw.trim(), "")
    }
}

fn strip_quotes(value: &str) -> &str {
    value
        .strip_prefix('"')
        .and_then(|inner| inner.strip_suffix('"'))
        .or_else(|| {
            value
                .strip_prefix('\'')
                .and_then(|inner| inner.strip_suffix('\''))
        })
        .unwrap_or(value)
}

fn identifier_error() -> CompileError {
    CompileError {
        message: "interpolation must be a single identifier in v0; expressions are not supported"
            .to_string(),
        line: 0,
        col: 0,
        ..Default::default()
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::MacroValue;

    /// Test helper: invoke `parse_attr` in HTML-element context (the
    /// default for these unit tests, since they exercise both HTML-only
    /// rejection paths and `$macro` paths which are kind-agnostic).
    fn parse_attr(raw: &str) -> Result<Attr, CompileError> {
        super::parse_attr(raw, true)
    }

    /// Test helper: invoke `parse_attr` in component-element context
    /// (capitalized tag-name or `<$...>` structural macro). C306 must
    /// NOT fire on plain curly bindings in this mode.
    fn parse_attr_component(raw: &str) -> Result<Attr, CompileError> {
        super::parse_attr(raw, false)
    }

    #[test]
    fn macro_boolean_once() {
        let attr = parse_attr("$once").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "once".to_string(),
                value: MacroValue::Boolean
            }
        );
    }

    #[test]
    fn macro_boolean_raw() {
        let attr = parse_attr("$raw").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "raw".to_string(),
                value: MacroValue::Boolean
            }
        );
    }

    #[test]
    fn macro_quoted_simple_identifier() {
        let attr = parse_attr("$if=\"isVisible\"").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "if".to_string(),
                value: MacroValue::Quoted("isVisible".to_string())
            }
        );
    }

    #[test]
    fn macro_quoted_dotted_path() {
        let attr = parse_attr("$if=\"user.profile.active\"").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "if".to_string(),
                value: MacroValue::Quoted("user.profile.active".to_string())
            }
        );
    }

    #[test]
    fn macro_curly_expression() {
        let attr = parse_attr("$show={count > 0}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "show".to_string(),
                value: MacroValue::Curly("count > 0".to_string())
            }
        );
    }

    #[test]
    fn macro_curly_nested_braces() {
        let attr = parse_attr("$show={obj.method({key: val})}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "show".to_string(),
                value: MacroValue::Curly("obj.method({key: val})".to_string())
            }
        );
    }

    #[test]
    fn macro_bind_dot_form() {
        // B3c: colon-form is now C500; use dot-form instead.
        let attr = parse_attr("$bind.value=\"count\"").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "bind:value".to_string(),
                value: MacroValue::Quoted("count".to_string())
            }
        );
    }

    #[test]
    fn macro_on_event() {
        // B3c: colon-form is now C500; use dot-form instead.
        let attr = parse_attr("$on.click=\"handleClick\"").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "on:click".to_string(),
                value: MacroValue::Quoted("handleClick".to_string())
            }
        );
    }

    #[test]
    fn macro_quoted_rejects_brackets() {
        let err = parse_attr("$if=\"items[0]\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C302"));
    }

    #[test]
    fn macro_quoted_rejects_whitespace() {
        let err = parse_attr("$if=\"a b\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C302"));
    }

    #[test]
    fn macro_quoted_rejects_calls() {
        let err = parse_attr("$if=\"fn()\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C302"));
    }

    #[test]
    fn macro_quoted_rejects_negation() {
        // Pre-tightening: `!loading` silently passed (no whitespace, no brackets/parens/?)
        // and reached codegen, where it wrapped to `[() => (!loading)]`. If `loading`
        // is a signal getter (a function), `!function` is always `false` — silent
        // wrong-result. Validator now rejects with a pointer to the curly form.
        let err = parse_attr("$if=\"!loading\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C302"));
        assert!(
            err.message.contains("curly form") && err.message.contains("$if={expr}"),
            "C302 should point at the curly form, got: {}",
            err.message
        );
        assert_eq!(err.to.as_deref(), Some("$if={…}"));
    }

    #[test]
    fn macro_quoted_rejects_logical_operators() {
        // `a&&b` — no whitespace, would have slipped through previously.
        let err = parse_attr("$if=\"a&&b\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C302"));
    }

    #[test]
    fn macro_quoted_rejects_comparison() {
        let err = parse_attr("$if=\"count>0\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C302"));
    }

    #[test]
    fn macro_quoted_rejects_leading_digit() {
        let err = parse_attr("$if=\"1count\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C302"));
    }

    #[test]
    fn macro_quoted_rejects_consecutive_dots() {
        let err = parse_attr("$if=\"a..b\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C302"));
    }

    #[test]
    fn macro_quoted_rejects_trailing_dot() {
        let err = parse_attr("$if=\"route.\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C302"));
    }

    #[test]
    fn macro_quoted_accepts_dollar_in_identifier() {
        // `$`-prefixed signals (e.g. `$loading`) are a common convention; ensure
        // the strict validator still accepts them.
        let attr = parse_attr("$if=\"$loading\"").unwrap();
        assert!(
            matches!(attr, Attr::Macro { ref value, .. } if matches!(value, MacroValue::Quoted(s) if s == "$loading")),
            "$if=\"$loading\" must remain Attr::Macro with Quoted value, got: {:?}",
            attr
        );
    }

    #[test]
    fn macro_quoted_accepts_underscore_start() {
        let attr = parse_attr("$if=\"_private\"").unwrap();
        assert!(
            matches!(attr, Attr::Macro { ref value, .. } if matches!(value, MacroValue::Quoted(s) if s == "_private")),
        );
    }

    #[test]
    fn bare_value_rejected_c300() {
        let err = parse_attr("class=myClass").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C300"));
    }

    #[test]
    fn bare_macro_value_rejected_c300() {
        let err = parse_attr("$if=isVisible").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C300"));
    }

    #[test]
    fn rejects_legacy_event_binding_alias_c305() {
        // v1.0.8 — Amendment 04: `@event=` is removed (C305). Use `$on.event=`.
        let err = parse_attr("@click=\"handleClick\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C305"));
        assert!(
            err.message.contains("$on.click"),
            "C305 message should suggest `$on.click`, got: {}",
            err.message
        );
        assert!(
            err.message.contains("npx aihu migrate"),
            "C305 message should reference `npx aihu migrate`, got: {}",
            err.message
        );
    }

    #[test]
    fn c305_html_alias_redirects_to_dollar_html() {
        // Bug 9b — `@html=` is innerHTML intent, NOT an event. C305 must
        // point at `$html={…}`, not `$on.html` (a no-op for raw HTML).
        let err = parse_attr("@html=\"raw\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C305"));
        assert!(
            err.message.contains("$html"),
            "C305 for @html should suggest `$html`, got: {}",
            err.message
        );
        assert!(
            !err.message.contains("$on.html"),
            "C305 for @html must NOT steer to `$on.html`, got: {}",
            err.message
        );
    }

    #[test]
    fn c305_event_alias_still_points_to_on_event() {
        // Bug 9b regression guard — genuine event aliases keep the
        // `$on.<event>` guidance.
        let err = parse_attr("@click=\"handleClick\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C305"));
        assert!(
            err.message.contains("$on.click"),
            "C305 for @click should suggest `$on.click`, got: {}",
            err.message
        );
    }

    #[test]
    fn on_html_is_suspicious_event() {
        // Bug 9a — `$on.html` is the canonical wrong case (dead handler).
        assert!(is_suspicious_event_name("html"));
        assert!(is_suspicious_event_name("innerhtml"));
        assert!(is_suspicious_event_name("foo"));
        assert!(is_suspicious_event_name("text"));
    }

    #[test]
    fn real_events_are_not_suspicious() {
        // Bug 9a — real DOM events must never warn.
        assert!(!is_suspicious_event_name("click"));
        assert!(!is_suspicious_event_name("input"));
        assert!(!is_suspicious_event_name("submit"));
        assert!(!is_suspicious_event_name("pointerdown"));
        assert!(!is_suspicious_event_name("DOMContentLoaded"));
    }

    #[test]
    fn custom_events_are_not_suspicious() {
        // Bug 9a — conservative heuristic: hyphenated or camelCase names
        // look intentional and must NOT warn (avoid false-positives on
        // legit custom events).
        assert!(!is_suspicious_event_name("user-login"));
        assert!(!is_suspicious_event_name("valueChanged"));
        assert!(!is_suspicious_event_name("my-custom-event"));
        assert!(!is_suspicious_event_name("itemSelected"));
    }

    #[test]
    fn on_html_parses_as_binding_still_warns_separately() {
        // Bug 9a — `$on.html={x}` still parses (warning is emitted to
        // stderr as a side-effect, not a hard error). The parse result is
        // unchanged; we only added the diagnostic.
        let attr = parse_attr("$on.html={html}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "on:html".to_string(),
                value: MacroValue::Curly("html".to_string())
            }
        );
    }

    #[test]
    fn rejects_legacy_colon_binding_alias_c304() {
        // v1.0.8 — Amendment 04: `:attr=` is removed (C304). Use `$attr={expr}`.
        let err = parse_attr(":value=\"count\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C304"));
        assert!(
            err.message.contains("$value"),
            "C304 message should suggest `$value`, got: {}",
            err.message
        );
        assert!(
            err.message.contains("npx aihu migrate"),
            "C304 message should reference `npx aihu migrate`, got: {}",
            err.message
        );
    }

    #[test]
    fn rejects_plain_curly_html_binding_c306() {
        // v1.0.8 — Amendment 04: plain `attr={expr}` on HTML attrs is removed
        // (C306). Use `$attr={expr}` (always-prefix).
        let err = parse_attr("class={dynamic}").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C306"));
        assert!(
            err.message.contains("$class"),
            "C306 message should suggest `$class`, got: {}",
            err.message
        );
        assert!(
            err.message.contains("npx aihu migrate"),
            "C306 message should reference `npx aihu migrate`, got: {}",
            err.message
        );
    }

    #[test]
    fn accepts_plain_curly_on_component_element() {
        // Per Amendment 04 §11.2: component prop-passing is unaffected.
        // `<UserCard user={u}>` keeps plain curly form. Same for `<$focusTrap>`.
        let attr = parse_attr_component("user={u}").unwrap();
        assert_eq!(
            attr,
            Attr::Binding {
                name: "user".to_string(),
                expr: "u".to_string(),
            }
        );
    }

    #[test]
    fn accepts_plain_curly_active_on_structural_macro() {
        // `<$focusTrap active={isOpen}>` — `active` is a prop on the
        // structural macro element, NOT an HTML attribute. C306 must
        // not fire.
        let attr = parse_attr_component("active={isOpen}").unwrap();
        assert_eq!(
            attr,
            Attr::Binding {
                name: "active".to_string(),
                expr: "isOpen".to_string(),
            }
        );
    }

    #[test]
    fn dollar_prefix_plain_attr_routes_to_binding() {
        // Amendment 04 — `$<plain-attr>={expr}` (not in reserved-macro registry)
        // routes to `Attr::Binding { name, expr }`. This preserves the existing
        // emit.rs codegen at the 9 `Attr::Binding` consumer sites.
        let attr = parse_attr("$class={dynamic}").unwrap();
        assert_eq!(
            attr,
            Attr::Binding {
                name: "class".to_string(),
                expr: "dynamic".to_string(),
            }
        );
    }

    #[test]
    fn dollar_prefix_href_routes_to_binding() {
        let attr = parse_attr("$href={url}").unwrap();
        assert_eq!(
            attr,
            Attr::Binding {
                name: "href".to_string(),
                expr: "url".to_string(),
            }
        );
    }

    #[test]
    fn dollar_prefix_aria_routes_to_binding() {
        let attr = parse_attr("$aria-label={label}").unwrap();
        assert_eq!(
            attr,
            Attr::Binding {
                name: "aria-label".to_string(),
                expr: "label".to_string(),
            }
        );
    }

    #[test]
    fn dollar_prefix_data_attr_routes_to_binding() {
        let attr = parse_attr("$data-id={id}").unwrap();
        assert_eq!(
            attr,
            Attr::Binding {
                name: "data-id".to_string(),
                expr: "id".to_string(),
            }
        );
    }

    #[test]
    fn dollar_prefix_class_array_routes_to_binding() {
        // `$class={[a, b]}` array form also routes to `Attr::Binding`. The
        // `__aihu_cls` wrapping lives in emit.rs:3608 on the `Attr::Binding`
        // path (detected via `expr.trim_start().starts_with('[')`).
        let attr = parse_attr("$class={[a, b]}").unwrap();
        assert_eq!(
            attr,
            Attr::Binding {
                name: "class".to_string(),
                expr: "[a, b]".to_string(),
            }
        );
    }

    #[test]
    fn dollar_prefix_reserved_if_stays_macro() {
        // Reserved bare macro names (if/each/key/show/once/memo/html/raw/ref)
        // remain `Attr::Macro` for curly form.
        let attr = parse_attr("$if={isVisible}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "if".to_string(),
                value: MacroValue::Curly("isVisible".to_string())
            }
        );
    }

    #[test]
    fn dollar_prefix_reserved_on_namespace_stays_macro() {
        // Namespaced macros (`on:`, `bind:`, `class:`, `emit:`) stay `Attr::Macro`.
        let attr = parse_attr("$on.click={handler}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "on:click".to_string(),
                value: MacroValue::Curly("handler".to_string())
            }
        );
    }

    #[test]
    fn dollar_prefix_reserved_bind_namespace_stays_macro() {
        let attr = parse_attr("$bind.value={count}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "bind:value".to_string(),
                value: MacroValue::Curly("count".to_string())
            }
        );
    }

    #[test]
    fn macro_each_and_key() {
        // Updated to spec-idiomatic "list as item" form (old form is C302)
        let each = parse_attr("$each=\"items as item\"").unwrap();
        let key = parse_attr("$key=\"getKey\"").unwrap();
        assert_eq!(
            each,
            Attr::Macro {
                name: "each".to_string(),
                value: MacroValue::Quoted("items as item".to_string())
            }
        );
        assert_eq!(
            key,
            Attr::Macro {
                name: "key".to_string(),
                value: MacroValue::Quoted("getKey".to_string())
            }
        );
    }

    #[test]
    fn macro_each_spec_form_with_index() {
        let each = parse_attr("$each=\"users as user, idx\"").unwrap();
        assert_eq!(
            each,
            Attr::Macro {
                name: "each".to_string(),
                value: MacroValue::Quoted("users as user, idx".to_string())
            }
        );
    }

    #[test]
    fn macro_each_old_form_is_c302() {
        let err = parse_attr("$each=\"items\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C302"));
    }

    #[test]
    fn macro_memo_curly() {
        let attr = parse_attr("$memo={[count, name]}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "memo".to_string(),
                value: MacroValue::Curly("[count, name]".to_string())
            }
        );
    }

    // ─── B3: $on. / $bind. dot-form parsing ──────────────────────────────────
    #[test]
    fn b3_on_dot_form_curly_parses() {
        // $on.click is the canonical Variant B form; internally normalized to "on:click".
        let attr = parse_attr("$on.click={handleClick}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "on:click".to_string(),
                value: MacroValue::Curly("handleClick".to_string())
            }
        );
    }

    #[test]
    fn b3_bind_dot_form_curly_parses() {
        let attr = parse_attr("$bind.value={count}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "bind:value".to_string(),
                value: MacroValue::Curly("count".to_string())
            }
        );
    }

    #[test]
    fn b3_on_dot_form_quoted_parses() {
        let attr = parse_attr("$on.click=\"handleClick\"").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "on:click".to_string(),
                value: MacroValue::Quoted("handleClick".to_string())
            }
        );
    }

    #[test]
    fn b3c_colon_form_is_hard_error() {
        // B3c Phase 2: colon-form is now a C500 hard error.
        let err = parse_attr("$on:click={handleClick}").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C500"));
    }

    #[test]
    fn b3_class_colon_namespaced_unchanged() {
        // `$class:active` uses colon as a namespace; B3 colon→dot transition
        // applies only to `$on` and `$bind`. Verify class:NAME pass-through.
        let attr = parse_attr("$class:active={cond}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "class:active".to_string(),
                value: MacroValue::Curly("cond".to_string())
            }
        );
    }
}
