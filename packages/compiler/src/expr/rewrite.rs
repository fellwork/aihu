//! W3 (advanced-js-template-expressions, Option C hybrid) — the AST-driven,
//! scope-aware signal-read rewrite, active under `--expr-parser ast`.
//!
//! Replaces the token-scanner rewrite (`codegen/emit.rs
//! rewrite_signal_reads_to_calls` + `collect_arrow_params`) for AST-mode
//! captures. The expression is parsed once with `oxc_parser::parse_expression`
//! (TS mode — same parse the W2 validator performs) and a single scope-aware
//! visitor records SPAN-BASED SOURCE EDITS: `()` spliced in after every
//! identifier that resolves to a registered component signal. The original
//! source text is otherwise preserved byte-for-byte (whitespace, comments,
//! string contents, multibyte glyphs — nothing is re-printed from the AST).
//!
//! What the AST gives us that the token scanners could not (the plan's
//! truth-table silent-wrong rows):
//! - **spread**: `Math.max(...nums)` → `Math.max(...nums())` — a
//!   `SpreadElement`'s argument is an ordinary expression here, not a
//!   "member access after `.`" (a10/a11/a12/b04/b05/b13/b14/c12/d07);
//! - **template literals**: `` `n=${count}` `` → `` `n=${count()}` `` — the
//!   `${…}` holes are ordinary expressions (a06/a24/b08/d06);
//! - **scope**: arrow/function params (incl. destructuring — a
//!   `BindingIdentifier` in oxc, distinct from `IdentifierReference` reads),
//!   param defaults, block-body `const`/`let`, catch params, and function
//!   names all shadow correctly. Param-DEFAULT expressions are still
//!   rewritten (`(a = count) => a` → `(a = count()) => a`) — the legacy
//!   scanner over-collected those as shadows;
//! - **positions by construction**: member-expression properties and
//!   non-computed object keys are `IdentifierName` nodes — a different type
//!   from `IdentifierReference` — so they are never rewrite candidates; no
//!   heuristic bracket-stack needed. Object SHORTHAND `{ count }` (whose
//!   value IS an `IdentifierReference`) expands to `{ count: count() }` — a
//!   form the token rewriter could not express;
//! - **TS type positions** (`user as User`, `foo<T>(x)`): suppressed — type
//!   names are runtime-irrelevant and must never grow `()`.
//!
//! Deliberately NOT rewritten:
//! - a signal identifier already in CALLEE position (`count()`,
//!   `count?.()`, `new count()`) — already a call; still counted as a
//!   signal READ for the reactivity decision;
//! - assignment/update WRITE targets (`count = 1`, `count++` in `$on.*`
//!   handler position) — a write, not a read; splicing `()` would emit
//!   invalid JS. (The legacy scanner rewrote these into `count() = 1`;
//!   template-position signal writes go through setters/actions, so this
//!   divergence is strictly less broken.)
//!
//! CONTAINMENT RULE (plan §Risks 1): all oxc types stay inside `src/expr/`.
//!
//! `{#each}` alias shadowing (d03/d04) is NOT handled here by design: the
//! emitter threads alias scopes by handing the loop body a signal map with
//! the alias names REMOVED (see `codegen/emit.rs emit_each_block`), so the
//! rewrite itself stays a pure function of (expression, signal set).

use std::cell::Cell;
use std::collections::HashSet;

use crate::codegen::SignalMap;

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    BindingIdentifier, CallExpression, Expression, IdentifierReference, NewExpression,
    ObjectProperty, SimpleAssignmentTarget, TSType, TSTypeAnnotation, TSTypeParameterDeclaration,
    TSTypeParameterInstantiation,
};
use oxc_ast_visit::{walk, Visit};
use oxc_parser::Parser;
use oxc_span::SourceType;
use oxc_syntax::scope::{ScopeFlags, ScopeId};

/// Outcome of the AST rewrite over one captured template expression.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RewriteResult {
    /// The expression with `()` spliced after every unshadowed signal read
    /// (and object shorthand expanded). Byte-identical to the input when the
    /// expression reads no signal.
    pub source: String,
    /// True when the expression reads any registered signal AFTER shadowing
    /// is resolved — i.e. a rewrite happened, or a signal was read in an
    /// already-called position (`count()`). Drives the emitter's reactivity
    /// (thunk-vs-eager) decision alongside the legacy has-a-call heuristic.
    pub reads_signal: bool,
}

/// How a bare signal read is rewritten.
///
/// `Call` is the JS-emission form (`count` → `count()`) — the runtime reads a
/// getter. `CtxProperty` is the TYPE-CHECK form (#485 step 1/2): `count` →
/// `__aihu_ctx.count`, a property access on a declared VALUE view of the
/// signals. The distinction is load-bearing for step 2's narrowing: TypeScript
/// never narrows a call result (`if (user()) { user().name }` stays "possibly
/// null" — each call is a fresh value), but it does narrow a property chain
/// rooted in a const (`if (__aihu_ctx.user) { __aihu_ctx.user.name }`) — the
/// same reason vue-language-tools checks templates through `__VLS_ctx.x`
/// property accesses. A signal already in CALLEE position (`count()`) is left
/// alone in both styles — under `CtxProperty` it still resolves to the real
/// getter binding, so the authored call form keeps checking.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RewriteStyle {
    Call,
    CtxProperty,
}

/// The name of the declared value view the `CtxProperty` style rewrites onto.
/// The sidecar generator declares it as
/// `declare const __aihu_ctx: { <name>: ReturnType<typeof <name>>, … }`.
pub const TYPECHECK_CTX: &str = "__aihu_ctx";

/// Rewrite bare reads of registered reactive getters (the keys of
/// `signal_map`) to getter CALLS, scope-aware, via span edits over the oxc
/// AST. Returns `None` when the capture does not parse as a TS expression —
/// the caller falls back to the legacy token rewrite so emit never panics
/// (under `--expr-parser ast` such captures were already rejected with
/// C320/C321 by `expr::validate_template` before emit runs).
pub fn rewrite_signal_reads(source: &str, signal_map: &SignalMap) -> Option<RewriteResult> {
    rewrite_with_style(source, signal_map, RewriteStyle::Call)
}

/// #485 step 1 — the TYPE-CHECK rewrite: bare reads (and handler-position
/// writes/updates) of registered getters become `__aihu_ctx.<name>` property
/// accesses, so lifted template expressions check at the authored VALUE types
/// and step 2's real `if` blocks narrow them. Same scope model, same parse,
/// same `None`-on-unparseable contract as `rewrite_signal_reads`.
pub fn rewrite_signal_reads_typecheck(
    source: &str,
    signal_map: &SignalMap,
) -> Option<RewriteResult> {
    rewrite_with_style(source, signal_map, RewriteStyle::CtxProperty)
}

fn rewrite_with_style(
    source: &str,
    signal_map: &SignalMap,
    style: RewriteStyle,
) -> Option<RewriteResult> {
    if signal_map.0.is_empty() || source.trim().is_empty() {
        return Some(RewriteResult {
            source: source.to_string(),
            reads_signal: false,
        });
    }

    let allocator = Allocator::default();
    let parser = Parser::new(&allocator, source, SourceType::ts());
    let expr = parser.parse_expression().ok()?;

    let mut visitor = RewriteVisitor {
        signal_map,
        style,
        // Root frame: bindings introduced at the top level of the expression
        // itself (e.g. a named function expression's name).
        scopes: vec![HashSet::new()],
        edits: Vec::new(),
        reads_signal: false,
    };
    visitor.visit_expression(&expr);

    if visitor.edits.is_empty() {
        return Some(RewriteResult {
            source: source.to_string(),
            reads_signal: visitor.reads_signal,
        });
    }

    // Splice the edits back into the ORIGINAL source. Offsets are oxc spans —
    // UTF-8 byte offsets into `source` — so everything between edit points is
    // copied verbatim (comments, strings, multibyte text). `sort_by_key` is
    // stable; visitation order is already source order for a single pass.
    let mut edits = visitor.edits;
    edits.sort_by_key(|(offset, _)| *offset);
    let mut out = String::with_capacity(source.len() + edits.len() * 2);
    let mut copied_to = 0usize;
    for (offset, insertion) in edits {
        let offset = (offset as usize).min(source.len());
        out.push_str(&source[copied_to..offset]);
        out.push_str(&insertion);
        copied_to = offset;
    }
    out.push_str(&source[copied_to..]);

    Some(RewriteResult {
        source: out,
        reads_signal: true,
    })
}

struct RewriteVisitor<'m> {
    signal_map: &'m SignalMap,
    style: RewriteStyle,
    /// Lexical scope stack. A frame is pushed/popped by oxc's own
    /// `enter_scope`/`leave_scope` walk hooks (functions, arrows, blocks,
    /// catch clauses, for-heads, classes — every scope-carrying node), and
    /// filled by `visit_binding_identifier` (which fires exactly at binding
    /// positions: params incl. destructuring, `const`/`let`/`var`
    /// declarators, function/class names, catch params).
    scopes: Vec<HashSet<String>>,
    /// `(byte offset, text to insert)` — applied to the source afterwards.
    edits: Vec<(u32, String)>,
    reads_signal: bool,
}

impl RewriteVisitor<'_> {
    fn is_shadowed(&self, name: &str) -> bool {
        self.scopes.iter().rev().any(|frame| frame.contains(name))
    }

    /// True when `name` is a registered signal getter NOT shadowed by a
    /// lexical binding in the expression.
    fn is_signal_read(&self, name: &str) -> bool {
        self.signal_map.0.contains_key(name) && !self.is_shadowed(name)
    }
}

impl<'a> Visit<'a> for RewriteVisitor<'_> {
    // ─── Scope model ─────────────────────────────────────────────────────────
    fn enter_scope(&mut self, _flags: ScopeFlags, _scope_id: &Cell<Option<ScopeId>>) {
        self.scopes.push(HashSet::new());
    }

    fn leave_scope(&mut self) {
        self.scopes.pop();
    }

    fn visit_binding_identifier(&mut self, it: &BindingIdentifier<'a>) {
        if let Some(frame) = self.scopes.last_mut() {
            frame.insert(it.name.to_string());
        }
    }

    // ─── The rewrite ─────────────────────────────────────────────────────────
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        if self.is_signal_read(&it.name) {
            match self.style {
                RewriteStyle::Call => self.edits.push((it.span.end, "()".to_string())),
                RewriteStyle::CtxProperty => self
                    .edits
                    .push((it.span.start, format!("{}.", TYPECHECK_CTX))),
            }
            self.reads_signal = true;
        }
    }

    /// A signal in CALLEE position is already a call — no `()` splice (that
    /// would double-call), but it IS a signal read for reactivity purposes.
    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if let Expression::Identifier(id) = &it.callee {
            if self.is_signal_read(&id.name) {
                self.reads_signal = true;
            }
        } else {
            self.visit_expression(&it.callee);
        }
        // `type_arguments` is a TS type position — skipped (see the TS
        // suppressions below).
        self.visit_arguments(&it.arguments);
    }

    fn visit_new_expression(&mut self, it: &NewExpression<'a>) {
        if let Expression::Identifier(id) = &it.callee {
            if self.is_signal_read(&id.name) {
                self.reads_signal = true;
            }
        } else {
            self.visit_expression(&it.callee);
        }
        self.visit_arguments(&it.arguments);
    }

    /// Object SHORTHAND `{ count }`: key and value are the SAME source bytes
    /// (the value is an `IdentifierReference`), so the generic ident path
    /// would splice `{ count() }` — invalid. Expand to `{ count: count() }`
    /// instead. Non-shorthand properties take the default walk (a
    /// non-computed key is an `IdentifierName` — never a rewrite candidate;
    /// a computed `[expr]` key is walked as an ordinary expression).
    fn visit_object_property(&mut self, it: &ObjectProperty<'a>) {
        if it.shorthand {
            if let Expression::Identifier(id) = &it.value {
                if self.is_signal_read(&id.name) {
                    match self.style {
                        RewriteStyle::Call => {
                            self.edits.push((id.span.end, format!(": {}()", id.name)));
                        }
                        RewriteStyle::CtxProperty => {
                            self.edits
                                .push((id.span.end, format!(": {}.{}", TYPECHECK_CTX, id.name)));
                        }
                    }
                    self.reads_signal = true;
                }
            }
            return;
        }
        walk::walk_object_property(self, it);
    }

    /// Assignment/update WRITE targets (`count = 1`, `count++` — legal at the
    /// root only in `$on.*` handler position, per the W2 contract check) are
    /// writes, not reads: never splice `()` onto them (that would emit invalid
    /// JS). Under `CtxProperty` the target IS redirected onto the value view
    /// (`__aihu_ctx.count = 1`) so a handler write type-checks against the
    /// authored value type instead of TS2588-ing on the const getter binding.
    /// Non-identifier targets (member expressions, TS wrappers) still walk —
    /// their OBJECT part is a read (`user.name = 1` reads `user`).
    fn visit_simple_assignment_target(&mut self, it: &SimpleAssignmentTarget<'a>) {
        if let SimpleAssignmentTarget::AssignmentTargetIdentifier(id) = it {
            if self.style == RewriteStyle::CtxProperty && self.is_signal_read(&id.name) {
                self.edits
                    .push((id.span.start, format!("{}.", TYPECHECK_CTX)));
                self.reads_signal = true;
            }
            return;
        }
        walk::walk_simple_assignment_target(self, it);
    }

    // ─── TS type positions — runtime-irrelevant, never rewritten ────────────
    // TSTypeName wraps IdentifierReference, so without these suppressions a
    // signal-named TYPE (`user as User` with a `User` signal) would grow `()`.
    fn visit_ts_type(&mut self, _it: &TSType<'a>) {}
    fn visit_ts_type_annotation(&mut self, _it: &TSTypeAnnotation<'a>) {}
    fn visit_ts_type_parameter_instantiation(&mut self, _it: &TSTypeParameterInstantiation<'a>) {}
    fn visit_ts_type_parameter_declaration(&mut self, _it: &TSTypeParameterDeclaration<'a>) {}
}

// ─── Unit tests — the truth-table rows at rewrite level ─────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// SignalMap with getters `count`/`items`/`nums`/`obj`/`user` (setters
    /// irrelevant to the rewrite) — mirrors the plan harness state.
    fn signals() -> SignalMap {
        let mut map = SignalMap::default();
        for (g, s) in [
            ("count", "setCount"),
            ("items", "setItems"),
            ("nums", "setNums"),
            ("obj", "setObj"),
            ("user", "setUser"),
        ] {
            map.insert_signal(g, s);
        }
        map
    }

    fn rw(src: &str) -> RewriteResult {
        rewrite_signal_reads(src, &signals()).expect("expression must parse")
    }

    #[test]
    fn plain_reads_and_member_bases() {
        assert_eq!(rw("count + 1").source, "count() + 1");
        assert_eq!(rw("user.name").source, "user().name");
        assert_eq!(rw("user?.name").source, "user()?.name");
        assert_eq!(rw("count > 0 ? count : 0").source, "count() > 0 ? count() : 0");
    }

    #[test]
    fn spread_is_rewritten() {
        // a10 / a11 / a12 / b04 / c12 — the founder's original bug class.
        assert_eq!(rw("Math.max(...nums)").source, "Math.max(...nums())");
        assert_eq!(rw("[...items, extra].length").source, "[...items(), extra].length");
        assert_eq!(rw("{ ...obj, b: 2 }.b").source, "{ ...obj(), b: 2 }.b");
        assert_eq!(rw("[...items, 'x']").source, "[...items(), 'x']");
    }

    #[test]
    fn template_literal_holes_are_rewritten() {
        // a06 / a24 / b08 / d06.
        assert_eq!(rw("`Count: ${count}`").source, "`Count: ${count()}`");
        assert_eq!(
            rw("`n=${count} of ${items.length}`").source,
            "`n=${count()} of ${items().length}`"
        );
        // Nested holes.
        assert_eq!(rw("`a${`b${count}`}`").source, "`a${`b${count()}`}`");
        assert!(rw("`Count: ${count}`").reads_signal);
    }

    #[test]
    fn arrow_bodies_and_params() {
        // d01 — the dotted-base fast path used to copy this verbatim.
        assert_eq!(
            rw("items.filter(i => i > count).length").source,
            "items().filter(i => i > count()).length"
        );
        // Param shadows suppress the rewrite (a22).
        assert_eq!(
            rw("items.map(count => count + 1).join('')").source,
            "items().map(count => count + 1).join('')"
        );
        // Destructured params shadow precisely (d10)…
        assert_eq!(rw("items.map(({ x }) => x)").source, "items().map(({ x }) => x)");
        // …and param DEFAULTS are still rewritten (the legacy scanner
        // over-collected `count` here as a shadow and missed the read).
        assert_eq!(rw("(a = count) => a").source, "(a = count()) => a");
        // Block-bodied arrow: local const shadows below, outer read above.
        assert_eq!(
            rw("() => { const count = 1; return count }").source,
            "() => { const count = 1; return count }"
        );
        assert_eq!(
            rw("(e) => { const x = count; return x }").source,
            "(e) => { const x = count(); return x }"
        );
    }

    #[test]
    fn callee_positions_are_not_double_called() {
        let r = rw("count()");
        assert_eq!(r.source, "count()");
        assert!(r.reads_signal, "a called signal is still a signal READ");
        assert_eq!(rw("items.map(i => i)").source, "items().map(i => i)");
        // The shipped fellwork-web workaround must survive (FEL-172 test).
        assert_eq!(rw("section().data").source, "section().data");
    }

    #[test]
    fn object_keys_and_shorthand() {
        // Keys are IdentifierName — untouched by construction (a23).
        assert_eq!(rw("JSON.stringify({ count: 1 })").source, "JSON.stringify({ count: 1 })");
        // Shorthand expands — a form the token rewriter could not express.
        assert_eq!(rw("JSON.stringify({ count })").source, "JSON.stringify({ count: count() })");
        // Computed keys are reads.
        assert_eq!(rw("({ [count]: 1 })").source, "({ [count()]: 1 })");
    }

    #[test]
    fn member_properties_and_strings_untouched() {
        assert_eq!(rw("state.count").source, "state.count");
        assert_eq!(rw("obj.items.count").source, "obj().items.count");
        assert_eq!(rw("'count' + \"items\"").source, "'count' + \"items\"");
        assert_eq!(rw("`count`").source, "`count`");
        // Regex literals (a16's class) — no identifier inside.
        assert_eq!(rw("/^a/.test(user.name) ? 1 : 0").source, "/^a/.test(user().name) ? 1 : 0");
    }

    #[test]
    fn ts_type_positions_untouched() {
        assert_eq!(rw("(user as User).name").source, "(user() as User).name");
        assert_eq!(rw("user!.name").source, "user()!.name");
        // A signal-NAMED type must not be called.
        let mut map = SignalMap::default();
        map.insert_signal("User", "setUser");
        let r = rewrite_signal_reads("(x as User)", &map).unwrap();
        assert_eq!(r.source, "(x as User)");
        assert!(!r.reads_signal);
    }

    #[test]
    fn write_targets_are_not_reads() {
        // Handler-position writes: never `count() = 1`.
        assert_eq!(rw("() => count = 1").source, "() => count = 1");
        assert_eq!(rw("() => count++").source, "() => count++");
        // Compound writes still rewrite the READ side of the RHS.
        assert_eq!(rw("() => count = count + 1").source, "() => count = count() + 1");
        // Member writes read their object.
        assert_eq!(rw("() => user.name = 'x'").source, "() => user().name = 'x'");
    }

    #[test]
    fn reads_signal_flag() {
        assert!(rw("count").reads_signal);
        assert!(rw("`${count}`").reads_signal);
        assert!(rw("JSON.stringify({ count })").reads_signal);
        assert!(!rw("extra + 1").reads_signal);
        assert!(!rw("new Date().getFullYear()").reads_signal);
        // The member BASE is an outer read; the param-shadowed body is not.
        let r = rw("items.map(items => items)");
        assert_eq!(r.source, "items().map(items => items)");
        assert!(r.reads_signal);
        // Fully shadowed: no outer signal read at all.
        assert!(!rw("[1, 2].map(items => items)").reads_signal, "fully shadowed");
    }

    #[test]
    fn multibyte_source_is_preserved() {
        assert_eq!(
            rw("`שלום ${count} κόσμος`").source,
            "`שלום ${count()} κόσμος`"
        );
    }

    #[test]
    fn unparseable_falls_back_to_none() {
        assert_eq!(rewrite_signal_reads("count +", &signals()), None);
    }

    #[test]
    fn empty_and_signal_free_are_identity() {
        let r = rewrite_signal_reads("  ", &signals()).unwrap();
        assert_eq!(r.source, "  ");
        assert!(!r.reads_signal);
        let empty_map = SignalMap::default();
        let r = rewrite_signal_reads("count + 1", &empty_map).unwrap();
        assert_eq!(r.source, "count + 1");
    }
}
