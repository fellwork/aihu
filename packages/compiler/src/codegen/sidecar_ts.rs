use crate::codegen::signals::SignalMap;
use crate::types::{Attr, CompileUnit, MacroValue, TemplateNode};
use super::state_emit::{transform_bare_declaration};
use super::template_emit::macro_value_expr;
/// B3 — Emit a TypeScript sidecar containing the SFC's template expressions
/// as typed body statements. Per Architect spec §7 path (i):
///
/// ```ts
/// // foo.aihu.ts (generated)
/// declare function __template(): void {
///   // expressions lifted from @template:
///   ;(view === 'week') satisfies boolean
///   ;(day.toISOString()) satisfies string
///   // ...
/// }
/// ```
///
/// TS-gen steps 1–3 (#485, template-grammar 40-spec §5): the sidecar is no
/// longer a flat lift. Every captured expression is REWRITTEN before it is
/// lifted (`expr::rewrite_signal_reads` — bare signal/prop reads check at
/// their authored value types, not as getter functions); `if=`/`elseif=`/
/// `else` chains and `{#if}` blocks emit REAL `if/else if/else` blocks so
/// TypeScript narrowing flows into branch bodies; and `each=`/`{#each}`
/// loops emit `for (const [item, i] of __aihu_each(list))` against one
/// overloaded helper so loop binders carry inferred element types instead
/// of `any` params. `tsc --noEmit` flags type errors on real `.aihu` lines.
pub(crate) fn emit_sidecar_ts(
    unit: &CompileUnit,
    tag_name: &str,
    strict_templates: bool,
) -> Option<String> {
    let nodes = unit.template_ast.as_ref()?;
    // Always emit a sidecar when a template is present so tsc has a per-SFC
    // surface to check, even if the @template happens to contain only static
    // markup at this moment.

    let script = unit.source.script.unwrap_or("").trim();
    // Preamble re-declares typical SFC globals so tsc has a permissive type
    // scope. We type these as `any` because precise typing requires deeper
    // SFC -> TS lowering (B3+ sidecar refinement is a watched item).
    // B3b — derive a typed `$emit` interface from the SFC's `$event:` collection
    // entries (if any). Each `$event: { name: { payload: T } }` entry contributes
    // a strongly-typed dispatcher: `dayjump: (payload: { day: Date }) => void`.
    // Falls back to the permissive `unknown` shape when no $event collection
    // is declared so existing fixtures continue to type-check.
    let mut macros = crate::parser::state_macros::parse_state_macros(script).unwrap_or_default();
    // #487 — the wrapper dialect's `event<P>('name', …)` statement calls feed
    // the same typed `$emit` derivation (state-model spec §3.2.6).
    let wrapper_scan =
        crate::parser::state_wrappers::scan_state_wrappers(script).unwrap_or_default();
    macros.extend(wrapper_scan.macros.iter().cloned());
    let event_entries: Vec<(&str, Option<&str>)> = macros
        .iter()
        .flat_map(|m| {
            if let crate::types::StateMacro::Collection {
                kind: crate::types::CollectionKind::Event,
                entries,
            } = m
            {
                entries
                    .iter()
                    .map(|e| {
                        let payload = e
                            .meta
                            .iter()
                            .find(|(k, _)| k == "payload")
                            .map(|(_, v)| v.trim());
                        (e.name.as_str(), payload)
                    })
                    .collect::<Vec<_>>()
            } else {
                Vec::new()
            }
        })
        .collect();
    let (emit_decl, event_decl) = if event_entries.is_empty() {
        (
            "declare const $emit: { [name: string]: (payload?: unknown) => void };".to_string(),
            "declare const $event: { [name: string]: { payload: unknown } };".to_string(),
        )
    } else {
        let emit_lines: Vec<String> = event_entries
            .iter()
            .map(|(n, p)| {
                let p_ts = p.unwrap_or("unknown");
                format!("  {}: (payload: {}) => void;", n, p_ts)
            })
            .collect();
        let event_lines: Vec<String> = event_entries
            .iter()
            .map(|(n, p)| {
                let p_ts = p.unwrap_or("unknown");
                format!("  {}: {{ payload: {} }};", n, p_ts)
            })
            .collect();
        (
            format!("declare const $emit: {{\n{}\n}};", emit_lines.join("\n")),
            format!("declare const $event: {{\n{}\n}};", event_lines.join("\n")),
        )
    };
    // COMPACT one-line preamble. All framework-global decls + the derived
    // `$emit`/`$event` decls live on a SINGLE physical line, and the function
    // opener on the next. That two-line prefix is what makes the line-preserving
    // layout below work: every lifted template expression at or after source
    // line 3 can be placed on its exact `.aihu` line, so `tsc` diagnostics cite
    // the real source line instead of a bunched-up projection region.
    //
    // A framework global is declared only when the script does NOT already bind
    // that name. Now that the @state body is inlined verbatim, a component that
    // imports `signal` from '@aihu/signals' brings its own — and an ambient
    // re-declaration beside the import is a hard TS2440 conflict.
    const FRAMEWORK_GLOBALS: &[(&str, &str)] = &[
        ("signal", "declare const signal: <T>(initial: T) => readonly [() => T, (v: T) => void];"),
        ("computed", "declare const computed: <T>(fn: () => T) => () => T;"),
        ("onMount", "declare const onMount: (fn: () => void | (() => void)) => void;"),
        ("onCleanup", "declare const onCleanup: (fn: () => void) => void;"),
        ("onAdopt", "declare const onAdopt: (fn: () => void) => void;"),
        (
            "onAttributeChange",
            "declare const onAttributeChange: (fn: (name: string, oldVal: string | null, newVal: string | null) => void) => void;",
        ),
    ];
    let script_bound = script_bound_names(script);
    let mut globals: String = FRAMEWORK_GLOBALS
        .iter()
        .filter(|(name, _)| !script_bound.contains(*name))
        .map(|(_, decl)| *decl)
        .collect::<Vec<_>>()
        .join(" ");
    // #487 §5 — the identity-typed intrinsic declarations (state-model spec
    // §5.1). Emitted ONLY for a wrapper-dialect file, so old-dialect sidecars
    // stay byte-identical. Wrapper declarations are valid TS checked IN PLACE
    // (§5.4) — the binding a wrapper declares carries the author-facing VALUE
    // type, so `const city = prop<string>({ default: 'London' })` types
    // `city: string` and template expressions close over it directly.
    // Names an authored import shadows are skipped (same discipline as the
    // framework globals above).
    if !wrapper_scan.macros.is_empty() {
        const WRAPPER_TYPE_DECLS: &str = "type __AihuExpose = 'read' | 'write' | 'read write' | 'public' | { read?: boolean; write?: boolean }; interface __AihuMemberConfig { describe?: string; expose?: __AihuExpose } interface __AihuPropConfig<T> { default?: T; required?: boolean; describe?: string; expose?: __AihuExpose; attribute?: string | boolean; reflect?: boolean } interface __AihuResource<T> { readonly loading: boolean; readonly data: T | null; readonly error: Error | null; refetch(): Promise<void> } interface __AihuStream { readonly value: string; readonly delta: string; readonly status: string; readonly error: Error | null; start(source?: unknown): Promise<void>; stop(): void }";
        const WRAPPER_INTRINSIC_DECLS: &[(&str, &str)] = &[
            ("state", "declare function state<T>(initial: T): T;"),
            ("prop", "declare function prop<T>(config: __AihuPropConfig<T> & { default: T }): T; declare function prop<T>(config: __AihuPropConfig<T> & { required: true }): T; declare function prop<T>(config?: __AihuPropConfig<T>): T | undefined;"),
            ("derived", "declare function derived<T>(fn: () => T): T; declare function derived<T>(config: __AihuMemberConfig, fn: () => T): T;"),
            ("action", "declare function action<F extends (...args: any[]) => any>(fn: F): F; declare function action<F extends (...args: any[]) => any>(config: __AihuMemberConfig, fn: F): F;"),
            ("resource", "declare function resource<T>(fn: () => T | Promise<T>): __AihuResource<T>; declare function resource<T>(config: __AihuMemberConfig, fn: () => T | Promise<T>): __AihuResource<T>;"),
            ("stream", "declare function stream<T>(source: () => T): __AihuStream; declare function stream<T>(config: { describe?: string }, source: () => T): __AihuStream;"),
            ("controller", "declare function controller<C>(factory: () => C): C; declare function controller<C>(config: { describe?: string }, factory: () => C): C;"),
            ("route", "declare function route(): any;"),
            ("consume", "declare function consume<T = unknown>(key: string): T;"),
            ("effect", "declare function effect(fn: () => void): void; declare function effect(config: { on: readonly unknown[] }, fn: () => void): void;"),
            ("onDispose", "declare function onDispose(fn: () => void): void;"),
            ("aria", "declare function aria(config: Record<string, unknown>): void;"),
            ("provide", "declare function provide(key: string, value: unknown): void;"),
            ("form", "declare function form(config: { value?: unknown; validity?: unknown }): void;"),
            ("event", "declare function event<P = unknown>(name: string, config?: { describe?: string; bubbles?: boolean; composed?: boolean }): void;"),
            ("beforeNavigate", "declare function beforeNavigate(fn: (...args: any[]) => any): void;"),
            ("afterNavigate", "declare function afterNavigate(fn: (...args: any[]) => any): void;"),
        ];
        globals.push(' ');
        globals.push_str(WRAPPER_TYPE_DECLS);
        for (name, decl) in WRAPPER_INTRINSIC_DECLS {
            if !script_bound.contains(*name) {
                globals.push(' ');
                globals.push_str(decl);
            }
        }
    }
    // GX Phase 4 (#466, 70-governed-data-access §4.5) — the generated
    // withheld-type contract for a `data:`-declared route. One authored type
    // (the `$prop route` declared `data` member) derives the discriminated
    // union the template sees: `route.data : __GxEntitled<T> | __GxWithheld<T, P>`,
    // discriminated on `$gx.entitled`, with `__GxWithheld` carrying NO key of
    // `T` beyond the declared `preview:` subset. `__gxEntitled` is the
    // narrowing predicate the lifted template expressions are rewritten onto
    // (TS does not narrow through the nested `$gx.entitled` discriminant
    // itself — a checked fact, not a guess). G7g: unguarded `route.data` field
    // access fails `tsc`; guarded access passes. `None` for every ungoverned
    // route — their sidecars are byte-identical to before Phase 4.
    let governed_data = unit.source.route.as_ref().and_then(|r| r.data.as_ref());
    let gx_type_decls = match governed_data {
        Some(_) => {
            "type __GxEntitled<T> = T & { readonly $gx: { readonly entitled: true } }; \
             type __GxWithheld<T, P extends PropertyKey = never> = { readonly $gx: { readonly \
             entitled: false; readonly reason: 'auth' | 'scope' | 'entitlement' | 'unavailable' \
             }; readonly preview?: { readonly [K in P & keyof T]?: T[K] } }; \
             type __GxData<T, P extends PropertyKey = never> = __GxEntitled<T> | __GxWithheld<T, P>; \
             type __GxRoute<R, P extends PropertyKey = never> = Omit<R, 'data'> & { readonly \
             data: __GxData<R extends { data: infer D } ? D : unknown, P> }; \
             declare function __gxEntitled<T, P extends PropertyKey>(d: __GxData<T, P>): d is __GxEntitled<T>; "
        }
        None => "",
    };
    // Steps 1–3 (#485): collect the template as a statement TREE, rewriting
    // every captured expression (scope-aware signal-read rewrite + the GX
    // predicate rewrite) and recovering each one's `.aihu` line via a single
    // forward cursor over the ORIGINAL template text — the raw capture is what
    // the cursor searches, so the rewrite never perturbs line mapping.
    let template_text = unit.source.template.unwrap_or("");
    let tmpl_first_line = unit.source.template_line; // 1-based; 0 if no @template
    let mut collector = SidecarCollector {
        template_text,
        tmpl_first_line,
        cursor: 0,
        signal_map: sidecar_signal_map(script, governed_data.is_some()),
        governed: governed_data.is_some(),
        uses_each: false,
        each_counter: 0,
        strict: strict_templates,
        chk_counter: 0,
    };
    let stmts = collector.collect(nodes, &std::collections::BTreeSet::new());

    // Step 3 — the ONE overloaded loop helper (the Vue `__VLS_getVForSourceType`
    // / svelte2tsx `ensureArray` pattern, 40-spec §5). Declared only when the
    // template loops, so loop-free sidecars carry no dead scaffolding.
    let each_helper = if collector.uses_each {
        "declare function __aihu_each<T>(list: readonly T[]): ReadonlyArray<[T, number]>; \
         declare function __aihu_each<T>(list: Iterable<T>): ReadonlyArray<[T, number]>; \
         declare function __aihu_each(list: number): ReadonlyArray<[number, number]>; "
    } else {
        ""
    };

    // #486 step 4 — the strict-templates attribute/component-prop layer's
    // shared type scaffolding. `AihuComponentProps` is a GLOBAL interface each
    // compiled component augments with its own tag→props entry (declaration
    // merging across every sidecar in the program — the
    // `JSX.IntrinsicElements` analog, derived from the `prop()` wrapper /
    // `$prop` declarations, no parallel table). `__AihuPropsOf` resolves a
    // tag to its merged entry and FAILS OPEN (`Record<string, any>`) for tags
    // no compiled component declares, so third-party custom elements are
    // never over-constrained.
    let strict_type_decls = if strict_templates {
        "declare global { interface AihuComponentProps {} } \
         type __AihuPropsOf<K extends string> = K extends keyof AihuComponentProps \
         ? AihuComponentProps[K] : Record<string, any>; "
    } else {
        ""
    };

    let preamble_line = format!(
        "{} declare function __handler(h: (...args: any[]) => any): void; {} {} {}{}{}{} \
         // {}.aihu type-check sidecar (generated, line-preserving)",
        globals,
        to_single_line(&emit_decl),
        to_single_line(&event_decl),
        gx_type_decls,
        each_helper,
        strict_type_decls,
        macro_binding_decls(script, governed_data),
        tag_name
    );

    // Line-preserving body. `lines[i]` is sidecar line i+1: line 1 = preamble,
    // then the @state body verbatim at its own source lines, then the template
    // function whose statements each sit on their real `.aihu` line (recovered
    // by the collector's forward cursor; statements are collected in source
    // order, so the cursor disambiguates repeats). Expressions are collapsed to
    // a single physical line, so a multi-line source expression is reported at
    // its START line, and several expressions sharing a source line share a
    // sidecar line.
    //
    // @state precedes @template in every ordinary SFC, so the script's lines and
    // the template's lines never collide and both keep their true numbers. When a
    // file inverts that order the script still lands on its real lines and the
    // template function stacks after it — diagnostics inside @state stay exact,
    // and the template's may shift. `script_opener_line` is the last line we may
    // not write into.
    let mut lines: Vec<String> = vec![preamble_line];

    // The @state body, on its real lines, at module scope — so the template
    // function below closes over every binding with its TRUE type.
    //
    // Plain JS/TS lines (imports, `const`s, functions — the bulk of a @state
    // block) go through verbatim and are fully checked, each on its own source
    // line. Macro lines are blanked: `$prop: { … }` and friends are aihu syntax,
    // not TypeScript (`type: { params: { ref: string } }` uses `string` in value
    // position), so feeding them to tsc raises syntax errors on code the author
    // never wrote. What the macros BIND is declared instead, on the preamble line
    // — with the prop's real declared type where `type:` gives one.
    let mut macro_lines = macro_line_set(script);
    // #487 §6.4 — the naked `extract: { … }` directive is NOT valid TS in
    // label position, so its lines keep the sidecar blanking `$extract` had.
    // (`shadow:`/`base:` are valid labeled statements and stay in place, as
    // do all wrapper declarations — that is the point of the model.)
    for (m, (s, e)) in wrapper_scan.macros.iter().zip(wrapper_scan.spans.iter()) {
        if matches!(m, crate::types::StateMacro::Extract { .. }) {
            let first = newlines_before(script, (*s).min(script.len()));
            let last = newlines_before(script, (*e).min(script.len()));
            for l in first..=last {
                macro_lines.insert(l);
            }
        }
    }
    let script_first_line = unit.source.script_line; // 1-based; 0 if no @state
    if script_first_line > 0 && !script.is_empty() {
        for (n, text) in script.lines().enumerate() {
            let idx = script_first_line - 1 + n;
            if idx >= lines.len() {
                lines.resize(idx + 1, String::new());
            }
            // `transform_bare_declaration` is the SAME lowering the runtime emit
            // applies: `@state` accepts a bare typed declaration with no keyword —
            // `intervalId: number | null = null`, `rates: Record<…, number> = {…}` —
            // and that is aihu syntax, not TypeScript. Inlined verbatim it reads as
            // a labelled statement, so tsc reports `'number' only refers to a type,
            // but is being used as a value here` on a line the author wrote
            // correctly, and the name never gets declared (every template reference
            // to it then false-errors as undefined). Lowering it to `let name: T = …`
            // keeps the line — and its length, so the mapping still holds.
            let text = if macro_lines.contains(&n) {
                String::new()
            } else {
                transform_bare_declaration(text)
            };
            // Line 1 is the preamble and must not be overwritten. A @state body
            // cannot start there in practice (the `@state {` opener occupies a
            // line above it), so this only guards the pathological case.
            if idx > 0 {
                lines[idx] = text;
            }
        }
    }

    // Open the template function on the first free line after the script. Loop
    // binders are bound by real `for…of` heads now (step 3), so the function
    // takes no parameters — every other name comes from the inlined @state
    // body, the preamble declarations, or the `__aihu_ctx` value view, with
    // its true type.
    //
    // `__aihu_ctx` is the declared VALUE view of the registered getters the
    // step-1 rewrite targets: `ReturnType<typeof name>` derives each member's
    // type from the getter binding the inlined @state body (or the preamble's
    // macro decls) already carries — one authored type, no parallel table. It
    // rides the opener line, AFTER the @state lines, so every `typeof` query
    // resolves against the real bindings.
    let opener_line = lines.len().max(1) + 1;
    lines.resize(opener_line - 1, String::new());
    let ctx_decl = if collector.signal_map.0.is_empty() {
        String::new()
    } else {
        let members: Vec<String> = collector
            .signal_map
            .0
            .keys()
            .map(|k| format!("{k}: ReturnType<typeof {k}>", k = k))
            .collect();
        format!(
            "declare const {}: {{ {} }}; ",
            crate::expr::rewrite::TYPECHECK_CTX,
            members.join("; ")
        )
    };
    lines.push(format!("{}function __aihu_template(): void {{", ctx_decl));
    let mut placer = SidecarPlacer { lines, opener_line };
    emit_sidecar_stmts(&stmts, &mut placer);
    let mut lines = placer.lines;
    lines.push("}".to_string());
    // #486 step 4 — register THIS component's tag→props entry on the global
    // `AihuComponentProps` interface. The member types are DERIVED from the
    // authored declarations, not re-extracted: a wrapper-dialect
    // `const city = prop<string>({…})` binding carries the author-facing
    // value type in place (state-model spec §5.4), so `typeof city` IS the
    // prop's type; an old-dialect `$prop` binds an accessor
    // (`let city: () => T`, see `macro_binding_decls`), so its value type is
    // `ReturnType<typeof city>`. Every entry is optional — required-prop
    // presence is not this layer's check; wrong types and unknown prop names
    // are.
    if strict_templates {
        let mut members: Vec<String> = Vec::new();
        for m in &macros {
            let crate::types::StateMacro::Collection {
                kind: crate::types::CollectionKind::Prop,
                entries,
            } = m
            else {
                continue;
            };
            for e in entries {
                // `route` is framework-injected, never parent-passed — and on
                // a governed route it is declared as a VALUE, so the accessor
                // derivation would not even type. Skip it.
                if e.name == "route" {
                    continue;
                }
                let ty = if e.wrapper {
                    format!("typeof {}", e.name)
                } else {
                    format!("ReturnType<typeof {}>", e.name)
                };
                members.push(format!("{}?: {}", e.name, ty));
            }
        }
        lines.push(format!(
            "declare global {{ interface AihuComponentProps {{ {:?}: {{ {} }} }} }}",
            tag_name,
            members.join("; ")
        ));
    }
    // #487 — a wrapper-dialect sidecar is forced into MODULE scope so its
    // `declare function` intrinsics never collide with lib.dom script-scope
    // globals (`event`). A strict-templates sidecar needs module scope too:
    // `declare global` augmentation is only legal inside a module. No-op when
    // the inlined @state body already imports.
    if strict_templates || !wrapper_scan.macros.is_empty() {
        lines.push("export {}".to_string());
    }
    Some(format!("{}\n", lines.join("\n")))
}

// ─── #485 steps 1–3 — the sidecar statement tree ─────────────────────────────

/// GX Phase 4 (#466): TypeScript does not narrow the `Entitled | Withheld`
/// union through the nested `$gx.entitled` discriminant, so on a governed
/// route every occurrence of the authored guard is rewritten to the declared
/// narrowing predicate — in `if=` heads (where step 2's real `if` blocks make
/// it narrow branch bodies) and inside ternaries/`&&` chains alike.
const GX_GUARD: &str = "route.data.$gx.entitled";
const GX_PRED: &str = "__gxEntitled(route.data)";

/// A statement in the sidecar's template function: a lifted expression, a real
/// `if/else if/else` chain (step 2 — narrowing), or a `for…of` loop over the
/// `__aihu_each` helper (step 3 — inferred loop-binder types).
enum SidecarStmt {
    Expr {
        /// Rewritten, single-line expression text (signal reads called, GX
        /// predicate applied).
        ts: String,
        /// 1-based `.aihu` line (0 = unknown → stacked after the current body).
        line: usize,
        /// Handlers are functions — emitted in CALL position so inline arrow
        /// params get a contextual `any` (a bare `void ((e) => …)` would leave
        /// `e` implicit-any → TS7006).
        is_handler: bool,
    },
    If {
        branches: Vec<SidecarBranch>,
    },
    /// #486 step 4 — a strict-templates check statement placed VERBATIM: the
    /// `document.createElement` element materialization, an
    /// `__chk_N.prop = (expr);` attribute assignment, or a component-prop
    /// assignment against `__AihuPropsOf<'tag'>`.
    Raw {
        ts: String,
        line: usize,
    },
    Each {
        /// Tuple binding pattern for the loop head: `[item]`, `[item, i]`,
        /// `[[k, v], i]` — the rejoined alias list wrapped as one pattern.
        binders: String,
        /// Rewritten list expression — evaluated OUTSIDE the alias scope, via
        /// the intermediate const (the svelte2tsx alias-shadows-iterable
        /// trick), so `each={items of items}` reads the outer binding.
        list_ts: String,
        line: usize,
        id: usize,
        body: Vec<SidecarStmt>,
        /// `{:empty}` / `empty` sibling statements — checked OUTSIDE the loop
        /// scope (the aliases are not in scope in an empty branch).
        empty: Vec<SidecarStmt>,
    },
}

struct SidecarBranch {
    /// `None` for the trailing `else` branch.
    cond_ts: Option<String>,
    line: usize,
    body: Vec<SidecarStmt>,
}

/// The signal/prop/computed getter names whose bare template reads the sidecar
/// rewrites onto the `__aihu_ctx` value view — the same registration set the
/// JS emitter's call rewrite uses (`resolve_signals` + `$computed`/`$prop`
/// names), so the two surfaces share one expression semantics. Every name here
/// must have a getter DECLARATION in the sidecar surface (the inlined @state
/// body or `macro_binding_decls`) for `ReturnType<typeof name>` to resolve —
/// which is why `$route` bindings (undeclared in the sidecar today) are not
/// registered. On a governed route `route` is EXCLUDED: the sidecar declares
/// it as a VALUE (`__GxRoute<…>`), so the authored `route.data.$gx.entitled`
/// chains stay textually intact for the GX predicate rewrite.
fn sidecar_signal_map(script: &str, governed: bool) -> SignalMap {
    let mut map = crate::codegen::signals::resolve_signals(script);
    let macros = crate::parser::state_macros::parse_state_macros(script).unwrap_or_default();
    for m in &macros {
        if let crate::types::StateMacro::Collection { kind, entries } = m {
            match kind {
                crate::types::CollectionKind::Computed | crate::types::CollectionKind::Prop => {
                    for e in entries {
                        map.insert_computed(&e.name);
                    }
                }
                _ => {}
            }
        }
    }
    if governed {
        map.0.remove("route");
    }
    map
}

/// Walks the template AST into `SidecarStmt`s: rewrites every captured
/// expression (scope-aware — loop binders shadow signals, mirroring
/// `emit_each_block`'s alias-filtered maps) and recovers source lines with one
/// forward cursor over the RAW template text, in source order.
struct SidecarCollector<'a> {
    template_text: &'a str,
    /// 1-based `.aihu` line of the template body's first line; 0 if unknown.
    tmpl_first_line: usize,
    cursor: usize,
    signal_map: SignalMap,
    governed: bool,
    uses_each: bool,
    each_counter: usize,
    /// #486 step 4 — emit the attribute/component-prop check layer.
    strict: bool,
    /// Unique ids for the per-element `__chk_N` check consts.
    chk_counter: usize,
}

impl SidecarCollector<'_> {
    /// Recover a raw capture's 1-based `.aihu` line (0 = unknown). Forward-only
    /// cursor: captures are visited in source order, so repeats disambiguate.
    fn recover_line(&mut self, raw: &str) -> usize {
        if self.tmpl_first_line == 0 || raw.is_empty() {
            return 0;
        }
        match self.template_text.get(self.cursor..).and_then(|s| s.find(raw)) {
            Some(off) => {
                let abs = self.cursor + off;
                self.cursor = abs + raw.len();
                self.tmpl_first_line + newlines_before(self.template_text, abs)
            }
            None => 0,
        }
    }

    /// #486 step 4 — recover a STATIC attribute's 1-based `.aihu` line by
    /// locating its `name="value"` (or `name='value'`) text. Shares the
    /// forward-only cursor, and attrs scan in source order, so the recovery
    /// stays sound alongside expression captures. 0 = unknown (stacks).
    fn recover_static_line(&mut self, name: &str, value: &str) -> usize {
        if self.tmpl_first_line == 0 {
            return 0;
        }
        for pat in [
            format!("{}=\"{}\"", name, value),
            format!("{}='{}'", name, value),
        ] {
            if let Some(off) = self.template_text.get(self.cursor..).and_then(|s| s.find(&pat)) {
                let abs = self.cursor + off;
                self.cursor = abs + pat.len();
                return self.tmpl_first_line + newlines_before(self.template_text, abs);
            }
        }
        0
    }

    /// Step 1 — rewrite-before-lift: bare reads of registered getters check at
    /// their authored VALUE types via the `__aihu_ctx` view (`count > 0` →
    /// `__aihu_ctx.count > 0`), scope-aware against the current loop-binder
    /// shadow set. The value-view form (not the JS emitter's `count()` call
    /// form) is what lets step 2's real `if` blocks narrow: TypeScript never
    /// narrows a call result, but does narrow a const-rooted property chain.
    /// Captures that don't parse fall back to the raw text (under the `ast`
    /// default they were already rejected with C320/C321 before emit; under
    /// `legacy` this preserves the old lift). The GX predicate rewrite applies
    /// AFTER, on the textual guard chain.
    fn rewrite(&self, raw: &str, shadow: &std::collections::BTreeSet<String>) -> String {
        let rewritten = if shadow.iter().any(|n| self.signal_map.0.contains_key(n)) {
            let filtered = SignalMap(
                self.signal_map
                    .0
                    .iter()
                    .filter(|(k, _)| !shadow.contains(*k))
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect(),
            );
            crate::expr::rewrite_signal_reads_typecheck(raw, &filtered)
        } else {
            crate::expr::rewrite_signal_reads_typecheck(raw, &self.signal_map)
        };
        let mut text = rewritten.map(|r| r.source).unwrap_or_else(|| raw.to_string());
        if self.governed {
            text = text.replace(GX_GUARD, GX_PRED);
        }
        to_single_line(&text)
    }

    fn collect(
        &mut self,
        nodes: &[TemplateNode],
        shadow: &std::collections::BTreeSet<String>,
    ) -> Vec<SidecarStmt> {
        let mut out: Vec<SidecarStmt> = Vec::new();
        for node in nodes {
            match node {
                TemplateNode::Element { tag, attrs, children } => {
                    self.collect_element(Some(tag.as_str()), attrs, children, shadow, &mut out);
                }
                TemplateNode::MacroElement { attrs, children, .. } => {
                    // Framework elements (`<group>`, `<suspense>`, …) carry no
                    // attribute type surface — only their macro attrs matter.
                    self.collect_element(None, attrs, children, shadow, &mut out);
                }
                TemplateNode::Interpolation(s) => {
                    let line = self.recover_line(s);
                    out.push(SidecarStmt::Expr {
                        ts: self.rewrite(s, shadow),
                        line,
                        is_handler: false,
                    });
                }
                TemplateNode::HtmlBlock { expr } => {
                    let line = self.recover_line(expr);
                    out.push(SidecarStmt::Expr {
                        ts: self.rewrite(expr, shadow),
                        line,
                        is_handler: false,
                    });
                }
                TemplateNode::IfBlock { branches } => {
                    let mut sb: Vec<SidecarBranch> = Vec::new();
                    for (cond, body) in branches {
                        let (cond_ts, line) = if cond.trim().is_empty() {
                            (None, 0)
                        } else {
                            let line = self.recover_line(cond);
                            (Some(self.rewrite(cond, shadow)), line)
                        };
                        let body_stmts = self.collect(body, shadow);
                        sb.push(SidecarBranch { cond_ts, line, body: body_stmts });
                    }
                    out.push(SidecarStmt::If { branches: sb });
                }
                TemplateNode::EachBlock {
                    list_expr,
                    item_alias,
                    idx_alias,
                    key_expr,
                    body,
                    empty_body,
                } => {
                    let line = self.recover_line(list_expr);
                    let list_ts = self.rewrite(list_expr, shadow);
                    let mut inner = shadow.clone();
                    push_alias_bindings(item_alias, idx_alias.as_deref(), &mut inner);
                    let binders =
                        format!("[{}]", rejoin_alias_list(item_alias, idx_alias.as_deref()));
                    let mut body_stmts: Vec<SidecarStmt> = Vec::new();
                    if let Some(k) = key_expr {
                        // The key runs with the aliases bound (per-item).
                        let kline = self.recover_line(k);
                        body_stmts.push(SidecarStmt::Expr {
                            ts: self.rewrite(k, &inner),
                            line: kline,
                            is_handler: false,
                        });
                    }
                    body_stmts.extend(self.collect(body, &inner));
                    let empty = match empty_body {
                        Some(eb) => self.collect(eb, shadow),
                        None => Vec::new(),
                    };
                    self.uses_each = true;
                    let id = self.each_counter;
                    self.each_counter += 1;
                    out.push(SidecarStmt::Each { binders, list_ts, line, id, body: body_stmts, empty });
                }
                TemplateNode::Text(_) => {}
            }
        }
        out
    }

    /// An element's own captured attribute expressions plus its children, with
    /// the element-level `if=`/`each=` directives lowered structurally. Loop
    /// (`each`) is the OUTER wrapper and `if` the inner one, matching the
    /// runtime composition in `emit_macro_effects` (the `if` evaluates per
    /// item); the element's other attribute expressions and children evaluate
    /// in the loop/branch scope, while the each LIST evaluates outside.
    fn collect_element(
        &mut self,
        tag: Option<&str>,
        attrs: &[Attr],
        children: &[TemplateNode],
        shadow: &std::collections::BTreeSet<String>,
        out: &mut Vec<SidecarStmt>,
    ) {
        enum RawKind {
            Plain,
            Handler,
            /// #486 step 4 — a typed `__chk_N.prop = (expr);` assignment
            /// (HTML attribute or component prop). `prop` is the full
            /// assignment target path.
            Assign {
                prop: String,
            },
            /// #486 step 4 — a static string checked AS A STRING LITERAL
            /// against the attribute's type (`disabled="false"` is a type
            /// error under `--strict-templates`). `literal` is the quoted TS
            /// string literal; no rewrite applies.
            StaticAssign {
                prop: String,
                literal: String,
            },
        }
        struct RawExpr {
            raw: String,
            line: usize,
            kind: RawKind,
        }
        // #486 step 4 — what this element's attributes type-check against:
        // a real DOM interface (the `document.createElement` trick) for a
        // known HTML tag, the merged `AihuComponentProps` entry for a
        // hyphenated/PascalCase component tag, nothing for SVG/MathML and
        // framework elements.
        enum CheckTarget {
            Html(String),
            Component(String),
        }
        let target: Option<CheckTarget> = if self.strict {
            match tag {
                Some(t) if crate::tags::is_component_tag(t) => {
                    Some(CheckTarget::Component(crate::tags::kebab_component_tag(t)))
                }
                Some(t) if crate::tags::is_html_dom_element(t) => {
                    Some(CheckTarget::Html(t.to_string()))
                }
                _ => None,
            }
        } else {
            None
        };
        let mut chk_id: Option<usize> = None;
        // (list raw, head line, binder tuple pattern, bound names)
        let mut each_head: Option<(String, usize, String, std::collections::BTreeSet<String>)> =
            None;
        let mut if_cond: Option<(String, usize)> = None;
        let mut attr_exprs: Vec<RawExpr> = Vec::new();
        // Attrs scan in source order so the line-recovery cursor stays sound.
        for a in attrs {
            match a {
                Attr::Macro { name, value } if name == "each" => {
                    let clause = macro_value_expr(value);
                    match crate::parser::directives::parse_each_of_head(&clause) {
                        Ok(head) => {
                            let line = self.recover_line(&head.list);
                            let mut bound = std::collections::BTreeSet::new();
                            push_alias_bindings(&head.item, head.idx.as_deref(), &mut bound);
                            let binders = format!(
                                "[{}]",
                                rejoin_alias_list(&head.item, head.idx.as_deref())
                            );
                            each_head = Some((head.list, line, binders, bound));
                        }
                        Err(_) => {
                            // Malformed heads are rejected at parse time; keep
                            // the list capture checked as a plain expression.
                            let raw = clause.trim().to_string();
                            let line = self.recover_line(&raw);
                            attr_exprs.push(RawExpr { raw, line, kind: RawKind::Plain });
                        }
                    }
                }
                Attr::Macro { name, value } if name == "if" => {
                    let raw = macro_value_expr(value);
                    let line = self.recover_line(&raw);
                    if_cond = Some((raw, line));
                }
                Attr::Macro { name, value } if name.starts_with("on:") => {
                    let raw = macro_value_expr(value);
                    let line = self.recover_line(&raw);
                    attr_exprs.push(RawExpr { raw, line, kind: RawKind::Handler });
                }
                Attr::Binding { name, expr } => {
                    let line = self.recover_line(expr);
                    let kind = match &target {
                        Some(CheckTarget::Html(_)) => match html_attr_prop(name) {
                            Some(prop) => {
                                let id = *chk_id.get_or_insert_with(|| {
                                    let i = self.chk_counter;
                                    self.chk_counter += 1;
                                    i
                                });
                                RawKind::Assign { prop: format!("__chk_{}.{}", id, prop) }
                            }
                            None => RawKind::Plain,
                        },
                        Some(CheckTarget::Component(_)) if component_prop_candidate(name) => {
                            let id = *chk_id.get_or_insert_with(|| {
                                let i = self.chk_counter;
                                self.chk_counter += 1;
                                i
                            });
                            RawKind::Assign { prop: format!("__chk_{}.{}", id, name) }
                        }
                        _ => RawKind::Plain,
                    };
                    attr_exprs.push(RawExpr { raw: expr.clone(), line, kind });
                }
                Attr::Static { name, value }
                    if self.strict
                        && !value.is_empty()
                        && matches!(target, Some(CheckTarget::Html(_))) =>
                {
                    // §2.2 normative static-attribute typing, boolean attrs:
                    // the quoted string checks as a string literal against
                    // the boolean property type — always a type error, which
                    // is the point (`disabled="false"` is truthy in HTML;
                    // W602 already warns non-strict).
                    if let Some(prop) = boolean_attr_prop(name) {
                        let line = self.recover_static_line(name, value);
                        let id = *chk_id.get_or_insert_with(|| {
                            let i = self.chk_counter;
                            self.chk_counter += 1;
                            i
                        });
                        attr_exprs.push(RawExpr {
                            raw: String::new(),
                            line,
                            kind: RawKind::StaticAssign {
                                prop: format!("__chk_{}.{}", id, prop),
                                literal: format!("{:?}", value),
                            },
                        });
                    }
                }
                Attr::Macro { value: MacroValue::Curly(s), .. } => {
                    let raw = s.clone();
                    let line = self.recover_line(&raw);
                    attr_exprs.push(RawExpr { raw, line, kind: RawKind::Plain });
                }
                _ => {}
            }
        }
        // Per-item scope: the each binders shadow outer names for the cond,
        // the other attribute expressions, and the children.
        let mut inner_storage;
        let inner: &std::collections::BTreeSet<String> = match &each_head {
            Some((_, _, _, bound)) => {
                inner_storage = shadow.clone();
                inner_storage.extend(bound.iter().cloned());
                &inner_storage
            }
            None => shadow,
        };
        let mut current: Vec<SidecarStmt> = Vec::new();
        let mut chk_declared = false;
        for e in attr_exprs {
            match e.kind {
                RawKind::Plain => current.push(SidecarStmt::Expr {
                    ts: self.rewrite(&e.raw, inner),
                    line: e.line,
                    is_handler: false,
                }),
                RawKind::Handler => current.push(SidecarStmt::Expr {
                    ts: self.rewrite(&e.raw, inner),
                    line: e.line,
                    is_handler: true,
                }),
                RawKind::Assign { prop } => {
                    if !chk_declared {
                        current.push(SidecarStmt::Raw {
                            ts: chk_decl(&target, chk_id),
                            line: e.line,
                        });
                        chk_declared = true;
                    }
                    current.push(SidecarStmt::Raw {
                        ts: format!("{} = ({});", prop, self.rewrite(&e.raw, inner)),
                        line: e.line,
                    });
                }
                RawKind::StaticAssign { prop, literal } => {
                    if !chk_declared {
                        current.push(SidecarStmt::Raw {
                            ts: chk_decl(&target, chk_id),
                            line: e.line,
                        });
                        chk_declared = true;
                    }
                    current.push(SidecarStmt::Raw {
                        ts: format!("{} = ({});", prop, literal),
                        line: e.line,
                    });
                }
            }
        }
        // The per-element check binding: a `document.createElement('tag')`
        // materialization (typed through `HTMLElementTagNameMap`) or the
        // component's `__AihuPropsOf` value view.
        fn chk_decl(
            target: &Option<CheckTarget>,
            chk_id: Option<usize>,
        ) -> String {
            match (target, chk_id) {
                (Some(CheckTarget::Html(t)), Some(id)) => {
                    format!("const __chk_{} = document.createElement({:?});", id, t)
                }
                (Some(CheckTarget::Component(t)), Some(id)) => {
                    format!("const __chk_{} = null as any as __AihuPropsOf<{:?}>;", id, t)
                }
                _ => String::new(),
            }
        }
        current.extend(self.collect(children, inner));
        if let Some((cond_raw, line)) = if_cond {
            if !cond_raw.trim().is_empty() {
                current = vec![SidecarStmt::If {
                    branches: vec![SidecarBranch {
                        cond_ts: Some(self.rewrite(&cond_raw, inner)),
                        line,
                        body: current,
                    }],
                }];
            }
        }
        if let Some((list_raw, line, binders, _)) = each_head {
            self.uses_each = true;
            let id = self.each_counter;
            self.each_counter += 1;
            let list_ts = self.rewrite(&list_raw, shadow); // OUTER scope
            current = vec![SidecarStmt::Each {
                binders,
                list_ts,
                line,
                id,
                body: current,
                empty: Vec::new(),
            }];
        }
        out.extend(current);
    }
}

/// Line-preserving statement placer. Placement is MONOTONIC — each emitted
/// token lands at or after the previous one — which is what keeps block
/// structure (`if`/`for` opens and closes) physically nested. Source lines
/// are monotonic in walk order (the collector's forward cursor), so real-line
/// placement and structural correctness coincide; a capture whose line could
/// not be recovered stacks on a fresh line inside the currently-open block.
struct SidecarPlacer {
    lines: Vec<String>,
    /// 1-based line of `function __aihu_template…` — the last line statements
    /// may never be placed at or before.
    opener_line: usize,
}

impl SidecarPlacer {
    fn place(&mut self, text: String, want: usize) {
        if want > self.opener_line && want > self.lines.len() {
            // Ahead of everything written — land on the real source line.
            self.lines.resize(want - 1, String::new());
            self.lines.push(text);
        } else if want > self.opener_line && want == self.lines.len() {
            // Shares the current last line (several captures on one line).
            let last = self.lines.last_mut().expect("opener pushed");
            if last.is_empty() {
                *last = text;
            } else {
                last.push(' ');
                last.push_str(&text);
            }
        } else {
            // Unknown or behind the emission point — stack on a fresh line.
            self.lines.push(text);
        }
    }

    /// Append a structural token (`}`, `} else {`) to the current last line.
    fn append(&mut self, text: &str) {
        let last = self.lines.last_mut().expect("opener pushed");
        if last.is_empty() {
            last.push_str(text);
        } else {
            last.push(' ');
            last.push_str(text);
        }
    }
}

fn emit_sidecar_stmts(stmts: &[SidecarStmt], p: &mut SidecarPlacer) {
    for s in stmts {
        match s {
            SidecarStmt::Expr { ts, line, is_handler } => {
                // `void (...)` so the result type isn't checked beyond
                // validity; tsc still flags undefined identifiers and type
                // errors. Handlers go in call position (contextual params).
                let stmt = if *is_handler {
                    format!("__handler({});", ts)
                } else {
                    format!("void ({});", ts)
                };
                p.place(stmt, *line);
            }
            SidecarStmt::Raw { ts, line } => {
                p.place(ts.clone(), *line);
            }
            SidecarStmt::If { branches } => {
                // Step 2 — REAL `if/else if/else` blocks: heads sit on the
                // control-flow source lines, so narrowing flows into branch
                // bodies and diagnostics cite the authored condition's line.
                // `else if` semantics carry prior-branch negation structurally.
                for (i, b) in branches.iter().enumerate() {
                    let head = match (&b.cond_ts, i) {
                        (Some(c), 0) => format!("if ({}) {{", c),
                        (Some(c), _) => format!("}} else if ({}) {{", c),
                        (None, 0) => "if (true) {".to_string(),
                        (None, _) => "} else {".to_string(),
                    };
                    if i == 0 || b.line > 0 {
                        p.place(head, b.line);
                    } else {
                        p.append(&head);
                    }
                    emit_sidecar_stmts(&b.body, p);
                }
                p.append("}");
            }
            SidecarStmt::Each { binders, list_ts, line, id, body, empty } => {
                // Step 3 — `for…of` over the overloaded helper. The
                // intermediate const evaluates the list in the OUTER scope
                // (alias-shadows-iterable), and the tuple binding gives every
                // alias its inferred element/index type.
                let head = format!(
                    "const __each_{id} = __aihu_each({list}); for (const {binders} of __each_{id}) {{",
                    id = id,
                    list = list_ts,
                    binders = binders
                );
                p.place(head, *line);
                emit_sidecar_stmts(body, p);
                p.append("}");
                emit_sidecar_stmts(empty, p);
            }
        }
    }
}

/// Top-level names the `@state` body itself binds — imports and `const`/`let`
/// declarations. The sidecar's preamble skips any framework global already bound
/// here: with the script inlined verbatim, `import { signal } from '@aihu/signals'`
/// beside an ambient `declare const signal` is a TS2440 conflict.
fn script_bound_names(script: &str) -> std::collections::BTreeSet<String> {
    let mut names = std::collections::BTreeSet::new();
    collect_imported_names(script, &mut names);
    names.extend(crate::codegen::signals::collect_state_decls(script).all);
    names
}

/// The 0-based line indices (within the `@state` body) occupied by a `$macro`
/// and its body. The sidecar blanks these so tsc never parses aihu macro syntax
/// as TypeScript, while the surrounding real code keeps its line numbers.
///
/// Mirrors the macro-region skip in `codegen::signals::collect_state_decls`.
fn macro_line_set(script: &str) -> std::collections::BTreeSet<usize> {
    let mut out = std::collections::BTreeSet::new();
    let bytes = script.as_bytes();
    let mut i = 0usize;
    while i < script.len() {
        let nl = script[i..].find('\n').map(|r| i + r).unwrap_or(script.len());
        let line = script[i..nl].trim();
        if line.starts_with('$') {
            // Find the macro's end: the close of its `{ … }` or `( … )` payload,
            // else just this line.
            let mut end = nl;
            if let Some(colon_rel) = script[i..].find(|c| c == '{' || c == '(') {
                let p = i + colon_rel;
                // Only treat it as a payload when it opens on the macro's own line
                // or the next (a `$macro` never opens its body further away).
                if script[i..p].bytes().filter(|&b| b == b'\n').count() <= 1 {
                    let close = if bytes[p] == b'{' {
                        crate::parser::state_macros::find_brace_close_js(script, p + 1)
                    } else {
                        crate::parser::state_macros::find_paren_close(script, p + 1)
                    };
                    if let Some(c) = close {
                        end = c;
                    }
                }
            }
            let first = newlines_before(script, i);
            let last = newlines_before(script, end.min(script.len()));
            for l in first..=last {
                out.insert(l);
            }
            i = script[end.min(script.len())..]
                .find('\n')
                .map(|r| end + r + 1)
                .unwrap_or(script.len());
            continue;
        }
        i = nl + 1;
    }
    out
}

/// Declarations for every binding a `$macro` introduces, as a single physical
/// line appended to the preamble (the macro's own lines are blanked — see
/// `macro_line_set`).
///
/// `$prop` entries carry a declared `type:`, so they get their REAL type — props
/// are what templates touch most, and a wrong prop type is exactly the bug the
/// sidecar exists to catch. They are typed as ACCESSORS (`() => T`), not values:
/// at runtime `ctx.props.<name>` is a `Signal`, read via the getter call
/// (`props.title()`), so a template reads a prop as `language()`. Typing the
/// binding as a plain `T` made every such call a `TS2349` "not callable".
///
/// The other collections bind functions whose types would have to be inferred
/// from macro bodies that aren't yet lowered to TS, so they are honestly `any`
/// for now rather than confidently wrong.
///
/// Module-scope `let`/`const` (not `declare const`): a binding may shadow a DOM
/// global (`name`, `open`, `status`, `close`), and an ambient re-declaration of
/// one collides with lib.dom (TS2451) where a module-scope binding shadows it.
///
/// GX Phase 4 (#466): on a governed (`data:`-declared) route the `route` prop
/// is typed through the generated `__GxRoute` wrapper (§4.5) — its declared
/// `data` member becomes the `__GxEntitled<T> | __GxWithheld<T, P>` union, so
/// unguarded `route.data` field access is a type error (G7g). It is declared
/// as a VALUE (not the accessor form): the lifted template expressions read
/// the RAW authored `route.data.…` member chains (the `route()` call rewrite
/// is a JS-emit concern), so the value typing is what makes them checkable.
fn macro_binding_decls(script: &str, governed: Option<&crate::types::DataDecl>) -> String {
    let macros = crate::parser::state_macros::parse_state_macros(script).unwrap_or_default();
    let mut decls: Vec<String> = Vec::new();
    let mut declared_route = false;
    for m in &macros {
        let crate::types::StateMacro::Collection { kind, entries } = m else {
            continue;
        };
        for e in entries {
            let name = &e.name;
            match kind {
                crate::types::CollectionKind::Prop => {
                    // `type:` is a TS type, but may be written as a quoted string
                    // (`type: "number"`) or bare (`type: { params: { ref: string } }`).
                    let ty = e
                        .meta
                        .iter()
                        .find(|(k, _)| k == "type")
                        .map(|(_, v)| unquote_ts_type(v.trim()))
                        .unwrap_or_else(|| "any".to_string());
                    if let (Some(data), "route") = (governed, name.as_str()) {
                        declared_route = true;
                        decls.push(format!(
                            "let route: __GxRoute<{}, {}> = null as any;",
                            ty,
                            data.preview_keys_ts()
                        ));
                        continue;
                    }
                    // Accessor, not value: a prop is a Signal getter (`props.name()`).
                    decls.push(format!("let {}: () => {} = null as any;", name, ty));
                }
                // Event dispatchers are already typed by the $emit/$event decls.
                crate::types::CollectionKind::Event => {}
                // B5/O2 — `$context` entries are named "provide"/"consume"; the
                // template-referenceable bindings are the context KEYS in each
                // entry's meta (`theme`, `locale`, …). The runtime lowering is
                // `const key = inject(contextKey('key'))` / `provide(...)`; the
                // macro line itself is blanked in the sidecar, so declare each
                // key here (as `any` — the injected value's type is a watched
                // B3+ refinement) instead of the entry names.
                crate::types::CollectionKind::Context => {
                    for (ctx_key, _) in &e.meta {
                        let decl = format!("let {}: any = null as any;", ctx_key);
                        if !decls.contains(&decl) {
                            decls.push(decl);
                        }
                    }
                }
                _ => decls.push(format!("let {}: any = null as any;", name)),
            }
        }
    }
    // A governed route with no `$prop route` declaration still receives the
    // generated loader's payload as `route.data`; declare the wrapper over the
    // minimal route shape so the template contract holds (unguarded access
    // still errors, `$gx` and declared previews are reachable).
    if let Some(data) = governed {
        if !declared_route {
            decls.push(format!(
                "let route: __GxRoute<{{ params: Record<string, string> }}, {}> = null as any;",
                data.preview_keys_ts()
            ));
        }
    }
    decls.join(" ")
}

/// A `type:` meta value is a TS type. Accept both the quoted (`"number"`) and
/// bare (`{ params: { ref: string } }`) spellings authors use.
fn unquote_ts_type(v: &str) -> String {
    let t = v.trim();
    let unq = t
        .strip_prefix('"')
        .and_then(|s| s.strip_suffix('"'))
        .or_else(|| t.strip_prefix('\'').and_then(|s| s.strip_suffix('\'')));
    to_single_line(unq.unwrap_or(t)).trim().to_string()
}

/// Replace newlines with spaces so a value fits on one physical line — used to
/// keep each lifted template expression (and the compact preamble decls) on a
/// single sidecar line for the line-preserving layout. String-literal interior
/// whitespace is otherwise untouched.
fn to_single_line(s: &str) -> String {
    s.replace(['\r', '\n'], " ")
}

/// Number of `\n` in `text[..offset]` (line breaks before `offset`).
fn newlines_before(text: &str, offset: usize) -> usize {
    text[..offset].bytes().filter(|&b| b == b'\n').count()
}


// ─── #486 step 4 — strict-templates attribute/prop classification ────────────

/// HTML attributes whose reflected DOM property has a DIFFERENT name. Checked
/// attributes not listed here use the attribute name verbatim as the property.
const HTML_ATTR_TO_PROP: &[(&str, &str)] = &[
    ("class", "className"),
    ("for", "htmlFor"),
    ("readonly", "readOnly"),
    ("maxlength", "maxLength"),
    ("minlength", "minLength"),
    ("tabindex", "tabIndex"),
    ("colspan", "colSpan"),
    ("rowspan", "rowSpan"),
    ("contenteditable", "contentEditable"),
    ("novalidate", "noValidate"),
    ("formnovalidate", "formNoValidate"),
    ("usemap", "useMap"),
    ("ismap", "isMap"),
    ("accesskey", "accessKey"),
    ("crossorigin", "crossOrigin"),
    ("datetime", "dateTime"),
    ("allowfullscreen", "allowFullscreen"),
    ("playsinline", "playsInline"),
    ("inputmode", "inputMode"),
    ("referrerpolicy", "referrerPolicy"),
    ("formaction", "formAction"),
    ("formenctype", "formEnctype"),
    ("formmethod", "formMethod"),
    ("formtarget", "formTarget"),
];

/// Attributes the strict layer deliberately does NOT check on HTML elements:
/// their reflected property is an object (or otherwise not
/// assignment-shaped), so the attribute→property assignment would be a false
/// error on legal authoring.
const STRICT_SKIP_HTML_ATTRS: &[&str] = &["style", "part", "is", "role"];

/// Attribute name → checkable DOM property for a REACTIVE attribute on a
/// known HTML element. `None` = stay open (the spec's JSX-hole carve-outs:
/// kebab-case, `data-*`, `aria-*`, namespaced/directive names, and the
/// object-valued skip set).
fn html_attr_prop(name: &str) -> Option<String> {
    if name.contains('-') || name.contains(':') || !is_js_ident(name) {
        return None;
    }
    if STRICT_SKIP_HTML_ATTRS.contains(&name) {
        return None;
    }
    Some(
        HTML_ATTR_TO_PROP
            .iter()
            .find(|(a, _)| *a == name)
            .map(|(_, p)| (*p).to_string())
            .unwrap_or_else(|| name.to_string()),
    )
}

/// Boolean attributes whose STATIC quoted value checks as a string literal
/// against the boolean property type (§2.2 normative — `disabled="false"` is
/// a type error under `--strict-templates`; the Angular `strictAttributeTypes`
/// precedent). Only attributes whose reflected boolean property exists in
/// lib.dom are listed, so the assignment itself can never be a false error.
const BOOLEAN_ATTR_PROPS: &[(&str, &str)] = &[
    ("disabled", "disabled"),
    ("checked", "checked"),
    ("readonly", "readOnly"),
    ("required", "required"),
    ("multiple", "multiple"),
    ("autofocus", "autofocus"),
    ("autoplay", "autoplay"),
    ("controls", "controls"),
    ("default", "default"),
    ("hidden", "hidden"),
    ("loop", "loop"),
    ("novalidate", "noValidate"),
    ("formnovalidate", "formNoValidate"),
    ("ismap", "isMap"),
    ("open", "open"),
    ("reversed", "reversed"),
    ("selected", "selected"),
    ("inert", "inert"),
];

fn boolean_attr_prop(name: &str) -> Option<&'static str> {
    BOOLEAN_ATTR_PROPS
        .iter()
        .find(|(a, _)| *a == name)
        .map(|(_, p)| *p)
}

/// Global HTML attributes that are legal on ANY custom element and are NOT
/// component props — they must not be checked against the component's
/// `AihuComponentProps` entry.
const GLOBAL_HTML_ATTRS: &[&str] = &[
    "class",
    "id",
    "style",
    "slot",
    "part",
    "hidden",
    "title",
    "tabindex",
    "dir",
    "lang",
    "role",
    "translate",
    "draggable",
    "spellcheck",
    "accesskey",
    "autocapitalize",
    "contenteditable",
    "enterkeyhint",
    "inputmode",
    "is",
    "nonce",
    "popover",
    "autofocus",
    // aihu islands: lazy-hydration opt-in, consumed by the runtime wrapper.
    "defer",
];

/// True when a reactive attribute on a component tag is a PROP to check
/// against the child's declared interface. Kebab-case (`data-*`/`aria-*`
/// included), namespaced, and global-HTML attribute names stay open.
fn component_prop_candidate(name: &str) -> bool {
    !name.contains('-')
        && !name.contains(':')
        && is_js_ident(name)
        && !GLOBAL_HTML_ATTRS.contains(&name)
}

/// True for a non-empty `[A-Za-z_$][A-Za-z0-9_$]*` token.
fn is_js_ident(s: &str) -> bool {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' || c == '$' => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
}

/// Collect the bound names from `import` statements in the @state script:
/// `import { a, b as c } from '…'` → a, c; `import D from '…'` → D;
/// `import * as N from '…'` → N. Type-only imports contribute names too —
/// harmless as `any` params. Handles MULTI-LINE imports (named lists split
/// across lines), which the previous line-at-a-time scan missed — that miss is
/// why imported handlers like `closeNav` still TS2304'd.
fn collect_imported_names(script: &str, out: &mut std::collections::BTreeSet<String>) {
    // Reassemble each `import …` statement (it may span several lines) up to and
    // including its `from '…'` tail, then parse that single logical statement.
    let mut buf = String::new();
    let mut in_import = false;
    for line in script.lines() {
        let t = line.trim();
        if !in_import {
            if t.starts_with("import ") {
                in_import = true;
                buf.clear();
                buf.push_str(t);
            }
        } else {
            buf.push(' ');
            buf.push_str(t);
        }
        // A statement is complete once it carries its `from` clause (named/
        // default/namespace imports). Side-effect imports (`import './x'`,
        // no `from`) bind nothing — terminate them on the trailing quote.
        let done = in_import
            && (buf.contains(" from ")
                || buf.trim_end().ends_with('\'')
                || buf.trim_end().ends_with('"')
                || buf.trim_end().ends_with(';'));
        if done {
            parse_import_statement(&buf, out);
            in_import = false;
            buf.clear();
        }
    }
}

/// Parse one assembled `import …` statement for its bound names.
fn parse_import_statement(stmt: &str, out: &mut std::collections::BTreeSet<String>) {
    let Some(rest) = stmt.trim().strip_prefix("import ") else {
        return;
    };
    if let (Some(lb), Some(rb)) = (rest.find('{'), rest.find('}')) {
        if lb < rb {
            for part in rest[lb + 1..rb].split(',') {
                // `name` or `name as alias` (the alias is the local binding).
                let bound = part.trim().rsplit(" as ").next().unwrap_or("").trim();
                if is_js_ident(bound) {
                    out.insert(bound.to_string());
                }
            }
            // Default import preceding the brace: `import D, { … } from …`.
            let head = rest[..lb].trim().trim_end_matches(',').trim();
            if is_js_ident(head) {
                out.insert(head.to_string());
            }
            return;
        }
    }
    if let Some(star) = rest.strip_prefix("* as ") {
        if let Some(n) = star.split_whitespace().next() {
            if is_js_ident(n) {
                out.insert(n.to_string());
            }
        }
        return;
    }
    // Default import: `import D from '…'`.
    if let Some(n) = rest.split_whitespace().next() {
        if is_js_ident(n) {
            out.insert(n.to_string());
        }
    }
}

/// Split `s` on TOP-LEVEL commas, respecting `[]`/`{}`/`()` nesting so a
/// destructuring alias like `[a, b]` isn't torn apart. Minimal by design — a
/// loop-clause alias list carries no string/template literals.
fn split_top_level_commas_pat(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut depth = 0i32;
    let mut start = 0usize;
    for (i, c) in s.char_indices() {
        match c {
            '[' | '{' | '(' => depth += 1,
            ']' | '}' | ')' => depth = (depth - 1).max(0),
            ',' if depth == 0 => {
                out.push(s[start..i].to_string());
                start = i + 1;
            }
            _ => {}
        }
    }
    out.push(s[start..].to_string());
    out
}

/// Extract every bound identifier from a single loop-alias part: a bare ident
/// (`item`), array destructuring (`[a, b]`, `[a, ...r]`, holes skipped), or
/// object destructuring (`{a, b}`, `{a: b}` → local `b`, `{a, ...r}`). Nested
/// patterns recurse; default initializers (`a = expr`) are stripped. Non-ident
/// tokens are skipped. Without this, `$each="… as [name, desc]"` bound nothing
/// (the whole `[name, desc]` failed `is_js_ident`) → template refs TS2304'd.
pub(crate) fn extract_pattern_idents(part: &str, out: &mut std::collections::BTreeSet<String>) {
    let p = part.trim();
    let (inner, is_object) = if p.starts_with('[') && p.ends_with(']') {
        (&p[1..p.len() - 1], false)
    } else if p.starts_with('{') && p.ends_with('}') {
        (&p[1..p.len() - 1], true)
    } else {
        if is_js_ident(p) {
            out.insert(p.to_string());
        }
        return;
    };
    for sub in split_top_level_commas_pat(inner) {
        let s = sub.trim().trim_start_matches("...").trim();
        if s.is_empty() {
            continue; // array hole or trailing comma
        }
        // Object rename/shorthand: `key` or `key: local` — the LOCAL binding is
        // after the top-level colon.
        let token = if is_object {
            s.split_once(':').map(|(_, v)| v.trim()).unwrap_or(s)
        } else {
            s
        };
        // Strip a default-value initializer (`a = expr`).
        let token = token.split('=').next().map(str::trim).unwrap_or(token);
        if token.starts_with('[') || token.starts_with('{') {
            extract_pattern_idents(token, out);
        } else if is_js_ident(token) {
            out.insert(token.to_string());
        }
    }
}

/// The alias-side source text of an each head, rejoined from the parser's
/// (possibly torn) `item_alias`/`idx_alias` fields: `parse_each_header` splits
/// the alias list on the FIRST comma (template.rs — W5 turns it into a parsed
/// BindingPattern), so `as [k, v], i` arrives as `[k` + `v], i`. Rejoining
/// with a comma reconstructs the exact alias list for a real parse.
fn rejoin_alias_list(item_alias: &str, idx_alias: Option<&str>) -> String {
    match idx_alias {
        Some(idx) => format!("{}, {}", item_alias, idx),
        None => item_alias.to_string(),
    }
}

/// Bind the identifiers of one each-head alias list into `out` — via a real
/// parse of the (rejoined) alias list (W4, `expr::alias_bound_idents`), so
/// destructuring patterns torn by the header split bind every contained
/// identifier instead of nothing; the token extractor stays as the fallback
/// for alias text that doesn't parse as a parameter list.
pub(crate) fn push_alias_bindings(
    item_alias: &str,
    idx_alias: Option<&str>,
    out: &mut std::collections::BTreeSet<String>,
) {
    let alias_list = rejoin_alias_list(item_alias, idx_alias);
    match crate::expr::alias_bound_idents(&alias_list) {
        Some(bound) => out.extend(bound),
        None => {
            extract_pattern_idents(item_alias, out);
            if let Some(idx) = idx_alias {
                if is_js_ident(idx) {
                    out.insert(idx.to_string());
                }
            }
        }
    }
}







#[cfg(test)]
mod sidecar_alias_tests {
    use super::extract_pattern_idents;
    use std::collections::BTreeSet;

    fn idents(part: &str) -> Vec<String> {
        let mut out = BTreeSet::new();
        extract_pattern_idents(part, &mut out);
        out.into_iter().collect()
    }

    // Fix B — a loop alias may be a destructuring pattern; every contained
    // binding must land in the sidecar scope. Regression for `$each="… as
    // [name, desc]"` where the whole `[name, desc]` failed `is_js_ident` and
    // bound nothing → template refs TS2304'd.
    #[test]
    fn bare_alias() {
        assert_eq!(idents("item"), vec!["item"]);
    }

    #[test]
    fn array_destructure_binds_each_element() {
        assert_eq!(idents("[name, desc]"), vec!["desc", "name"]); // BTreeSet → sorted
    }

    #[test]
    fn array_holes_and_rest() {
        assert_eq!(idents("[a, , c]"), vec!["a", "c"]);
        assert_eq!(idents("[first, ...rest]"), vec!["first", "rest"]);
    }

    #[test]
    fn object_shorthand_rename_and_rest() {
        assert_eq!(idents("{a, b}"), vec!["a", "b"]);
        // `{key: local}` binds the LOCAL name, not the key.
        assert_eq!(idents("{key: local}"), vec!["local"]);
        assert_eq!(idents("{a, ...others}"), vec!["a", "others"]);
    }

    #[test]
    fn default_initializers_are_stripped() {
        assert_eq!(idents("[a = 5]"), vec!["a"]);
        assert_eq!(idents("{a = 1, b}"), vec!["a", "b"]);
    }

    #[test]
    fn nested_pattern_recurses() {
        assert_eq!(idents("[a, [b, c]]"), vec!["a", "b", "c"]);
        assert_eq!(idents("{outer: {inner}}"), vec!["inner"]);
    }

    #[test]
    fn non_ident_tokens_skipped() {
        // Empty / punctuation-only parts contribute nothing (no panic).
        assert!(idents("[]").is_empty());
        assert!(idents("").is_empty());
    }
}
