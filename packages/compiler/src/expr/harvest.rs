//! W4 (advanced-js-template-expressions, Option C hybrid) — AST-derived
//! sidecar harvest: the identifier-READ set of a captured template expression
//! and the identifier-BINDING set of an each-head alias list, both read off
//! the same oxc parse W2/W3 use.
//!
//! Consumed by `codegen/emit.rs emit_sidecar_ts` (which declares each
//! referenced in-scope name as an `any` parameter of `__aihu_template`) and
//! `collect_loop_aliases` (which feeds `{#each}`/`$each` aliases into that
//! in-scope set). This replaces the token scans `expr_references_ident` and
//! `extract_pattern_idents` on the sidecar path — those remain in emit.rs
//! only as per-expression fallbacks for captures that don't parse as a TS
//! expression (possible under `--expr-parser legacy`, which accepts some
//! malformed captures) and as the emit-side alias extractor (W5's problem).
//!
//! ALWAYS-ON, deliberately not `--expr-parser`-gated: harvesting is
//! type-check-side only — it changes which `any` params the sidecar declares,
//! never the emitted component JS — and oxc is compiled in unconditionally
//! since W2. The token scan's blind spots (reads inside template-literal
//! `${…}` holes, reads after `...` spread) made VALID components fail sidecar
//! tsc with TS2304 under BOTH modes, so gating the fix behind the flag would
//! keep known-false diagnostics in the default path for no compensating
//! safety: an emit-behavior corpus diff (the flag's purpose) cannot be
//! affected by sidecar params.
//!
//! What counts as a READ (post-scope-model):
//! - every `IdentifierReference` not shadowed by a lexical binding inside the
//!   expression itself (arrow/function params incl. destructuring, block
//!   `const`/`let`, catch params, function/class names);
//! - callee positions (`label()`) and write targets (`count = 1`, `count++`
//!   in `$on.*` handler position) — the sidecar lifts the expression as raw
//!   text, so tsc needs the name declared either way.
//!
//! What never counts, by construction (they are `IdentifierName`, a different
//! AST type): member-access properties (`user.name`), non-computed object
//! keys (`{ count: 1 }`). Object SHORTHAND `{ count }` IS a read (its value
//! is an `IdentifierReference`). TS type positions (`user as User`) are
//! suppressed like the W3 rewrite: a type name cannot be satisfied by an
//! `any` VALUE parameter, so declaring it would just trade TS2304 for TS2749
//! — real type lowering belongs to the `@state`-emit completion pass, not W4.
//!
//! CONTAINMENT RULE (plan §Risks 1): all oxc types stay inside `src/expr/`.

use std::cell::Cell;
use std::collections::{BTreeSet, HashSet};

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    BindingIdentifier, Expression, IdentifierReference, TSType, TSTypeAnnotation,
    TSTypeParameterDeclaration, TSTypeParameterInstantiation,
};
use oxc_ast_visit::Visit;
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType};
use oxc_syntax::scope::{ScopeFlags, ScopeId};

/// Every identifier a template expression READS from its surrounding scope,
/// post-scope-model (see module docs). Returns `None` when the capture does
/// not parse as a single TS expression — the caller falls back to the legacy
/// token scan so the sidecar never loses the coverage it had.
pub fn referenced_idents(source: &str) -> Option<BTreeSet<String>> {
    if source.trim().is_empty() {
        return Some(BTreeSet::new());
    }
    let allocator = Allocator::default();
    let parser = Parser::new(&allocator, source, SourceType::ts());
    let expr = parser.parse_expression().ok()?;

    let mut visitor = HarvestVisitor {
        scopes: vec![HashSet::new()],
        reads: BTreeSet::new(),
    };
    visitor.visit_expression(&expr);
    Some(visitor.reads)
}

/// Every identifier BOUND by an each-head alias list (`item`, `item, idx`,
/// `[k, v], i`, `{ name, id: rid }`), extracted from a real parse: the list is
/// wrapped as `(<aliases>) => 0` and the arrow's parameter binding patterns
/// are walked (the plan's validated trick — a binding-pattern grammar without
/// hand-rolling one). Returns `None` when the text does not parse as a
/// parameter list; callers fall back to the token extractor.
pub fn alias_bound_idents(alias_list: &str) -> Option<BTreeSet<String>> {
    let trimmed = alias_list.trim();
    if trimmed.is_empty() {
        return Some(BTreeSet::new());
    }
    let probe = format!("({}) => 0", trimmed);
    let allocator = Allocator::default();
    let parser = Parser::new(&allocator, &probe, SourceType::ts());
    let expr = parser.parse_expression().ok()?;
    let Expression::ArrowFunctionExpression(arrow) = &expr else {
        // Alias text that parses but not as ONE arrow's param list (e.g. a
        // stray `)` making a sequence) is not a param list.
        return None;
    };
    if arrow.span().end as usize != probe.len() {
        return None; // trailing garbage after the probe arrow
    }
    // The arrow's parameter list must be exactly the wrapper parens we added:
    // alias text containing its own `) => (` would otherwise smuggle a nested
    // arrow through (`(a) => (b) => 0`) and mis-bind.
    if arrow.params.span().end as usize != 1 + trimmed.len() + 1 {
        return None;
    }
    let mut collector = BindingCollector {
        names: BTreeSet::new(),
    };
    collector.visit_formal_parameters(&arrow.params);
    Some(collector.names)
}

/// Scope-aware read collector. The scope model is identical to the W3
/// `RewriteVisitor`: oxc's own `enter_scope`/`leave_scope` hooks push/pop
/// frames, `visit_binding_identifier` fills the current frame (it fires
/// exactly at binding positions), and a reference counts only when no
/// enclosing frame holds its name.
struct HarvestVisitor {
    scopes: Vec<HashSet<String>>,
    reads: BTreeSet<String>,
}

impl<'a> Visit<'a> for HarvestVisitor {
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

    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        let name = it.name.as_str();
        if !self.scopes.iter().rev().any(|frame| frame.contains(name)) {
            self.reads.insert(name.to_string());
        }
    }

    // TS type positions — suppressed (module docs): a type name cannot be
    // satisfied by an `any` value parameter.
    fn visit_ts_type(&mut self, _it: &TSType<'a>) {}
    fn visit_ts_type_annotation(&mut self, _it: &TSTypeAnnotation<'a>) {}
    fn visit_ts_type_parameter_instantiation(&mut self, _it: &TSTypeParameterInstantiation<'a>) {}
    fn visit_ts_type_parameter_declaration(&mut self, _it: &TSTypeParameterDeclaration<'a>) {}
}

/// Collects every `BindingIdentifier` under a formal-parameter walk — the
/// bound names of the alias patterns, including nested destructuring, rest
/// elements, and renamed object entries (`{ id: rid }` binds `rid`; the key
/// `id` is an `IdentifierName` and never fires).
struct BindingCollector {
    names: BTreeSet<String>,
}

impl<'a> Visit<'a> for BindingCollector {
    fn visit_binding_identifier(&mut self, it: &BindingIdentifier<'a>) {
        self.names.insert(it.name.to_string());
    }
}

// ─── Unit tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn reads(src: &str) -> Vec<String> {
        referenced_idents(src)
            .unwrap_or_else(|| panic!("`{src}` must parse"))
            .into_iter()
            .collect()
    }

    fn binds(src: &str) -> Vec<String> {
        alias_bound_idents(src)
            .unwrap_or_else(|| panic!("`{src}` must parse as a param list"))
            .into_iter()
            .collect()
    }

    #[test]
    fn plain_reads_members_and_callees() {
        assert_eq!(reads("count + extra"), ["count", "extra"]);
        assert_eq!(reads("user.name"), ["user"]);
        assert_eq!(reads("label()"), ["label"]);
        assert_eq!(reads("new Thing(count)"), ["Thing", "count"]);
    }

    #[test]
    fn template_literal_holes_are_reads() {
        // The token scan treated the backtick as a string open and skipped
        // the whole literal — `count` was invisible (false TS2304).
        assert_eq!(reads("`Count: ${count}`"), ["count"]);
        assert_eq!(reads("`n=${count} of ${items.length}`"), ["count", "items"]);
        assert_eq!(reads("`a${`b${count}`}`"), ["count"]);
        assert_eq!(reads("`no holes`"), Vec::<String>::new());
    }

    #[test]
    fn spread_targets_are_reads() {
        // The token scan saw `prev == '.'` after `...` and skipped these.
        assert_eq!(reads("Math.max(...nums)"), ["Math", "nums"]);
        assert_eq!(reads("[...items, extra].length"), ["extra", "items"]);
        assert_eq!(reads("({ ...obj, b: 2 })"), ["obj"]);
    }

    #[test]
    fn shadowed_params_are_not_reads() {
        assert_eq!(reads("items.map(count => count + 1)"), ["items"]);
        assert_eq!(reads("items.map(({ x }) => x)"), ["items"]);
        assert_eq!(reads("(e) => { const x = count; return x }"), ["count"]);
        assert_eq!(
            reads("() => { const count = 1; return count }"),
            Vec::<String>::new()
        );
        // Param DEFAULTS read the outer scope.
        assert_eq!(reads("(a = count) => a"), ["count"]);
    }

    #[test]
    fn object_keys_and_member_props_are_not_reads() {
        assert_eq!(reads("JSON.stringify({ count: 1 })"), ["JSON"]);
        assert_eq!(reads("state.count"), ["state"]);
        // …but SHORTHAND is a read.
        assert_eq!(reads("JSON.stringify({ count })"), ["JSON", "count"]);
        // Computed keys are reads.
        assert_eq!(reads("({ [key]: 1 })"), ["key"]);
    }

    #[test]
    fn write_targets_still_need_declaring() {
        // The sidecar lifts handler bodies as raw text — tsc must see the
        // written names too, or `__handler(() => count = 1)` TS2304s.
        assert_eq!(reads("() => count = 1"), ["count"]);
        assert_eq!(reads("() => count++"), ["count"]);
        assert_eq!(reads("() => setCount(count() + 1)"), ["count", "setCount"]);
    }

    #[test]
    fn ts_type_positions_are_not_reads() {
        assert_eq!(reads("(user as User).name"), ["user"]);
        assert_eq!(reads("user!.name"), ["user"]);
        assert_eq!(reads("foo<T>(count)"), ["count", "foo"]);
    }

    #[test]
    fn strings_comments_and_regex_are_not_reads() {
        assert_eq!(reads("'count' + \"items\""), Vec::<String>::new());
        assert_eq!(reads("/count/.test(user)"), ["user"]);
        assert_eq!(reads("// count\nitems"), ["items"]);
    }

    #[test]
    fn unparseable_returns_none() {
        assert_eq!(referenced_idents("count +"), None);
        assert_eq!(referenced_idents("const x = 1"), None);
    }

    #[test]
    fn empty_is_no_reads() {
        assert_eq!(referenced_idents("  "), Some(BTreeSet::new()));
    }

    #[test]
    fn alias_lists_bind_precisely() {
        assert_eq!(binds("item"), ["item"]);
        assert_eq!(binds("item, i"), ["i", "item"]);
        assert_eq!(binds("[k, v], i"), ["i", "k", "v"]);
        assert_eq!(binds("{ name, id: rid }"), ["name", "rid"]);
        assert_eq!(binds("[a = 1, ...rest]"), ["a", "rest"]);
        assert_eq!(binds("[{ x }, [y]], idx"), ["idx", "x", "y"]);
        assert_eq!(binds(""), Vec::<String>::new());
    }

    #[test]
    fn non_param_lists_return_none() {
        assert_eq!(alias_bound_idents("a) => (b"), None);
        assert_eq!(alias_bound_idents("a b"), None);
        assert_eq!(alias_bound_idents("f(x)"), None);
    }
}
