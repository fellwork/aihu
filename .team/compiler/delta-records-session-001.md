# Delta Records — Session 1 (Historian Promotion Candidates)
**Date:** 2026-04-30
**Track:** compiler
**Topic:** aihu-sfc-compiler
**Historian:** Session 1 end-of-session

These records are ready for promotion from delta → user layer in AGENTS.delta.db.
The `agents_context_write` MCP tool was not available this session.
Import with: `agentsdb import --layer user` or equivalent.

---

## Record 1 — domain_hint: Compiler v0 emit pattern

```
kind: domain_hint
scope: user (ready for promotion)
tags: topic:aihu-sfc-compiler, track:compiler, kind:domain_hint, source:director-adjudication

Compiler v0 emit pattern: `defineElement('tag', defineComponent((_ctx) => { ... }))` — Option A chosen
over Option B (full class extending HTMLElement) because Option B would require the compiler to generate
untested lifecycle boilerplate (connectedCallback, disconnectedCallback, #scope field management).
Option B is the intended *future* compiler target per define-element.ts JSDoc ("the compiler emits...
HelloAihu extends HTMLElement is fully authored by the compiler") but is NOT the v0 form.

Source: director-notes/round-001-2026-04-30.md OQ-C9 adjudication, architecture.md Section 7.
Survived Director routing pass without revision. No Verifier issue with this choice.
```

---

## Record 2 — domain_hint: leaf() Signal cast form

```
kind: domain_hint
scope: user (ready for promotion)
tags: topic:aihu-sfc-compiler, track:compiler, kind:domain_hint, source:director-adjudication

leaf() is typed as Signal<string> but v0 compiler emits signals of arbitrary T (e.g., Signal<number>
for a counter). Required cast in generated code: `[readFn, writeFn] as unknown as Signal<string>`.
Direct `as Signal<string>` cast is rejected by TypeScript because Signal<number> is not a subtype
of Signal<string> — the intermediate `as unknown` is required. Runtime unaffected: leaf() discriminates
signals via Array.isArray(value), not the type parameter.

v1 plan: widen leaf() to accept Signal<unknown> to eliminate the cast.

Source: scout-report OQ-C10, director-notes/round-001-2026-04-30.md OQ-C10 adjudication, architecture.md Section 7.
```

---

## Record 3 — domain_hint: _ctx parameter naming convention

```
kind: domain_hint
scope: user (ready for promotion)
tags: topic:aihu-sfc-compiler, track:compiler, kind:domain_hint, source:director-adjudication

Compiler-generated `defineComponent` setup functions must use `_ctx` as the parameter name (not `ctx`,
not `_`). Suppresses TypeScript noUnusedParameters warnings in generated code where the SetupContext
argument is received but not used. The Setup type requires a named parameter; bare `_` alone may not
satisfy strict TypeScript configs. The underscore-prefix is the TypeScript convention for intentionally
unused parameters.

IMPORTANT: hand-authored code uses `ctx` (it uses the context). Only generated code uses `_ctx`.

Source: architecture.md Section 7 locked design decisions.
```

---

## NOT promoted

**`defineElement` vs `defineComponent` distinction:** Already documented verbatim in
`packages/runtime/src/define-component.ts` JSDoc line 3: "Learning #12: humans use `defineComponent`,
the compiler uses `defineElement`". Derivable from source. No need to duplicate in user memory.
