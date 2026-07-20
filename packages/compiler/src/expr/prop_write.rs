//! CO1 — `$prop` WRITE rewriting: scope-aware, AST-driven, span-spliced.
//!
//! A `$prop:` entry lowers to `const <name> = ctx.props.<name>` — a callable
//! getter carrying a `.set` writer (`packages/runtime/src/define-component.ts`).
//! `$action` / `$lifecycle` / `$effect` bodies are spliced VERBATIM into the
//! emitted function, so an authored `count++` emits an assignment to a `const`
//! and throws `TypeError: Assignment to constant variable` on first click.
//!
//! This module rewrites those writes to the `.set(…)` form. Reads are NOT
//! touched — `count()` and bare `count` pass through byte-identical (spec
//! §4.9); the bare-read defect is a separate slice.
//!
//! CONTAINMENT RULE (mirrors `expr/rewrite.rs`): all oxc types stay inside
//! `src/expr/`. `codegen/emit.rs` sees only `String -> String`.
//!
//! ## Why an AST and not a scanner
//!
//! A string scanner cannot see shadowing at all — the primary over-application
//! guard — and corrupts regex literals (`/^www\./`) and template-literal
//! `${…}` holes. A wrongly-rewritten shadowed local emits `.set` on a number,
//! which PASSES a parse check and fails only at runtime, so parse-checking
//! alone cannot catch over-application.
//!
//! ## Parse strategy (spec §4.2) — see [`super::handler_parse`]
//!
//! A macro body is a STATEMENT LIST, not an expression, so `parse_expression`
//! does not apply. The body is wrapped in a synthetic function and parsed as a
//! Program. That wrapper, its span arithmetic, and the signature extraction
//! built on it now live in [`super::handler_parse`], because DE5 (typed MCP
//! parameter schemas) must read the SAME handler signature this module
//! rewrites through — two parsers over one signature would be a "kept in sync"
//! seam, which thesis §2 (Derived) forbids.
//!
//! ```text
//! {async }function __aihu_pw(<params>) {
//! <body>
//! }
//! ```
//!
//! Three things fall out free: the enclosing arrow's params become real
//! bindings shadowed by oxc's scope model (the shadow lives OUTSIDE the body
//! text, in `arrow_args` — a transform parsing the body alone silently
//! corrupts `(count) => { count = 5 }`); `return`/`await` parse legally; and
//! TS-typed params (`(h: number)`) parse, which macro-test and todo-mvc need.
//!
//! Edits are span-based splices into the ORIGINAL body text. Nothing is
//! reprinted from the AST, so comments, strings and multibyte glyphs survive
//! verbatim. Parse failure returns `Ok(None)` — emit must never panic on a
//! body the parser cannot model, and the pass is strictly non-regressive.

use std::cell::Cell;
use std::collections::{HashMap, HashSet};

use crate::types::CompileError;

use oxc_ast::ast::{
    AssignmentExpression, AssignmentOperator, AssignmentTarget, BindingIdentifier, Expression,
    ForInStatement, ForOfStatement, ForStatementLeft, IdentifierReference, SimpleAssignmentTarget,
    Statement, TSType, TSTypeAnnotation, TSTypeParameterDeclaration, TSTypeParameterInstantiation,
    UpdateExpression, UpdateOperator, VariableDeclaration, VariableDeclarationKind,
};
use oxc_ast_visit::{walk, Visit};
use oxc_span::GetSpan;
use oxc_syntax::scope::{ScopeFlags, ScopeId};

// The synthetic-function-wrapper parse lives in `handler_parse` (DE5 shares it).
use super::handler_parse::HandlerSource;

/// Names declared by `$prop:` in this component, mapped to whether the entry's
/// `default:` is a NUMERIC LITERAL.
///
/// NOT the `SignalMap` (spec §6.1): `process_state_body` registers prop names
/// into `signal_map` alongside real `$computed` entries and lifted `signal()`
/// bindings, so keying off it would rewrite a plain writable `let` and break
/// working code. The key set is `collect_prop_entries` only.
///
/// The bool drives the §4.5 `++`/`--` inline fast path: a numeric-literal
/// `default:` proves `ToNumeric` is identity for that prop.
pub struct PropWriteTargets<'a> {
    pub props: &'a HashMap<String, bool>,
}

/// Outcome of the rewrite over one macro body.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PropWriteResult {
    /// Body with writes rewritten. Byte-identical outside edited spans.
    pub source: String,
    /// True when any emitted form calls `__aihu_prop_upd`; the emitter lazily
    /// declares that helper once (spec §4.5).
    pub needs_update_helper: bool,
}

/// Rewrite writes to `$prop` bindings inside one macro body.
///
/// * `body`     — macro body text as authored (post-`arrow_body`, PRE-`$announce`
///                replace: that replace is a raw string substitution which
///                invalidates byte offsets, so it must run AFTER this — spec §4.11).
/// * `params`   — the enclosing arrow's params from `arrow_args`; seeds the
///                outermost shadow frame (spec §4.6, the primary guard).
/// * `is_async` — from `arrow_is_async`; parses the wrapper as async so `await`
///                in the body is not a syntax error.
///
/// `Ok(None)`  = nothing to do; the caller splices `body` unchanged (byte-identical).
/// `Err(…)`    = C560 (destructuring / for-of / for-in target is a `$prop`).
pub fn rewrite_prop_writes(
    body: &str,
    params: &str,
    is_async: bool,
    targets: &PropWriteTargets<'_>,
) -> Result<Option<PropWriteResult>, CompileError> {
    if targets.props.is_empty() || body.trim().is_empty() {
        return Ok(None);
    }

    let wrapped = HandlerSource::wrap(body, params, is_async);

    let allocator = oxc_allocator::Allocator::default();
    // Parse failure -> Ok(None). Strictly non-regressive: emit never panics on
    // a body oxc cannot model, it just leaves it exactly as authored.
    let Some(parsed) = wrapped.parse(&allocator) else {
        return Ok(None);
    };

    let mut visitor = PropWriteVisitor::new(wrapped.source(), targets);
    // `var` / function-declaration hoisting (spec §4.6): a function-scoped
    // `var count` shadows the prop across the WHOLE body, including textually
    // before its declaration. Seed those names before walking.
    visitor.hoisted = collect_hoisted_shadows(&parsed.program.body);
    visitor.visit_program(&parsed.program);

    if let Some(err) = visitor.error {
        return Err(err);
    }
    for name in &visitor.member_write_warnings {
        crate::diagnostics::emit_warning(&member_write_warning(name));
    }

    let mut edits: Vec<Edit> = visitor
        .edits
        .into_iter()
        .filter(|e| wrapped.span_in_body(e.start, e.end))
        .map(|e| Edit {
            start: e.start - wrapped.body_start(),
            end: e.end - wrapped.body_start(),
            text: e.text,
        })
        .collect();

    if edits.is_empty() {
        return Ok(None);
    }

    edits.sort_by_key(|e| (e.start, e.end));
    let mut out = String::with_capacity(body.len() + 32);
    let mut copied_to = 0usize;
    let mut needs_update_helper = false;
    for edit in edits {
        // Drop any edit fully contained in one already applied. This can only
        // arise from a prop write nested inside another prop write's RHS
        // (`count = (other = 1)`), which no fixture uses; the outer rewrite
        // wins and the inner keeps today's behaviour.
        if edit.start < copied_to {
            continue;
        }
        out.push_str(&body[copied_to..edit.start]);
        if edit.text.contains(UPDATE_HELPER_NAME) {
            needs_update_helper = true;
        }
        out.push_str(&edit.text);
        copied_to = edit.end;
    }
    out.push_str(&body[copied_to..]);

    Ok(Some(PropWriteResult {
        source: out,
        needs_update_helper,
    }))
}

/// Detect-only pass: the names of `$prop`s written inside `body`, ignoring
/// C560 shapes (which are reported as writes too — a destructuring write is
/// still a write). Used by the `$computed` / `$resource` C561 check, where the
/// answer is "is there a write at all", not "what should it become".
pub fn detect_prop_writes(
    body: &str,
    params: &str,
    is_async: bool,
    prop_names: &HashSet<String>,
) -> Vec<String> {
    if prop_names.is_empty() || body.trim().is_empty() {
        return Vec::new();
    }
    let props: HashMap<String, bool> = prop_names.iter().map(|n| (n.clone(), false)).collect();
    let targets = PropWriteTargets { props: &props };

    let wrapped = HandlerSource::wrap(body, params, is_async);
    let allocator = oxc_allocator::Allocator::default();
    let Some(parsed) = wrapped.parse(&allocator) else {
        return Vec::new();
    };

    let mut visitor = PropWriteVisitor::new(wrapped.source(), &targets);
    visitor.detect_only = true;
    visitor.hoisted = collect_hoisted_shadows(&parsed.program.body);
    visitor.visit_program(&parsed.program);

    let mut seen: Vec<String> = Vec::new();
    for (offset, name) in visitor.written {
        if wrapped.to_body_offset(offset).is_some() && !seen.contains(&name) {
            seen.push(name);
        }
    }
    seen
}

/// **W562** — `count.foo = x` where `count` is a `$prop`.
///
/// Not rewritten, by design (spec §4.8): this is a member assignment, not an
/// assignment to the prop binding. Today it sets a property on the getter
/// FUNCTION OBJECT — almost certainly not what the author meant — but it is
/// legal JS that does not throw, and rewriting it to `count().foo = x` would
/// be a READ rewrite, which the founder's decision excludes from CO1. So it
/// warns rather than erroring, and the warning carries the machine rewrite.
///
/// Built as a `CompileError` and rendered through `crate::diagnostics` so it
/// gets the same `hint:` / `fix:` / `replace:` / `with:` shape as C560/C561
/// rather than the bare one-line `eprintln!` it originally shipped as.
fn member_write_warning(name: &str) -> CompileError {
    CompileError {
        message: format!(
            "`{name}.… = …` writes a property on the `{name}` getter function, not the `$prop` \
             value."
        ),
        line: 0,
        col: 0,
        code: Some("W562".to_string()),
        hint: Some(format!(
            "a `$prop` binding is a callable getter carrying a `.set` writer; assigning a member \
             on it mutates the function object, so the component never re-renders and the prop \
             value is unchanged"
        )),
        fix: Some(format!(
            "write the whole prop value through `.set(…)`, deriving it from the current value"
        )),
        from: Some(format!("{name}.foo = x")),
        to: Some(format!("{name}.set({{ ...{name}(), foo: x }})")),
        ..Default::default()
    }
}

/// The lazily-emitted module helper for `++`/`--` outside the fast path.
pub const UPDATE_HELPER_NAME: &str = "__aihu_prop_upd";

/// `x++` is NOT `x = x + 1` — it is `x = ToNumeric(x) + 1`, returning the OLD
/// numeric value. A `$prop` can genuinely hold a string (`type:` is discarded
/// by the emitter, and with no `default:` an attribute falls through to
/// `JSON.parse`, so `"05"` stays a string), on which the naive rewrite would
/// store `"51"` instead of `6`. One call form covers prefix/postfix and both
/// positions, so no position analysis is needed for the general case.
pub const UPDATE_HELPER_DECL: &str = "const __aihu_prop_upd = (s, d, n) => { const o = s(); const c = typeof o === 'bigint' ? o : Number(o); const v = c + (typeof c === 'bigint' ? BigInt(d) : d); s.set(v); return n ? v : c; };";

// ─── internals ───────────────────────────────────────────────────────────────

struct Edit {
    start: usize,
    end: usize,
    text: String,
}

/// Collect `var` and function-declaration names from the WRAPPER function's own
/// scope, without descending into nested functions or arrows (whose `var`s are
/// scoped to themselves and do not shadow here).
fn collect_hoisted_shadows(program_body: &[Statement<'_>]) -> HashSet<String> {
    let mut out = HashSet::new();
    for stmt in program_body {
        if let Statement::FunctionDeclaration(func) = stmt {
            if let Some(body) = &func.body {
                collect_hoisted_in(&body.statements, &mut out);
            }
        }
    }
    out
}

fn collect_hoisted_in(stmts: &[Statement<'_>], out: &mut HashSet<String>) {
    for stmt in stmts {
        match stmt {
            Statement::VariableDeclaration(decl) if decl.kind == VariableDeclarationKind::Var => {
                collect_var_names(decl, out);
            }
            Statement::FunctionDeclaration(func) => {
                if let Some(id) = &func.id {
                    out.insert(id.name.to_string());
                }
                // Do NOT descend: a nested function's `var`s are its own.
            }
            Statement::BlockStatement(b) => collect_hoisted_in(&b.body, out),
            Statement::IfStatement(s) => {
                collect_hoisted_in(std::slice::from_ref(&s.consequent), out);
                if let Some(alt) = &s.alternate {
                    collect_hoisted_in(std::slice::from_ref(alt), out);
                }
            }
            Statement::ForStatement(s) => collect_hoisted_in(std::slice::from_ref(&s.body), out),
            Statement::ForInStatement(s) => collect_hoisted_in(std::slice::from_ref(&s.body), out),
            Statement::ForOfStatement(s) => collect_hoisted_in(std::slice::from_ref(&s.body), out),
            Statement::WhileStatement(s) => collect_hoisted_in(std::slice::from_ref(&s.body), out),
            Statement::DoWhileStatement(s) => collect_hoisted_in(std::slice::from_ref(&s.body), out),
            Statement::TryStatement(s) => {
                collect_hoisted_in(&s.block.body, out);
                if let Some(h) = &s.handler {
                    collect_hoisted_in(&h.body.body, out);
                }
                if let Some(f) = &s.finalizer {
                    collect_hoisted_in(&f.body, out);
                }
            }
            Statement::SwitchStatement(s) => {
                for case in &s.cases {
                    collect_hoisted_in(&case.consequent, out);
                }
            }
            Statement::LabeledStatement(s) => collect_hoisted_in(std::slice::from_ref(&s.body), out),
            _ => {}
        }
    }
}

/// Collect the binding names introduced by a `var` declaration, including
/// destructuring patterns. A `Visit` pass is used rather than matching
/// `BindingPatternKind` by hand: `visit_binding_identifier` fires at exactly
/// the binding positions, and suppressing `visit_expression` keeps initializer
/// READS out of the set.
fn collect_var_names(decl: &VariableDeclaration<'_>, out: &mut HashSet<String>) {
    struct C<'o>(&'o mut HashSet<String>);
    impl<'a> Visit<'a> for C<'_> {
        fn visit_binding_identifier(&mut self, it: &BindingIdentifier<'a>) {
            self.0.insert(it.name.to_string());
        }
        fn visit_expression(&mut self, _it: &Expression<'a>) {}
    }
    C(out).visit_variable_declaration(decl);
}

/// The `$prop`-named LEAF TARGETS of an assignment target — the identifiers a
/// destructuring assignment would actually write.
///
/// `visit_expression` is suppressed so default values (`[a = count] = arr`) and
/// computed member keys are NOT collected: those are reads, and flagging them
/// as C560 would reject working code. Member targets (`obj.count`) reach their
/// object through `Expression` too, so they fall out by the same suppression.
fn collect_target_leaves(target: &AssignmentTarget<'_>) -> Vec<(u32, String)> {
    let mut out = Vec::new();
    {
        struct C<'o>(&'o mut Vec<(u32, String)>);
        impl<'a> Visit<'a> for C<'_> {
            fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
                self.0.push((it.span.start, it.name.to_string()));
            }
            fn visit_expression(&mut self, _it: &Expression<'a>) {}
        }
        C(&mut out).visit_assignment_target(target);
    }
    out
}

/// Same, for a `for (… of/in …)` head. A `VariableDeclaration` head introduces
/// NEW bindings (`for (const count of …)`), whose leaves are
/// `BindingIdentifier`s — not collected here, so a declaring head is correctly
/// treated as a shadow rather than a write.
fn collect_for_left_leaves(left: &ForStatementLeft<'_>) -> Vec<(u32, String)> {
    let mut out = Vec::new();
    {
        struct C<'o>(&'o mut Vec<(u32, String)>);
        impl<'a> Visit<'a> for C<'_> {
            fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
                self.0.push((it.span.start, it.name.to_string()));
            }
            fn visit_expression(&mut self, _it: &Expression<'a>) {}
        }
        C(&mut out).visit_for_statement_left(left);
    }
    out
}

struct PropWriteVisitor<'s, 't> {
    src: &'s str,
    targets: &'t PropWriteTargets<'t>,
    /// Lexical scope stack, driven by oxc's own `enter_scope`/`leave_scope`
    /// hooks and filled by `visit_binding_identifier` — which fires exactly at
    /// binding positions (params incl. destructuring, declarators, function
    /// and class names, catch params).
    scopes: Vec<HashSet<String>>,
    /// Function-scoped `var` / function-decl names (spec §4.6 mitigation).
    hoisted: HashSet<String>,
    /// Spans of expressions that ARE a whole `ExpressionStatement` — the
    /// "statement position" of the §4.4 table, where a return value is
    /// provably discarded.
    stmt_expr_spans: HashSet<(u32, u32)>,
    edits: Vec<Edit>,
    /// `(offset, prop name)` of every detected write; drives `detect_prop_writes`.
    written: Vec<(usize, String)>,
    member_write_warnings: Vec<String>,
    error: Option<CompileError>,
    detect_only: bool,
}

impl<'s, 't> PropWriteVisitor<'s, 't> {
    fn new(src: &'s str, targets: &'t PropWriteTargets<'t>) -> Self {
        Self {
            src,
            targets,
            scopes: vec![HashSet::new()],
            hoisted: HashSet::new(),
            stmt_expr_spans: HashSet::new(),
            edits: Vec::new(),
            written: Vec::new(),
            member_write_warnings: Vec::new(),
            error: None,
            detect_only: false,
        }
    }

    fn is_shadowed(&self, name: &str) -> bool {
        self.hoisted.contains(name) || self.scopes.iter().rev().any(|f| f.contains(name))
    }

    /// True when `name` is a `$prop` NOT shadowed by a lexical binding.
    fn is_prop(&self, name: &str) -> bool {
        self.targets.props.contains_key(name) && !self.is_shadowed(name)
    }

    /// True when the prop's `default:` is a numeric literal — the §4.5 proof
    /// obligation for the `++`/`--` inline fast path.
    fn has_numeric_default(&self, name: &str) -> bool {
        self.targets.props.get(name).copied().unwrap_or(false)
    }

    fn text(&self, start: u32, end: u32) -> &str {
        &self.src[start as usize..end as usize]
    }

    fn is_stmt_position(&self, span: (u32, u32)) -> bool {
        self.stmt_expr_spans.contains(&span)
    }

    fn push_edit(&mut self, start: u32, end: u32, text: String) {
        if self.detect_only {
            return;
        }
        self.edits.push(Edit {
            start: start as usize,
            end: end as usize,
            text,
        });
    }

    fn record_write(&mut self, offset: u32, name: &str) {
        self.written.push((offset as usize, name.to_string()));
    }

    fn c560(&mut self, name: &str, form: &str) {
        if self.error.is_some() {
            return;
        }
        self.error = Some(CompileError {
            message: format!(
                "C560: cannot {form} into `$prop` `{name}` — props are written through \
                 `{name}.set(…)`."
            ),
            line: 0,
            col: 0,
            code: Some("C560".to_string()),
            hint: Some(format!(
                "a `$prop` binding is a callable getter carrying a `.set` writer, not an \
                 assignable variable; a destructuring target cannot be rewritten soundly \
                 without a temporary"
            )),
            fix: Some(format!(
                "bind to a temporary first, then write the prop: \
                 `const [__t] = …; {name}.set(__t)`"
            )),
            from: Some(format!("[{name}] = …")),
            to: Some(format!("{name}.set(…)")),
            ..Default::default()
        });
    }

    /// C560: a destructuring assignment whose leaf target is a `$prop`.
    ///
    /// Not rewritten, by design (spec §4.7) — this is the one genuinely
    /// unsound rewrite. A sound desugar needs a temporary
    /// (`{ const [__t0] = arr; count.set(__t0) }`) because `arr` may be any
    /// iterable, so `arr[0]` is NOT equivalent; and a block statement cannot be
    /// spliced into expression position, which this emitter has no facility to
    /// split. Zero fixtures use the form, and doing nothing would emit the
    /// exact defect under repair — so it is a loud error with a fix hint.
    fn flag_destructuring_targets(&mut self, leaves: Vec<(u32, String)>, form: &str) {
        for (offset, name) in leaves {
            if self.is_prop(&name) {
                self.record_write(offset, &name);
                self.c560(&name, form);
            }
        }
    }
}

/// Binary operator text for a compound assignment. `None` for `=` and for the
/// three logical forms, which take their own short-circuiting shapes.
fn compound_op(op: AssignmentOperator) -> Option<&'static str> {
    use AssignmentOperator as O;
    Some(match op {
        O::Addition => "+",
        O::Subtraction => "-",
        O::Multiplication => "*",
        O::Division => "/",
        O::Remainder => "%",
        O::Exponential => "**",
        O::ShiftLeft => "<<",
        O::ShiftRight => ">>",
        O::ShiftRightZeroFill => ">>>",
        O::BitwiseAnd => "&",
        O::BitwiseOR => "|",
        O::BitwiseXOR => "^",
        _ => return None,
    })
}

impl<'a> Visit<'a> for PropWriteVisitor<'_, '_> {
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

    // ─── Statement-position tracking ─────────────────────────────────────────
    fn visit_expression_statement(&mut self, it: &oxc_ast::ast::ExpressionStatement<'a>) {
        let span = it.expression.span();
        self.stmt_expr_spans.insert((span.start, span.end));
        walk::walk_expression_statement(self, it);
    }

    // ─── The rewrite ─────────────────────────────────────────────────────────
    fn visit_assignment_expression(&mut self, it: &AssignmentExpression<'a>) {
        // Always walk the RHS first so nested writes inside it are seen.
        self.visit_expression(&it.right);

        match &it.left {
            AssignmentTarget::AssignmentTargetIdentifier(id) if self.is_prop(&id.name) => {
                let name = id.name.to_string();
                self.record_write(id.span.start, &name);
                let rhs = self.text(it.right.span().start, it.right.span().end).to_string();
                let stmt = self.is_stmt_position((it.span.start, it.span.end));

                let set_call = match it.operator {
                    AssignmentOperator::Assign => format!("{name}.set({rhs})"),
                    // `a OP= b` is defined as `a = a OP b` with no coercion
                    // step, so this is exact — string concatenation included.
                    op if compound_op(op).is_some() => {
                        let bop = compound_op(op).unwrap();
                        // Parenthesize the RHS: `count *= a + b` must become
                        // `count.set(count() * (a + b))`, not `… * a + b`.
                        format!("{name}.set({name}() {bop} ({rhs}))")
                    }
                    // Logical assignment must PRESERVE SHORT-CIRCUITING. The
                    // naive `count.set(count() || rhs)` evaluates `rhs`
                    // unconditionally AND writes on every call, firing
                    // reactivity where the language specifies no assignment.
                    // `count()` is a pure getter, so calling it twice is free.
                    AssignmentOperator::LogicalOr => {
                        let out = format!("({name}() || ({name}.set({rhs}), {name}()))");
                        self.push_edit(it.span.start, it.span.end, out);
                        return;
                    }
                    AssignmentOperator::LogicalAnd => {
                        let out = format!("({name}() && ({name}.set({rhs}), {name}()))");
                        self.push_edit(it.span.start, it.span.end, out);
                        return;
                    }
                    AssignmentOperator::LogicalNullish => {
                        let out = format!("({name}() ?? ({name}.set({rhs}), {name}()))");
                        self.push_edit(it.span.start, it.span.end, out);
                        return;
                    }
                    _ => return,
                };

                // In expression position the assignment's VALUE is observed, so
                // re-read after writing. `.set` returns void.
                let out = if stmt {
                    set_call
                } else {
                    format!("({set_call}, {name}())")
                };
                self.push_edit(it.span.start, it.span.end, out);
            }
            // `obj.count = x` and `count.foo = x`: the target is a member
            // expression, never a candidate — this falls out by construction,
            // no heuristic. `count.foo = x` where `count` IS a prop sets a
            // property on the getter FUNCTION OBJECT, which is almost certainly
            // unintended; warn, but do not rewrite (rewriting to
            // `count().foo = x` would be a READ rewrite, out of scope).
            AssignmentTarget::StaticMemberExpression(_)
            | AssignmentTarget::ComputedMemberExpression(_) => {
                if let Some(base) = member_base_identifier(&it.left) {
                    if self.is_prop(&base) && !self.member_write_warnings.contains(&base) {
                        self.member_write_warnings.push(base);
                    }
                }
                walk::walk_assignment_target(self, &it.left);
            }
            AssignmentTarget::ArrayAssignmentTarget(_)
            | AssignmentTarget::ObjectAssignmentTarget(_) => {
                let leaves = collect_target_leaves(&it.left);
                self.flag_destructuring_targets(leaves, "destructure");
                walk::walk_assignment_target(self, &it.left);
            }
            _ => walk::walk_assignment_target(self, &it.left),
        }
    }

    fn visit_update_expression(&mut self, it: &UpdateExpression<'a>) {
        let SimpleAssignmentTarget::AssignmentTargetIdentifier(id) = &it.argument else {
            walk::walk_update_expression(self, it);
            return;
        };
        if !self.is_prop(&id.name) {
            return;
        }
        let name = id.name.to_string();
        self.record_write(id.span.start, &name);
        let delta = if it.operator == UpdateOperator::Increment { 1 } else { -1 };
        let stmt = self.is_stmt_position((it.span.start, it.span.end));

        // FAST PATH (spec §4.5) — fires only when BOTH hold: (a) statement
        // position, so the return value is provably discarded; and (b) the
        // prop declares a numeric-literal `default:`, so `ToNumeric` is
        // provably identity. `aihu-counter` satisfies both, so the headline
        // fixture emits the clean form and never loads the helper.
        // Per the §4.4 table the fast path is POSTFIX only (rows D1/D2);
        // `++count` takes the helper in every position (row D4).
        let out = if stmt && !it.prefix && self.has_numeric_default(&name) {
            let bop = if delta == 1 { "+" } else { "-" };
            format!("{name}.set({name}() {bop} 1)")
        } else {
            format!(
                "{UPDATE_HELPER_NAME}({name}, {delta}, {})",
                if it.prefix { "true" } else { "false" }
            )
        };
        self.push_edit(it.span.start, it.span.end, out);
    }

    // ─── `for (count of …)` / `for (count in …)` — C560 ──────────────────────
    fn visit_for_of_statement(&mut self, it: &ForOfStatement<'a>) {
        let leaves = collect_for_left_leaves(&it.left);
        self.flag_destructuring_targets(leaves, "iterate");
        walk::walk_for_of_statement(self, it);
    }

    fn visit_for_in_statement(&mut self, it: &ForInStatement<'a>) {
        let leaves = collect_for_left_leaves(&it.left);
        self.flag_destructuring_targets(leaves, "iterate");
        walk::walk_for_in_statement(self, it);
    }

    // ─── TS type positions — runtime-irrelevant, never rewritten ────────────
    fn visit_ts_type(&mut self, _it: &TSType<'a>) {}
    fn visit_ts_type_annotation(&mut self, _it: &TSTypeAnnotation<'a>) {}
    fn visit_ts_type_parameter_instantiation(&mut self, _it: &TSTypeParameterInstantiation<'a>) {}
    fn visit_ts_type_parameter_declaration(&mut self, _it: &TSTypeParameterDeclaration<'a>) {}

    // Reads are NEVER touched (spec §4.9): the visitor inspects only
    // `AssignmentExpression.left` and `UpdateExpression.argument`. `count()`
    // and bare `count` pass through byte-identical.
    fn visit_identifier_reference(&mut self, _it: &IdentifierReference<'a>) {}
}

fn member_base_identifier(target: &AssignmentTarget<'_>) -> Option<String> {
    match target {
        AssignmentTarget::StaticMemberExpression(m) => match &m.object {
            Expression::Identifier(id) => Some(id.name.to_string()),
            _ => None,
        },
        AssignmentTarget::ComputedMemberExpression(m) => match &m.object {
            Expression::Identifier(id) => Some(id.name.to_string()),
            _ => None,
        },
        _ => None,
    }
}

// ─── Unit tests — the §4.4 table, BOTH directions ────────────────────────────
//
// Named exactly per spec §8.1. The must-NOT-fire half is not decoration: a
// wrongly-rewritten shadowed local emits `.set` on a number, which PASSES a
// parse check and fails only at runtime. Over-application is invisible to
// `check:emit-parses` by construction, so it has to be pinned here.

#[cfg(test)]
mod tests {
    use super::*;

    /// `count` has a numeric `default:` (fast-path eligible); `label` has a
    /// non-numeric default; `open` has none at all.
    fn targets_map() -> HashMap<String, bool> {
        HashMap::from([
            ("count".to_string(), true),
            ("label".to_string(), false),
            ("open".to_string(), false),
        ])
    }

    /// Rewrite with no enclosing params, sync.
    fn rw(body: &str) -> String {
        rw_p(body, "")
    }

    /// Rewrite with an enclosing param list (the `arrow_args` shadow source).
    fn rw_p(body: &str, params: &str) -> String {
        let props = targets_map();
        let t = PropWriteTargets { props: &props };
        match rewrite_prop_writes(body, params, false, &t).expect("must not error") {
            Some(r) => r.source,
            None => body.to_string(),
        }
    }

    fn rw_async(body: &str, params: &str) -> String {
        let props = targets_map();
        let t = PropWriteTargets { props: &props };
        match rewrite_prop_writes(body, params, true, &t).expect("must not error") {
            Some(r) => r.source,
            None => body.to_string(),
        }
    }

    fn err(body: &str) -> CompileError {
        let props = targets_map();
        let t = PropWriteTargets { props: &props };
        rewrite_prop_writes(body, "", false, &t).expect_err("must be a hard error")
    }

    fn helper_needed(body: &str) -> bool {
        let props = targets_map();
        let t = PropWriteTargets { props: &props };
        rewrite_prop_writes(body, "", false, &t)
            .unwrap()
            .map(|r| r.needs_update_helper)
            .unwrap_or(false)
    }

    // ─── MUST FIRE ───────────────────────────────────────────────────────────

    #[test]
    fn simple_assignment_statement() {
        // A1.
        assert_eq!(rw("count = 5"), "count.set(5)");
        assert_eq!(rw("open = true"), "open.set(true)");
        assert_eq!(rw("open = false"), "open.set(false)");
        // The headline fixture's third action.
        assert_eq!(rw("count = 0"), "count.set(0)");
    }

    #[test]
    fn simple_assignment_expression_position() {
        // A2 — the assignment's VALUE is observed, so re-read after writing
        // (`.set` returns void).
        assert_eq!(rw("return count = 5"), "return (count.set(5), count())");
        assert_eq!(rw("f(count = 5)"), "f((count.set(5), count()))");
    }

    #[test]
    fn compound_arithmetic_all_operators() {
        // B1/B2/B3 — `a OP= b` is defined as `a = a OP b` with no coercion
        // step, so these are exact (string concatenation included).
        assert_eq!(rw("count += 1"), "count.set(count() + (1))");
        assert_eq!(rw("count -= 2"), "count.set(count() - (2))");
        assert_eq!(rw("count *= 3"), "count.set(count() * (3))");
        assert_eq!(rw("count /= 4"), "count.set(count() / (4))");
        assert_eq!(rw("count %= 5"), "count.set(count() % (5))");
        assert_eq!(rw("count **= 2"), "count.set(count() ** (2))");
        // The RHS must be parenthesized or precedence breaks.
        assert_eq!(rw("count *= a + b"), "count.set(count() * (a + b))");
        // String concatenation onto a non-numeric prop is covered by the same
        // rule — no numeric coercion is introduced.
        assert_eq!(rw("label += 'x'"), "label.set(label() + ('x'))");
    }

    #[test]
    fn compound_bitwise_and_shift_all_operators() {
        // B4.
        assert_eq!(rw("count &= 1"), "count.set(count() & (1))");
        assert_eq!(rw("count |= 2"), "count.set(count() | (2))");
        assert_eq!(rw("count ^= 3"), "count.set(count() ^ (3))");
        assert_eq!(rw("count <<= 1"), "count.set(count() << (1))");
        assert_eq!(rw("count >>= 1"), "count.set(count() >> (1))");
        assert_eq!(rw("count >>>= 1"), "count.set(count() >>> (1))");
    }

    #[test]
    fn logical_assignment_short_circuits() {
        // C1/C2/C3 — the naive `count.set(count() || rhs)` evaluates `rhs`
        // unconditionally AND writes on every call, firing reactivity where
        // the language specifies NO assignment. `count()` is a pure getter, so
        // reading it twice is free.
        assert_eq!(rw("count ||= 5"), "(count() || (count.set(5), count()))");
        assert_eq!(rw("count &&= 5"), "(count() && (count.set(5), count()))");
        assert_eq!(rw("count ??= 5"), "(count() ?? (count.set(5), count()))");
        // The short-circuit shape is identical in expression position.
        assert_eq!(
            rw("return open ??= true"),
            "return (open() ?? (open.set(true), open()))"
        );
    }

    #[test]
    fn postfix_increment_statement_numeric_default_inlines() {
        // D1/D2 — the fast path, requiring BOTH statement position (return
        // value provably discarded) and a numeric-literal `default:`
        // (`ToNumeric` provably identity). This is the headline fixture.
        assert_eq!(rw("count++"), "count.set(count() + 1)");
        assert_eq!(rw("count--"), "count.set(count() - 1)");
        assert!(!helper_needed("count++"), "fast path must not load the helper");
    }

    #[test]
    fn postfix_increment_expression_position_uses_helper() {
        // D3 — the value is observed, so the ToNumeric-correct helper is
        // required even though the prop has a numeric default.
        assert_eq!(rw("return count++"), "return __aihu_prop_upd(count, 1, false)");
        assert!(helper_needed("return count++"));
        // A prop with a NON-numeric default takes the helper even in statement
        // position: `"05"++` must store 6, not "051".
        assert_eq!(rw("open++"), "__aihu_prop_upd(open, 1, false)");
    }

    #[test]
    fn prefix_increment_returns_new_value() {
        // D4 — `n = true` selects the new value.
        assert_eq!(rw("++count"), "__aihu_prop_upd(count, 1, true)");
        assert_eq!(rw("return ++count"), "return __aihu_prop_upd(count, 1, true)");
    }

    #[test]
    fn postfix_increment_returns_old_value() {
        // D3 — `n = false` selects the old value.
        assert_eq!(rw("f(count++)"), "f(__aihu_prop_upd(count, 1, false))");
    }

    #[test]
    fn decrement_forms() {
        // D5 — delta -1, both fixities.
        assert_eq!(rw("--count"), "__aihu_prop_upd(count, -1, true)");
        assert_eq!(rw("return count--"), "return __aihu_prop_upd(count, -1, false)");
        assert_eq!(rw("open--"), "__aihu_prop_upd(open, -1, false)");
    }

    #[test]
    fn nested_closure_write_is_rewritten() {
        // The closure param is `n`; `count` resolves OUTWARD — a non-shadow.
        assert_eq!(
            rw("[1,2].forEach(n => { count += n })"),
            "[1,2].forEach(n => { count.set(count() + (n)) })"
        );
        // `setTimeout` runs after the batch drains; `.set` outside a batch
        // works normally (spec §4.10).
        assert_eq!(
            rw("setTimeout(() => { count++ }, 0)"),
            "setTimeout(() => { count.set(count() + 1) }, 0)"
        );
    }

    #[test]
    fn write_inside_if_and_try_is_rewritten() {
        assert_eq!(
            rw("if (open) { count = 1 } else { count = 2 }"),
            "if (open) { count.set(1) } else { count.set(2) }"
        );
        assert_eq!(
            rw("try { count++ } finally { open = false }"),
            "try { count.set(count() + 1) } finally { open.set(false) }"
        );
    }

    #[test]
    fn async_body_with_await_is_rewritten() {
        // `is_async` must parse the wrapper as async or `await` is a syntax
        // error and the body silently falls through unrewritten.
        assert_eq!(
            rw_async("const r = await fetch(u); count = r.status", ""),
            "const r = await fetch(u); count.set(r.status)"
        );
    }

    // ─── MUST NOT FIRE ───────────────────────────────────────────────────────

    #[test]
    fn shadowed_by_action_param_is_not_rewritten() {
        // THE primary guard. The shadow lives OUTSIDE the body text, in
        // `arrow_args` — a transform parsing the body alone corrupts this.
        assert_eq!(rw_p("count = 5", "count"), "count = 5");
        assert_eq!(rw_p("count++", "count"), "count++");
        // TS-typed params must parse (macro-test / todo-mvc need this).
        assert_eq!(rw_p("count = h", "count: number, h: number"), "count = h");
    }

    #[test]
    fn shadowed_by_block_let_is_not_rewritten() {
        assert_eq!(rw("{ let count = 1; count++ }"), "{ let count = 1; count++ }");
        assert_eq!(
            rw("{ const count = 1; f(count) }"),
            "{ const count = 1; f(count) }"
        );
    }

    #[test]
    fn shadowed_by_nested_arrow_param_is_not_rewritten() {
        // The first write is shadowed; the second is not.
        assert_eq!(
            rw("const f = (count) => { count = 0 }; count = 2"),
            "const f = (count) => { count = 0 }; count.set(2)"
        );
    }

    #[test]
    fn shadowed_by_catch_param_is_not_rewritten() {
        assert_eq!(
            rw("try { g() } catch (count) { count = 1 }"),
            "try { g() } catch (count) { count = 1 }"
        );
    }

    #[test]
    fn hoisted_var_shadow_is_not_rewritten() {
        // `var` hoists to the function scope, so the write BEFORE the
        // declaration is legal and targets the local, not the prop.
        assert_eq!(rw("count = 5; var count;"), "count = 5; var count;");
        assert_eq!(
            rw("count++; var count = 1;"),
            "count++; var count = 1;"
        );
        // A function declaration shadows the same way.
        assert_eq!(
            rw("count = 5; function count() {}"),
            "count = 5; function count() {}"
        );
    }

    #[test]
    fn member_base_obj_dot_prop_is_not_rewritten() {
        // The target is a MemberExpression, never a candidate — this falls out
        // by construction, with no heuristic. A string scanner needs a bracket
        // stack and still gets it wrong.
        assert_eq!(rw("obj.count = 5"), "obj.count = 5");
        assert_eq!(rw("obj.count++"), "obj.count++");
        assert_eq!(rw("state.open = true"), "state.open = true");
        assert_eq!(rw("obj['count'] = 5"), "obj['count'] = 5");
    }

    #[test]
    fn prop_member_write_is_not_rewritten_but_warns() {
        // F2 — `count.foo = x` sets a property on the getter FUNCTION OBJECT.
        // Almost certainly unintended, but rewriting to `count().foo = x`
        // would be a READ rewrite, which is outside the ratified decision. So:
        // unchanged, plus a warning. Legal JS that doesn't throw, so erroring
        // would break a form no fixture uses.
        assert_eq!(rw("count.foo = 5"), "count.foo = 5");
        assert_eq!(rw("count[k] = 5"), "count[k] = 5");
    }

    #[test]
    fn member_write_warning_is_structured_like_the_c_codes() {
        // The warning originally shipped as a bare one-line `eprintln!` with
        // no code, no hint, and no machine rewrite, while C560/C561 two
        // functions away carried the full shape. It now goes through the same
        // renderer as the errors; this locks the shape so it cannot regress to
        // a hand-rolled `eprintln!` again.
        let w = member_write_warning("count");
        assert_eq!(w.code.as_deref(), Some("W562"));
        assert!(w.hint.is_some(), "a warning without a hint is a bare print");
        assert!(w.fix.is_some());
        assert_eq!(w.from.as_deref(), Some("count.foo = x"));
        assert_eq!(
            w.to.as_deref(),
            Some("count.set({ ...count(), foo: x })"),
            "the machine rewrite must be applicable, not illustrative"
        );

        let mut buf: Vec<u8> = Vec::new();
        crate::diagnostics::write_warning(&mut buf, &w);
        let out = String::from_utf8(buf).unwrap();
        assert!(out.starts_with("warning: W562: "));
        for line in ["  hint: ", "  fix:  ", "  replace: ", "  with:    "] {
            assert!(out.contains(line), "missing `{line}` in:\n{out}");
        }
    }

    #[test]
    fn plain_let_state_is_not_rewritten() {
        // §6.1 — the key set is `$prop` names, NOT the SignalMap (which also
        // holds `$computed` entries and lifted `signal()` bindings). A plain
        // `@state` `let n = 0` stays a writable `let`; rewriting `n++` would
        // break working code.
        assert_eq!(rw("n++; m = 2"), "n++; m = 2");
        assert_eq!(rw("let total = 0; total += 5"), "let total = 0; total += 5");
    }

    #[test]
    fn computed_signal_is_not_rewritten() {
        // `doubled` is a `$computed`, absent from the prop key set.
        assert_eq!(rw("doubled = 4"), "doubled = 4");
        assert_eq!(rw("doubled++"), "doubled++");
    }

    #[test]
    fn reads_are_byte_identical() {
        // HARD INVARIANT (§4.9). The visitor inspects only
        // `AssignmentExpression.left` and `UpdateExpression.argument`.
        for src in [
            "count()",
            "count",
            "f(count(), count)",
            "return count() + 1",
            "const x = count; const y = count()",
            "if (count() > 0) { g(count) }",
            "[...items, count]",
        ] {
            assert_eq!(rw(src), src, "read form must pass through byte-identical");
        }
        // Rows B/C/D introduce `count()` ONLY inside the value expression they
        // synthesize — never at an author read site. The RHS read stays bare
        // (that is the separate bare-read defect, deliberately untouched).
        assert_eq!(rw("count = count + 1"), "count.set(count + 1)");
    }

    #[test]
    fn regex_literal_is_not_corrupted() {
        // The class of bug a string/token scanner cannot avoid.
        let src = r#"const h = new URL(u).hostname.replace(/^www\./, ''); count = h.length"#;
        assert_eq!(
            rw(src),
            r#"const h = new URL(u).hostname.replace(/^www\./, ''); count.set(h.length)"#
        );
        // A regex whose SOURCE spells a write must survive untouched.
        assert_eq!(rw("const re = /count = 5/g"), "const re = /count = 5/g");
    }

    #[test]
    fn template_literal_and_string_contents_untouched() {
        assert_eq!(
            rw("label = `n=${count()} of ${total}`"),
            "label.set(`n=${count()} of ${total}`)"
        );
        // Text that merely SPELLS a write is not a write.
        assert_eq!(rw("const s = 'count = 5'"), "const s = 'count = 5'");
        assert_eq!(rw("const s = `count++`"), "const s = `count++`");
        // Comments survive verbatim — nothing is reprinted from the AST.
        assert_eq!(
            rw("// count = 9\ncount = 1"),
            "// count = 9\ncount.set(1)"
        );
        // Multibyte glyphs: span offsets are UTF-8 byte offsets.
        assert_eq!(
            rw("label = 'שלום κόσμος'; count = 1"),
            "label.set('שלום κόσμος'); count.set(1)"
        );
    }

    #[test]
    fn ts_type_named_like_prop_is_not_rewritten() {
        // TS type positions are runtime-irrelevant and must never be touched.
        assert_eq!(
            rw("const x = y as count; count = 1"),
            "const x = y as count; count.set(1)"
        );
        assert_eq!(rw("let v: count = z"), "let v: count = z");
    }

    // ─── ERRORS ──────────────────────────────────────────────────────────────

    #[test]
    #[allow(non_snake_case)]
    fn array_destructuring_target_is_C560() {
        let e = err("[count] = arr");
        assert_eq!(e.code.as_deref(), Some("C560"));
        assert!(e.message.contains("count"), "names the offending prop");
        assert!(e.fix.is_some(), "carries a fix hint");
        // A default value in the pattern is a READ, not a target — it must not
        // be mistaken for a write.
        assert_eq!(rw("[a = count] = arr"), "[a = count] = arr");
    }

    #[test]
    #[allow(non_snake_case)]
    fn object_destructuring_target_is_C560() {
        let e = err("({ count } = obj)");
        assert_eq!(e.code.as_deref(), Some("C560"));
        let e = err("({ x: count } = obj)");
        assert_eq!(e.code.as_deref(), Some("C560"));
    }

    #[test]
    #[allow(non_snake_case)]
    fn for_of_target_is_C560() {
        let e = err("for (count of xs) { g(count) }");
        assert_eq!(e.code.as_deref(), Some("C560"));
        let e = err("for (count in obj) { g(count) }");
        assert_eq!(e.code.as_deref(), Some("C560"));
        // A DECLARING head introduces a new binding — a shadow, not a write.
        assert_eq!(
            rw("for (const count of xs) { g(count) }"),
            "for (const count of xs) { g(count) }"
        );
    }

    #[test]
    #[allow(non_snake_case)]
    fn write_in_computed_is_C561() {
        // The detect-only pass backing the `$computed` / `$resource` carve-out.
        // A write in a declared-derivation position is a category error; C561
        // moves today's runtime `TypeError` to compile time.
        let names = HashSet::from(["count".to_string()]);
        assert_eq!(detect_prop_writes("count = 5", "", false, &names), vec!["count"]);
        assert_eq!(detect_prop_writes("count++", "", false, &names), vec!["count"]);
        assert_eq!(detect_prop_writes("[count] = arr", "", false, &names), vec!["count"]);
        // Reads in a derivation are the CORRECT form and must stay clean.
        assert!(detect_prop_writes("count() * 2", "", false, &names).is_empty());
        // Shadowing applies to the detector too.
        assert!(detect_prop_writes("count = 5", "count", false, &names).is_empty());
    }

    // ─── Composition / invariants ────────────────────────────────────────────

    #[test]
    fn announce_and_prop_write_compose() {
        // §4.11 — the `$announce(` -> `__a11y_announce(` replace is a RAW
        // STRING substitution that invalidates byte offsets, so the prop-write
        // rewrite must run FIRST. `$announce` is a legal JS identifier, so oxc
        // parses it without special handling. This test locks the ordering by
        // showing the rewrite is correct on the pre-replace text.
        let rewritten = rw("count++; $announce('bumped')");
        assert_eq!(rewritten, "count.set(count() + 1); $announce('bumped')");
        assert_eq!(
            rewritten.replace("$announce(", "__a11y_announce("),
            "count.set(count() + 1); __a11y_announce('bumped')"
        );
    }

    #[test]
    fn double_increment_in_one_batch_increments_twice() {
        // §4.10 — `batch` defers subscriber NOTIFICATION, not the write; the
        // value is stored immediately, so read-after-write inside a batch is
        // safe and two increments advance by two. Load-bearing for rows B/D.
        assert_eq!(
            rw("count++; count++"),
            "count.set(count() + 1); count.set(count() + 1)"
        );
    }

    #[test]
    fn no_prop_write_returns_none_for_byte_identical_splice() {
        let props = targets_map();
        let t = PropWriteTargets { props: &props };
        assert!(rewrite_prop_writes("g(count())", "", false, &t).unwrap().is_none());
        // Unparseable bodies are non-regressive, never a panic.
        assert!(rewrite_prop_writes("count = ", "", false, &t).unwrap().is_none());
        // An empty prop set is a no-op.
        let empty = HashMap::new();
        let t0 = PropWriteTargets { props: &empty };
        assert!(rewrite_prop_writes("count = 1", "", false, &t0).unwrap().is_none());
    }
}
