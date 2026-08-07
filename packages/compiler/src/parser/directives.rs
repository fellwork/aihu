use crate::types::{Attr, CompileError, MacroValue};

/// Boolean void attributes that are valid without a value.
const VOID_ATTRS: &[&str] = &[
    "disabled", "checked", "readonly", "required", "multiple",
    "autofocus", "autoplay", "controls", "default", "defer",
    "formnovalidate", "hidden", "ismap", "loop", "novalidate",
    "open", "reversed", "scoped", "seamless", "selected",
];

// ─── Grammar v2 — the prefix-less template (40-spec §2.4) ────────────────────
//
// The framework attribute vocabulary is naked words, reserved on every
// element. `$`-prefixed attributes are retired (C606/C607). The internal AST
// names are UNCHANGED from v1 (`if`, `each`, `on:click`, `bind:value`,
// `class:active`, …) so the emit layer is untouched by the surface change.

/// Naked framework words that take a braced `{expr}` value.
pub(crate) const GRAMMAR_WORDS_EXPR: &[&str] =
    &["if", "elseif", "each", "key", "show", "html", "ref", "memo"];

/// Naked framework words that are bare (valueless).
pub(crate) const GRAMMAR_WORDS_BARE: &[&str] = &["else", "empty", "once", "raw"];

/// Colon-namespace directive prefixes (`word:param` family). `attr:` — the
/// literal-attribute escape hatch (§2.7) — is handled separately.
const GRAMMAR_PREFIXES: &[&str] = &["on:", "bind:", "class:"];

/// Standard DOM event names (sans the `on` prefix) used by the Bug 9a
/// `on:<name>` validation. This is a recognition allowlist, NOT an
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

/// Event-handler modifiers accepted after the event name (`on:click.prevent`).
const KNOWN_EVENT_MODIFIERS: &[&str] = &["prevent", "stop", "self", "once"];

/// Bug 9a — heuristic for "this `on:<name>` almost certainly is NOT an
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

/// Bug 9a — emit the unknown-event warning for a suspicious `on:<event>`.
/// The `html`/`innerhtml` cases additionally redirect to `html={…}`,
/// which is the real raw-innerHTML directive.
fn warn_unknown_event(event: &str) {
    let (hint, fix) = if event == "html" || event == "innerhtml" {
        (
            format!(
                "`on:{}` compiles to a dead `on{}` attribute that never fires",
                event, event
            ),
            "If you meant to set raw innerHTML, use `html={…}` instead.".to_string(),
        )
    } else {
        (
            format!(
                "`on:{}` compiles to a dead `on{}` handler that never fires",
                event, event
            ),
            "Did you mean a real DOM event (e.g. `on:click`)?".to_string(),
        )
    };
    crate::diagnostics::emit_warning(&CompileError {
        message: format!(
            "`on:{}` references '{}', which is not a known DOM event.",
            event, event
        ),
        line: 0,
        col: 0,
        code: Some("W210".to_string()),
        hint: Some(hint),
        fix: Some(fix),
        ..Default::default()
    });
}

// ─── Retirement (40-spec §4) — every old form is a compile error ─────────────

/// C606/C607 — `$`-prefixed attributes are retired. Builds the per-name
/// migration hint (the C471 pattern: code + hint + fix + from/to anchors).
fn dollar_attr_retired(rest: &str) -> CompileError {
    let eq_pos = find_top_level_eq(rest);
    let (name_part, value_part) = match eq_pos {
        Some(pos) => (&rest[..pos], &rest[pos + 1..]),
        None => (rest, ""),
    };
    let name = name_part.trim();
    let from = if value_part.is_empty() {
        format!("${}", name)
    } else {
        format!("${}={}", name, value_part)
    };

    // Recover the inner value text for the fix hint: `{expr}` → expr,
    // `"quoted"` → quoted (the quoted form was a signal reference — its
    // braced replacement is the same text).
    let inner_value = {
        let v = value_part.trim();
        if v.starts_with('{') {
            extract_balanced_braces(v).unwrap_or("…").to_string()
        } else if v.starts_with('"') || v.starts_with('\'') {
            strip_quotes(v).to_string()
        } else if v.is_empty() {
            String::new()
        } else {
            v.to_string()
        }
    };
    let val_or = |fallback: &str| {
        if inner_value.is_empty() {
            fallback.to_string()
        } else {
            inner_value.clone()
        }
    };

    // C606 — the control-flow attributes (incl. the string-DSL `$each` and
    // the `$let` loop alias). C607 — every other `$`-prefixed attribute.
    let (code, to): (&str, String) = match name {
        "if" => ("C606", format!("if={{{}}}", val_or("expr"))),
        "each" => {
            // `$each="items as item[, i]"` → `each={item[, i] of items}`;
            // `$each={list}` (+ `$let={item}`) → `each={item of list}`.
            let v = inner_value.trim();
            let to = if let Some((list, aliases)) = v.split_once(" as ") {
                format!("each={{{} of {}}}", aliases.trim(), list.trim())
            } else if !v.is_empty() {
                format!("each={{item of {}}}", v)
            } else {
                "each={item of list}".to_string()
            };
            ("C606", to)
        }
        "let" => ("C606", format!("each={{{} of list}}", val_or("item"))),
        "key" => ("C607", format!("key={{{}}}", val_or("expr"))),
        "show" => ("C607", format!("show={{{}}}", val_or("expr"))),
        "html" => ("C607", format!("html={{{}}}", val_or("expr"))),
        "ref" => ("C607", format!("ref={{{}}}", val_or("expr"))),
        "once" => ("C607", "once".to_string()),
        "raw" => ("C607", "raw".to_string()),
        "memo" => ("C607", format!("memo={{{}}}", val_or("deps"))),
        "class" => ("C607", format!("class={{{}}}", val_or("expr"))),
        n if n.starts_with("on.") || n.starts_with("on:") => {
            let event = &n[3..];
            ("C607", format!("on:{}={{{}}}", event, val_or("handler")))
        }
        n if n.starts_with("bind.") => {
            let prop = &n["bind.".len()..];
            ("C607", format!("bind:{}={{{}}}", prop, val_or("name")))
        }
        n if n.starts_with("bind:") => {
            let prop = &n["bind:".len()..];
            ("C607", format!("bind:{}={{{}}}", prop, val_or("name")))
        }
        n if n.starts_with("class:") => {
            let cls = &n["class:".len()..];
            ("C607", format!("class:{}={{{}}}", cls, val_or("cond")))
        }
        n => ("C607", format!("{}={{{}}}", n, val_or("expr"))),
    };

    CompileError {
        message: format!(
            "{}: `${}` is removed — template attributes are prefix-less. \
             fix: rewrite as `{}`.",
            code, name, to
        ),
        line: 0,
        col: 0,
        code: Some(code.to_string()),
        hint: Some(
            "the `$` attribute layer is retired: naked keywords (`if`, `each`, `key`, \
             `show`, …), colon directives (`on:click`, `bind:value`, `class:active`), \
             and plain `{expr}` bindings replace it. `$` now belongs to `@state` \
             macros only."
                .to_string(),
        ),
        fix: Some(format!("rewrite as `{}`", to)),
        from: Some(from),
        to: Some(to),
        ..Default::default()
    }
}

/// C310 (§13 layer 1) — the characters an attribute NAME may never contain.
///
/// Deliberately a NARROW alphabet, not the HTML name production. Every
/// character here already means something else where an attribute name is
/// serialized, so a name carrying one does not render as written under ANY
/// renderer:
///
/// - `/` — `<span data-x/onload="alert(1)">` is TWO attributes to an HTML
///   parser (`data-x` and a live `onload` handler), which is the whole reason
///   this check exists. `serializeAttrs` and `__aihu_sattr` escape attribute
///   VALUES, never keys, and child SSR now carries whatever the template said
///   straight into a prerendered page.
/// - `"` / `'` — close the surrounding quoted value and start a new attribute.
/// - `<` — a parse error in the attribute-name state; browsers recover in ways
///   that differ from what was written.
/// - backtick — IE-era attribute-value delimiter; still a documented
///   markup-injection vector in sanitizer literature.
/// - `=` — starts the value. Unreachable today (`split_attr` cuts at the first
///   `=`, so a name never contains one) and kept as a stated invariant: if that
///   split ever changes, the rule should not have to be rediscovered.
/// - control characters — invisible; a name containing one cannot be what the
///   author meant, and `\n`/`\r` can restructure the serialized tag.
///
/// NOT enforced here, on purpose: the full attribute-name production. Unicode
/// policing and spec-complete strictness are where a WRONG production breaks
/// real, working templates, and that tier can only ever land as a warning.
/// Templates that trip THIS rule were already broken — silently, and in the
/// direction of executing script.
const FORBIDDEN_ATTR_NAME_CHARS: &[char] = &['/', '"', '\'', '<', '=', '`'];

/// Reject an attribute name that cannot serialize as written. See
/// `FORBIDDEN_ATTR_NAME_CHARS` for why each character is on the list.
///
/// Applied to the RAW name, before any prefix dispatch, so every spelling is
/// covered by one rule: plain attributes, `attr:` escape-hatch names, and the
/// `on:` / `bind:` / `class:` suffixes alike. `@` and `:` are absent from the
/// list precisely so the legacy-alias diagnostics below (C304/C305) keep
/// reporting their own, more useful messages.
fn validate_attr_name(name: &str, raw: &str) -> Result<(), CompileError> {
    let bad = name
        .chars()
        .find(|c| FORBIDDEN_ATTR_NAME_CHARS.contains(c) || c.is_control());
    let Some(bad) = bad else {
        if name.is_empty() {
            return Err(CompileError {
                message: format!(
                    "C310: attribute with an empty name (`{}`) — there is nothing to \
                     serialize, and an HTML parser reads the `=` as the start of a name.",
                    raw
                ),
                line: 0,
                col: 0,
                code: Some("C310".to_string()),
                hint: Some("an attribute needs a name before its `=`".to_string()),
                from: Some(raw.to_string()),
                ..Default::default()
            });
        }
        return Ok(());
    };
    let shown = if bad.is_control() {
        format!("U+{:04X}", bad as u32)
    } else {
        format!("`{}`", bad)
    };
    Err(CompileError {
        message: format!(
            "C310: attribute name `{}` contains {} — attribute names are serialized \
             VERBATIM (only values are escaped), so this does not render as written. \
             `<span data-x/onload=\"…\">` is two attributes to an HTML parser, the \
             second a live event handler.",
            name, shown
        ),
        line: 0,
        col: 0,
        code: Some("C310".to_string()),
        hint: Some(
            "attribute names may not contain `/`, `\"`, `'`, `<`, `=`, a backtick, or a \
             control character — each of those already means something else where the \
             name is serialized"
                .to_string(),
        ),
        fix: Some("remove the character, or split this into two separate attributes".to_string()),
        from: Some(raw.to_string()),
        ..Default::default()
    })
}

pub fn parse_attr(raw: &str, is_html_element: bool) -> Result<Attr, CompileError> {
    // C606/C607 — the `$` attribute layer is retired (grammar v2).
    if let Some(rest) = raw.strip_prefix('$') {
        return Err(dollar_attr_retired(rest));
    }

    let (name, raw_value) = split_attr(raw);

    // §13 layer 1 — the name has to be a name. Before every prefix dispatch
    // below, so `attr:`'s literal-name escape hatch and the `on:`/`bind:`/
    // `class:` suffixes are covered by the same rule as a plain attribute.
    validate_attr_name(name, raw)?;

    // Event binding: @event="handler" — REMOVED (C305).
    // Migration: `on:<event>={fn}` colon directive.
    if let Some(event_name) = name.strip_prefix('@') {
        let lower = event_name.to_ascii_lowercase();
        let (message, hint, to_form) = if lower == "html" || lower == "innerhtml" {
            (
                format!(
                    "C305: `@{}=` is removed. For setting raw innerHTML, \
                     use `html={{expr}}`.",
                    event_name
                ),
                format!(
                    "`@{}=` is innerHTML intent, not an event handler — \
                     the raw-HTML directive is the naked `html` attribute",
                    event_name
                ),
                "html={expr}".to_string(),
            )
        } else {
            (
                format!(
                    "C305: `@{}=` event-binding alias is removed. \
                     Use `on:{}={{fn}}` for event handlers.",
                    event_name, event_name
                ),
                format!(
                    "event handlers use the colon directive `on:{}`, \
                     not the legacy `@{}=` alias",
                    event_name, event_name
                ),
                format!("on:{}={{fn}}", event_name),
            )
        };
        return Err(CompileError {
            message,
            line: 0,
            col: 0,
            code: Some("C305".to_string()),
            hint: Some(hint),
            fix: Some(format!("rewrite as `{}`", to_form)),
            from: Some(format!("@{}=", event_name)),
            to: Some(to_form),
            ..Default::default()
        });
    }

    // Property binding: :prop="expr" — REMOVED (C304).
    // Migration: `prop={expr}` (plain braces are the reactive form).
    if let Some(binding_name) = name.strip_prefix(':') {
        return Err(CompileError {
            message: format!(
                "C304: `:{}=` binding alias is removed. \
                 Use `{}={{expr}}` for reactive bindings.",
                binding_name, binding_name
            ),
            line: 0,
            col: 0,
            code: Some("C304".to_string()),
            hint: Some(format!(
                "reactive bindings are plain braces: `{}={{expr}}` — \
                 not the legacy `:{}=` alias",
                binding_name, binding_name
            )),
            fix: Some(format!("rewrite as `{}={{expr}}`", binding_name)),
            from: Some(format!(":{}=", binding_name)),
            to: Some(format!("{}={{expr}}", binding_name)),
            ..Default::default()
        });
    }

    if name == "v-if" || name == "v-for" {
        return Err(CompileError {
            message: "v-if / v-for directives are not supported; use `if={expr}` / `each={item of list}`".to_string(),
            line: 0,
            col: 0,
            ..Default::default()
        });
    }

    if let Some(directive_name) = name.strip_prefix("v-") {
        return Err(CompileError {
            message: format!(
                "unknown directive 'v-{}'; aihu templates use naked keywords (`if`, `each`), colon directives (`on:`, `bind:`, `class:`), and `{{expr}}` bindings",
                directive_name
            ),
            line: 0,
            col: 0,
            ..Default::default()
        });
    }

    // ── §2.7 escape hatch — `attr:<name>` emits a literal attribute ─────────
    if let Some(lit_name) = name.strip_prefix("attr:") {
        if lit_name.is_empty() {
            return Err(CompileError {
                message: "`attr:` requires an attribute name (e.g. `attr:if=\"…\"`)".to_string(),
                line: 0,
                col: 0,
                code: Some("C302".to_string()),
                ..Default::default()
            });
        }
        if raw_value.starts_with('{') {
            let inner = extract_balanced_braces(raw_value).ok_or_else(|| CompileError {
                message: format!("unclosed '{{' in attribute value for 'attr:{}'", lit_name),
                line: 0,
                col: 0,
                code: Some("C303".to_string()),
                ..Default::default()
            })?;
            return Ok(Attr::Binding {
                name: lit_name.to_string(),
                expr: inner.to_string(),
            });
        }
        if raw_value.is_empty() {
            return Ok(Attr::Static {
                name: lit_name.to_string(),
                value: String::new(),
            });
        }
        if raw_value.starts_with('"') || raw_value.starts_with('\'') {
            return Ok(Attr::Static {
                name: lit_name.to_string(),
                value: strip_quotes(raw_value).to_string(),
            });
        }
        return Err(bare_value_error());
    }

    // ── §2.3/§2.4 — naked framework words, reserved on every element ────────
    if GRAMMAR_WORDS_BARE.contains(&name) {
        if !raw_value.is_empty() {
            return Err(CompileError {
                message: format!(
                    "`{}` takes no value — it is a bare framework word (got `{}`)",
                    name, raw
                ),
                line: 0,
                col: 0,
                code: Some("C302".to_string()),
                hint: Some(format!(
                    "`{}` marks the element itself; for a literal `{}` attribute on a \
                     custom element use the `attr:{}` escape hatch",
                    name, name, name
                )),
                fix: Some(format!("write bare `{}`", name)),
                from: Some(raw.to_string()),
                to: Some(name.to_string()),
                ..Default::default()
            });
        }
        return Ok(Attr::Macro {
            name: name.to_string(),
            value: MacroValue::Boolean,
        });
    }

    if GRAMMAR_WORDS_EXPR.contains(&name) {
        if raw_value.starts_with('{') {
            let inner = extract_balanced_braces(raw_value).ok_or_else(|| CompileError {
                message: format!("unclosed '{{' in `{}` attribute", name),
                line: 0,
                col: 0,
                code: Some("C301".to_string()),
                ..Default::default()
            })?;
            if name == "each" {
                // §3.2 — validate the `of` head at parse time so head syntax
                // errors get head-specific messages, never oxc's.
                parse_each_of_head(inner).map_err(|msg| CompileError {
                    message: msg,
                    line: 0,
                    col: 0,
                    code: Some("C302".to_string()),
                    hint: Some(
                        "the `each` head is `<binder> [, <index>] of <list-expr>` — \
                         item-first, `of`-separated; the binder may destructure \
                         (`each={[k, v] of entries}`)"
                            .to_string(),
                    ),
                    fix: Some("write `each={item of items}` (or `each={item, i of items}`)".to_string()),
                    from: Some(raw.to_string()),
                    ..Default::default()
                })?;
            }
            return Ok(Attr::Macro {
                name: name.to_string(),
                value: MacroValue::Curly(inner.to_string()),
            });
        }
        // Quoted / bare / missing value on an expression word.
        return Err(CompileError {
            message: format!(
                "`{}` takes a braced expression: `{}={{expr}}` (quoted strings are static \
                 HTML values, and `{}` is a reserved framework word)",
                name, name, name
            ),
            line: 0,
            col: 0,
            code: Some("C302".to_string()),
            hint: Some(format!(
                "for a literal `{}` attribute on a custom element, use the \
                 `attr:{}` escape hatch",
                name, name
            )),
            fix: Some(format!("rewrite as `{}={{expr}}`", name)),
            from: Some(raw.to_string()),
            to: Some(format!("{}={{expr}}", name)),
            ..Default::default()
        });
    }

    // ── §2.4 colon-namespace directives: on:<event>, bind:<prop>, class:<n> ─
    if let Some(prefix) = GRAMMAR_PREFIXES.iter().find(|p| name.starts_with(**p)) {
        let suffix = &name[prefix.len()..];
        if suffix.is_empty() {
            return Err(CompileError {
                message: format!(
                    "`{}` requires a name (e.g. `{}click` / `{}value` / `{}active`)",
                    prefix, "on:", "bind:", "class:"
                ),
                line: 0,
                col: 0,
                code: Some("C302".to_string()),
                ..Default::default()
            });
        }
        if raw_value.starts_with('{') {
            let inner = extract_balanced_braces(raw_value).ok_or_else(|| CompileError {
                message: format!("unclosed '{{' in `{}` attribute", name),
                line: 0,
                col: 0,
                code: Some("C301".to_string()),
                ..Default::default()
            })?;
            if *prefix == "on:" {
                // Validate the event name (sans dotted modifiers) + modifiers.
                let (event, mods) = match suffix.split_once('.') {
                    Some((e, m)) => (e, Some(m)),
                    None => (suffix, None),
                };
                if let Some(mods) = mods {
                    for m in mods.split('.') {
                        if !KNOWN_EVENT_MODIFIERS.contains(&m) {
                            return Err(CompileError {
                                message: format!(
                                    "unknown event modifier `.{}` on `on:{}` — supported: .prevent, .stop, .self, .once",
                                    m, suffix
                                ),
                                line: 0,
                                col: 0,
                                code: Some("C302".to_string()),
                                ..Default::default()
                            });
                        }
                    }
                }
                if is_suspicious_event_name(event) {
                    warn_unknown_event(event);
                }
            }
            return Ok(Attr::Macro {
                name: name.to_string(),
                value: MacroValue::Curly(inner.to_string()),
            });
        }
        return Err(CompileError {
            message: format!(
                "`{}` takes a braced expression: `{}={{…}}` (quoted strings are static)",
                name, name
            ),
            line: 0,
            col: 0,
            code: Some("C302".to_string()),
            fix: Some(format!("rewrite as `{}={{…}}`", name)),
            from: Some(raw.to_string()),
            to: Some(format!("{}={{…}}", name)),
            ..Default::default()
        });
    }

    // ── §2.2 — plain HTML attributes ────────────────────────────────────────
    // Reactive: braces. `disabled={loading}`, `href={x}` — on EVERY element
    // (the v1 C306 always-`$`-prefix rule is retired with the `$` layer).
    if raw_value.starts_with('{') {
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

    // Boolean attribute (bare presence, no `=`): `disabled`, `data-x`,
    // `replace`, `reload`, … — static empty value.
    if raw_value.is_empty() {
        return Ok(Attr::Static {
            name: name.to_string(),
            value: String::new(),
        });
    }

    // If there's a value, it must be quoted — bare values are C300.
    if !raw_value.starts_with('"') && !raw_value.starts_with('\'') {
        return Err(bare_value_error());
    }

    let value = strip_quotes(raw_value);

    // W602 [S] — a non-empty static string on a boolean attribute is a known
    // author trap (`disabled="false"` is truthy in HTML). Advisory warning.
    if is_html_element && VOID_ATTRS.contains(&name) && !value.is_empty() {
        crate::diagnostics::emit_warning(&CompileError {
            message: format!(
                "W602: `{}=\"{}\"` — a non-empty string on a boolean attribute is always \
                 truthy in HTML (`{}=\"false\"` still enables it).",
                name, value, name
            ),
            line: 0,
            col: 0,
            code: Some("W602".to_string()),
            hint: Some(format!(
                "boolean attributes are presence-based; `{}=\"false\"` does NOT disable it",
                name
            )),
            fix: Some(format!(
                "use bare `{}` to enable, omit to disable, or bind reactively: `{}={{cond}}`",
                name, name
            )),
            from: Some(raw.to_string()),
            to: Some(format!("{}={{cond}}", name)),
            ..Default::default()
        });
    }

    Ok(Attr::Static {
        name: name.to_string(),
        value: value.to_string(),
    })
}

fn bare_value_error() -> CompileError {
    CompileError {
        message: "bare attribute values are not supported; use quoted form or {expression}"
            .to_string(),
        line: 0,
        col: 0,
        code: Some("C300".to_string()),
        ..Default::default()
    }
}

// ─── §2.3 `each` — the item-first `of` binder head ───────────────────────────

/// Parsed `each={ <binder> [, <index>] of <list-expr> }` head.
#[derive(Debug, PartialEq, Clone)]
pub struct EachOfHead {
    /// The item binder — a BindingIdentifier, ArrayBindingPattern, or
    /// ObjectBindingPattern, verbatim.
    pub item: String,
    /// The optional index binder (a plain identifier).
    pub idx: Option<String>,
    /// The list expression (an ordinary oxc-validated expression).
    pub list: String,
}

/// §3.2 head-splitting rule (normative): split at the FIRST top-level ` of `
/// — outside strings, template literals, comments, regex, and all bracket
/// nesting — using the shared lexical scanner. The left side parses as the
/// BindingPattern list; the right side is one expression. Sound because a
/// BindingPattern cannot contain a top-level ` of `.
pub fn parse_each_of_head(head: &str) -> Result<EachOfHead, String> {
    let trimmed = head.trim();
    if trimmed.is_empty() {
        return Err(
            "`each` head is empty — expected `<binder> [, <index>] of <list-expr>`".to_string(),
        );
    }
    let bytes = trimmed.as_bytes();

    let mut scanner = crate::parser::expr_scan::CodeScanner::new(trimmed);
    let mut depth: i32 = 0;
    let mut of_pos: Option<usize> = None;
    while let Some((i, c)) = scanner.next_code_byte() {
        match c {
            b'(' | b'{' | b'[' => depth += 1,
            b')' | b'}' | b']' => depth -= 1,
            b' ' if of_pos.is_none()
                && depth == 0
                && bytes.get(i + 1) == Some(&b'o')
                && bytes.get(i + 2) == Some(&b'f')
                && bytes.get(i + 3) == Some(&b' ') =>
            {
                of_pos = Some(i);
            }
            _ => {}
        }
    }

    let Some(of_at) = of_pos else {
        return Err(
            "`each` head must contain ` of ` — expected `<binder> [, <index>] of <list-expr>` \
             (e.g. `each={item of items}`)"
                .to_string(),
        );
    };

    let binders = trimmed[..of_at].trim();
    let list = trimmed[of_at + 4..].trim();
    if binders.is_empty() {
        return Err("`each` head is missing the item binder before ` of `".to_string());
    }
    if list.is_empty() {
        return Err("`each` head is missing the list expression after ` of `".to_string());
    }

    // Split the binder list at the first top-level comma (destructuring
    // patterns keep their inner commas).
    let (item, idx) = split_each_alias(binders);
    if item.is_empty() {
        return Err("`each` head is missing the item binder before ` of `".to_string());
    }

    // The item binder must be a BindingIdentifier / ArrayBindingPattern /
    // ObjectBindingPattern shape.
    let valid_item = {
        let t = item.trim();
        let is_ident = t
            .chars()
            .enumerate()
            .all(|(i, c)| {
                if i == 0 {
                    c.is_ascii_alphabetic() || c == '_' || c == '$'
                } else {
                    c.is_ascii_alphanumeric() || c == '_' || c == '$'
                }
            });
        is_ident
            || (t.starts_with('[') && t.ends_with(']'))
            || (t.starts_with('{') && t.ends_with('}'))
    };
    if !valid_item {
        return Err(format!(
            "`each` item binder `{}` is not a binding pattern — expected an identifier, \
             `[…]` array pattern, or `{{…}}` object pattern",
            item
        ));
    }

    // The index binder (when present) is a plain identifier.
    if let Some(ref ix) = idx {
        let ok = !ix.is_empty()
            && ix.chars().enumerate().all(|(i, c)| {
                if i == 0 {
                    c.is_ascii_alphabetic() || c == '_' || c == '$'
                } else {
                    c.is_ascii_alphanumeric() || c == '_' || c == '$'
                }
            });
        if !ok {
            return Err(format!(
                "`each` index binder `{}` must be a plain identifier",
                ix
            ));
        }
    }

    Ok(EachOfHead {
        item,
        idx,
        list: list.to_string(),
    })
}

/// Find the position of the top-level `=` in an attribute token,
/// skipping over brace-balanced regions with full lexical awareness (an `=`
/// inside a string, template literal, comment, or regex never splits).
fn find_top_level_eq(s: &str) -> Option<usize> {
    let mut scanner = crate::parser::expr_scan::CodeScanner::new(s);
    let mut depth = 0usize;
    while let Some((i, c)) = scanner.next_code_byte() {
        match c {
            b'{' => depth += 1,
            b'}' => depth = depth.saturating_sub(1),
            b'=' if depth == 0 => return Some(i),
            _ => {}
        }
    }
    None
}

/// Extract the inner content of a brace-balanced `{...}` expression.
/// `s` must start with `{`. Lexically aware via the shared scanner: `}`
/// inside strings, template literals, comments, and regex does not close.
fn extract_balanced_braces(s: &str) -> Option<&str> {
    if !s.starts_with('{') {
        return None;
    }
    let close = crate::parser::expr_scan::find_matching_close_brace(s, 1)?;
    Some(&s[1..close])
}

/// Split a binder/alias clause into `(item, idx)` at the first comma that is
/// NOT inside a destructuring pattern.
///
/// A plain `split_once(',')` breaks every destructured binder: for
/// `[name, desc]` it returns `("[name", Some("desc]"))`, which then emits
/// `([name) => name` — a syntax error. Object patterns (`{ id, label }`)
/// fail the same way.
pub(crate) fn split_each_alias(rest: &str) -> (String, Option<String>) {
    let bytes = rest.as_bytes();
    let mut depth = 0i32;
    for (i, b) in bytes.iter().enumerate() {
        match b {
            b'[' | b'{' | b'(' => depth += 1,
            b']' | b'}' | b')' => depth = (depth - 1).max(0),
            b',' if depth == 0 => {
                return (
                    rest[..i].trim().to_string(),
                    Some(rest[i + 1..].trim().to_string()),
                );
            }
            _ => {}
        }
    }
    (rest.trim().to_string(), None)
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

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::MacroValue;

    /// Test helper: invoke `parse_attr` in HTML-element context.
    fn parse_attr(raw: &str) -> Result<Attr, CompileError> {
        super::parse_attr(raw, true)
    }

    /// Test helper: invoke `parse_attr` in component/framework-element context.
    fn parse_attr_component(raw: &str) -> Result<Attr, CompileError> {
        super::parse_attr(raw, false)
    }

    // ─── Grammar v2 — naked framework words ──────────────────────────────────

    #[test]
    fn naked_boolean_once() {
        let attr = parse_attr("once").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "once".to_string(),
                value: MacroValue::Boolean
            }
        );
    }

    #[test]
    fn naked_boolean_raw() {
        let attr = parse_attr("raw").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "raw".to_string(),
                value: MacroValue::Boolean
            }
        );
    }

    #[test]
    fn naked_boolean_else_and_empty() {
        assert_eq!(
            parse_attr("else").unwrap(),
            Attr::Macro { name: "else".to_string(), value: MacroValue::Boolean }
        );
        assert_eq!(
            parse_attr("empty").unwrap(),
            Attr::Macro { name: "empty".to_string(), value: MacroValue::Boolean }
        );
    }

    #[test]
    fn valued_else_is_error() {
        let err = parse_attr("else={cond}").unwrap_err();
        assert!(err.message.contains("takes no value"), "{}", err.message);
    }

    #[test]
    fn naked_if_curly() {
        let attr = parse_attr("if={isVisible}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "if".to_string(),
                value: MacroValue::Curly("isVisible".to_string())
            }
        );
    }

    #[test]
    fn naked_elseif_curly() {
        let attr = parse_attr("elseif={errorMsg}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "elseif".to_string(),
                value: MacroValue::Curly("errorMsg".to_string())
            }
        );
    }

    #[test]
    fn naked_show_expression() {
        let attr = parse_attr("show={count > 0}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "show".to_string(),
                value: MacroValue::Curly("count > 0".to_string())
            }
        );
    }

    #[test]
    fn naked_show_nested_braces() {
        let attr = parse_attr("show={obj.method({key: val})}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "show".to_string(),
                value: MacroValue::Curly("obj.method({key: val})".to_string())
            }
        );
    }

    #[test]
    fn quoted_grammar_word_is_error_with_escape_hint() {
        let err = parse_attr("if=\"isVisible\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C302"));
        assert!(err.hint.unwrap().contains("attr:if"), "hint must offer the escape hatch");
    }

    #[test]
    fn naked_memo_curly() {
        let attr = parse_attr("memo={[count, name]}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "memo".to_string(),
                value: MacroValue::Curly("[count, name]".to_string())
            }
        );
    }

    // ─── colon-namespace directives ──────────────────────────────────────────

    #[test]
    fn on_click_curly() {
        let attr = parse_attr("on:click={handleClick}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "on:click".to_string(),
                value: MacroValue::Curly("handleClick".to_string())
            }
        );
    }

    #[test]
    fn on_click_with_modifier() {
        let attr = parse_attr("on:click.prevent={handleClick}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "on:click.prevent".to_string(),
                value: MacroValue::Curly("handleClick".to_string())
            }
        );
    }

    #[test]
    fn on_unknown_modifier_is_error() {
        let err = parse_attr("on:click.bogus={h}").unwrap_err();
        assert!(err.message.contains("unknown event modifier"), "{}", err.message);
    }

    #[test]
    fn bind_value_curly() {
        let attr = parse_attr("bind:value={count}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "bind:value".to_string(),
                value: MacroValue::Curly("count".to_string())
            }
        );
    }

    #[test]
    fn class_toggle_curly() {
        let attr = parse_attr("class:active={cond}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "class:active".to_string(),
                value: MacroValue::Curly("cond".to_string())
            }
        );
    }

    #[test]
    fn quoted_on_click_is_error() {
        let err = parse_attr("on:click=\"handleClick\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C302"));
        assert_eq!(err.to.as_deref(), Some("on:click={…}"));
    }

    #[test]
    fn on_html_is_suspicious_event() {
        assert!(is_suspicious_event_name("html"));
        assert!(is_suspicious_event_name("innerhtml"));
        assert!(is_suspicious_event_name("foo"));
        assert!(is_suspicious_event_name("text"));
    }

    #[test]
    fn real_events_are_not_suspicious() {
        assert!(!is_suspicious_event_name("click"));
        assert!(!is_suspicious_event_name("input"));
        assert!(!is_suspicious_event_name("submit"));
        assert!(!is_suspicious_event_name("pointerdown"));
        assert!(!is_suspicious_event_name("DOMContentLoaded"));
    }

    #[test]
    fn custom_events_are_not_suspicious() {
        assert!(!is_suspicious_event_name("user-login"));
        assert!(!is_suspicious_event_name("valueChanged"));
        assert!(!is_suspicious_event_name("my-custom-event"));
        assert!(!is_suspicious_event_name("itemSelected"));
    }

    // ─── each — the `of` binder head ─────────────────────────────────────────

    #[test]
    fn each_of_simple() {
        let attr = parse_attr("each={item of items}").unwrap();
        assert_eq!(
            attr,
            Attr::Macro {
                name: "each".to_string(),
                value: MacroValue::Curly("item of items".to_string())
            }
        );
        let head = parse_each_of_head("item of items").unwrap();
        assert_eq!(head.item, "item");
        assert_eq!(head.idx, None);
        assert_eq!(head.list, "items");
    }

    #[test]
    fn each_of_with_index() {
        let head = parse_each_of_head("item, i of items").unwrap();
        assert_eq!(head.item, "item");
        assert_eq!(head.idx.as_deref(), Some("i"));
        assert_eq!(head.list, "items");
    }

    #[test]
    fn each_of_array_destructure() {
        let head = parse_each_of_head("[k, v] of entries").unwrap();
        assert_eq!(head.item, "[k, v]");
        assert_eq!(head.idx, None);
        assert_eq!(head.list, "entries");
    }

    #[test]
    fn each_of_object_destructure_with_index() {
        let head = parse_each_of_head("{ name, id }, i of users").unwrap();
        assert_eq!(head.item, "{ name, id }");
        assert_eq!(head.idx.as_deref(), Some("i"));
        assert_eq!(head.list, "users");
    }

    #[test]
    fn each_of_complex_list_expression() {
        let head = parse_each_of_head("evt of events.filter(e => e.ok)").unwrap();
        assert_eq!(head.item, "evt");
        assert_eq!(head.list, "events.filter(e => e.ok)");
    }

    #[test]
    fn each_of_list_containing_of_in_string() {
        // ` of ` inside a string literal in the LIST never splits — but the
        // first top-level ` of ` is the separator, so the string lives right.
        let head = parse_each_of_head("x of labels.filter(l => l !== ' of ')").unwrap();
        assert_eq!(head.item, "x");
        assert_eq!(head.list, "labels.filter(l => l !== ' of ')");
    }

    #[test]
    fn each_missing_of_is_head_error() {
        let err = parse_each_of_head("items as item").unwrap_err();
        assert!(err.contains("` of `"), "{}", err);
    }

    #[test]
    fn each_missing_of_via_parse_attr_is_c302() {
        let err = parse_attr("each={items as item}").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C302"));
        assert!(err.hint.unwrap().contains("item-first"));
    }

    #[test]
    fn each_bad_index_binder_is_error() {
        let err = parse_each_of_head("item, [a] of items").unwrap_err();
        assert!(err.contains("index binder"), "{}", err);
    }

    // ─── §2.2 — plain HTML attributes ────────────────────────────────────────

    #[test]
    fn plain_curly_binding_on_html_element() {
        let attr = parse_attr("disabled={loading}").unwrap();
        assert_eq!(
            attr,
            Attr::Binding {
                name: "disabled".to_string(),
                expr: "loading".to_string(),
            }
        );
    }

    #[test]
    fn plain_curly_class_binding() {
        let attr = parse_attr("class={dynamic}").unwrap();
        assert_eq!(
            attr,
            Attr::Binding {
                name: "class".to_string(),
                expr: "dynamic".to_string(),
            }
        );
    }

    #[test]
    fn plain_curly_class_array_binding() {
        let attr = parse_attr("class={[a, b]}").unwrap();
        assert_eq!(
            attr,
            Attr::Binding {
                name: "class".to_string(),
                expr: "[a, b]".to_string(),
            }
        );
    }

    #[test]
    fn plain_curly_aria_and_data() {
        assert_eq!(
            parse_attr("aria-label={label}").unwrap(),
            Attr::Binding { name: "aria-label".to_string(), expr: "label".to_string() }
        );
        assert_eq!(
            parse_attr("data-id={id}").unwrap(),
            Attr::Binding { name: "data-id".to_string(), expr: "id".to_string() }
        );
    }

    #[test]
    fn plain_curly_on_component_element() {
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
    fn static_quoted_attr() {
        let attr = parse_attr("class=\"story\"").unwrap();
        assert_eq!(
            attr,
            Attr::Static { name: "class".to_string(), value: "story".to_string() }
        );
    }

    #[test]
    fn bare_boolean_attr() {
        let attr = parse_attr("disabled").unwrap();
        assert_eq!(
            attr,
            Attr::Static { name: "disabled".to_string(), value: String::new() }
        );
    }

    #[test]
    fn bare_value_rejected_c300() {
        let err = parse_attr("class=myClass").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C300"));
    }

    // ─── §2.7 — `attr:` escape hatch ─────────────────────────────────────────

    #[test]
    fn attr_escape_static() {
        let attr = parse_attr("attr:if=\"config-string\"").unwrap();
        assert_eq!(
            attr,
            Attr::Static { name: "if".to_string(), value: "config-string".to_string() }
        );
    }

    #[test]
    fn attr_escape_curly() {
        let attr = parse_attr("attr:key={dynamicVal}").unwrap();
        assert_eq!(
            attr,
            Attr::Binding { name: "key".to_string(), expr: "dynamicVal".to_string() }
        );
    }

    #[test]
    fn attr_escape_bare() {
        let attr = parse_attr("attr:raw").unwrap();
        assert_eq!(
            attr,
            Attr::Static { name: "raw".to_string(), value: String::new() }
        );
    }

    // ─── §4 retirement — C606/C607 ───────────────────────────────────────────

    #[test]
    fn dollar_if_is_c606() {
        let err = parse_attr("$if={isVisible}").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C606"));
        assert_eq!(err.to.as_deref(), Some("if={isVisible}"));
        assert!(err.fix.unwrap().contains("if={isVisible}"));
        assert_eq!(err.from.as_deref(), Some("$if={isVisible}"));
    }

    #[test]
    fn dollar_if_quoted_is_c606() {
        let err = parse_attr("$if=\"loading\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C606"));
        assert_eq!(err.to.as_deref(), Some("if={loading}"));
    }

    #[test]
    fn dollar_each_string_dsl_is_c606_with_of_hint() {
        let err = parse_attr("$each=\"items as item\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C606"));
        assert_eq!(err.to.as_deref(), Some("each={item of items}"));
    }

    #[test]
    fn dollar_each_with_index_maps_to_of_form() {
        let err = parse_attr("$each=\"users as user, idx\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C606"));
        assert_eq!(err.to.as_deref(), Some("each={user, idx of users}"));
    }

    #[test]
    fn dollar_let_is_c606() {
        let err = parse_attr("$let={item}").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C606"));
    }

    #[test]
    fn dollar_on_click_is_c607() {
        let err = parse_attr("$on.click={handleClick}").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C607"));
        assert_eq!(err.to.as_deref(), Some("on:click={handleClick}"));
    }

    #[test]
    fn dollar_on_click_quoted_is_c607() {
        let err = parse_attr("$on.click=\"handleClick\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C607"));
        assert_eq!(err.to.as_deref(), Some("on:click={handleClick}"));
    }

    #[test]
    fn dollar_bind_value_is_c607() {
        let err = parse_attr("$bind.value=\"count\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C607"));
        assert_eq!(err.to.as_deref(), Some("bind:value={count}"));
    }

    #[test]
    fn dollar_class_is_c607() {
        let err = parse_attr("$class={dynamic}").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C607"));
        assert_eq!(err.to.as_deref(), Some("class={dynamic}"));
    }

    #[test]
    fn dollar_class_toggle_is_c607() {
        let err = parse_attr("$class:active={cond}").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C607"));
        assert_eq!(err.to.as_deref(), Some("class:active={cond}"));
    }

    #[test]
    fn dollar_key_is_c607() {
        let err = parse_attr("$key=\"id\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C607"));
        assert_eq!(err.to.as_deref(), Some("key={id}"));
    }

    #[test]
    fn dollar_once_is_c607_naked_word() {
        let err = parse_attr("$once").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C607"));
        assert_eq!(err.to.as_deref(), Some("once"));
    }

    #[test]
    fn dollar_generic_attr_is_c607() {
        let err = parse_attr("$href={url}").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C607"));
        assert_eq!(err.to.as_deref(), Some("href={url}"));
    }

    // ─── legacy alias rejections (C304/C305) point at the new grammar ────────

    #[test]
    fn rejects_legacy_event_binding_alias_c305() {
        let err = parse_attr("@click=\"handleClick\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C305"));
        assert!(
            err.message.contains("on:click"),
            "C305 message should suggest `on:click`, got: {}",
            err.message
        );
    }

    #[test]
    fn c305_html_alias_redirects_to_html_attr() {
        let err = parse_attr("@html=\"raw\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C305"));
        assert!(
            err.message.contains("html={expr}"),
            "C305 for @html should suggest `html={{expr}}`, got: {}",
            err.message
        );
    }

    #[test]
    fn rejects_legacy_colon_binding_alias_c304() {
        let err = parse_attr(":value=\"count\"").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("C304"));
        assert!(
            err.message.contains("value={expr}"),
            "C304 message should suggest plain braces, got: {}",
            err.message
        );
    }
}
