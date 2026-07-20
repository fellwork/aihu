//! Shared diagnostic rendering — the ONE formatter for the rich
//! `hint:` / `fix:` / `replace:` / `with:` tail.
//!
//! Before this module there were two formatting paths: `render_human_error` in
//! `bin/main.rs` (errors, via the `CompileError` `Result` channel) and
//! hand-rolled `eprintln!` blocks for warnings, which do NOT flow through that
//! channel because they are non-fatal. The hand-rolled copies drifted — CO1's
//! `W-prop-member-write` shipped as a bare one-line `eprintln!` with no code,
//! no hint, and no machine rewrite, while `W210` two files away carried the
//! full shape.
//!
//! The fix is not "format warnings like errors by hand, more carefully". It is
//! to make both channels call the same writer:
//!
//! * errors  — `bin/main.rs::render_human_error` writes its header + codeframe,
//!   then delegates the tail to [`write_tail`].
//! * warnings — [`emit_warning`] writes a `warning:` header, then delegates the
//!   tail to [`write_tail`].
//!
//! So a `CompileError` describes a diagnostic; whether it is fatal is decided
//! by which channel carries it, not by how it is printed. A warning that gains
//! a `fix:` gains it in both places at once, and the two cannot drift again.

use crate::types::CompileError;
use std::io::Write;

/// Write the rich tail shared by every diagnostic: `hint:`, `fix:`, and the
/// machine `replace:`/`with:` rewrite.
///
/// Kept separate from the header/codeframe because the two channels anchor
/// their headers differently — an error has a file/line/col and source to
/// build a codeframe from, a parse-time warning generally has neither.
/// Everything BELOW the header is identical, and that is what lives here.
pub fn write_tail(w: &mut impl Write, e: &CompileError) {
    if let Some(hint) = e.hint.as_deref() {
        let _ = writeln!(w, "  hint: {}", hint);
    }
    if let Some(fix) = e.fix.as_deref() {
        let _ = writeln!(w, "  fix:  {}", fix);
    }
    // Surface the machine rewrite for humans/AIs too (the LSP reads the JSON
    // form, but the plain-text form is useful in stderr/dev-overlay).
    if let (Some(from), Some(to)) = (e.from.as_deref(), e.to.as_deref()) {
        let _ = writeln!(w, "  replace: {}", from);
        let _ = writeln!(w, "  with:    {}", to);
    }
}

/// Render a non-fatal diagnostic to `w` as `warning: <CODE>: <message>` plus
/// the shared tail.
///
/// The code is optional so pre-existing uncoded warnings can migrate to this
/// path without inventing a code for each in the same change.
pub fn write_warning(w: &mut impl Write, e: &CompileError) {
    match e.code.as_deref() {
        Some(code) => {
            let _ = writeln!(w, "warning: {}: {}", code, e.message);
        }
        None => {
            let _ = writeln!(w, "warning: {}", e.message);
        }
    }
    write_tail(w, e);
}

/// [`write_warning`] to stderr — the normal call form.
pub fn emit_warning(e: &CompileError) {
    write_warning(&mut std::io::stderr(), e);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn render(e: &CompileError) -> String {
        let mut buf: Vec<u8> = Vec::new();
        write_warning(&mut buf, e);
        String::from_utf8(buf).unwrap()
    }

    #[test]
    fn warning_carries_code_message_and_full_tail() {
        let e = CompileError {
            message: "something is off".to_string(),
            code: Some("W562".to_string()),
            hint: Some("why it is off".to_string()),
            fix: Some("do this instead".to_string()),
            from: Some("bad".to_string()),
            to: Some("good".to_string()),
            ..Default::default()
        };
        let out = render(&e);
        assert_eq!(
            out,
            "warning: W562: something is off\n  hint: why it is off\n  fix:  do this instead\n  \
             replace: bad\n  with:    good\n"
        );
    }

    #[test]
    fn tail_lines_are_omitted_when_absent() {
        let e = CompileError {
            message: "bare".to_string(),
            ..Default::default()
        };
        assert_eq!(render(&e), "warning: bare\n");
    }

    #[test]
    fn replace_with_requires_both_from_and_to() {
        // A half-specified rewrite is not machine-applicable, so it is not
        // printed as one. Matches `render_human_error`'s long-standing
        // behaviour, which this module now owns for both channels.
        let e = CompileError {
            message: "half".to_string(),
            from: Some("bad".to_string()),
            ..Default::default()
        };
        assert_eq!(render(&e), "warning: half\n");
    }
}
