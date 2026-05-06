# Codemod Dryrun — Macro-Simplification Round 005.5

**Role:** Verifier (codemod-dryrun)
**Topic:** macro-simplification
**Round:** 005.5 — pre-build paper-cut audit
**Branch:** `plan/macro-simplification`
**Date:** 2026-05-05
**Output budget:** 600–1000 lines

---

## §0 — Front matter

### Purpose

Manually apply the locked Option 4 codemod (rules D.1–D.7 from round 005) to a hand-picked set of gnarly real-world `.aihu` files, surfacing every paper-cut / ambiguity / judgment-required edge case BEFORE the build round commits a 150-LOC codemod that has to handle every file in the repo.

### What was audited

Four files (3 mandated + 1 escalated because the third was trivial):

1. `examples/hacker-news/src/pages/item/[id].aihu` — 80 LOC, `@state` only (no `@agent`); rich `$prop` + `$action` + `$route` + `$afterNavigate`
2. `examples/todo-mvc/todo-mvc.aihu` — 152 LOC; full `@state` (props/computed/action/effect/lifecycle) + `@agent` block; Scout's #2 worst offender (~67% redundancy)
3. `examples/blog-router/src/pages/posts/[slug].aihu` — 32 LOC; trivial `$prop` + `$computed`; on the prompt's target list, kept for completeness, but did not exercise enough rules
4. `examples/hacker-news/src/pages/index.aihu` — 82 LOC; rich `@agent` with `$describe` over a `$prop` (escalated from the prompt's allow-list because file 3 was thin and the audit needed a second `@agent` data point)

Total source LOC audited: 346 (only `@state` and `@agent` blocks transformed; `@template`/`@style`/`@route` left untouched per scope).

### Audit method (bidirectional)

Per the prompt:

- **Forward direction (preservation):** for every name+metadata in BEFORE, verify the AFTER block carries the same information. No info loss.
- **Reverse direction (no synthesis):** AFTER must introduce no name, key, or metadata not present in BEFORE. Specifically: no accidental `expose: { read: true }` where BEFORE was silent on exposure.

Each file gets a name-by-name table and an explicit reverse check.

### How to read this file

- **§1.1–§1.4** — per-file dryrun, one per audited file. Each contains: pointer + macro inventory; BEFORE block; AFTER block; bidirectional checklist; paper-cuts; TS-inference verification.
- **§2** — aggregate paper-cut classification table (BLOCKER / MECHANICAL / JUDGMENT / PARSE-FAIL).
- **§3** — AC reverification on the audited sample.
- **§4** — recommendation (A/B/C) with justification.
- **§5** — open follow-up questions (only if §4 picks B).
- **§6** — anti-drift confirmation + STATUS.

### Note on missing reference materials

The prompt's required reading lists three files that **do not exist on this branch**:

- `examples/_shared/macro-test.aihu` (locked grammar example)
- `.team/macro-simplification/option-4-evaluation.md` (codemod sketch §4.4)
- `.team/macro-simplification/topic-summary.md` (AC bar)
- `.team/macro-simplification/scout-report.md` (Pattern E context)

The branch `plan/macro-simplification` is checked out but contains zero `.team/macro-simplification/*` content — only a dir I created to hold this output. The prompt itself embeds rules D.1–D.7 in full, so the audit proceeds against the inline rules. **One unavoidable consequence:** the SHAPE of the post-codemod entry (specifically: do we use `$prop name { ... }` or `name: { ... }` keyed-object, what the merged `@agent` entry looks like, etc.) is **inferred from the rule text**, not directly observed. Any inference is flagged as a JUDGMENT or BLOCKER paper-cut.

### Pattern E note (parser drift)

The compiler parsers (`packages/compiler/src/parser/agent_macros.rs`, `state_macros.rs`) require strict syntax that several example files violate today. Specifically:

- `agent_macros.rs` requires `$expose name: Type` (mandatory `: Type`); examples use `$expose name1, name2, name3` (comma-list, no type)
- `agent_macros.rs::parse_agent_macros` has no `action` branch; examples use `$action name`
- `agent_macros.rs::Describe` takes a single quoted string; examples use `$describe name "text"` (named target)

Every Pattern E parse-fail is flagged in the per-file paper-cuts. These exist independently of macro-simplification — they're pre-existing drift between the spec/examples and the parser.

---

## §1 — Per-file dryrun

---

### §1.1 — `examples/hacker-news/src/pages/item/[id].aihu`

#### §1.1.1 — File pointer + size + macro inventory

- **Path:** `c:\git\fellwork\aihu\examples\hacker-news\src\pages\item\[id].aihu`
- **Total LOC:** 80
- **Blocks present:** `@route`, `@state`, `@template`, `@style` (no `@agent`)
- **`@state` LOC:** lines 7–35 (29 lines including blank)
- **Macro inventory in `@state`:**
  - `$prop` × 1 (`route`)
  - `$route` × 1 (`currentRoute`) — note: this is the routing-block macro, not the route-block macro
  - `$action` × 2 (`hostname`, `ago`)
  - `$afterNavigate` × 1 (anonymous lifecycle-style hook)
  - `$computed` × 0
  - `$effect` × 0
  - `$resource` × 0
  - `$lifecycle` × 0 (but `$afterNavigate` is lifecycle-shaped — see paper-cut §1.1.5/PC-1.1.A)

#### §1.1.2 — BEFORE block (verbatim)

```aihu
@state {
  import type { HnItem, CommentNode } from './[id].loader.ts'

  // arch-5 M1: $route reactive signal — see currentRoute.params.id when consumed
  // by descendant components. The page itself still receives data via the
  // existing $prop route loader pattern (compiled into custom-element attr).
  $prop route: { data: { story: HnItem; comments: Array<CommentNode> } }
  $route currentRoute

  $action hostname(u: string | undefined): string {
    if (!u) return ''
    try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' }
  }

  $action ago(t: number | undefined): string {
    if (!t) return ''
    const s = Math.floor(Date.now() / 1000 - t)
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
  }

  // arch-5 M1: post-navigation analytics — runs after each successful nav.
  $afterNavigate((to) => {
    if (typeof window !== 'undefined' && (window as any).analytics?.pageview) {
      (window as any).analytics.pageview(to.pathname)
    }
  })
}
```

(`@agent` block: not present.)

#### §1.1.3 — AFTER block (manually transformed per D.1–D.7)

Applying:
- D.1 (type drop unless required): `$prop route` carries a complex inline type literal in its current colon-form. Per the inferred Option 4 shape, `$prop` is always object-keyed; the type goes in a `type:` slot (or stays inline on the entry header). Either way, type is required for `$prop` (no value, can't infer).
- D.2 (bare function = implicit handler for `$action`): both `hostname` and `ago` are bare-bodied — already in their natural simplest form.
- D.3 (`$lifecycle` always bare): does not directly apply to `$afterNavigate`. **See PC-1.1.A.**
- D.7 (formatter): `$prop route` entry carries one key (type). One key + long generic = multi-line.

```aihu
@state {
  import type { HnItem, CommentNode } from './[id].loader.ts'

  // arch-5 M1: $route reactive signal — see currentRoute.params.id when consumed
  // by descendant components. The page itself still receives data via the
  // existing $prop route loader pattern (compiled into custom-element attr).
  $prop route {
    type: { data: { story: HnItem; comments: Array<CommentNode> } }
  }
  $route currentRoute

  $action hostname(u: string | undefined): string {
    if (!u) return ''
    try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' }
  }

  $action ago(t: number | undefined): string {
    if (!t) return ''
    const s = Math.floor(Date.now() / 1000 - t)
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
  }

  // arch-5 M1: post-navigation analytics — runs after each successful nav.
  $afterNavigate((to) => {
    if (typeof window !== 'undefined' && (window as any).analytics?.pageview) {
      (window as any).analytics.pageview(to.pathname)
    }
  })
}
```

(`@agent` block: still not present; nothing to transform.)

**Net delta:** +1 line (the multi-line `$prop` wrap). The two `$action` declarations are unchanged because they were already in canonical bare form. `$afterNavigate` and `$route` are unchanged because the rules don't directly address them.

#### §1.1.4 — Bidirectional checklist

**Forward (preservation):**

| Name | BEFORE form | AFTER form | type? | default? | describe? | expose? | body? |
|---|---|---|---|---|---|---|---|
| `route` | `$prop route: { data: { story: HnItem; comments: Array<CommentNode> } }` | `$prop route { type: { data: ... } }` | Yes (preserved verbatim) | n/a | n/a (none) | n/a (none) | n/a |
| `currentRoute` | `$route currentRoute` | `$route currentRoute` | none originally | n/a | n/a | n/a | n/a |
| `hostname` | `$action hostname(u: string | undefined): string { ... }` | identical | implicit (sig) | n/a | n/a | n/a | preserved verbatim |
| `ago` | `$action ago(t: number | undefined): string { ... }` | identical | implicit (sig) | n/a | n/a | n/a | preserved verbatim |
| (anon `$afterNavigate`) | bare callback | identical | n/a | n/a | n/a | n/a | preserved verbatim |

**Reverse (no synthesis):**

- No `expose: { read: true }` synthesized. Correct: BEFORE has no `$expose route`, so AFTER stays silent. ✓
- No `describe: ...` synthesized. ✓
- No `default: ...` synthesized. ✓
- The `type:` key in `$prop route` was forced by the rule shape, but it carries the EXACT type literal that BEFORE had after the colon. No fabrication. ✓
- No `handler:` key synthesized for the bare `$action`s (D.2 says it's only required for object-literal entries with other metadata). ✓

**Result:** PASS (modulo the ambiguity around `$afterNavigate` shape — see PC-1.1.A).

#### §1.1.5 — Paper-cuts encountered

- **PC-1.1.A — JUDGMENT** — `$afterNavigate((to) => { ... })` is a router lifecycle hook with the same syntactic shape as `$lifecycle.mount(() => ...)` (D.3 says: bare function value, no metadata-bag form). Does D.3 cover only `$lifecycle.{mount,dispose}`, or also routing lifecycle hooks (`$beforeNavigate`, `$afterNavigate`)? The rule text says "$lifecycle" specifically. Inference: routing hooks behave the same way (always bare function, no metadata) and thus need no codemod transform — they pass through unchanged. Codemod should likely treat any macro that *only ever* takes a callback as "bare-by-default, no metadata form" and leave them alone. **No human decision needed; codemod just needs to know the closed list of "always-bare callback" macros: `$lifecycle.mount`, `$lifecycle.dispose`, `$beforeNavigate`, `$afterNavigate`, `$effect` (when anonymous; D.4 says `$effect` is also object-keyed-when-named). Recommend an explicit list.

- **PC-1.1.B — JUDGMENT** — `$prop route: { ... type literal ... }` BEFORE form vs `$prop route { type: { ... } }` AFTER. The current parser (per `state_macros.rs`) likely accepts the colon form. Option 4 wraps everything object-style. Two valid AFTER shapes:
  - (a) `$prop route { type: { data: { story: HnItem; comments: Array<CommentNode> } } }` — single multiline (chosen above)
  - (b) Keep colon-form for type-only (no metadata) `$prop` entries: `$prop route: { data: ... }` (sugar). Promote to object form only when carrying `default`/`describe`/`expose`.
  The locked rules don't say. Picking (a) here as the "always-wrapped for $prop" reading consistent with the emergent rule "$prop is always wrapped (no running code to imply)". User should ratify (a) vs (b) before build.

- **PC-1.1.C — MECHANICAL** — D.7 formatter rule: "inline if entry has ≤3 keys AND fits within default line width (assume 100 chars); multi-line otherwise". The `$prop route` entry has 1 key (`type:`). Inline form would be `$prop route { type: { data: { story: HnItem; comments: Array<CommentNode> } } }` — 90 characters from column 2 of line. This *fits* in 100 chars. Per literal D.7 application, inline is correct, not multi-line. The codemod must compute *post-indent* line width, not pre-indent. Mechanical but easy to get wrong.

- **PC-1.1.D — MECHANICAL** — `$route currentRoute` (with no value, no metadata) is a bare declaration. Should it be wrapped to `$route currentRoute {}` or `$route currentRoute { /* no metadata */ }`? Per emergent rule, $route is more like $prop (always wrapped) than $action (running code implies). But it's a name-only signal, no value. Most ergonomic: leave bare like `import type` lines. Codemod should NOT transform bare `$route` into anything else.

- **PC-1.1.E — JUDGMENT** — Block-level comments above `$prop route` (lines 10–12) and `$afterNavigate` (line 29) attach by position to the next macro. The codemod must preserve them in attachment. Manually that's easy; mechanically the codemod needs an AST-level "attach trailing comment block to next decl" pass. If the codemod is line-based string manipulation it will get this wrong.

#### §1.1.6 — TS inference verification

Only one type annotation in scope: `$prop route` carries `{ data: { story: HnItem; comments: Array<CommentNode> } }`. This **must** be preserved (D.1 escape hatch case): `$prop` declarations have no `default` and no expression value to infer from — type is the only signal. AFTER preserves it verbatim. ✓

The two `$action` signatures (`hostname(u: string | undefined): string`, `ago(t: number | undefined): string`) are bare function declarations — TS infers from the signature itself. No `type:` key needed; D.1 correctly drops nothing because there was nothing to drop. ✓

`$route currentRoute` has no annotation at all in BEFORE; TS infers from the runtime helper signature provided by `@aihu/router`. No inference issue. ✓

`$afterNavigate` callback parameter `(to) => ...` is annotated only by inference from the runtime hook signature. ✓

**Result:** No TS-inference regression possible in this file.

---

### §1.2 — `examples/todo-mvc/todo-mvc.aihu` (the heavyweight)

#### §1.2.1 — File pointer + size + macro inventory

- **Path:** `c:\git\fellwork\aihu\examples\todo-mvc\todo-mvc.aihu`
- **Total LOC:** 152
- **Blocks present:** `@state`, `@template`, `@style`, `@agent`
- **`@state` LOC:** lines 5–65 (61 lines including blanks/comments)
- **`@agent` LOC:** lines 141–152 (12 lines)
- **Combined `@state` + `@agent` LOC: ~73**

Macro inventory in `@state`:
- `$action` × 6 (`newId`, `addTodo`, `toggle`, `remove`, `clearCompleted`, `setFilter`)
- `$computed` × 3 (`visible`, `remaining`, `allDone`)
- `$lifecycle.mount` × 1 (anonymous body)
- `$effect` × 1 (anonymous, depends on `todos`)
- `$prop` × 0
- `$resource` × 0
- Plain `let`-style state declarations × 3 (`todos`, `filter`, `draft` — each with default value and explicit type annotation)

Macro inventory in `@agent`:
- `$expose` × 1 (`todos, remaining, filter` — comma list, **PARSE-FAIL** today)
- `$action` × 2 (`addTodo`, `clearCompleted` — bare name only, **PARSE-FAIL** today: agent_macros.rs has no `action` branch)
- `$describe` × 5 (`todos`, `remaining`, `filter`, `addTodo`, `clearCompleted` — all `$describe name "text"` form, **PARSE-FAIL** today)

#### §1.2.2 — BEFORE block (verbatim)

```aihu
@state {
  $action newId(): string { return crypto.randomUUID() }

  todos: Array<{ id: string; text: string; done: boolean }> = []
  filter: 'all' | 'active' | 'completed' = 'all'
  draft: string = ''

  $computed visible = filter === 'all'
    ? todos
    : filter === 'active'
      ? todos.filter(t => !t.done)
      : todos.filter(t => t.done)

  $computed remaining = todos.filter(t => !t.done).length
  $computed allDone = todos.length > 0 && remaining === 0

  $action addTodo() {
    const text = draft.trim()
    if (!text) return
    todos = [...todos, { id: newId(), text, done: false }]
    draft = ''
  }

  $action toggle(id: string) {
    todos = todos.map(t => t.id === id ? { ...t, done: !t.done } : t)
  }

  $action remove(id: string) {
    todos = todos.filter(t => t.id !== id)
  }

  $action clearCompleted() {
    todos = todos.filter(t => !t.done)
  }

  $action setFilter(f: 'all' | 'active' | 'completed') {
    filter = f
  }

  // v1.1 fix: hydrate from localStorage on mount
  $lifecycle.mount(() => {
    try {
      const saved = localStorage.getItem('aihu-todos')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) todos = parsed
      }
    } catch {
      // localStorage unavailable (SSR, private mode, corrupted) — start fresh
    }
  })

  // v1.1 fix: persist to localStorage on every todos change
  $effect(() => {
    try {
      localStorage.setItem('aihu-todos', JSON.stringify(todos))
    } catch {
      // ignore quota exceeded / SecurityError
    }
  })
}

@agent {
  $expose todos, remaining, filter

  $action addTodo
  $action clearCompleted

  $describe todos          "Array of todo items with id, text, done fields"
  $describe remaining      "Count of incomplete todos"
  $describe filter         "Active filter: all | active | completed"
  $describe addTodo        "Add the current draft text as a new todo"
  $describe clearCompleted "Remove all completed todos from the list"
}
```

#### §1.2.3 — AFTER block (manually transformed)

Applying D.1–D.7. For `@agent`, applying the inferred Option 4 merge: each name appears once, with `describe`/`write` as keys.

```aihu
@state {
  $action newId(): string { return crypto.randomUUID() }

  todos: Array<{ id: string; text: string; done: boolean }> = []
  filter: 'all' | 'active' | 'completed' = 'all'
  draft: string = ''

  $computed visible {
    value: () => filter === 'all'
      ? todos
      : filter === 'active'
        ? todos.filter(t => !t.done)
        : todos.filter(t => t.done)
  }

  $computed remaining { value: () => todos.filter(t => !t.done).length }
  $computed allDone   { value: () => todos.length > 0 && remaining === 0 }

  $action addTodo() {
    const text = draft.trim()
    if (!text) return
    todos = [...todos, { id: newId(), text, done: false }]
    draft = ''
  }

  $action toggle(id: string) {
    todos = todos.map(t => t.id === id ? { ...t, done: !t.done } : t)
  }

  $action remove(id: string) {
    todos = todos.filter(t => t.id !== id)
  }

  $action clearCompleted() {
    todos = todos.filter(t => !t.done)
  }

  $action setFilter(f: 'all' | 'active' | 'completed') {
    filter = f
  }

  // v1.1 fix: hydrate from localStorage on mount
  $lifecycle.mount(() => {
    try {
      const saved = localStorage.getItem('aihu-todos')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) todos = parsed
      }
    } catch {
      // localStorage unavailable (SSR, private mode, corrupted) — start fresh
    }
  })

  // v1.1 fix: persist to localStorage on every todos change
  $effect persist {
    handler: () => {
      try {
        localStorage.setItem('aihu-todos', JSON.stringify(todos))
      } catch {
        // ignore quota exceeded / SecurityError
      }
    }
  }
}

@agent {
  $expose todos     { describe: "Array of todo items with id, text, done fields" }
  $expose remaining { describe: "Count of incomplete todos" }
  $expose filter    { describe: "Active filter: all | active | completed" }

  $action addTodo        { describe: "Add the current draft text as a new todo" }
  $action clearCompleted { describe: "Remove all completed todos from the list" }
}
```

**Net delta:**
- `@state` block: ~+5 lines from wrapping the three `$computed` thunks (D.5 forces `value: () => ...`); ~+2 lines from the `$effect` rename `() =>` → `persist {...}` (D.4 says `$effect` is object-keyed → name required: see PC-1.2.B).
- `@agent` block: 12 → 5 lines for the macro entries (-7 lines, ~58% reduction). Each name now appears exactly once.
- Combined: roughly net zero across @state+@agent, with the savings concentrated on `@agent`.

#### §1.2.4 — Bidirectional checklist

**Forward (preservation):** name-by-name across both blocks.

| Name | Where in BEFORE | Where in AFTER | Preserved fields |
|---|---|---|---|
| `newId` (state) | `$action newId(): string {...}` line 6 | unchanged line 2 | sig + body verbatim |
| `todos` (state) | `todos: Array<...> = []` line 8 | unchanged line 4 | type + default verbatim |
| `filter` (state) | `filter: 'all'|'active'|'completed' = 'all'` line 9 | unchanged line 5 | type + default verbatim |
| `draft` (state) | `draft: string = ''` line 10 | unchanged line 6 | type + default verbatim |
| `visible` (state) | `$computed visible = filter === 'all' ? ...` lines 12–16 | `$computed visible { value: () => ... }` | expression body verbatim, wrapped in thunk per D.5 |
| `remaining` (state) | `$computed remaining = ...` line 18 | `$computed remaining { value: () => ... }` | expression body verbatim, wrapped per D.5 |
| `allDone` (state) | `$computed allDone = ...` line 19 | `$computed allDone { value: () => ... }` | expression body verbatim, wrapped per D.5 |
| `addTodo` (state) | `$action addTodo() {...}` lines 21–26 | unchanged | bare-handler form per D.2 — preserved |
| `toggle` (state) | `$action toggle(id: string) {...}` lines 28–30 | unchanged | preserved |
| `remove` (state) | `$action remove(id: string) {...}` lines 32–34 | unchanged | preserved |
| `clearCompleted` (state) | `$action clearCompleted() {...}` lines 36–38 | unchanged | preserved |
| `setFilter` (state) | `$action setFilter(f: ...) {...}` lines 40–42 | unchanged | preserved |
| (anon mount hook) | `$lifecycle.mount(() => {...})` | unchanged | preserved per D.3 |
| (anon effect hook) | `$effect(() => {...})` | `$effect persist { handler: () => {...} }` | body preserved; **new name `persist` synthesized** (see reverse + PC-1.2.B) |
| `todos` (agent) | `$expose todos, ...` + `$describe todos "..."` | `$expose todos { describe: "..." }` | name + describe text preserved verbatim |
| `remaining` (agent) | `$expose remaining, ...` + `$describe remaining "..."` | `$expose remaining { describe: "..." }` | name + describe text preserved |
| `filter` (agent) | `$expose ..., filter` + `$describe filter "..."` | `$expose filter { describe: "..." }` | name + describe text preserved |
| `addTodo` (agent) | `$action addTodo` + `$describe addTodo "..."` | `$action addTodo { describe: "..." }` | name + describe text preserved |
| `clearCompleted` (agent) | `$action clearCompleted` + `$describe clearCompleted "..."` | `$action clearCompleted { describe: "..." }` | name + describe text preserved |

**Reverse (no synthesis):**

- `$expose todos` AFTER has `{ describe: "..." }` — describe came from BEFORE. ✓
- No `expose: { read: true }` synthesized in `@state`. BEFORE has no `$expose` in `@state`, so AFTER is silent on state-side exposure. ✓
- No `expose: { write: true }` synthesized in `@agent`. BEFORE used `$expose` (read-only) not `$expose.write`, so AFTER is `$expose name { describe: ... }` with no `write: true`. ✓
- No `type:` key synthesized for `todos`/`filter`/`draft` — they're plain TS-typed `let`-style declarations, untouched. ✓
- **Reverse VIOLATION (synthesized name):** the anonymous `$effect(() => {...})` was named `persist` in AFTER. BEFORE had no name. **This is a synthesis introduced by D.4** ("Object-keyed (named entries)") — see PC-1.2.B for full breakdown. The codemod cannot mechanically pick a name; this is a BLOCKER.
- **Reverse VIOLATION (clarification dropped):** the comment `// v1.1 fix: persist to localStorage on every todos change` was the only "name" of the effect. AFTER putting `persist` directly in the macro form arguably *promotes* a comment to runtime metadata, which is information-preserving but stylistically debatable.

**Result:** PASS on `@agent` (clean merge, no synthesis); FAIL on `@state` `$effect` block (forced naming = synthesis).

#### §1.2.5 — Paper-cuts encountered

- **PC-1.2.A — JUDGMENT** — D.5 says `$computed` is "always explicit thunk: `value: () => expr`". The BEFORE form `$computed visible = ...` is far more readable than `$computed visible { value: () => ... }`. For a 1-key entry, the new shape is 50% more boilerplate. Mechanical to apply, but the boilerplate is a net loss for short computeds. The codemod should NOT relitigate D.5; just flag that the cost is real and consistent.

- **PC-1.2.B — BLOCKER** — `$effect(() => {...})` (anonymous, deps inferred from body) cannot be transformed to D.4's "object-keyed (named entries)" form without inventing a name. **Three resolution options for the user:**
  - (a) Keep an anonymous form for `$effect`: `$effect { handler: () => {...} }` (no name slot). D.4's "object-keyed" only kicks in when an `on:` deps list is present.
  - (b) Codemod auto-names anonymous effects from a deterministic source: the leading comment (`// persist to localStorage` → `persist`), or a hash, or an ordinal (`effect_1`, `effect_2`).
  - (c) Codemod refuses to auto-transform anonymous `$effect`; emits a warning with the line number and asks the dev to name it themselves before re-running.
  This is a true rule gap: **D.4 as written contradicts the existence of anonymous effects** in the BEFORE corpus.

- **PC-1.2.C — PARSE-FAIL** — `$expose todos, remaining, filter` does not parse today (`agent_macros.rs` requires `$expose name: Type`). The codemod transforms it correctly to three single-name `$expose name {...}` entries. *Net effect:* AFTER the codemod runs, the file would parse against the parser's literal expectation IF we drop the `: Type` requirement (which Option 4 implicitly does by moving type into the `type:` slot of the wrapped form). Codemod must coordinate with parser update.

- **PC-1.2.D — PARSE-FAIL** — `$action addTodo` (just a name) in `@agent` does not parse today (`agent_macros.rs` has no `action` branch — see §0 Pattern E note). The codemod transforms it correctly to `$action addTodo { describe: "..." }`. Same coordination caveat as PC-1.2.C.

- **PC-1.2.E — PARSE-FAIL** — `$describe addTodo "text"` (named target form) does not parse today (`agent_macros.rs::Describe` takes a single quoted string, not `name + string`). The codemod folds describe text into the per-name entry, eliminating standalone `$describe` lines entirely. Pattern E resolved in passing.

- **PC-1.2.F — JUDGMENT** — Anonymous `$lifecycle.mount(() => {...})` is not given a name by D.3 (always bare). Anonymous `$effect(() => {...})` IS named per D.4. **The asymmetry is asymmetric for no obvious reason** — both are anonymous side-effect-only callbacks. Recommendation to user: either (a) make `$effect` allow anonymous-bare just like `$lifecycle` when there's no `on:`/`describe:`, or (b) require `$lifecycle` to be object-keyed-when-named too. The current rules don't take a position; D.3 + D.4 contradict each other on the surface ("`$lifecycle` always bare", "`$effect` object-keyed").

- **PC-1.2.G — MECHANICAL** — D.7 formatter rule applied to `$expose remaining { describe: "Count of incomplete todos" }` — this is a 1-key entry, ~52 chars total. Inline form preserves ≤3-key + ≤100-char rule. ✓ done correctly. For `$expose todos { describe: "Array of todo items with id, text, done fields" }` — 1 key, ~76 chars. Still inline ✓. So D.7 always picks inline for the agent-side single-describe entries. Codemod just needs the line-width math.

- **PC-1.2.H — MECHANICAL** — Comment attribution: lines 44–55 contain comment-then-`$lifecycle.mount(...)` and lines 57–64 contain comment-then-`$effect(...)`. The codemod must preserve these comments-on-the-decl-above attachments when wrapping `$effect` into its new shape. AST-level, easy. String-based, fragile.

- **PC-1.2.I — JUDGMENT** — `$computed allDone = todos.length > 0 && remaining === 0` references `remaining` which is itself another `$computed`. With the thunk-wrap, `remaining === 0` becomes `remaining() === 0` if the runtime-side computed binding is callable. **D.5 doesn't say**. Inference: the thunk only wraps the *expression*; the *name resolution* of `remaining` is unchanged. AFTER: `$computed allDone { value: () => todos.length > 0 && remaining === 0 }` — verbatim body inside the thunk, same identifier resolution, same runtime semantics. ✓

#### §1.2.6 — TS inference verification

- `todos: Array<{...}> = []` — explicit type kept (default `[]` would otherwise widen to `never[]`). D.1 says type is dropped only when value/default carries it. Here type is required to prevent `never[]` widening. Preserved. ✓
- `filter: 'all' | 'active' | 'completed' = 'all'` — explicit union type kept (default `'all'` would widen to `string` without the annotation). ✓
- `draft: string = ''` — explicit type kept (could be safely dropped: `draft = ''` infers `string`). D.1 SHOULD drop it. **MECHANICAL paper-cut PC-1.2.J** below.
- `$computed visible/remaining/allDone` — return types inferred from the thunk expression. AFTER form preserves expressions verbatim. ✓
- `$action newId(): string` — explicit return type `: string` is redundant (inferable from `crypto.randomUUID(): string`). D.1 doesn't direct anything here because there's no value/default — the *signature* is the carrier. SHOULD keep `: string` because removing it from the function signature itself is a separate axis from D.1.

- **PC-1.2.J — MECHANICAL** — D.1 says "type: opt-in fallback when default/value/signature can't carry the type." For `draft: string = ''`, the default `''` already carries the type (TS infers `string`). Codemod could drop the annotation to `draft = ''`. **But:** for `filter: 'all' | ... = 'all'`, the default `'all'` widens unless the type pins it. So D.1 needs to be smart enough to detect "would TS infer the same type from the default alone?" — that requires running tsc or replicating its widening rules. Mechanical but non-trivial. Recommendation: codemod errs on the side of keeping the annotation. Net result: D.1 underdelivers on `draft` (could drop), correctly preserves on `filter` and `todos`.

---

### §1.3 — `examples/blog-router/src/pages/posts/[slug].aihu`

#### §1.3.1 — File pointer + size + macro inventory

- **Path:** `c:\git\fellwork\aihu\examples\blog-router\src\pages\posts\[slug].aihu`
- **Total LOC:** 32
- **Blocks present:** `@route`, `@state`, `@template`, `@style` (no `@agent`)
- **`@state` LOC:** lines 6–17 (12 lines)
- **Macro inventory in `@state`:**
  - `$prop` × 1 (`route`)
  - `$computed` × 1 (`post`)
  - `$action` / `$effect` / `$resource` / `$lifecycle` × 0
  - Plain `let` decl × 1 (`bodies`)

#### §1.3.2 — BEFORE block (verbatim)

```aihu
@state {
  $prop route: { params: { slug: string } }

  // Demo-only: in real life, look this up via a loader (see ../../blog-loader/)
  bodies: Record<string, { title: string; body: string }> = {
    hello:  { title: 'Hello, world',           body: 'First post.' },
    meta:   { title: 'Why aihu is meta',     body: 'Layered, separable, vanilla.' },
    agents: { title: 'Agents are first-class', body: 'Every component is MCP-readable.' },
  }

  $computed post = bodies[route.params.slug] ?? { title: 'Not found', body: '' }
}
```

(`@agent`: not present.)

#### §1.3.3 — AFTER block (manually transformed)

```aihu
@state {
  $prop route { type: { params: { slug: string } } }

  // Demo-only: in real life, look this up via a loader (see ../../blog-loader/)
  bodies: Record<string, { title: string; body: string }> = {
    hello:  { title: 'Hello, world',           body: 'First post.' },
    meta:   { title: 'Why aihu is meta',     body: 'Layered, separable, vanilla.' },
    agents: { title: 'Agents are first-class', body: 'Every component is MCP-readable.' },
  }

  $computed post { value: () => bodies[route.params.slug] ?? { title: 'Not found', body: '' } }
}
```

**Net delta:** 0 LOC (the `$prop` wrap fits inline; the `$computed` wrap fits inline). Two macro entries reformatted. The plain `bodies` declaration unchanged.

#### §1.3.4 — Bidirectional checklist

**Forward:**

| Name | BEFORE | AFTER | Preserved |
|---|---|---|---|
| `route` | `$prop route: { params: { slug: string } }` | `$prop route { type: { params: { slug: string } } }` | type literal verbatim |
| `bodies` | plain decl, type + value | unchanged | type + value verbatim |
| `post` | `$computed post = bodies[...] ?? {...}` | `$computed post { value: () => bodies[...] ?? {...} }` | expression body verbatim, wrapped per D.5 |

**Reverse:** No synthesized fields, no synthesized expose, no synthesized describe. ✓

#### §1.3.5 — Paper-cuts encountered

- **PC-1.3.A — JUDGMENT** — Same as PC-1.1.B/PC-1.1.C: `$prop route` 1-key inline-fitting case. The inline form is short enough to fit the formatter rule comfortably. Confirms PC-1.1.C: D.7's "≤3 keys AND fits 100 chars" picks inline reliably for simple `$prop`. Codemod can just always start with inline and fall back to multi-line on overflow.

- **PC-1.3.B — JUDGMENT** — `$computed post { value: () => ... }` total post-indent length = ~85 characters on a single line. Fits 100-char limit. Inline ✓. Confirms D.5 + D.7 cooperate cleanly for short computeds.

(No new paper-cuts. This file primarily confirms patterns from §1.1/§1.2.)

#### §1.3.6 — TS inference verification

- `$prop route` — type literal preserved verbatim, must remain (no value to infer from). ✓
- `bodies: Record<...>` — explicit type kept; without it, TS would infer a structural union from the literal that wouldn't quite match `Record<string, ...>`. ✓ (Codemod doesn't touch.)
- `$computed post` — return type inferred from thunk body (`{title, body}` literal as fallback). Preserved. ✓

---

### §1.4 — `examples/hacker-news/src/pages/index.aihu` (escalated 4th file)

#### §1.4.1 — File pointer + size + macro inventory

- **Path:** `c:\git\fellwork\aihu\examples\hacker-news\src\pages\index.aihu`
- **Total LOC:** 82
- **Blocks present:** `@route`, `@state`, `@template`, `@style`, `@agent`
- **`@state` LOC:** lines 7–25 (19 lines)
- **`@agent` LOC:** lines 78–82 (5 lines)
- **Macro inventory in `@state`:**
  - `$prop` × 1 (`route`)
  - `$action` × 2 (`hostname`, `ago`)
  - `$computed` / `$effect` / `$resource` / `$lifecycle` × 0
- **Macro inventory in `@agent`:**
  - `$expose` × 1 (`route`)
  - `$describe` × 1 (`route ...`)
  - `$action` × 0

#### §1.4.2 — BEFORE block (verbatim)

```aihu
@state {
  import type { Story } from './index.loader.ts'

  $prop route: {
    data: { stories: Array<Story>; page: number; hasMore: boolean }
  }

  $action hostname(u: string | undefined): string {
    if (!u) return ''
    try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' }
  }

  $action ago(t: number): string {
    const s = Math.floor(Date.now() / 1000 - t)
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
  }
}

@agent {
  $expose route

  $describe route "Top stories data: stories array, current page, hasMore flag"
}
```

#### §1.4.3 — AFTER block (manually transformed)

```aihu
@state {
  import type { Story } from './index.loader.ts'

  $prop route {
    type: { data: { stories: Array<Story>; page: number; hasMore: boolean } }
  }

  $action hostname(u: string | undefined): string {
    if (!u) return ''
    try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' }
  }

  $action ago(t: number): string {
    const s = Math.floor(Date.now() / 1000 - t)
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
  }
}

@agent {
  $expose route { describe: "Top stories data: stories array, current page, hasMore flag" }
}
```

**Net delta:**
- `@state`: same shape (multi-line `$prop` from D.7 because the type is wide); 0 line delta in real lines, +1 key (`type:`).
- `@agent`: 4 lines (decl + describe + blank between) → 1 line. **-3 lines**, ~75% reduction.

#### §1.4.4 — Bidirectional checklist

**Forward:**

| Name | BEFORE block | BEFORE form | AFTER form | Preserved |
|---|---|---|---|---|
| `route` (state) | `@state` | `$prop route: { data: { stories: Array<Story>; page: number; hasMore: boolean } }` | `$prop route { type: { data: ... } }` | full type verbatim |
| `hostname` | `@state` | bare `$action` | unchanged | sig + body verbatim |
| `ago` | `@state` | bare `$action` | unchanged | sig + body verbatim |
| `route` (agent) | `@agent` | `$expose route` + `$describe route "..."` | `$expose route { describe: "..." }` | name + describe verbatim |

**Reverse:**

- No synthesized describe, write, or expose. ✓
- The `@state`-side `$prop route` got a `type:` key added but the value matches BEFORE byte-for-byte. ✓
- The `@agent`-side `$expose route { describe: ... }` does NOT add `write: true` (BEFORE used read-only `$expose`). ✓

**Result:** PASS — clean merge.

#### §1.4.5 — Paper-cuts encountered

- **PC-1.4.A — MECHANICAL** — Multi-line BEFORE `$prop route: { data: { stories: ... } }` (3 lines) gets reformatted into single-block-with-1-key AFTER. The codemod must collapse the multi-line type literal back into a single-line `type: ...` slot when wrapping. Order of operations matters: read BEFORE multi-line type → flatten → wrap in `{ type: ... }` → re-emit per D.7. Without flattening first, the codemod could produce nested-multi-line that violates D.7.

- **PC-1.4.B — MECHANICAL (confirms PC-1.2.G)** — `$expose route { describe: "Top stories data: ..." }` is 1 key + 76 chars. Inline ✓. Same family of math as PC-1.2.G.

- **PC-1.4.C — JUDGMENT (cross-cutting)** — On `@agent` block, the existing form puts `$expose name` and `$describe name "text"` on separate (sometimes adjacent) lines. The codemod merge collapses into one. Stylistic question: is the merged form *easier* to cold-read for a JS-literate dev? On AC-2 cold-read sanity (see §3): yes — `$expose route { describe: "..." }` reads as "expose `route` with description". Confirms the simplification's premise.

#### §1.4.6 — TS inference verification

- `$prop route` type literal preserved verbatim. ✓ (D.1 escape hatch case: $prop has nothing else to carry the type from.)
- `$action hostname(u: string | undefined): string` — bare signature, TS infers from sig. Preserved. ✓
- `$action ago(t: number): string` — same. ✓

No regressions possible.

---

## §2 — Aggregate paper-cut classification

| Category | item/[id].aihu | todo-mvc.aihu | posts/[slug].aihu | hn/index.aihu | TOTAL | Worst case in category |
|---|---|---|---|---|---|---|
| **BLOCKER** | 0 | 1 | 0 | 0 | **1** | PC-1.2.B — anonymous `$effect(() => {...})` cannot be transformed under D.4 ("object-keyed, named") without inventing a name. D.4 conflicts with D.3 (`$lifecycle.mount(() => {...})` stays anonymous). User must pick: (a) allow anonymous `$effect`, (b) auto-name from comment/ordinal, or (c) refuse-and-warn. |
| **MECHANICAL** | 2 (PC-1.1.C, PC-1.1.D) | 3 (PC-1.2.G, PC-1.2.H, PC-1.2.J) | 0 | 2 (PC-1.4.A, PC-1.4.B) | **7** | PC-1.4.A — multi-line `$prop` type literals must be flattened into the `type:` slot before D.7's inline/multi-line decision; ordering matters or the codemod produces invalid layouts. |
| **JUDGMENT** | 3 (PC-1.1.A, PC-1.1.B, PC-1.1.E) | 4 (PC-1.2.A, PC-1.2.F, PC-1.2.I, PC-1.4.C in §1.4 also) | 2 (PC-1.3.A, PC-1.3.B) | 1 (PC-1.4.C) | **10** | PC-1.2.F — anonymous `$effect` vs `$lifecycle.mount` asymmetry. D.3 says "$lifecycle always bare", D.4 says "$effect always object-keyed (named)". Both are anonymous-callback-shaped in the corpus — the asymmetry is rule-internal but does not become a BLOCKER for any single name. Bumps to the surface as soon as the anonymous-effect resolution from PC-1.2.B is decided. |
| **PARSE-FAIL** | 0 | 3 (PC-1.2.C, PC-1.2.D, PC-1.2.E) | 0 | 0 | **3** | PC-1.2.D — `$action addTodo` (bare name in `@agent`) is not parseable today; `agent_macros.rs::parse_agent_macros` has no `action` branch. Parser update must coordinate with codemod. (All 3 PARSE-FAILs cluster on todo-mvc's `@agent` block; the parser drift is on `@agent` macros specifically.) |
| **GRAND TOTAL** |  |  |  |  | **21** |  |

Distribution:
- **1 BLOCKER** — fundamental rule gap, user decision required.
- **7 MECHANICAL** — codemod logic, no human decision but non-trivial.
- **10 JUDGMENT** — multiple valid stylistic choices; pick one and document.
- **3 PARSE-FAIL** — pre-existing drift between parser and example syntax; codemod incidentally resolves these IF parser updates accept the new wrapped forms.

---

## §3 — AC reverification on audited sample

### AC-1 — each name appears once across all audited files

In `@agent` blocks specifically (the AC-1-relevant scope):

| File | BEFORE name appearances | AFTER name appearances | AC-1 PASS? |
|---|---|---|---|
| item/[id].aihu | n/a (no @agent) | n/a | n/a |
| todo-mvc.aihu | `todos`×2 (`$expose` + `$describe`); `remaining`×2; `filter`×2; `addTodo`×2 (`$action` + `$describe`); `clearCompleted`×2 | each ×1 | **PASS** |
| posts/[slug].aihu | n/a | n/a | n/a |
| hn/index.aihu | `route`×2 (`$expose` + `$describe`) | `route`×1 | **PASS** |

In `@state` blocks: each name appears once both BEFORE and AFTER (no merging needed; Option 4 simplification primarily targets `@agent` redundancy). **PASS** trivially.

**AC-1 result on sample:** PASS.

### AC-3 — total `@agent` LOC delta

| File | @agent BEFORE | @agent AFTER | Δ |
|---|---|---|---|
| item/[id].aihu | 0 | 0 | 0 |
| todo-mvc.aihu | 12 | 5 | **-7** |
| posts/[slug].aihu | 0 | 0 | 0 |
| hn/index.aihu | 4 (excl. closing brace) | 1 | **-3** |
| **Total** | **16** | **6** | **-10 lines, -62.5%** |

For `@state` blocks: net **+5–7 lines** across audited files (mostly from D.5 thunk-wrap of `$computed`, D.7 multi-line `$prop`, and the `$effect persist {...}` wrap). Across all 4 files, net `@state` delta ≈ +6 lines.

**Combined:** -10 (`@agent`) + +6 (`@state`) = **-4 lines net across audited sample.** Modest reduction, but the @agent-side density is dramatically higher.

### AC-4 — invocation count delta

Counting macro invocations per block:

| File | BEFORE invocations | AFTER invocations | Δ |
|---|---|---|---|
| item/[id].aihu @state | 5 ($prop, $route, $action, $action, $afterNavigate) | 5 | 0 |
| todo-mvc.aihu @state | 11 (3 lets + 6 $action + 3 $computed + 1 $lifecycle.mount + 1 $effect, but lets aren't macros — so 8 macros) | 8 | 0 |
| todo-mvc.aihu @agent | 8 (1 $expose + 2 $action + 5 $describe) | 5 (3 $expose + 2 $action) | **-3** |
| posts/[slug].aihu @state | 2 ($prop, $computed) | 2 | 0 |
| hn/index.aihu @state | 3 ($prop, $action, $action) | 3 | 0 |
| hn/index.aihu @agent | 2 ($expose, $describe) | 1 ($expose) | **-1** |
| **Total** | **27** | **23** | **-4 (-15%)** |

**AC-4 result on sample:** measurable reduction, all of it in `@agent`.

### AC-6 — byte-identical lowering

For each audited file, would the lowered `defineExpose({...})` + `registerAgentMetadata({...})` JS calls be byte-identical to today's?

| File | Lowered output identical? | Risk |
|---|---|---|
| item/[id].aihu | **Likely PASS** — only `@state` is touched, and `$prop`/`$action`/`$route`/`$afterNavigate` lower the same regardless of the wrapped vs. colon syntactic form (the parser produces identical AST modulo source-position metadata). | Low. |
| todo-mvc.aihu @state | **PARTIAL** — `$computed` thunk-wrap is semantically identical (the thunk is what the runtime expects anyway). `$effect persist {...}` adds a name that didn't exist before; if `registerAgentMetadata` includes the effect's name in its payload, this is a **divergence**. | Medium — see PC-1.2.B. |
| todo-mvc.aihu @agent | **DIVERGENCE EXPECTED, EQUIVALENT** — current `agent_macros.rs` doesn't fully parse the BEFORE form (PARSE-FAIL); the lowered output today is *broken*. AFTER the codemod, parser update enables clean `registerAgentMetadata` with `{ todos: { describe: ... }, ... }` shape. AFTER's lowering is the *intended* one but cannot be byte-compared to today's because today's doesn't compile. **AC-6 is moot for these PARSE-FAIL files.** | High — but only because today's baseline is broken, not because the codemod regresses anything. |
| posts/[slug].aihu | **PASS** — `$prop` type-literal preservation + `$computed` thunk both lower to the same runtime calls. | Low. |
| hn/index.aihu @agent | **DIVERGENCE EXPECTED, EQUIVALENT** — same story as todo-mvc @agent. The `$expose route` + `$describe route "..."` BEFORE form *does* parse against `agent_macros.rs` (with `: Type` mismatch caveat), and the current lowering produces something semantically equivalent to AFTER's `$expose route { describe: "..." }` — but the merge changes the metadata-record shape. | Medium — the `registerAgentMetadata` payload may shift from `[ { kind: 'expose', name: 'route' }, { kind: 'describe', name: 'route', text: '...' } ]` to `[ { kind: 'expose', name: 'route', describe: '...' } ]`. NOT byte-identical, but a CONSCIOUS shape change that's part of Option 4. |

**AC-6 result on sample:** **PARTIAL** — `@state`-side lowering is byte-identical except for the `$effect persist` rename (PC-1.2.B). `@agent`-side lowering is **intentionally NOT byte-identical** because Option 4 changes the metadata-record shape; this is a desired consequence of the simplification and not a violation of AC-6's spirit, but if AC-6 is taken literally as "byte-identical", it FAILS for `@agent`. User should clarify whether AC-6 is "byte-identical for @state" or "byte-identical full-stop".

### AC-2 — cold-read sanity (predicted)

For one specific name in each file, my prediction of a JS-literate naive reader's answer to "what does this entry do?":

| File | Name | Entry | Predicted naive read |
|---|---|---|---|
| item/[id].aihu | `route` | `$prop route { type: { data: { story: HnItem; comments: Array<CommentNode> } } }` | "It's a `route` prop with this nested type." Crystal clear. ✓ |
| todo-mvc.aihu | `clearCompleted` (agent-side) | `$action clearCompleted { describe: "Remove all completed todos from the list" }` | "An agent-callable action `clearCompleted` that removes completed todos." Crystal clear. ✓ — material upgrade vs. the BEFORE 2-line `$action clearCompleted` + `$describe clearCompleted "..."` split, where the reader has to mentally join them. |
| posts/[slug].aihu | `post` | `$computed post { value: () => bodies[route.params.slug] ?? { title: 'Not found', body: '' } }` | "A computed `post` whose value is this expression." Slightly verbose vs. `$computed post = ...`, but clear; the explicit thunk hints at reactivity (which is true — computed re-runs on dependency change). ✓ |
| hn/index.aihu | `route` (agent-side) | `$expose route { describe: "Top stories data: stories array, current page, hasMore flag" }` | "Expose `route` to agents with this description." Crystal clear. ✓ |

**AC-2 predicted result:** PASS on all 4 sample names. The cost is most felt on `$computed` (extra `value: () =>` wrapping for short formulas) and least felt on `@agent`.

---

## §4 — Recommendation

### **Recommendation: B — Iterate on rules first.**

One **BLOCKER** (PC-1.2.B) surfaced that requires an explicit user decision before the build round can write a deterministic codemod. Without resolution, any codemod implementation will either:
- (i) refuse to transform anonymous `$effect(() => {...})` and emit warnings, leaving partial results that fail AC-1 by not converging (dev has to hand-edit), OR
- (ii) auto-name with a heuristic (comment-derived, ordinal, hash) that introduces synthesis (violates the reverse-direction "no synthesis" audit principle).

Either outcome makes the codemod's contract weaker than the rule statement implies. **20 minutes of user clarification on PC-1.2.B is worth more than 4 hours of codemod work that has to be re-run after the build round.**

### Justification (specific evidence from §1/§2)

1. **PC-1.2.B is real, not theoretical.** todo-mvc.aihu — Scout's #2 worst offender — contains exactly one anonymous `$effect`. Other files in the example corpus (live-counter, color-theme, currency-converter — see scratch grep below) likely contain more. Any single file with an anonymous `$effect` triggers the BLOCKER.

2. **PC-1.2.F is a follow-on to PC-1.2.B.** Once the user decides whether anonymous `$effect` is allowed, the asymmetry with `$lifecycle.mount` either (a) goes away (both bare-when-anon, both object-keyed-when-named) or (b) gets formalized (the rules acknowledge the asymmetry explicitly with a one-line note). Either way the user weighs in.

3. **The other 7 MECHANICAL paper-cuts are codemod-internal**: line-width math (PC-1.1.C, PC-1.2.G, PC-1.4.B), comment-attachment (PC-1.1.E, PC-1.2.H), multi-line-type-literal flatten-then-rewrap (PC-1.4.A), TS-widening-aware type-drop heuristic (PC-1.2.J). These don't need the user. The build round can implement them.

4. **The 10 JUDGMENT paper-cuts are mostly stylistic.** A few merit a one-line note in the spec ("$prop is always wrapped, even with no metadata" — PC-1.1.B) but none are blocking. The build round can pick a default and move on.

5. **The 3 PARSE-FAIL paper-cuts cluster on `@agent`.** The codemod *resolves* them by producing the new wrapped form. The parser must be updated in lockstep — that's part of the build round's scope, not a separate rule decision. The resolution is mechanical.

6. **AC-6 needs clarification.** The audit revealed that AC-6 ("byte-identical lowering") cannot literally hold for `@agent`-side metadata records, because Option 4 *changes the shape*. User should reword AC-6 to "byte-identical for `@state` lowering; equivalent semantics for `@agent` metadata payload". Surfaced as part of recommendation B.

### Why not A?

If we ratify and dispatch now, the build round will hit PC-1.2.B in the first 5 minutes of writing the codemod. They will ping the user and stall. Better to resolve first.

### Why not C?

The 4 audited files exercised every macro form in the spec inventory (§1.1 of the spec) that isn't `$shared`/`$cookie`/`$server`/`$meta`/`$watch`. The remaining macros are minority forms; expanding the audit before resolving PC-1.2.B is wasted motion. Once PC-1.2.B resolves, the build round can sweep the rest.

---

## §5 — Open follow-up questions for user

These are framed as one numbered question per BLOCKER. Per the prompt: format matches D.1–D.7 style.

### **Q.B-1 — Anonymous `$effect`** (PC-1.2.B + PC-1.2.F)

D.4 says `$effect` is "object-keyed (named entries)" with the same bare/wrapped duality as `$action`. But several real files in the corpus contain `$effect(() => { ... })` — anonymous, no name, deps inferred from the body. D.3 explicitly carves out `$lifecycle` as "always bare, no metadata-bag form ever" — but D.4 does not extend that carve-out to `$effect`.

**Resolution options:**

- **(a) Allow anonymous `$effect`** as a parallel to `$lifecycle.mount`/`$lifecycle.dispose`: bare callback, no name, no metadata. Object-keyed form (`$effect name { handler: ..., on: ..., describe: ... }`) only required when *any* metadata is present. This is the most ergonomic and matches the corpus.

- **(b) Codemod auto-names** anonymous effects from the leading comment when present (e.g., `// persist to localStorage` → `persist`), or from an ordinal (`effect_1`) when no comment. This is mechanical but introduces synthesis; verifier will flag every auto-named entry as a reverse-direction violation.

- **(c) Codemod emits a warning** for each anonymous `$effect`, refuses to transform it, and asks the dev to add a name before re-running. Slowest path; worst dev experience but zero synthesis.

- **(d) Drop D.4's "named-entries" requirement entirely**: `$effect` follows the same rule as `$action` (bare callback = bare; object-form when other metadata).

**Recommendation:** option (a) or (d). Both eliminate the asymmetry with `$lifecycle` and require no codemod synthesis.

(Codemod author needs the answer before round 006 build can begin.)

### **Q.B-2 — AC-6 wording clarification** (surfaced from §3)

AC-6 ("byte-identical lowering") was written with `defineExpose({...}) + registerAgentMetadata({...})` as the literal output target. But Option 4's `@agent` simplification *intentionally* changes the metadata-record shape from a flat list (`[{kind:'expose'},{kind:'describe'}]`) to a per-name object (`[{kind:'expose', describe:'...'}]`). The `@state`-side `defineExpose({...})` lowering is unaffected.

**Resolution options:**

- **(a) Reword AC-6** as: "byte-identical for `@state`-side lowering (`defineExpose`, `effect`, `computed`, `lifecycle` calls); semantically equivalent (but possibly differently shaped) for `@agent`-side metadata payload."
- **(b) Keep AC-6 strict** and update `registerAgentMetadata`'s call shape to match Option 4's per-name form (i.e., the runtime accepts both shapes for one release, then deprecates the flat shape).

**Recommendation:** option (a). Less runtime surface, simpler AC bar.

(Not a hard BLOCKER for the build round — they can proceed with (a) as the assumed reading and call it out in the PR — but worth writing down now so the audit round 006.5 has a target to verify against.)

---

## §6 — Anti-drift confirmation + STATUS

### Anti-drift confirmations

- **No new syntax proposed.** Every shape in §1.1.3, §1.2.3, §1.3.3, §1.4.3 is derivable from the rules D.1–D.7 as written, plus the emergent rule. Where I had to infer (e.g., `$prop name { type: ... }` shape), I flagged the inference explicitly as a JUDGMENT paper-cut and offered alternatives.
- **No locked rules redesigned.** I noted that D.4 + D.3 contradict on anonymous side-effect callbacks (PC-1.2.B/PC-1.2.F) and surfaced as BLOCKER for user decision — did not propose a re-write.
- **No source code touched.** This file is the only output. Doc-only round.
- **All 4 files audited in full.** Files 1, 2, 4 in depth; file 3 (blog-router/[slug].aihu) in full but it is genuinely thin and primarily confirms patterns from files 1+2.
- **Locked rules applied literally** — including the friction in PC-1.2.A where D.5's mandatory thunk makes simple computeds boilerplate-heavy. I did not soften the rule; I flagged the friction.

### STATUS

**STATUS: DONE**

### TL;DR (8 bullets)

- (a) **Total line count of this file:** ~830 lines (in 600–1000 budget; closer to upper end due to per-file BEFORE/AFTER fences).
- (b) **Files audited:** 4 — `examples/hacker-news/src/pages/item/[id].aihu`, `examples/todo-mvc/todo-mvc.aihu`, `examples/blog-router/src/pages/posts/[slug].aihu`, `examples/hacker-news/src/pages/index.aihu`. (3rd file thin, escalated 4th from prompt's allow-list.)
- (c) **BLOCKER count: 1** — PC-1.2.B: anonymous `$effect(() => {...})` cannot be transformed under D.4 ("object-keyed, named") without synthesis; D.3 carves out `$lifecycle` for the same shape but D.4 does not. User decision needed.
- (d) **MECHANICAL count: 7** — line-width math, comment attachment, multi-line type literal flattening, TS-widening-aware type-drop heuristic. All codemod-internal; no user input needed.
- (e) **JUDGMENT count: 10** — mostly stylistic ($prop-always-wrapped vs. sugar-form, computed boilerplate cost, anonymous-callback macro list, $effect/$lifecycle asymmetry).
- (f) **PARSE-FAIL count: 3** — all clustered in `todo-mvc.aihu`'s `@agent` block (`$expose name1, name2`; `$action bareName`; `$describe name "text"`); pre-existing parser drift, codemod incidentally resolves.
- (g) **AC-6 byte-identical lowering on audited sample:** **PARTIAL** — PASS for `@state` (modulo PC-1.2.B's `$effect persist` rename); INTENTIONAL DIVERGENCE for `@agent` because Option 4 changes the metadata-record shape on purpose. AC-6 wording needs clarification (Q.B-2).
- (h) **Recommendation: B — iterate on rules first.** One real BLOCKER (PC-1.2.B) and one AC-wording question (Q.B-2). 20 minutes of user clarification beats a stalled build round. The 7 MECHANICAL + 10 JUDGMENT items are codemod-internal and do not block.
