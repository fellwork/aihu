//! Auto-import registry for `@aihu/use` composables.
//!
//! When a `@state` body calls a bare `useMouse()` without importing it, the
//! compiler injects `import { useMouse } from '@aihu/use/useMouse'` into the
//! emitted module — mirroring how the `@state` vocabulary imports are
//! synthesized. Per-subpath specifiers (never the `@aihu/use` barrel) so
//! tree-shaking is preserved. ON by default (v1).
//!
//! Keep this registry in sync with `packages/use/package.json` `exports`:
//! every bare-callable composable is one `(name, subpath source)` row below.
//! (`shared` is intentionally absent — it is not a bare-callable composable.)
//! The fan-out of the remaining composables adds entries here — a future
//! improvement is to generate this table from the exports map at build time.
//!
//! `detect_composables` is the ONE decision function: both the JS emit
//! (state_emit.rs, which injects the import) and the TS sidecar
//! (sidecar_ts.rs, which emits the matching ambient declaration) call it with
//! the same raw `@state` script, so the two surfaces can never disagree about
//! whether a composable is auto-imported.

use std::collections::BTreeSet;

/// `(bare call name, module specifier)` — adding a composable is one line.
pub(crate) const USE_COMPOSABLES: &[(&str, &str)] = &[
    ("useEventListener", "@aihu/use/useEventListener"),
    ("useMouse", "@aihu/use/useMouse"),
    ("useToggle", "@aihu/use/useToggle"),
    ("useCounter", "@aihu/use/useCounter"),
    ("usePrevious", "@aihu/use/usePrevious"),
    ("useSupported", "@aihu/use/useSupported"),
    ("useIntervalFn", "@aihu/use/useIntervalFn"),
    ("useTimeoutFn", "@aihu/use/useTimeoutFn"),
    ("useRafFn", "@aihu/use/useRafFn"),
    ("useNow", "@aihu/use/useNow"),
    ("useDebounced", "@aihu/use/useDebounced"),
    ("useThrottle", "@aihu/use/useThrottle"),
    ("useScroll", "@aihu/use/useScroll"),
    ("useElementSize", "@aihu/use/useElementSize"),
    ("useElementVisibility", "@aihu/use/useElementVisibility"),
    ("useWindowSize", "@aihu/use/useWindowSize"),
    ("useMediaQuery", "@aihu/use/useMediaQuery"),
    ("usePreferredDark", "@aihu/use/usePreferredDark"),
    ("useColorScheme", "@aihu/use/useColorScheme"),
    ("useDocumentVisibility", "@aihu/use/useDocumentVisibility"),
    ("useLocalStorage", "@aihu/use/useLocalStorage"),
    ("useClipboard", "@aihu/use/useClipboard"),
    ("useEventListenerMap", "@aihu/use/useEventListenerMap"),
    // `watch` is not `use`-prefixed, a slightly higher collision-risk bare
    // identifier than the rest of this registry (e.g. chokidar's `watch`, a
    // locally named variable). Low-risk in practice: `detect_composables`'s
    // `bound_names` guard already excludes any script that imports or
    // declares its OWN `watch` (any import form, any `@state` decl, any
    // destructure) — the only residual risk is a genuinely ambient,
    // unimported `watch` identifier, which does not exist in any
    // browser/Node global. Included per the hard 6-touch-point rule.
    ("watch", "@aihu/use/watch"),
    ("useClamp", "@aihu/use/math/useClamp"),
    ("useReducedMotion", "@aihu/use/motion/useReducedMotion"),
    ("usePreferredContrast", "@aihu/use/usePreferredContrast"),
    ("usePreferredReducedTransparency", "@aihu/use/usePreferredReducedTransparency"),
    ("useInterval", "@aihu/use/useInterval"),
    ("usePreferredLanguages", "@aihu/use/usePreferredLanguages"),
    ("useBrowserLanguage", "@aihu/use/useBrowserLanguage"),
    ("useTimeout", "@aihu/use/useTimeout"),
    ("useOperatingSystem", "@aihu/use/useOperatingSystem"),
    ("useTimer", "@aihu/use/useTimer"),
    ("useTextDirection", "@aihu/use/useTextDirection"),
    ("useCountdown", "@aihu/use/useCountdown"),
    ("useStopwatch", "@aihu/use/useStopwatch"),
    ("useDateFormat", "@aihu/use/useDateFormat"),
    ("useTimeAgo", "@aihu/use/useTimeAgo"),
    ("useAsyncAbortable", "@aihu/use/useAsyncAbortable"),
    ("useNetworkState", "@aihu/use/useNetworkState"),
    ("useIdle", "@aihu/use/useIdle"),
    ("useMap", "@aihu/use/useMap"),
    ("useSet", "@aihu/use/useSet"),
    ("useMeasure", "@aihu/use/useMeasure"),
    ("useFocusWithin", "@aihu/use/useFocusWithin"),
    ("useIntersectionObserver", "@aihu/use/useIntersectionObserver"),
    ("useMutationObserver", "@aihu/use/useMutationObserver"),
    ("usePerformanceObserver", "@aihu/use/usePerformanceObserver"),
    ("useBreakpoints", "@aihu/use/useBreakpoints"),
    ("useDevicePixelRatio", "@aihu/use/useDevicePixelRatio"),
    ("useOrientation", "@aihu/use/useOrientation"),
    ("useDeviceOrientation", "@aihu/use/useDeviceOrientation"),
    ("useDeviceMotion", "@aihu/use/useDeviceMotion"),
    ("usePageLeave", "@aihu/use/usePageLeave"),
    ("usePreferredReducedMotion", "@aihu/use/usePreferredReducedMotion"),
    ("useAsync", "@aihu/use/useAsync"),
    ("useResizeObserver", "@aihu/use/useResizeObserver"),
    ("useTimestamp", "@aihu/use/useTimestamp"),
];

/// The registry entries to auto-import for this `@state` script.
///
/// A composable is auto-imported only when:
/// - a bare call `name(` appears in REAL code — comments and string/template
///   literals are masked out first, so `// TODO: use useMouse()` or a string
///   mentioning the name never injects an import from the OPTIONAL
///   `@aihu/use` package (which would be a hard bundler resolution break in
///   apps that don't depend on it), AND
/// - the author did not bind `name` themselves (`bound_names`): any import
///   (named, aliased, default, namespace — from ANY source), any `@state`
///   declaration (`const`/`let`/`var`/`function`/`class`/destructure), or any
///   macro-entry binding (`$action`/`$prop`/… keys). A different-source
///   import or a local shadow means the author's binding wins — injecting
///   would double-bind (JS) or duplicate-declare (sidecar TS).
pub(crate) fn detect_composables(raw_script: &str) -> Vec<(&'static str, &'static str)> {
    let bound = bound_names(raw_script);
    let masked = mask_comments_and_strings(raw_script);
    USE_COMPOSABLES
        .iter()
        .copied()
        .filter(|(name, _)| !bound.contains(*name) && has_bare_call(&masked, name))
        .collect()
}

/// Every name the `@state` script binds itself — the shared shadow guard for
/// BOTH the emit-side injection and the sidecar-side ambient declaration.
///
/// Union of:
/// - imported bindings (any form, any source) — `collect_imported_names`,
/// - `collect_state_decls(...).all` — signal tuples, macro-entry names,
///   plain `const`/`let` declarations, and destructuring patterns (kept in
///   lockstep with `process_state_body` by construction), and
/// - top-level `function` / `class` / `var` statement declarations, which
///   neither of the above scans recognizes.
fn bound_names(script: &str) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    crate::codegen::sidecar_ts::collect_imported_names(script, &mut names);
    names.extend(crate::codegen::signals::collect_state_decls(script).all);
    for line in crate::codegen::signals::plain_state_lines(script) {
        if let Some(name) = statement_decl_name(&line) {
            names.insert(name);
        }
    }
    names
}

/// Binding name of a top-level `function foo(` / `async function foo(` /
/// `class Foo` / `var foo` statement (optionally `export `-prefixed).
/// `const`/`let` and destructures are handled by `collect_state_decls`.
fn statement_decl_name(line: &str) -> Option<String> {
    let l = line.trim();
    let l = l.strip_prefix("export ").unwrap_or(l);
    let rest = l
        .strip_prefix("async function ")
        .or_else(|| l.strip_prefix("function "))
        .or_else(|| l.strip_prefix("class "))
        .or_else(|| l.strip_prefix("var "))?;
    leading_ident(rest.trim_start())
}

/// Leading `[A-Za-z_$][A-Za-z0-9_$]*` identifier of `s`, if any.
fn leading_ident(s: &str) -> Option<String> {
    let mut end = 0usize;
    for (i, c) in s.char_indices() {
        let ok = if i == 0 {
            c.is_ascii_alphabetic() || c == '_' || c == '$'
        } else {
            c.is_ascii_alphanumeric() || c == '_' || c == '$'
        };
        if !ok {
            break;
        }
        end = i + c.len_utf8();
    }
    if end == 0 {
        None
    } else {
        Some(s[..end].to_string())
    }
}

/// Copy of `src` with `//` line comments, `/* … */` block comments, and
/// `'…'` / `"…"` / `` `…` `` string+template literal contents blanked to
/// spaces (newlines kept, offsets preserved). Escape sequences inside
/// strings are honored; template literals are masked WHOLE, including any
/// `${…}` interpolation — a bare composable call inside an interpolation is
/// not detected (author imports explicitly there). Regex literals are not
/// modeled (treated as code) — same tradeoff as the compiler's other
/// string-aware scanners (`find_brace_close_js`).
fn mask_comments_and_strings(src: &str) -> String {
    let b = src.as_bytes();
    let mut out = b.to_vec();
    let mut i = 0usize;
    while i < b.len() {
        match b[i] {
            b'/' if i + 1 < b.len() && b[i + 1] == b'/' => {
                while i < b.len() && b[i] != b'\n' {
                    out[i] = b' ';
                    i += 1;
                }
            }
            b'/' if i + 1 < b.len() && b[i + 1] == b'*' => {
                out[i] = b' ';
                out[i + 1] = b' ';
                i += 2;
                while i < b.len() {
                    if b[i] == b'*' && i + 1 < b.len() && b[i + 1] == b'/' {
                        out[i] = b' ';
                        out[i + 1] = b' ';
                        i += 2;
                        break;
                    }
                    if b[i] != b'\n' {
                        out[i] = b' ';
                    }
                    i += 1;
                }
            }
            q @ (b'\'' | b'"' | b'`') => {
                out[i] = b' ';
                i += 1;
                while i < b.len() {
                    if b[i] == b'\\' && i + 1 < b.len() {
                        out[i] = b' ';
                        if b[i + 1] != b'\n' {
                            out[i + 1] = b' ';
                        }
                        i += 2;
                        continue;
                    }
                    if b[i] == q {
                        out[i] = b' ';
                        i += 1;
                        break;
                    }
                    // Unescaped newline terminates a normal string (author
                    // error, but never let a stray quote swallow the file);
                    // backtick literals legitimately span lines.
                    if b[i] == b'\n' {
                        if q != b'`' {
                            break;
                        }
                    } else {
                        out[i] = b' ';
                    }
                    i += 1;
                }
            }
            _ => i += 1,
        }
    }
    // Blanking replaces whole regions byte-for-byte with ASCII spaces (every
    // byte of a multi-byte char in a masked region is replaced), so the
    // buffer stays valid UTF-8.
    String::from_utf8(out).unwrap_or_else(|_| src.to_string())
}

/// True when `script` (pre-masked by the caller) contains a bare call
/// `name(` — the identifier at a word boundary (previous char is not an
/// identifier char and not `.`) followed by optional whitespace (including a
/// line break: a call may wrap as `useMouse\n(`) and `(`. A trailing
/// identifier char after `name` stops the whitespace/paren scan, so
/// `useMouseFoo(` never matches. Optional-chain calls (`useMouse?.()`) are
/// deliberately NOT detected — a rare form; the author imports explicitly.
fn has_bare_call(script: &str, name: &str) -> bool {
    let bytes = script.as_bytes();
    let mut search_from = 0usize;
    while let Some(rel) = script[search_from..].find(name) {
        let at = search_from + rel;
        search_from = at + 1;
        // Word boundary before: reject ident-continuation chars and `.`
        // (member calls like `obj.useMouse(...)` are not bare calls).
        if at > 0 {
            let prev = bytes[at - 1];
            if prev.is_ascii_alphanumeric() || prev == b'_' || prev == b'$' || prev == b'.' {
                continue;
            }
        }
        // After the name: optional whitespace (line breaks included), then `(`.
        let mut j = at + name.len();
        while j < bytes.len() && matches!(bytes[j], b' ' | b'\t' | b'\n' | b'\r') {
            j += 1;
        }
        // If the char directly after the name were an ident char, the
        // whitespace scan would have stopped on it (ident chars are neither
        // whitespace nor `(`) and this check fails — so the trailing word
        // boundary holds for free.
        if j < bytes.len() && bytes[j] == b'(' {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bare_call_word_boundaries() {
        assert!(has_bare_call("const { x } = useMouse()", "useMouse"));
        assert!(has_bare_call("useMouse ()", "useMouse"));
        assert!(has_bare_call("const p = useMouse\n  ()", "useMouse"));
        assert!(!has_bare_call("useMouseFoo()", "useMouse"));
        assert!(!has_bare_call("myuseMouse()", "useMouse"));
        assert!(!has_bare_call("obj.useMouse()", "useMouse"));
        assert!(!has_bare_call("const y = useMouse", "useMouse"));
        // Optional-chain form is deliberately undetected.
        assert!(!has_bare_call("useMouse?.()", "useMouse"));
        // First occurrence bound, later occurrence bare — still found.
        assert!(has_bare_call("a.useMouse(); useMouse()", "useMouse"));
    }

    #[test]
    fn masking_blanks_comments_and_strings() {
        let masked = mask_comments_and_strings(concat!(
            "// TODO: wire useMouse() here\n",
            "/* also useMouse() */\n",
            "const a = 'useMouse()'\n",
            "const b = \"useMouse()\"\n",
            "const c = `useMouse()`\n",
            "const d = 'esc\\'d useMouse()'\n",
        ));
        assert!(!masked.contains("useMouse"), "masked: {masked}");
        // Newlines and offsets survive.
        assert_eq!(masked.matches('\n').count(), 6);
    }

    #[test]
    fn masking_keeps_real_code() {
        let masked =
            mask_comments_and_strings("const { x } = useMouse() // and useMouse() in prose");
        assert!(has_bare_call(&masked, "useMouse"));
        assert_eq!(masked.matches("useMouse").count(), 1);
    }

    #[test]
    fn bound_names_sees_statement_decls() {
        let names = bound_names(concat!(
            "function useMouse() { return 1 }\n",
            "var vDecl = 2\n",
            "class CDecl {}\n",
            "const { useEventListener } = makeHelpers()\n",
        ));
        for n in ["useMouse", "vDecl", "CDecl", "useEventListener"] {
            assert!(names.contains(n), "missing {n} in {names:?}");
        }
    }
}
