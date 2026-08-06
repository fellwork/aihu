//! SSR string-template emit (wave-3 keystone) — lowers the template IR to a
//! JS function of straight-line string concatenation with interpolated
//! dynamic holes, instead of the arbor-tree factory the runtime walker
//! interprets per request.
//!
//! **The contract is byte-identity with the tree walk.** For any component
//! this module agrees to lower, `__ssrString(props, { hydratable })` must
//! produce EXACTLY the bytes `@aihu/server`'s `renderToString(__ssr(props))`
//! produces for the same state — including the sacred wire grammar:
//!
//!   * `data-aihu-path="PATH"` on every non-fragment branch (hydratable only),
//!     seeded at ROOT_PATH `'0'`, children at `PATH.i` over the FILTERED
//!     children list (whitespace-only multi-line text contributes no child);
//!   * structural comment markers `<!--aihu:s:CPATH-->…<!--aihu:/s:CPATH-->`
//!     around every `when()`/`each()` node, where CPATH is the path with
//!     `-` → `_` (`_commentPath` in ssr.ts);
//!   * conditional content continues at `PATH.conditional.true`; list items
//!     at `PATH.list.KEY` with `KEY = String(key).replace(/\./g, '_')`;
//!   * `<!--|-->` between two adjacent TEXT leaves (hydratable only);
//!   * the walker's exact escaping: text `& < >`, attributes `& "`.
//!
//! The emitter is a PARALLEL WALK of the same `TemplateNode` IR that
//! `template_emit::emit_node` lowers, making the SAME decisions via the SAME
//! shared helpers (`rewrite_template_expr`, `normalize_text_node`,
//! `each_scoped_maps`, …) — so the tree the walker renders and the string
//! this function builds cannot classify a node differently. The differential
//! suite (`packages/server/tests/ssr-string-differential.test.ts`) pins the
//! byte-identity end to end.
//!
//! **Static-subtree constant folding**: any run of output with no dynamic
//! hole collapses into a single JS template-literal chunk at compile time —
//! markers, path attributes, and escaped static text included. Because the
//! marker/path bytes exist only in hydratable output, chunks are folded
//! per-variant and emitted as one literal when the variants agree, or as
//! `__h ? hydratableChunk : plainChunk` when they differ.
//!
//! **Scope (bail-out contract)**: templates using constructs whose walker
//! rendering cannot be reproduced cheaply at compile time do NOT get a
//! `__ssrString` export — the module simply keeps the tree walker as its
//! only renderer, and `@aihu/server` falls back automatically. Today that
//! set is: `<$suspense>`, `<$shield>`, `<$guard>`, `<$warp>`, `<$focusTrap>`,
//! `<$router>`, `<$link>`, `<$outlet>`, `<$navigate>`, unknown macro
//! elements, and elements with duplicate attribute names (object-literal
//! last-wins semantics). Everything else — including `show`/`class:`/`ref`
//! effects (mount-time behaviors, SSR-transparent), enhanced `<a>` anchors,
//! `<group>`, `<slot>`, and the a11y primitives — lowers.
//!
//! `html={expr}` is NOT SSR-transparent: its value is the element's content,
//! so it is interpolated unescaped into the string (see `emit_element_base`).
//! It was transparent once, which silently prerendered an empty element for
//! every page whose body is an `html` binding. Note this is one of the few
//! places the two renderers genuinely disagree — `html` lowers to a mount
//! effect, so the walker never sees it and renders the element empty. The
//! exception is a COMPONENT reference, where the child gate below fires first
//! and both renderers resolve the child; see the eligibility commentary there.

use std::collections::BTreeSet;

use super::signals::{SignalMap, StateNames};
use super::template_emit::{
    anchor_is_enhanced, attr_name, each_scoped_maps, expr_references_state, find_static_attr,
    interpolation_has_call, is_event_attr_name, is_pure_dotted_path, macro_value_expr,
    normalize_text_node, rewrite_template_expr, NormalizedText,
};
use crate::expr::ExprParserMode;
use crate::types::{Attr, MacroValue, TemplateNode};

/// The lowered string renderer: the function-body statements (2-space base
/// indent) plus the `@aihu/runtime` helper names the statements call.
pub(crate) struct SsrStringFn {
    pub(crate) body: String,
    pub(crate) helpers: Vec<&'static str>,
}

pub(crate) fn emit_ssr_string_body(
    nodes: &[TemplateNode],
    signal_map: &SignalMap,
    state_names: &StateNames,
    mode: ExprParserMode,
) -> Option<SsrStringFn> {
    let mut e = Emitter::new(mode);
    e.stmt("const __h = !!__opts.hydratable".to_string());
    e.stmt("let __out = ''".to_string());
    // Root mirror of `emit_nodes`: zero roots → an empty fragment (renders
    // nothing); one root → that node IS the tree root at ROOT_PATH `'0'`;
    // several roots → a fragment at `'0'` whose children walk at `0.i`.
    let root = P::stat("0");
    let kept: Vec<&TemplateNode> = nodes.iter().filter(|n| !node_is_dropped(n)).collect();
    match kept.len() {
        0 => {}
        1 => e.emit_node(kept[0], &root, signal_map, state_names),
        _ => e.emit_children(nodes, &root, signal_map, state_names),
    }
    e.flush();
    e.stmt("return __out".to_string());
    if e.bail {
        return None;
    }
    let mut body = String::new();
    for line in &e.stmts {
        body.push_str(line);
        body.push('\n');
    }
    Some(SsrStringFn {
        body,
        helpers: e.helpers.into_iter().collect(),
    })
}

// ─── Path addressing ─────────────────────────────────────────────────────────

/// A `data-aihu-path` value: fully static, or a runtime base variable (bound
/// at an `each` item boundary, where the key is a runtime value) plus a
/// static tail.
#[derive(Clone)]
struct P {
    /// JS identifier holding the dynamic prefix; `None` = fully static.
    base: Option<String>,
    /// Static tail. With `base: None` this IS the whole path.
    tail: String,
}

impl P {
    fn stat(s: &str) -> P {
        P { base: None, tail: s.to_string() }
    }
    fn child(&self, seg: &str) -> P {
        let mut tail = self.tail.clone();
        if !(tail.is_empty() && self.base.is_some()) && !tail.is_empty() {
            tail.push('.');
        } else if self.base.is_some() {
            tail.push('.');
        }
        tail.push_str(seg);
        P { base: self.base.clone(), tail }
    }
    /// The full path as a JS expression (only meaningful when `base` is set).
    fn js_expr(&self) -> String {
        match &self.base {
            Some(b) if self.tail.is_empty() => b.clone(),
            Some(b) => format!("{} + '{}'", b, self.tail),
            None => format!("'{}'", self.tail),
        }
    }
}

// ─── Output buffering with per-variant folding ───────────────────────────────

#[derive(Clone, PartialEq)]
enum Part {
    Lit(String),
    Expr(String),
}

struct Emitter {
    mode: ExprParserMode,
    stmts: Vec<String>,
    buf_h: Vec<Part>,
    buf_p: Vec<Part>,
    tmp: usize,
    indent: usize,
    helpers: BTreeSet<&'static str>,
    bail: bool,
}

impl Emitter {
    fn new(mode: ExprParserMode) -> Emitter {
        Emitter {
            mode,
            stmts: Vec::new(),
            buf_h: Vec::new(),
            buf_p: Vec::new(),
            tmp: 0,
            indent: 1,
            helpers: BTreeSet::new(),
            bail: false,
        }
    }

    fn helper(&mut self, name: &'static str) {
        self.helpers.insert(name);
    }

    fn tmp_name(&mut self, stem: &str) -> String {
        let n = self.tmp;
        self.tmp += 1;
        format!("__aihu_{}{}", stem, n)
    }

    fn pad(&self) -> String {
        "  ".repeat(self.indent)
    }

    // Both variants.
    fn lit(&mut self, s: &str) {
        push_lit(&mut self.buf_h, s);
        push_lit(&mut self.buf_p, s);
    }
    fn expr(&mut self, e: String) {
        self.buf_h.push(Part::Expr(e.clone()));
        self.buf_p.push(Part::Expr(e));
    }
    // Hydratable-only bytes (markers, path attrs, text-leaf boundaries).
    fn lit_h(&mut self, s: &str) {
        push_lit(&mut self.buf_h, s);
    }
    fn expr_h(&mut self, e: String) {
        self.buf_h.push(Part::Expr(e));
    }

    /// Flush the pending chunk as one (or one conditional) `__out +=`.
    fn flush(&mut self) {
        let h = render_parts(&self.buf_h);
        let p = render_parts(&self.buf_p);
        self.buf_h.clear();
        self.buf_p.clear();
        let pad = self.pad();
        match (h, p) {
            (None, None) => {}
            (Some(h), Some(p)) if h == p => self.stmts.push(format!("{}__out += {}", pad, h)),
            (Some(h), Some(p)) => self
                .stmts
                .push(format!("{}__out += __h ? {} : {}", pad, h, p)),
            (Some(h), None) => self.stmts.push(format!("{}if (__h) __out += {}", pad, h)),
            (None, Some(p)) => self.stmts.push(format!("{}if (!__h) __out += {}", pad, p)),
        }
    }

    /// Flush, then append a raw statement line at the current indent.
    fn stmt(&mut self, s: String) {
        self.flush();
        let pad = self.pad();
        self.stmts.push(format!("{}{}", pad, s));
    }

    // ── path attr / markers ──────────────────────────────────────────────────

    /// `data-a="<id>"` on the ROOT element only, driven by a runtime
    /// `__opts.lightScopeId` value (light-DOM leaf flip, LDF §10 step 3).
    /// The scope id can't be a Rust-compile-time literal: whether this
    /// component ends up in light mode depends on the plugin-global
    /// `shadowMode` config, decided only in the JS layer (`index.ts`'s
    /// `transform` hook, after Rust codegen already ran) — so Rust emits an
    /// always-present conditional runtime read instead, the same way
    /// `__opts.hydratable` (`__h`) is already runtime-driven despite being
    /// decided outside Rust. Present in BOTH variants (`self.expr`, not
    /// `self.expr_h`) — the CSS `@scope([data-a="…"])` selector must match
    /// regardless of hydration mode. `lightScopeId` is a compiler-generated
    /// hex string, never user data, so no escaping helper is needed.
    fn root_scope_attr(&mut self, path: &P) {
        if path.base.is_none() && path.tail == "0" {
            self.expr(
                "(__opts.lightScopeId ? ' data-a=\"' + __opts.lightScopeId + '\"' : '')"
                    .to_string(),
            );
        }
    }

    /// ` data-aihu-path="…"` (hydratable only). Static paths contain only
    /// `[0-9.]` and the words `conditional`/`true`/`list` — attr-safe, folded
    /// verbatim; dynamic paths escape at runtime (list keys are arbitrary).
    fn path_attr(&mut self, path: &P) {
        match &path.base {
            None => self.lit_h(&format!(" data-aihu-path=\"{}\"", path.tail)),
            Some(_) => {
                self.helper("__aihu_eattr");
                self.lit_h(" data-aihu-path=\"");
                self.expr_h(format!("__aihu_eattr({})", path.js_expr()));
                self.lit_h("\"");
            }
        }
    }

    /// `<!--aihu:s:CPATH-->` / `<!--aihu:/s:CPATH-->` (hydratable only).
    fn marker(&mut self, path: &P, close: bool) {
        let slash = if close { "/" } else { "" };
        match &path.base {
            // Static segments never contain `-`; the replace is a no-op kept
            // for the runtime (dynamic-key) case only.
            None => self.lit_h(&format!(
                "<!--aihu:{}s:{}-->",
                slash,
                path.tail.replace('-', "_")
            )),
            Some(_) => {
                self.helper("__aihu_cpath");
                self.lit_h(&format!("<!--aihu:{}s:", slash));
                self.expr_h(format!("__aihu_cpath({})", path.js_expr()));
                self.lit_h("-->");
            }
        }
    }

    // ── children ─────────────────────────────────────────────────────────────

    /// Mirror of `emit_nodes` + the walker's branch-children loop: filter the
    /// dropped text nodes, index the survivors, and interleave `<!--|-->`
    /// between adjacent text leaves (hydratable only).
    fn emit_children(
        &mut self,
        nodes: &[TemplateNode],
        parent: &P,
        sm: &SignalMap,
        sn: &StateNames,
    ) {
        let kept: Vec<&TemplateNode> = nodes.iter().filter(|n| !node_is_dropped(n)).collect();
        for (i, node) in kept.iter().enumerate() {
            if i > 0
                && node_is_text_leaf(kept[i - 1], self.mode)
                && node_is_text_leaf(node, self.mode)
            {
                self.lit_h("<!--|-->");
            }
            let child_path = parent.child(&i.to_string());
            self.emit_node(node, &child_path, sm, sn);
        }
    }

    // ── node dispatch ────────────────────────────────────────────────────────

    fn emit_node(&mut self, node: &TemplateNode, path: &P, sm: &SignalMap, sn: &StateNames) {
        if self.bail {
            return;
        }
        match node {
            TemplateNode::Text(s) => match normalize_text_node(s) {
                NormalizedText::Dropped => {}
                NormalizedText::Nbsp => self.lit("\u{00A0}"),
                NormalizedText::Text(t) => {
                    let escaped = escape_text_ct(&t);
                    self.lit(&escaped);
                }
            },
            TemplateNode::Interpolation(id) => self.emit_interpolation(id, sm),
            TemplateNode::Element { tag, attrs, children } => {
                self.emit_element_with_effects(tag, attrs, children, path, sm, sn, false)
            }
            TemplateNode::MacroElement { name, attrs, children } => {
                self.emit_element_with_effects(name, attrs, children, path, sm, sn, true)
            }
            TemplateNode::IfBlock { branches } => self.emit_if_block(branches, path, sm, sn),
            TemplateNode::EachBlock {
                list_expr,
                item_alias,
                idx_alias,
                key_expr,
                body,
                empty_body,
            } => self.emit_each_block(
                list_expr,
                item_alias,
                idx_alias.as_deref(),
                key_expr.as_deref(),
                body,
                empty_body.as_deref(),
                path,
                sm,
                sn,
            ),
            TemplateNode::HtmlBlock { .. } => {
                // `{@html}` lowers to a placeholder `<span data-aihu-html="">`
                // whose content is wired at mount — SSR renders the empty span.
                self.lit("<span data-aihu-html=\"\"");
                self.path_attr(path);
                self.lit("></span>");
            }
        }
    }

    // ── interpolation ladder (mirror of emit_node's Interpolation arm) ──────

    fn emit_interpolation(&mut self, id: &str, sm: &SignalMap) {
        let trimmed = id.trim();
        let is_simple_ident = !trimmed.is_empty()
            && trimmed
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');

        // 1. Bare registered signal/computed → reactive leaf; walker renders
        //    `escapeText(String(get()))` where get() = `<ident>()` either way.
        if is_simple_ident && sm.0.contains_key(trimmed) {
            self.helper("__aihu_stext");
            self.expr(format!("__aihu_stext({}())", trimmed));
            return;
        }

        // 2. Dotted reactive fast path.
        let dotted_fast_path = match self.mode {
            ExprParserMode::Legacy => true,
            ExprParserMode::Ast => is_pure_dotted_path(trimmed),
        };
        if dotted_fast_path {
            if let Some(dot_pos) = trimmed.find('.') {
                let base = &trimmed[..dot_pos];
                let prop_path = &trimmed[dot_pos + 1..];
                let base_is_ident = !base.is_empty()
                    && base
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
                if base_is_ident {
                    if sm.is_computed(base) {
                        self.helper("__aihu_stext");
                        self.expr(format!("__aihu_stext(({}() as any).{})", base, prop_path));
                        return;
                    } else if let Some(setter) = sm.0.get(base) {
                        if !setter.is_empty() {
                            self.helper("__aihu_stext");
                            self.expr(format!(
                                "__aihu_stext(({}() as any).{})",
                                base, prop_path
                            ));
                            return;
                        }
                    }
                }
            }
        }

        // 3./4. Rewritten complex expression: reactive-thunk when it calls or
        //    reads a signal (walker: `String(thunk())`), eager otherwise
        //    (walker: `value == null ? '' : String(value)`).
        let rewritten = rewrite_template_expr(trimmed, sm, self.mode);
        if interpolation_has_call(&rewritten.source) || rewritten.reads_signal {
            self.helper("__aihu_stext");
            self.expr(format!("__aihu_stext(({}))", rewritten.source));
        } else {
            self.helper("__aihu_stext0");
            self.expr(format!("__aihu_stext0(({}))", rewritten.source));
        }
    }

    // ── structural wrappers on an element (attribute-form each/if) ──────────

    #[allow(clippy::too_many_arguments)]
    fn emit_element_with_effects(
        &mut self,
        tag: &str,
        attrs: &[Attr],
        children: &[TemplateNode],
        path: &P,
        sm: &SignalMap,
        sn: &StateNames,
        is_macro_element: bool,
    ) {
        // Per-item scoping (W3 d03): an element-level `each` shadows
        // same-named signals/state for the element's own attrs/children.
        let scoped = each_scoped_maps(attrs, sm, sn, self.mode);
        let (inner_sm, inner_sn): (&SignalMap, &StateNames) = match &scoped {
            Some((a, b)) => (a, b),
            None => (sm, sn),
        };

        // Directive scan mirroring emit_macro_effects_scoped's composition:
        // element effects (SSR-transparent) → once/memo (transparent) →
        // if (structural) → each (outermost structural).
        let mut has_each = false;
        let mut each_head: Option<crate::parser::directives::EachOfHead> = None;
        let mut key_fn: Option<String> = None;
        let mut if_cond: Option<String> = None;
        for attr in attrs {
            let Attr::Macro { name, value } = attr else { continue };
            match name.as_str() {
                "each" => {
                    has_each = true;
                    let raw = macro_value_expr(value);
                    match crate::parser::directives::parse_each_of_head(&raw) {
                        Ok(h) => each_head = Some(h),
                        Err(_) => {
                            // emit_macro_effects falls back to alias `item`/`i`
                            // over the raw text; malformed heads are rejected
                            // at parse time, so simply refuse to lower.
                            self.bail = true;
                            return;
                        }
                    }
                }
                "key" => key_fn = Some(macro_value_expr(value)),
                "if" => if_cond = Some(macro_value_expr(value)),
                _ => {}
            }
        }

        if has_each {
            let head = each_head.unwrap();
            // The LIST evaluates in the OUTER scope; mirror emit_macro_effects:
            // reactive list → tuple/[getter] (walker reads `list[0]()` →
            // `<ident>()`), complex list → `[() => (rewritten)]` → rewritten.
            let resolved_list = if sm.is_reactive(&head.list) {
                format!("{}()", head.list)
            } else {
                format!("({})", rewrite_template_expr(&head.list, sm, self.mode).source)
            };
            // Key runs per-item with the loop-scoped map (emit_macro_effects
            // passes the inner signal_map to the key rewrite).
            let key_resolved = key_fn
                .as_ref()
                .filter(|k| !k.is_empty())
                .map(|k| rewrite_template_expr(k, inner_sm, self.mode).source);
            let idx = "i".to_string();
            let idx_alias = {
                // emit_macro_effects uses head.idx or "i".
                head.idx.clone().unwrap_or(idx)
            };
            let item_alias = head.item.clone();
            let if_cond_c = if_cond.clone();
            let tag_c = tag.to_string();
            let attrs_c: Vec<Attr> = attrs.to_vec();
            let children_c: Vec<TemplateNode> = children.to_vec();
            self.structural_list(
                path,
                &resolved_list,
                key_resolved.as_deref(),
                &item_alias,
                &idx_alias,
                inner_sm,
                inner_sn,
                &move |e: &mut Emitter, item_path: &P, sm2: &SignalMap, sn2: &StateNames| {
                    e.emit_if_then_base(
                        &tag_c,
                        &attrs_c,
                        &children_c,
                        if_cond_c.as_deref(),
                        item_path,
                        sm2,
                        sn2,
                        is_macro_element,
                    );
                },
            );
            return;
        }

        self.emit_if_then_base(
            tag,
            attrs,
            children,
            if_cond.as_deref(),
            path,
            inner_sm,
            inner_sn,
            is_macro_element,
        );
    }

    /// The `if` wrapper (attribute form — grow returns the element DIRECTLY,
    /// no fragment) around the base element/macro-element rendering.
    #[allow(clippy::too_many_arguments)]
    fn emit_if_then_base(
        &mut self,
        tag: &str,
        attrs: &[Attr],
        children: &[TemplateNode],
        if_cond: Option<&str>,
        path: &P,
        sm: &SignalMap,
        sn: &StateNames,
        is_macro_element: bool,
    ) {
        match if_cond {
            Some(cond) => {
                let resolved = self.resolve_cond(cond, sm);
                self.marker(path, false);
                self.stmt(format!("if ({}) {{", resolved));
                self.indent += 1;
                let inner = path.child("conditional.true");
                if is_macro_element {
                    self.emit_macro_base(tag, attrs, children, &inner, sm, sn);
                } else {
                    self.emit_element_base(tag, attrs, children, &inner, sm, sn);
                }
                self.flush();
                self.indent -= 1;
                self.stmts.push(format!("{}}}", self.pad()));
                self.marker(path, true);
            }
            None => {
                if is_macro_element {
                    self.emit_macro_base(tag, attrs, children, path, sm, sn);
                } else {
                    self.emit_element_base(tag, attrs, children, path, sm, sn);
                }
            }
        }
    }

    /// Mirror of `emit_macro_effects`'s `$if` cond lowering, resolved to the
    /// runtime read the walker performs (`_condTruthy` → `cond[0]()`).
    fn resolve_cond(&mut self, cond: &str, sm: &SignalMap) -> String {
        let trimmed = cond.trim();
        let is_simple_ident = !trimmed.is_empty()
            && trimmed
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
        if is_simple_ident && sm.is_reactive(trimmed) {
            format!("{}()", trimmed)
        } else {
            format!("({})", rewrite_template_expr(trimmed, sm, self.mode).source)
        }
    }

    // ── base renderings ──────────────────────────────────────────────────────

    fn emit_element_base(
        &mut self,
        tag: &str,
        attrs: &[Attr],
        children: &[TemplateNode],
        path: &P,
        sm: &SignalMap,
        sn: &StateNames,
    ) {
        // §2.6 enhanced <a> — createLinkBoundary renders
        // `branch('a', { ...forwarded, href, 'data-aihu-link': '', onClick }, children)`.
        if tag == "a" && anchor_is_enhanced(attrs) {
            let forwarded: Vec<&Attr> = attrs
                .iter()
                .filter(|a| !matches!(attr_name(a), "href" | "prefetch" | "replace" | "reload"))
                .collect();
            if has_duplicate_keys(&forwarded, &["href", "data-aihu-link"]) {
                self.bail = true;
                return;
            }
            self.lit("<a");
            self.emit_attr_list(&forwarded, sm, sn);
            // href: static → folded; dynamic → thunk resolved at render.
            self.emit_anchor_href(attrs, sm);
            self.lit(" data-aihu-link=\"\"");
            // onClick is a function attr — never serialized.
            self.root_scope_attr(path);
            self.path_attr(path);
            self.lit(">");
            self.emit_children(children, path, sm, sn);
            self.lit("</a>");
            return;
        }

        // A plain (opted-out) <a> must not render framework vocabulary words.
        let filtered: Vec<&Attr> = if tag == "a" {
            attrs
                .iter()
                .filter(|a| !matches!(attr_name(a), "reload" | "prefetch" | "replace"))
                .collect()
        } else {
            attrs.iter().collect()
        };
        if has_duplicate_keys(&filtered, &[]) {
            self.bail = true;
            return;
        }

        let is_raw = attrs
            .iter()
            .any(|a| matches!(a, Attr::Macro { name, value } if name == "raw" && *value == MacroValue::Boolean));

        // O1a: component references render their normalized custom-element
        // name; the walker renders them as plain (un-upgraded) elements.
        let rendered_tag = if crate::tags::is_component_tag(tag) {
            crate::tags::kebab_component_tag(tag)
        } else {
            tag.to_string()
        };

        // Child component resolution — step 3a of
        // `docs/plans/2026-08-05-ssr-child-components.md`.
        //
        // A reference to another component compiles to an EMPTY element: the
        // child's template lives in its own module, which this compilation
        // never sees, so there is nothing to inline. That is why every
        // prerendered page ships an empty `<site-header>`.
        //
        // The fix is a call, not an inline: `__aihu_schild` (in
        // `@aihu/runtime/ssr`) looks the tag up in the registry the CALLER
        // pre-resolved onto `__opts` and renders the child through the child's
        // OWN compiled renderer. @aihu/server's tree walker calls the same
        // function, so a resolved child is serialized in exactly one place
        // rather than once per renderer — the two paths could already only
        // drift in bytes (the differential suite pins that); this keeps them
        // from drifting in capability, which nothing pins.
        //
        // With no registry the helper emits this same empty element, so every
        // site that has not wired one up is byte-identical to before.
        //
        // Emitted through `expr` (not `expr_h`) because the helper reads
        // `__opts.hydratable` itself — one call serves both variants.
        //
        // ELIGIBILITY — and it is written TWICE: here, against the raw template
        // AST, and in `renderNodeAsync`'s child arm (`@aihu/server/src/ssr.ts`),
        // against the LOWERED arbor node. Both renderers must reach the same
        // verdict or the page ships one renderer's fill-in and the other's empty
        // element, with a registry present. That is the exact class of bug the
        // differential suite exists to catch, and it drifted anyway because the
        // walker's input is LOSSY: by the time it sees the node, macros and
        // whitespace-only text are already gone. It cannot tell `<x-kid>` from
        // `<x-kid show={on()}>`, nor from `<x-kid>\n</x-kid>`.
        //
        // The consequence is a one-way constraint: for those shapes the walker
        // CANNOT be made to decline, so this side has to be the one that agrees.
        // Each condition below is therefore phrased as "what does the walker
        // see", not "what did the author write":
        //
        //   - `attr_survives_lowering` — an attribute at a reference site is a
        //     prop, and rendering the child with defaults while the client
        //     renders it with real ones is a hydration mismatch. But only the
        //     attrs that reach the lowered `attrs` object are props: `Static`,
        //     every `Binding` (event handlers included — they occupy a key), and
        //     the `bind:` / `on:` macros. Element-level DIRECTIVE macros
        //     (`show`, `class:`, `ref`, `once`, `raw`, `html`, `if`, …) lower to
        //     mount effects OUTSIDE the attrs object, so the walker sees zero
        //     attrs and resolves. Mirrors `lower_attrs` in `template_emit.rs`.
        //   - `is_raw || node_is_dropped` — children are slot content and slot
        //     projection is unimplemented, but two shapes are children that are
        //     not: a whitespace run SPANNING LINES is template indentation that
        //     normalizes to nothing (the same predicate `emit_children` filters
        //     on, so "no children" means the same thing on both sides), and
        //     `raw` discards its children wholesale during lowering, so the
        //     walker sees an empty node whatever was written. A single-line
        //     whitespace run survives on BOTH (it is a significant inline space)
        //     and correctly blocks resolution.
        //   - `path.base.is_none()` — the path is a COMPILE-TIME LITERAL. Only
        //     an `{#each}` item boundary sets `base`, so this excludes exactly
        //     the runtime-keyed paths; a `{#if}` branch keeps a literal path and
        //     stays eligible. `_isLiteralPath` in `ssr.ts` is the walker's
        //     mirror, reconstructed from the path STRING (it rejects any `list`
        //     segment, which is what precedes every runtime key).
        //   - not at ROOT_PATH — the root element carries the PARENT's `data-a`
        //     stamp (`root_scope_attr`), which the host attrs here do not model.
        //
        // `html={…}` deserves a note: it is a DIRECTIVE, so a reference carrying
        // it resolves the child and the html expression is never emitted. That
        // is not a loss — it is the walker's long-standing behaviour, and the
        // client agrees with it: the lowered node is `branch('x-kid', undefined,
        // [])` exactly as for a bare reference, and the `html` mount effect
        // skips its first run inside a `data-aihu-ssr` boundary. Emitting the
        // html here instead produced two DIFFERENT non-empty trees — strictly
        // worse than either renderer's answer alone.
        if crate::tags::is_component_tag(tag)
            && !attrs.iter().any(attr_survives_lowering)
            && (is_raw || children.iter().all(node_is_dropped))
            && path.base.is_none()
            && path.tail != "0"
        {
            self.helper("__aihu_schild");
            // The host keeps its own `data-aihu-path`: it IS a node in this
            // component's tree. The child's tree restarts at ROOT_PATH behind
            // the `data-aihu-ssr` boundary the helper stamps, which is what
            // arbor's `hydrate()` already expects of a nested marked host.
            self.expr(format!(
                "__aihu_schild('{}', __h ? ' data-aihu-path=\"{}\"' : '', __opts)",
                rendered_tag, path.tail
            ));
            return;
        }

        // `html={expr}` is a mount-time effect on the client (the element's
        // children are `replaceChildren`'d from a parsed fragment), so it used
        // to be SSR-transparent: the element serialized empty and the content
        // existed only once JS ran. That silently hollowed out every page whose
        // body IS an `html` binding — apps/docs-next' guides prerendered ~60
        // bytes of nav chrome and nothing else, so crawlers, agents, and
        // readiness graders saw empty documents.
        //
        // The binding's value is a plain string at render time, so SSR can
        // simply interpolate it unescaped — that is what `html` means, and it
        // matches the fragment the client parses from the same expression. The
        // client effect still runs on hydrate and replaces these children with
        // an identical tree.
        //
        // `raw` wins: it already suppresses children wholesale.
        let html_expr = if is_raw {
            None
        } else {
            attrs.iter().find_map(|a| match a {
                Attr::Macro { name, value } if name == "html" => Some(macro_value_expr(value)),
                _ => None,
            })
        };

        self.lit(&format!("<{}", rendered_tag));
        self.emit_attr_list(&filtered, sm, sn);
        self.root_scope_attr(path);
        self.path_attr(path);
        self.lit(">");
        if let Some(raw_html) = html_expr {
            // Nullish → empty string, mirroring the client path, where
            // createContextualFragment(undefined) would yield "undefined".
            let resolved = rewrite_template_expr(&raw_html, sm, self.mode).source;
            self.expr(format!("String(({}) ?? '')", resolved));
        } else if !is_raw {
            self.emit_children(children, path, sm, sn);
        }
        // The walker's branch arm closes EVERY tag (it never consults the
        // void-element set — that path is only for `leaf.element`, which the
        // compiler does not emit). `<img></img>` is what the walker produces,
        // so it is what we produce.
        self.lit(&format!("</{}>", rendered_tag));
    }

    fn emit_macro_base(
        &mut self,
        name: &str,
        attrs: &[Attr],
        children: &[TemplateNode],
        path: &P,
        sm: &SignalMap,
        sn: &StateNames,
    ) {
        match name {
            // <group> — fragment carrier. emit_nodes collapse: 0 children →
            // empty fragment (no bytes); 1 → the child IS the node at `path`;
            // >1 → fragment branch, children at `path.i`.
            "group" => {
                let kept: Vec<&TemplateNode> =
                    children.iter().filter(|n| !node_is_dropped(n)).collect();
                match kept.len() {
                    0 => {}
                    1 => self.emit_node(kept[0], path, sm, sn),
                    _ => self.emit_children(children, path, sm, sn),
                }
            }
            // <slot> — createSlotBoundary drops its children and renders an
            // arbor `slot(name?)` ELEMENT LEAF: `<slot>`/`<slot name="…">`,
            // closed (slot is not a void element), no path attr (leaves carry
            // none).
            "slot" => {
                match find_static_attr(attrs, "name") {
                    Some(n) => self.lit(&format!("<slot name=\"{}\"></slot>", escape_attr_ct(n))),
                    None => self.lit("<slot></slot>"),
                }
            }
            // a11y primitives — plain branches with fixed attrs; the collapsed
            // children subtree is the single child at `path.0`.
            "liveRegion" => {
                let politeness = find_static_attr(attrs, "politeness").unwrap_or("polite");
                let politeness = if politeness == "assertive" { "assertive" } else { "polite" };
                let atomic = find_static_attr(attrs, "atomic")
                    .map(|v| v != "false")
                    .unwrap_or(true);
                self.lit(&format!(
                    "<div role=\"status\" aria-live=\"{}\" aria-atomic=\"{}\"",
                    politeness,
                    if atomic { "true" } else { "false" }
                ));
                self.path_attr(path);
                self.lit(">");
                self.emit_collapsed_child(children, &path.child("0"), sm, sn);
                self.lit("</div>");
            }
            "visuallyHidden" => {
                self.lit("<span class=\"aihu-sr-only\"");
                self.path_attr(path);
                self.lit(">");
                self.emit_collapsed_child(children, &path.child("0"), sm, sn);
                self.lit("</span>");
            }
            "skipLink" => {
                let target = find_static_attr(attrs, "target").unwrap_or("#main");
                self.lit(&format!(
                    "<a href=\"{}\" class=\"aihu-skip-link\"",
                    escape_attr_ct(target)
                ));
                self.path_attr(path);
                self.lit(">");
                self.emit_collapsed_child(children, &path.child("0"), sm, sn);
                self.lit("</a>");
            }
            // Everything else (suspense/shield/guard/warp/focusTrap/router/
            // link/outlet/navigate/unknown) — refuse to lower; the module
            // keeps the tree walker as its only renderer.
            _ => {
                self.bail = true;
            }
        }
    }

    /// A macro element whose lowering wraps `emit_nodes(children)` as ONE
    /// child: that collapsed subtree renders at `path` directly (single or
    /// fragment semantics identical to `<group>` at that position).
    fn emit_collapsed_child(
        &mut self,
        children: &[TemplateNode],
        path: &P,
        sm: &SignalMap,
        sn: &StateNames,
    ) {
        let kept: Vec<&TemplateNode> = children.iter().filter(|n| !node_is_dropped(n)).collect();
        match kept.len() {
            0 => {}
            1 => self.emit_node(kept[0], path, sm, sn),
            _ => self.emit_children(children, path, sm, sn),
        }
    }

    // ── attribute serialization (mirror of emit_attrs + fixed serializeAttrs) ─

    fn emit_attr_list(&mut self, attrs: &[&Attr], sm: &SignalMap, sn: &StateNames) {
        for a in attrs {
            match a {
                Attr::Static { name, value } => {
                    self.lit(&format!(" {}=\"{}\"", name, escape_attr_ct(value)));
                }
                Attr::Binding { name, expr } => {
                    if is_event_attr_name(name) {
                        continue; // function value — never serialized
                    }
                    if name == "class" && expr.trim_start().starts_with('[') {
                        // `class={[…]}` array form → `[() => __aihu_cls(inner)]`,
                        // resolved to the joined string at render.
                        let inner = match self.mode {
                            ExprParserMode::Legacy => expr.trim().to_string(),
                            ExprParserMode::Ast => {
                                rewrite_template_expr(expr.trim(), sm, self.mode).source
                            }
                        };
                        self.attr_hole(name, &format!("__aihu_cls({})", inner));
                        continue;
                    }
                    let resolved = self.resolve_attr_value(expr, sm, sn);
                    self.attr_hole(name, &resolved);
                }
                Attr::Macro { name, value } => {
                    if let Some(prop) = name.strip_prefix("bind:") {
                        let expr = macro_value_expr(value);
                        let resolved = self.resolve_attr_value(&expr, sm, sn);
                        self.attr_hole(prop, &resolved);
                    }
                    // `on:*` → function attrs (never serialized); structural/
                    // effect macros are handled at the element level; the R4
                    // bind write-back listeners are functions too.
                }
            }
        }
    }

    /// ` k="v"` hole with the walker's fixed value semantics: functions never
    /// serialize, `true` → bare attr, `false`/`undefined` → omitted,
    /// everything else `String(v)` attr-escaped.
    fn attr_hole(&mut self, name: &str, resolved: &str) {
        self.helper("__aihu_sattr");
        self.expr(format!("__aihu_sattr('{}', {})", name.replace('\'', "\\'"), resolved));
    }

    /// Mirror of `lower_attr_expr`, resolved to the value the walker reads:
    /// tuple `[get, set]` → `get()`; thunk `[() => (X)]` → `X`; plain → expr.
    fn resolve_attr_value(&mut self, expr: &str, sm: &SignalMap, sn: &StateNames) -> String {
        let trimmed = expr.trim();
        let is_simple_ident = !trimmed.is_empty()
            && trimmed
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
        if is_simple_ident && sm.is_reactive(trimmed) {
            return format!("{}()", trimmed);
        }
        if expr_references_state(expr, sn) || !is_simple_ident {
            format!("({})", rewrite_template_expr(trimmed, sm, self.mode).source)
        } else {
            format!("({})", expr)
        }
    }

    /// Enhanced-anchor `href` mirror of `link_href_arg` + the boundary's
    /// `typeof href === 'function' ? [() => href()] : href` split.
    fn emit_anchor_href(&mut self, attrs: &[Attr], sm: &SignalMap) {
        let mut emitted = false;
        for a in attrs {
            match a {
                Attr::Static { name, value } if name == "href" => {
                    self.lit(&format!(" href=\"{}\"", escape_attr_ct(value)));
                    emitted = true;
                    break;
                }
                Attr::Macro { name, value: MacroValue::Quoted(s) } if name == "href" => {
                    self.lit(&format!(" href=\"{}\"", escape_attr_ct(s)));
                    emitted = true;
                    break;
                }
                Attr::Binding { name, expr } if name == "href" => {
                    let resolved =
                        format!("({})", rewrite_template_expr(expr, sm, self.mode).source);
                    self.attr_hole("href", &resolved);
                    emitted = true;
                    break;
                }
                Attr::Macro { name, value: MacroValue::Curly(expr) } if name == "href" => {
                    let resolved =
                        format!("({})", rewrite_template_expr(expr, sm, self.mode).source);
                    self.attr_hole("href", &resolved);
                    emitted = true;
                    break;
                }
                _ => {}
            }
        }
        if !emitted {
            // link_href_arg defaults to `'#'` — but anchor_is_enhanced
            // requires an href, so this arm is unreachable for lowered input.
            self.lit(" href=\"#\"");
        }
    }

    // ── structural emitters ──────────────────────────────────────────────────

    /// `when()` structural node: markers always (hydratable), content only
    /// when the condition is truthy.
    fn structural_conditional(
        &mut self,
        path: &P,
        cond: &str,
        body: &dyn Fn(&mut Emitter, &P),
    ) {
        self.marker(path, false);
        self.stmt(format!("if ({}) {{", cond));
        self.indent += 1;
        let inner = path.child("conditional.true");
        body(self, &inner);
        self.flush();
        self.indent -= 1;
        self.stmts.push(format!("{}}}", self.pad()));
        self.marker(path, true);
    }

    /// `each()` structural node: markers around all items; per-item content
    /// at `path.list.KEY`.
    #[allow(clippy::too_many_arguments)]
    fn structural_list(
        &mut self,
        path: &P,
        resolved_list: &str,
        key_resolved: Option<&str>,
        item_alias: &str,
        idx_alias: &str,
        sm: &SignalMap,
        sn: &StateNames,
        body: &dyn Fn(&mut Emitter, &P, &SignalMap, &StateNames),
    ) {
        self.marker(path, false);
        let lv = self.tmp_name("l");
        let av = self.tmp_name("a");
        let iv = self.tmp_name("i");
        let kv = self.tmp_name("k");
        let pv = self.tmp_name("p");
        // Walker `_listItems`: a non-array read renders as empty (fail-safe).
        self.stmt(format!("const {} = {}", lv, resolved_list));
        self.stmt(format!(
            "const {} = Array.isArray({}) ? {} : []",
            av, lv, lv
        ));
        self.stmt(format!(
            "for (let {i} = 0; {i} < {a}.length; {i}++) {{",
            i = iv,
            a = av
        ));
        self.indent += 1;
        self.stmt(format!("const {} = {}[{}]", item_alias, av, iv));
        // The key computes BEFORE the index alias binds — the runtime keyFn
        // is `(item) => key`, item-only, so a key expression reaching for the
        // index alias must fail here exactly as it fails in the walker/client
        // (TDZ here, ReferenceError there — a throw either way, never a
        // silently diverging render).
        self.helper("__aihu_key");
        match key_resolved {
            Some(k) => self.stmt(format!("const {} = __aihu_key({})", kv, k)),
            None => self.stmt(format!("const {} = __aihu_key({})", kv, iv)),
        }
        if idx_alias != item_alias {
            self.stmt(format!("const {} = {}", idx_alias, iv));
        }
        self.stmt(format!(
            "const {} = {} + '.list.' + {}",
            pv,
            path.js_expr(),
            kv
        ));
        let item_path = P { base: Some(pv), tail: String::new() };
        body(self, &item_path, sm, sn);
        self.flush();
        self.indent -= 1;
        self.stmts.push(format!("{}}}", self.pad()));
        self.marker(path, true);
    }

    // ── IfBlock / EachBlock (chain-assembled forms) ─────────────────────────

    /// Mirror of `emit_if_block`: N branches lower to N SIBLING `when()`
    /// nodes with negated-prior conditions. One branch → the single when node
    /// sits at `path` itself; several → a fragment at `path` holds them at
    /// `path.k`. Every branch body is wrapped in a fragment, so content
    /// continues at `WHEN.conditional.true.i`.
    fn emit_if_block(
        &mut self,
        branches: &[(String, Vec<TemplateNode>)],
        path: &P,
        sm: &SignalMap,
        sn: &StateNames,
    ) {
        let single = branches.len() == 1;
        let mut prior: Vec<String> = Vec::new();
        for (k, (cond, body)) in branches.iter().enumerate() {
            let when_path = if single { path.clone() } else { path.child(&k.to_string()) };
            let rewritten_cond = rewrite_template_expr(cond, sm, self.mode).source;
            let cond_js = if cond.is_empty() {
                // {:else} — all priors false.
                prior
                    .iter()
                    .map(|c| format!("!({})", c))
                    .collect::<Vec<_>>()
                    .join(" && ")
            } else if prior.is_empty() {
                self.resolve_cond(cond, sm)
            } else {
                let mut parts: Vec<String> =
                    prior.iter().map(|c| format!("!({})", c)).collect();
                parts.push(format!("({})", rewritten_cond));
                parts.join(" && ")
            };
            let body_c: Vec<TemplateNode> = body.to_vec();
            let sm_c = sm.clone();
            let sn_c = sn.clone();
            self.structural_conditional(&when_path, &cond_js, &move |e, inner| {
                // emit_if_block's emit_body ALWAYS wraps in a fragment branch,
                // so children continue at `inner.i`.
                e.emit_children(&body_c, inner, &sm_c, &sn_c);
            });
            if !cond.is_empty() {
                prior.push(rewritten_cond);
            }
        }
    }

    /// Mirror of `emit_each_block` (chain-assembled `each` + optional
    /// `empty` sibling).
    #[allow(clippy::too_many_arguments)]
    fn emit_each_block(
        &mut self,
        list_expr: &str,
        item_alias: &str,
        idx_alias: Option<&str>,
        key_expr: Option<&str>,
        body: &[TemplateNode],
        empty_body: Option<&[TemplateNode]>,
        path: &P,
        sm: &SignalMap,
        sn: &StateNames,
    ) {
        // W3 alias shadowing — body/key evaluate against alias-filtered maps
        // under AST mode (mirror of emit_each_block).
        let mut alias_names = BTreeSet::new();
        if self.mode == ExprParserMode::Ast {
            super::sidecar_ts::extract_pattern_idents(item_alias, &mut alias_names);
            if let Some(idx) = idx_alias {
                super::sidecar_ts::extract_pattern_idents(idx, &mut alias_names);
            }
        }
        let filtered_sm: SignalMap;
        let filtered_sn: StateNames;
        let (body_sm, body_sn): (&SignalMap, &StateNames) = if alias_names
            .iter()
            .any(|n| sm.0.contains_key(n) || sn.contains(n))
        {
            filtered_sm = SignalMap(
                sm.0.iter()
                    .filter(|(k, _)| !alias_names.contains(*k))
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect(),
            );
            filtered_sn = StateNames(
                sn.0.iter()
                    .filter(|n| !alias_names.contains(*n))
                    .cloned()
                    .collect(),
            );
            (&filtered_sm, &filtered_sn)
        } else {
            (sm, sn)
        };

        let rewritten_list = rewrite_template_expr(list_expr, sm, self.mode).source;
        // Mirror emit_each_block's items_arg shapes, resolved to the walker's
        // `list[0]()` read.
        let resolved_list = if sm.is_reactive(list_expr) {
            format!("{}()", list_expr)
        } else {
            format!("({})", rewritten_list)
        };
        let key_resolved = key_expr
            .map(|k| rewrite_template_expr(k, body_sm, self.mode).source);
        let idx_alias_s = idx_alias.unwrap_or("i").to_string();
        let item_alias_s = item_alias.to_string();

        // The each node either sits at `path` (no empty arm) or inside a
        // fragment's first when() sibling.
        match empty_body {
            None => {
                self.each_core(
                    path,
                    &resolved_list,
                    key_resolved.as_deref(),
                    &item_alias_s,
                    &idx_alias_s,
                    body,
                    body_sm,
                    body_sn,
                );
            }
            Some(eb) => {
                // Fragment at `path` with two when() children:
                //   path.0 → populated (cond: list non-empty) wrapping the each
                //   path.1 → empty arm
                let cond_list = if sm.is_reactive(list_expr) {
                    format!("{}()", list_expr)
                } else {
                    rewritten_list.clone()
                };
                let populated = format!("(({}) && ({}).length > 0)", cond_list, cond_list);
                let empty_cond = format!("!(({}) && ({}).length > 0)", cond_list, cond_list);

                let p0 = path.child("0");
                self.marker(&p0, false);
                self.stmt(format!("if ({}) {{", populated));
                self.indent += 1;
                // grow returns the each call directly → the each structural
                // node renders at `p0.conditional.true`.
                let each_path = p0.child("conditional.true");
                self.each_core(
                    &each_path,
                    &resolved_list,
                    key_resolved.as_deref(),
                    &item_alias_s,
                    &idx_alias_s,
                    body,
                    body_sm,
                    body_sn,
                );
                self.flush();
                self.indent -= 1;
                self.stmts.push(format!("{}}}", self.pad()));
                self.marker(&p0, true);

                let p1 = path.child("1");
                self.marker(&p1, false);
                self.stmt(format!("if ({}) {{", empty_cond));
                self.indent += 1;
                let empty_path = p1.child("conditional.true");
                // emit_each_block: single part → the node directly; several →
                // fragment children (mirrors its empty_str shape).
                let kept: Vec<&TemplateNode> =
                    eb.iter().filter(|n| !node_is_dropped(n)).collect();
                match kept.len() {
                    0 => self.emit_children(eb, &empty_path, sm, sn),
                    1 => self.emit_node(kept[0], &empty_path, sm, sn),
                    _ => self.emit_children(eb, &empty_path, sm, sn),
                }
                self.flush();
                self.indent -= 1;
                self.stmts.push(format!("{}}}", self.pad()));
                self.marker(&p1, true);
            }
        }
    }

    /// The each() structural node for an EachBlock: markers + loop; the item
    /// body is a single node at the item path or a fragment (mirrors
    /// emit_each_block's `body_str`).
    #[allow(clippy::too_many_arguments)]
    fn each_core(
        &mut self,
        path: &P,
        resolved_list: &str,
        key_resolved: Option<&str>,
        item_alias: &str,
        idx_alias: &str,
        body: &[TemplateNode],
        sm: &SignalMap,
        sn: &StateNames,
    ) {
        let body_c: Vec<TemplateNode> = body.to_vec();
        let sm_c = sm.clone();
        let sn_c = sn.clone();
        self.structural_list(
            path,
            resolved_list,
            key_resolved,
            item_alias,
            idx_alias,
            sm,
            sn,
            &move |e, item_path, _sm2, _sn2| {
                let kept: Vec<&TemplateNode> =
                    body_c.iter().filter(|n| !node_is_dropped(n)).collect();
                match kept.len() {
                    0 => {}
                    1 => e.emit_node(kept[0], item_path, &sm_c, &sn_c),
                    _ => e.emit_children(&body_c, item_path, &sm_c, &sn_c),
                }
            },
        );
    }
}

/// True when two attrs would land on the same key of the runtime attrs
/// OBJECT (last-wins), which the compile-time fold cannot mirror without
/// re-implementing object-literal semantics. `extra` are keys the caller
/// appends itself (the enhanced-anchor `href`/`data-aihu-link`).
fn has_duplicate_keys(attrs: &[&Attr], extra: &[&str]) -> bool {
    let mut seen: BTreeSet<String> = extra.iter().map(|s| s.to_string()).collect();
    for a in attrs {
        let key = match a {
            Attr::Static { name, .. } => name.clone(),
            Attr::Binding { name, .. } => name.clone(),
            Attr::Macro { name, .. } => match name.strip_prefix("bind:") {
                Some(p) => p.to_string(),
                // Other macros (each/if/on:/class:/…) never serialize a key
                // of their own.
                None => continue,
            },
        };
        if !seen.insert(key) {
            return true;
        }
    }
    false
}

// ─── node classification ─────────────────────────────────────────────────────

/// A node that contributes NO child to its parent (mirrors emit_node
/// returning `""` — only multi-line whitespace text does).
fn node_is_dropped(node: &TemplateNode) -> bool {
    matches!(node, TemplateNode::Text(s) if matches!(normalize_text_node(s), NormalizedText::Dropped))
}

/// Does this attribute reach the LOWERED arbor node's `attrs` object — the
/// only thing @aihu/server's tree walker can see when IT decides whether a
/// component reference is eligible for child rendering?
///
/// Mirrors `lower_attrs` in `template_emit.rs`, which is the authority:
///   - `Static` and `Binding` always emit a key (event bindings included —
///     `onclick={fn}` occupies `onclick` even though nothing serializes it);
///   - a `Macro` emits a key only for `bind:*` (the bound prop) and `on:*`
///     (the handler);
///   - every other macro is an element-level DIRECTIVE lowered to a mount
///     effect outside the attrs object, so the walker never sees it.
///
/// The asymmetry is why this predicate exists rather than `attrs.is_empty()`:
/// the walker cannot fail closed on something it cannot observe, so the
/// eligible sets can only be reconciled on this side. Kept next to
/// `node_is_dropped` because the two encode the same idea — "what survives
/// into the tree the walker walks".
fn attr_survives_lowering(a: &Attr) -> bool {
    match a {
        Attr::Static { .. } | Attr::Binding { .. } => true,
        Attr::Macro { name, .. } => name.starts_with("bind:") || name.starts_with("on:"),
    }
}

/// Does this node render as a bare TEXT leaf at runtime? (Drives the
/// `<!--|-->` boundary — the walker's `_isTextLeaf`.) `<group>` collapses,
/// so a single-text-child group IS a text leaf.
fn node_is_text_leaf(node: &TemplateNode, mode: ExprParserMode) -> bool {
    match node {
        TemplateNode::Text(_) => !node_is_dropped(node),
        TemplateNode::Interpolation(_) => true,
        TemplateNode::MacroElement { name, attrs, children } if name == "group" => {
            // A group carrying structural/effect directives wraps in a
            // boundary (never a leaf).
            let has_structural = attrs.iter().any(|a| {
                matches!(a, Attr::Macro { name, .. } if matches!(name.as_str(), "each" | "if" | "once" | "memo"))
            });
            if has_structural {
                return false;
            }
            let kept: Vec<&TemplateNode> =
                children.iter().filter(|n| !node_is_dropped(n)).collect();
            kept.len() == 1 && node_is_text_leaf(kept[0], mode)
        }
        _ => false,
    }
}

// ─── compile-time escaping (exact mirrors of ssr.ts) ────────────────────────

/// `escapeText`: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;` (that order).
fn escape_text_ct(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

/// `escapeAttr`: `&` → `&amp;`, `"` → `&quot;`.
fn escape_attr_ct(s: &str) -> String {
    s.replace('&', "&amp;").replace('"', "&quot;")
}

// ─── chunk rendering ─────────────────────────────────────────────────────────

fn push_lit(buf: &mut Vec<Part>, s: &str) {
    if s.is_empty() {
        return;
    }
    if let Some(Part::Lit(prev)) = buf.last_mut() {
        prev.push_str(s);
        return;
    }
    buf.push(Part::Lit(s.to_string()));
}

/// Render a part sequence as ONE JS template-literal expression (or a plain
/// single-quoted literal when hole-free and quote-friendly). `None` = empty.
fn render_parts(parts: &[Part]) -> Option<String> {
    if parts.is_empty() {
        return None;
    }
    let mut out = String::from("`");
    for p in parts {
        match p {
            Part::Lit(s) => out.push_str(&escape_template_literal(s)),
            Part::Expr(e) => {
                out.push_str("${");
                out.push_str(e);
                out.push('}');
            }
        }
    }
    out.push('`');
    Some(out)
}

fn escape_template_literal(s: &str) -> String {
    s.replace('\\', "\\\\").replace('`', "\\`").replace("${", "\\${")
}
