//! #487 §4.2/§4.3 — the state-model READ + WRITE rewrite over `@state`-scope
//! code bodies (action/effect/lifecycle bodies, derived/resource thunks,
//! top-level statements, helper functions) and template handler expressions.
//!
//! CO1's `expr/prop_write.rs` generalized, exactly as the ratified spec
//! directs: one scope-aware AST pass rewrites
//!
//! - **writes** whose target resolves to a registered `state` `let`
//!   (`x = v` → `__x_set(v)`, `x op= v` → `__x_set(x() op (v))`,
//!   `x++` → the update-helper form with the numeric-literal-initializer
//!   fast path) and to a **`let`-natured `prop`** (the CO1 `.set` forms);
//! - **bare reads** of wrapper-declared reactive getters (`state`, `prop`,
//!   `derived`, `route`) → getter calls (`loading` → `loading()`), the same
//!   splice `expr/rewrite.rs` performs for template expressions, extended to
//!   macro-body position. Read rewriting is optional (`rewrite_reads`) —
//!   template handler positions leave reads to the shipped template pass.
//!
//! Writes to a `const`-natured `prop` or to a `derived` are **C624**;
//! destructuring / `for-of` / `for-in` targets over state/prop bindings are
//! **C626** (the C560 analog — no sound expression-position desugar exists).
//!
//! `expr/rewrite.rs`'s refusal of write targets (rewrite.rs:38–43) is NOT
//! touched: that pass still refuses writes in non-handler template position.
//! This is the NEW pass the spec §4.3 mandates, running only where writes are
//! legal, and only on wrapper-dialect names — an old-dialect file has no
//! wrapper targets, so its emission is byte-identical by construction.
//!
//! CONTAINMENT (CO1/W3 rule): all oxc types stay inside `src/expr/`;
//! `codegen` sees `String → String`. Parse failure returns `Ok(None)` — emit
//! never panics, the body splices as authored, and the sidecar surfaces the
//! type error instead (strictly non-regressive).

use std::cell::Cell;
use std::collections::HashSet;

use crate::parser::state_wrappers::WrapperTargets;
use crate::types::CompileError;

use oxc_ast::ast::{
    AssignmentExpression, AssignmentOperator, AssignmentTarget, BindingIdentifier, BindingPattern,
    Expression, ForInStatement, ForOfStatement, ForStatementLeft, IdentifierReference,
    ObjectProperty, SimpleAssignmentTarget, Statement, TSType, TSTypeAnnotation,
    TSTypeParameterDeclaration, TSTypeParameterInstantiation, UpdateExpression, UpdateOperator,
    VariableDeclaration, VariableDeclarationKind, VariableDeclarator,
};
use oxc_ast_visit::{walk, Visit};
use oxc_span::GetSpan;
use oxc_syntax::scope::{ScopeFlags, ScopeId};

use super::handler_parse::HandlerSource;

/// The lazily-emitted helper for `++`/`--` on a `state` binding outside the
/// fast path (getter and setter are SEPARATE bindings, unlike a `$prop`'s
/// getter-with-`.set`, so this is a 4-arg sibling of `__aihu_prop_upd`).
pub const STATE_UPDATE_HELPER_NAME: &str = "__aihu_state_upd";
pub const STATE_UPDATE_HELPER_DECL: &str = "const __aihu_state_upd = (g, s, d, n) => { const o = g(); const c = typeof o === 'bigint' ? o : Number(o); const v = c + (typeof c === 'bigint' ? BigInt(d) : d); s(v); return n ? v : c; };";

/// Outcome of the rewrite over one body.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct StateRwResult {
    pub source: String,
    /// `__aihu_state_upd` was emitted — declare the helper once.
    pub needs_state_update_helper: bool,
    /// `__aihu_prop_upd` was emitted (a `let`-prop `++` outside the fast
    /// path) — declare CO1's helper once.
    pub needs_prop_update_helper: bool,
}

/// Rewrite reads and writes of wrapper-declared bindings inside one body.
///
/// * `rewrite_reads` — `true` for `@state`-scope code bodies (§4.2 extends the
///   read rewrite to macro-body position); `false` for template handler
///   position, where the shipped template read-pass runs downstream.
///
/// `Ok(None)` = nothing to do (no targets, or parse failure — non-regressive).
/// `Err` = C624 (write to a const-natured binding) or C626 (destructuring).
pub fn rewrite_state_body(
    body: &str,
    params: &str,
    is_async: bool,
    targets: &WrapperTargets,
    rewrite_reads: bool,
) -> Result<Option<StateRwResult>, CompileError> {
    if targets.is_empty() && (!rewrite_reads || targets.reads.is_empty()) {
        return Ok(None);
    }
    if body.trim().is_empty() {
        return Ok(None);
    }

    let wrapped = HandlerSource::wrap(body, params, is_async);
    let allocator = oxc_allocator::Allocator::default();
    let Some(parsed) = wrapped.parse(&allocator) else {
        return Ok(None);
    };

    let mut visitor = StateRwVisitor::new(wrapped.source(), targets, rewrite_reads);
    visitor.hoisted = collect_hoisted_shadows(&parsed.program.body);
    visitor.visit_program(&parsed.program);

    if let Some(err) = visitor.error {
        return Err(err);
    }

    let mut edits: Vec<Edit> = visitor
        .edits
        .into_iter()
        .filter(|e| wrapped.span_in_body(e.start, e.end))
        .map(|e| Edit {
            start: e.start - wrapped.body_start(),
            end: e.end - wrapped.body_start(),
            text: e.text,
            seq: e.seq,
        })
        .collect();

    if edits.is_empty() {
        return Ok(None);
    }

    edits.sort_by_key(|e| (e.start, e.end, e.seq));
    let mut out = String::with_capacity(body.len() + 32);
    let mut copied_to = 0usize;
    let mut needs_state_helper = false;
    let mut needs_prop_helper = false;
    for edit in edits {
        if edit.start < copied_to {
            // Fully-contained duplicate (nested write inside a replaced
            // span) — the outer rewrite wins, as CO1.
            continue;
        }
        out.push_str(&body[copied_to..edit.start]);
        if edit.text.contains(STATE_UPDATE_HELPER_NAME) {
            needs_state_helper = true;
        }
        if edit.text.contains(super::prop_write::UPDATE_HELPER_NAME) {
            needs_prop_helper = true;
        }
        out.push_str(&edit.text);
        copied_to = edit.end;
    }
    out.push_str(&body[copied_to..]);

    Ok(Some(StateRwResult {
        source: out,
        needs_state_update_helper: needs_state_helper,
        needs_prop_update_helper: needs_prop_helper,
    }))
}

// ─── internals ───────────────────────────────────────────────────────────────

struct Edit {
    start: usize,
    end: usize,
    text: String,
    /// Push order — tiebreak for same-offset insertions so a read splice
    /// inside a synthesized wrapper lands before the wrapper's closer.
    seq: usize,
}

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
            Statement::DoWhileStatement(s) => {
                collect_hoisted_in(std::slice::from_ref(&s.body), out)
            }
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
            Statement::LabeledStatement(s) => {
                collect_hoisted_in(std::slice::from_ref(&s.body), out)
            }
            _ => {}
        }
    }
}

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

fn collect_target_leaves(target: &AssignmentTarget<'_>) -> Vec<String> {
    let mut out = Vec::new();
    {
        struct C<'o>(&'o mut Vec<String>);
        impl<'a> Visit<'a> for C<'_> {
            fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
                self.0.push(it.name.to_string());
            }
            fn visit_expression(&mut self, _it: &Expression<'a>) {}
        }
        C(&mut out).visit_assignment_target(target);
    }
    out
}

fn collect_for_left_leaves(left: &ForStatementLeft<'_>) -> Vec<String> {
    let mut out = Vec::new();
    {
        struct C<'o>(&'o mut Vec<String>);
        impl<'a> Visit<'a> for C<'_> {
            fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
                self.0.push(it.name.to_string());
            }
            fn visit_expression(&mut self, _it: &Expression<'a>) {}
        }
        C(&mut out).visit_for_statement_left(left);
    }
    out
}

/// How an unshadowed name is written.
#[derive(Clone)]
enum WriteForm {
    /// `state` let: setter is a separate function (`__x_set(v)`).
    State { setter: String, numeric: bool },
    /// `let`-natured prop: the CO1 `.set` writer (`x.set(v)`).
    PropLet { numeric: bool },
    /// `const`-natured prop or derived — a write is C624.
    Const { role: &'static str },
}

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

struct StateRwVisitor<'s, 't> {
    #[allow(dead_code)]
    src: &'s str,
    targets: &'t WrapperTargets,
    rewrite_reads: bool,
    scopes: Vec<HashSet<String>>,
    hoisted: HashSet<String>,
    stmt_expr_spans: HashSet<(u32, u32)>,
    edits: Vec<Edit>,
    seq: usize,
    error: Option<CompileError>,
}

impl<'s, 't> StateRwVisitor<'s, 't> {
    fn new(src: &'s str, targets: &'t WrapperTargets, rewrite_reads: bool) -> Self {
        Self {
            src,
            targets,
            rewrite_reads,
            scopes: vec![HashSet::new()],
            hoisted: HashSet::new(),
            stmt_expr_spans: HashSet::new(),
            edits: Vec::new(),
            seq: 0,
            error: None,
        }
    }

    fn is_shadowed(&self, name: &str) -> bool {
        self.hoisted.contains(name) || self.scopes.iter().rev().any(|f| f.contains(name))
    }

    fn write_form(&self, name: &str) -> Option<WriteForm> {
        if self.is_shadowed(name) {
            return None;
        }
        if let Some((setter, numeric)) = self.targets.states.get(name) {
            return Some(WriteForm::State {
                setter: setter.clone(),
                numeric: *numeric,
            });
        }
        if let Some(numeric) = self.targets.prop_lets.get(name) {
            return Some(WriteForm::PropLet { numeric: *numeric });
        }
        if self.targets.prop_consts.contains(name) {
            return Some(WriteForm::Const { role: "const-natured prop" });
        }
        if self.targets.reads.contains(name) {
            // A read-only reactive binding (derived / route) as a write
            // target is a category error.
            return Some(WriteForm::Const { role: "read-only reactive binding" });
        }
        None
    }

    fn is_read(&self, name: &str) -> bool {
        self.rewrite_reads && self.targets.reads.contains(name) && !self.is_shadowed(name)
    }

    fn is_stmt_position(&self, span: (u32, u32)) -> bool {
        self.stmt_expr_spans.contains(&span)
    }

    fn push_edit(&mut self, start: u32, end: u32, text: String) {
        let seq = self.seq;
        self.seq += 1;
        self.edits.push(Edit {
            start: start as usize,
            end: end as usize,
            text,
            seq,
        });
    }

    fn c624_write(&mut self, name: &str, role: &str) {
        if self.error.is_some() {
            return;
        }
        self.error = Some(CompileError {
            message: format!(
                "C624: cannot assign to `{name}` — it is a {role}. `const x = prop(…)` is \
                 internally read-only; declare it `let {name} = prop(…)` if the component \
                 writes it, or write through an action on a `state` binding."
            ),
            line: 0,
            col: 0,
            code: Some("C624".to_string()),
            fix: Some(format!("let {name} = prop(…)")),
            ..Default::default()
        });
    }

    fn c626(&mut self, name: &str, form: &str) {
        if self.error.is_some() {
            return;
        }
        self.error = Some(CompileError {
            message: format!(
                "C626: cannot {form} into the reactive binding `{name}` — writes go through \
                 plain assignment (`{name} = v`), which the compiler lowers to the setter; a \
                 destructuring target cannot be rewritten soundly without a temporary."
            ),
            line: 0,
            col: 0,
            code: Some("C626".to_string()),
            fix: Some(format!("const [__t] = …; {name} = __t")),
            ..Default::default()
        });
    }

    fn flag_destructuring(&mut self, leaves: Vec<String>, form: &str) {
        for name in leaves {
            if self.write_form(&name).is_some() {
                self.c626(&name, form);
            }
        }
    }
}

impl<'a> Visit<'a> for StateRwVisitor<'_, '_> {
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

    /// Bug 9 TDZ fix: `process_state_body` now splices a `let x = state(init)`
    /// wrapper binding's lowered form — `const [x, __x_set] = signal(init)` —
    /// INLINE into `plain_body`, at its original source position (instead of
    /// deferring it to the `macro_code` block emitted after ALL of
    /// plain_body; see the wrapper-span-skip branch in
    /// `codegen/state_emit.rs`). That means THIS pass — which walks the fully
    /// assembled plain_body text as one AST — now sees that declaration too.
    ///
    /// Without this override, `visit_binding_identifier` (default walk) would
    /// register `x` and `__x_set` as ordinary local bindings in the current
    /// scope frame, and `is_shadowed` would then treat every LATER reference
    /// to `x` in the rest of the body as a plain local variable instead of
    /// the wrapper's reactive getter — silently undoing the read/write
    /// rewrite (`x` → `x()`, `x = v` → `__x_set(v)`) for everything that
    /// follows the declaration. Recognize exactly the shape this fix
    /// produces — a 2-element array pattern `[name, setter]` whose names
    /// match a registered `state` target's binding + setter — and skip
    /// adding those two identifiers to `scopes`, so the target stays live for
    /// the rest of the walk. `init` is still visited normally, so a `state()`
    /// initializer that itself reads another wrapper target gets rewritten.
    fn visit_variable_declarator(&mut self, it: &VariableDeclarator<'a>) {
        if let BindingPattern::ArrayPattern(arr) = &it.id {
            if arr.rest.is_none() && arr.elements.len() == 2 {
                if let (
                    Some(BindingPattern::BindingIdentifier(name_id)),
                    Some(BindingPattern::BindingIdentifier(setter_id)),
                ) = (&arr.elements[0], &arr.elements[1])
                {
                    if let Some((setter, _)) = self.targets.states.get(name_id.name.as_str()) {
                        if setter.as_str() == setter_id.name.as_str() {
                            if let Some(init) = &it.init {
                                self.visit_expression(init);
                            }
                            return;
                        }
                    }
                }
            }
        }
        walk::walk_variable_declarator(self, it);
    }

    fn visit_expression_statement(&mut self, it: &oxc_ast::ast::ExpressionStatement<'a>) {
        let span = it.expression.span();
        self.stmt_expr_spans.insert((span.start, span.end));
        walk::walk_expression_statement(self, it);
    }

    // ─── Reads (§4.2, extended to macro-body position) ───────────────────────
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        if self.is_read(&it.name) {
            self.push_edit(it.span.end, it.span.end, "()".to_string());
        }
    }

    /// A wrapper getter already in CALLEE position stays as authored (no
    /// double call) — same rule as `expr/rewrite.rs`.
    fn visit_call_expression(&mut self, it: &oxc_ast::ast::CallExpression<'a>) {
        if let Expression::Identifier(_) = &it.callee {
            // Skip the callee identifier entirely.
        } else {
            self.visit_expression(&it.callee);
        }
        self.visit_arguments(&it.arguments);
    }

    fn visit_new_expression(&mut self, it: &oxc_ast::ast::NewExpression<'a>) {
        if let Expression::Identifier(_) = &it.callee {
        } else {
            self.visit_expression(&it.callee);
        }
        self.visit_arguments(&it.arguments);
    }

    /// Object SHORTHAND `{ count }` expands to `{ count: count() }`.
    fn visit_object_property(&mut self, it: &ObjectProperty<'a>) {
        if it.shorthand {
            if let Expression::Identifier(id) = &it.value {
                if self.is_read(&id.name) {
                    self.push_edit(id.span.end, id.span.end, format!(": {}()", id.name));
                }
            }
            return;
        }
        walk::walk_object_property(self, it);
    }

    // ─── Writes (§4.3) ───────────────────────────────────────────────────────
    fn visit_assignment_expression(&mut self, it: &AssignmentExpression<'a>) {
        // RHS first: nested writes and reads inside it get their own edits.
        self.visit_expression(&it.right);

        match &it.left {
            AssignmentTarget::AssignmentTargetIdentifier(id) => {
                let Some(form) = self.write_form(&id.name) else {
                    return;
                };
                let name = id.name.to_string();
                let stmt = self.is_stmt_position((it.span.start, it.span.end));
                let rhs_start = it.right.span().start;

                let (set_open, getter) = match &form {
                    WriteForm::State { setter, .. } => (format!("{setter}("), format!("{name}()")),
                    WriteForm::PropLet { .. } => (format!("{name}.set("), format!("{name}()")),
                    WriteForm::Const { role } => {
                        self.c624_write(&name, role);
                        return;
                    }
                };

                match it.operator {
                    AssignmentOperator::Assign => {
                        if stmt {
                            // `x = v` → `__x_set(v)` / `x.set(v)`.
                            self.push_edit(it.span.start, rhs_start, set_open);
                            self.push_edit(it.span.end, it.span.end, ")".to_string());
                        } else {
                            // Value observed — re-read after writing.
                            self.push_edit(it.span.start, rhs_start, format!("({set_open}"));
                            self.push_edit(it.span.end, it.span.end, format!("), {getter})"));
                        }
                    }
                    op if compound_op(op).is_some() => {
                        let bop = compound_op(op).unwrap();
                        let prefix = format!("{set_open}{getter} {bop} (");
                        if stmt {
                            self.push_edit(it.span.start, rhs_start, prefix);
                            self.push_edit(it.span.end, it.span.end, "))".to_string());
                        } else {
                            self.push_edit(it.span.start, rhs_start, format!("({prefix}"));
                            self.push_edit(it.span.end, it.span.end, format!(")), {getter})"));
                        }
                    }
                    AssignmentOperator::LogicalOr
                    | AssignmentOperator::LogicalAnd
                    | AssignmentOperator::LogicalNullish => {
                        let lop = match it.operator {
                            AssignmentOperator::LogicalOr => "||",
                            AssignmentOperator::LogicalAnd => "&&",
                            _ => "??",
                        };
                        // Short-circuit preserved: `(x() || (__x_set(v), x()))`.
                        self.push_edit(
                            it.span.start,
                            rhs_start,
                            format!("({getter} {lop} ({set_open}"),
                        );
                        self.push_edit(it.span.end, it.span.end, format!("), {getter}))"));
                    }
                    _ => {}
                }
            }
            AssignmentTarget::StaticMemberExpression(_)
            | AssignmentTarget::ComputedMemberExpression(_) => {
                // `x.foo = v` on a state binding: the BASE is a read of the
                // value (`x().foo = v`) — walked as an ordinary read.
                walk::walk_assignment_target(self, &it.left);
            }
            AssignmentTarget::ArrayAssignmentTarget(_)
            | AssignmentTarget::ObjectAssignmentTarget(_) => {
                let leaves = collect_target_leaves(&it.left);
                self.flag_destructuring(leaves, "destructure");
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
        let Some(form) = self.write_form(&id.name) else {
            return;
        };
        let name = id.name.to_string();
        let delta = if it.operator == UpdateOperator::Increment { 1 } else { -1 };
        let stmt = self.is_stmt_position((it.span.start, it.span.end));
        let bop = if delta == 1 { "+" } else { "-" };

        let out = match form {
            WriteForm::State { setter, numeric } => {
                if stmt && !it.prefix && numeric {
                    format!("{setter}({name}() {bop} 1)")
                } else {
                    format!(
                        "{STATE_UPDATE_HELPER_NAME}({name}, {setter}, {delta}, {})",
                        if it.prefix { "true" } else { "false" }
                    )
                }
            }
            WriteForm::PropLet { numeric } => {
                if stmt && !it.prefix && numeric {
                    format!("{name}.set({name}() {bop} 1)")
                } else {
                    format!(
                        "{}({name}, {delta}, {})",
                        super::prop_write::UPDATE_HELPER_NAME,
                        if it.prefix { "true" } else { "false" }
                    )
                }
            }
            WriteForm::Const { role } => {
                self.c624_write(&name, role);
                return;
            }
        };
        self.push_edit(it.span.start, it.span.end, out);
    }

    /// A write target that is a bare identifier must NOT get a read splice.
    fn visit_simple_assignment_target(&mut self, it: &SimpleAssignmentTarget<'a>) {
        if matches!(it, SimpleAssignmentTarget::AssignmentTargetIdentifier(_)) {
            return;
        }
        walk::walk_simple_assignment_target(self, it);
    }

    fn visit_for_of_statement(&mut self, it: &ForOfStatement<'a>) {
        let leaves = collect_for_left_leaves(&it.left);
        self.flag_destructuring(leaves, "iterate");
        walk::walk_for_of_statement(self, it);
    }

    fn visit_for_in_statement(&mut self, it: &ForInStatement<'a>) {
        let leaves = collect_for_left_leaves(&it.left);
        self.flag_destructuring(leaves, "iterate");
        walk::walk_for_in_statement(self, it);
    }

    // TS type positions — never rewritten.
    fn visit_ts_type(&mut self, _it: &TSType<'a>) {}
    fn visit_ts_type_annotation(&mut self, _it: &TSTypeAnnotation<'a>) {}
    fn visit_ts_type_parameter_instantiation(&mut self, _it: &TSTypeParameterInstantiation<'a>) {}
    fn visit_ts_type_parameter_declaration(&mut self, _it: &TSTypeParameterDeclaration<'a>) {}
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    /// `count` = state w/ numeric init; `loading` = state non-numeric;
    /// `n` = let-prop (numeric default); `city` = const prop; `d` = derived.
    fn targets() -> WrapperTargets {
        let mut t = WrapperTargets::default();
        t.states.insert("count".into(), ("__count_set".into(), true));
        t.states.insert("loading".into(), ("__loading_set".into(), false));
        t.prop_lets.insert("n".into(), true);
        t.prop_consts.insert("city".into());
        t.reads = BTreeSet::from(
            ["count", "loading", "n", "city", "d"].map(String::from),
        );
        t
    }

    fn rw(body: &str) -> String {
        let t = targets();
        match rewrite_state_body(body, "", false, &t, true).expect("must not error") {
            Some(r) => r.source,
            None => body.to_string(),
        }
    }

    fn rw_writes_only(body: &str) -> String {
        let t = targets();
        match rewrite_state_body(body, "", false, &t, false).expect("must not error") {
            Some(r) => r.source,
            None => body.to_string(),
        }
    }

    fn err(body: &str) -> CompileError {
        let t = targets();
        rewrite_state_body(body, "", false, &t, true).expect_err("must error")
    }

    // ─── Writes ──────────────────────────────────────────────────────────────

    #[test]
    fn plain_state_assignment() {
        assert_eq!(rw("loading = true"), "__loading_set(true)");
        assert_eq!(rw("count = 0"), "__count_set(0)");
    }

    #[test]
    fn assignment_rhs_reads_are_rewritten() {
        assert_eq!(rw("count = count + 1"), "__count_set(count() + 1)");
        assert_eq!(rw("loading = !loading"), "__loading_set(!loading())");
    }

    #[test]
    fn compound_assignment() {
        assert_eq!(rw("count += 1"), "__count_set(count() + (1))");
        assert_eq!(rw("count *= d + 1"), "__count_set(count() * (d() + 1))");
    }

    #[test]
    fn logical_assignment_short_circuits() {
        assert_eq!(
            rw("loading ||= true"),
            "(loading() || (__loading_set(true), loading()))"
        );
    }

    #[test]
    fn expression_position_reread() {
        assert_eq!(rw("return count = 5"), "return (__count_set(5), count())");
        assert_eq!(rw("f(count = 5)"), "f((__count_set(5), count()))");
    }

    #[test]
    fn update_fast_path_and_helper() {
        // Numeric-literal state initializer + statement position → inline.
        assert_eq!(rw("count++"), "__count_set(count() + 1)");
        assert_eq!(rw("count--"), "__count_set(count() - 1)");
        // Non-numeric initializer → helper.
        assert_eq!(rw("loading++"), "__aihu_state_upd(loading, __loading_set, 1, false)");
        // Expression position → helper even when numeric.
        assert_eq!(rw("return count++"), "return __aihu_state_upd(count, __count_set, 1, false)");
        assert_eq!(rw("++count"), "__aihu_state_upd(count, __count_set, 1, true)");
    }

    #[test]
    fn let_prop_takes_co1_forms() {
        assert_eq!(rw("n = 5"), "n.set(5)");
        assert_eq!(rw("n++"), "n.set(n() + 1)");
        assert_eq!(rw("n += 2"), "n.set(n() + (2))");
    }

    #[test]
    fn const_prop_write_is_c624() {
        let e = err("city = 'Paris'");
        assert_eq!(e.code.as_deref(), Some("C624"));
        assert!(e.message.contains("city"));
        let e = err("city++");
        assert_eq!(e.code.as_deref(), Some("C624"));
    }

    #[test]
    fn derived_write_is_c624() {
        let e = err("d = 4");
        assert_eq!(e.code.as_deref(), Some("C624"));
    }

    #[test]
    fn destructuring_into_state_is_c626() {
        assert_eq!(err("[count] = arr").code.as_deref(), Some("C626"));
        assert_eq!(err("({ count } = obj)").code.as_deref(), Some("C626"));
        assert_eq!(err("for (count of xs) { g() }").code.as_deref(), Some("C626"));
    }

    // ─── Reads ───────────────────────────────────────────────────────────────

    #[test]
    fn bare_reads_splice_calls() {
        assert_eq!(rw("f(count)"), "f(count())");
        assert_eq!(rw("const x = city.length"), "const x = city().length");
        assert_eq!(rw("g(`n=${count}`)"), "g(`n=${count()}`)");
        assert_eq!(rw("h({ count })"), "h({ count: count() })");
    }

    #[test]
    fn callee_position_not_double_called() {
        assert_eq!(rw("g(count())"), "g(count())");
    }

    #[test]
    fn shadowing_wins() {
        assert_eq!(
            rw("[1].map(count => count + 1)"),
            "[1].map(count => count + 1)"
        );
        assert_eq!(rw("{ let count = 1; count++ }"), "{ let count = 1; count++ }");
        let t = targets();
        // Enclosing-arrow params seed the outermost shadow frame.
        let r = rewrite_state_body("count = 5", "count", false, &t, true).unwrap();
        assert!(r.is_none(), "param-shadowed write must not rewrite");
    }

    #[test]
    fn ts_types_untouched() {
        assert_eq!(rw("const x = y as count; count = 1"), "const x = y as count; __count_set(1)");
    }

    #[test]
    fn member_write_reads_base() {
        // Mutating a property of the state VALUE: base is a read.
        assert_eq!(rw("count.foo = 1"), "count().foo = 1");
    }

    #[test]
    fn writes_only_mode_leaves_reads() {
        assert_eq!(rw_writes_only("() => count++"), "() => __count_set(count() + 1)");
        assert_eq!(rw_writes_only("() => f(count)"), "() => f(count)");
        assert_eq!(
            rw_writes_only("() => { loading = true }"),
            "() => { __loading_set(true) }"
        );
    }

    #[test]
    fn async_bodies() {
        let t = targets();
        let r = rewrite_state_body(
            "const r = await fetch(u); loading = false",
            "",
            true,
            &t,
            true,
        )
        .unwrap()
        .unwrap();
        assert_eq!(r.source, "const r = await fetch(u); __loading_set(false)");
    }

    #[test]
    fn helper_flags() {
        let t = targets();
        let r = rewrite_state_body("return ++count", "", false, &t, true).unwrap().unwrap();
        assert!(r.needs_state_update_helper);
        let r = rewrite_state_body("count++", "", false, &t, true).unwrap().unwrap();
        assert!(!r.needs_state_update_helper, "fast path must not load the helper");
    }

    #[test]
    fn empty_targets_is_none() {
        let t = WrapperTargets::default();
        assert!(rewrite_state_body("count = 1", "", false, &t, true).unwrap().is_none());
    }

    #[test]
    fn strings_comments_regex_survive() {
        assert_eq!(
            rw("// count = 9\ncount = 1"),
            "// count = 9\n__count_set(1)"
        );
        assert_eq!(rw("const s = 'count = 5'"), "const s = 'count = 5'");
        assert_eq!(rw("const re = /count = 5/g"), "const re = /count = 5/g");
    }
}
