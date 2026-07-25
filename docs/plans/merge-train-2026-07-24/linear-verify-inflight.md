# Linear verification — in-flight issues (FEL-395, FEL-396, FEL-406, FEL-399)

Verifier pass, read-only. Checkout: `main` @ `ad6921a0` (clean).
Date: 2026-07-25. All Linear states read as **Backlog** at time of check.

Summary table:

| Issue | Linear state now | Verdict | Evidence anchor |
|---|---|---|---|
| FEL-395 | Backlog | **IN PROGRESS — PR #546** | `packages/arbor/src/structural.ts` (PR head `bf6a2764`) |
| FEL-396 | Backlog | **IN PROGRESS (partial) — PR #546** | `_moveNode` + `connectedMoveCallback` |
| FEL-406 | Backlog | **STILL OPEN** | all 3 findings live at PR #550 head `c9bc14ff` |
| FEL-399 | Backlog | **STILL OPEN — systemic** | symptoms patched per-instance; race intact |

Nothing here is DONE. Neither #546 nor #550 is on `origin/main`.

---

## FEL-395 — [arbor] keyed `each()` leaves stale row values

**Verdict: IN PROGRESS — open PR #546 (`fix/keyed-list-and-dom-move`, head `bf6a2764`). The diff DOES fix the described mechanism.**

### Not on main

`git show origin/main:packages/arbor/src/structural.ts` line 148 is still the
original unconditional skip:

```ts
for (let i = 0; i < items.length; i++) {
  const k = kfn(items[i])
  if (sc.has(k)) continue        // origin/main:148 — unchanged
```

`git grep -n "moveBefore\|connectedMoveCallback" origin/main -- packages/` → **zero hits**.

### What #546 changes (exact hunk)

`packages/arbor/src/structural.ts`, replacing `if (sc.has(k)) continue`:

```ts
const existing = sc.get(k)
if (existing) {
  // FEL-395: key unchanged does NOT mean the item is unchanged. [...]
  if (existing.item === items[i]) continue
  _teardownChildScope(existing)
  sc.delete(k)
}
```

plus a new `readonly item: unknown` field on `ChildScope`
(`packages/arbor/src/types.ts` +101), populated at grow time
(`item: items[i]` in `_reconcileEach`; `item: null` in `_reconcileWhen`).

This is a direct, correct answer to the filed mechanism: the row is now
re-grown whenever the incoming item is a *different reference* under the same
key, so `lgrow(item, idx)`'s by-value capture is refreshed and the DOM reflects
the new field values.

### Coverage added

`packages/arbor/tests/structural.test.ts`:
- `T10 (FEL-395): same-keyed but different-value objects → DOM reflects the NEW values` — the exact repro from the issue.
- `T11 (FEL-395): reordering the SAME object references still reuses rows (no spurious re-grow)`.

The issue's "Missing coverage" complaint (no object-item test in T4–T8) is
addressed.

### Verifier caveat (not a blocker, but record it)

The fix is **reference identity**, which puts FEL-395 and FEL-396 in direct
tension. Any caller whose list is derived — `computed(() => rows().map(r => ({...r})))`,
a fetch that re-parses JSON each poll, an immutable-update store — produces
fresh object references on *every* update, so **every row re-grows on every
update**, discarding exactly the component state FEL-396 exists to preserve
and negating the point of keying. T11 pins only the "same references reused"
path. Worth a doc note on `each()` (or a value-equality escape hatch) before
this is treated as closed.

### Blocking status

PR #546 is `mergeable: CONFLICTING` / `mergeStateStatus: DIRTY` — needs a
rebase onto `ad6921a0`. `check` passes; `Smoke tests`, `bench`, `bench-arbor`
currently **fail** on the PR.

---

## FEL-396 — [runtime] moving a component in the DOM destroys all component state

**Verdict: IN PROGRESS (PARTIAL) — open PR #546. It addresses the dominant trigger, not the general statement.**

### Mechanism used: `moveBefore()`, NOT move detection

The PR does **not** add microtask-deferred teardown, and does **not** add move
detection to `disconnectedCallback`. `packages/runtime/src/define-component.ts`
`disconnectedCallback` (both the function-form ~337-354 and options/class-form
~686-707 paths) remains destructive and unchanged.

Instead it avoids ever firing the disconnect/connect pair, in two parts:

1. **`packages/arbor/src/structural.ts` — new `_moveNode()`**, and the reorder
   loop switched from `insertBefore` to it:

   ```ts
   function _moveNode(par, node, ref) {
     const mb = (par as unknown as _MoveCapableParent).moveBefore
     if (typeof mb === 'function' &&
         node.parentNode !== null &&
         node.getRootNode() === par.getRootNode()) {
       mb.call(par, node, ref)
     } else {
       par.insertBefore(node, ref)
     }
   }
   ```

   ```diff
   -    if (s.anchor !== ref) par.insertBefore(s.anchor, ref)
   +    if (s.anchor !== ref) _moveNode(par, s.anchor, ref)
        else ref = s.anchor.nextSibling
   -    for (const n of nl) n === ref ? (ref = n.nextSibling) : par.insertBefore(n, ref)
   +    for (const n of nl) n === ref ? (ref = n.nextSibling) : _moveNode(par, n, ref)
   ```

2. **Opt-in markers** so the platform actually preserves state:
   `connectedMoveCallback(): void {}` added to `defineComponent`'s function-form
   class (`define-component.ts` +352), forwarded in the options/class-form
   (+687, `_baseProto.connectedMoveCallback?.call(this)`), and in
   `define-element.ts` `wrapClass` (+71). `_LifecycleProto` gains the member.

### Why this is only partial

The issue as filed is scoped to `define-component.ts`: "a DOM *move* is
currently indistinguishable from a genuine unmount+remount." After #546 that
is **still true** for:

- **Any move not performed by arbor's `each()` reconciler** — userland
  `parent.appendChild(el)`, `el.after(other)`, drag-and-drop, portals, a
  third-party list lib. `_moveNode` is internal to `_reconcileEach`; nothing
  in `define-component.ts` detects a move.
- **Safari and jsdom** — no `moveBefore`, so the fallback is today's
  `insertBefore` = destroy/rebuild. Support quoted in the PR: Chrome/Edge 133+,
  Firefox 144+. This repo's test env (jsdom) always takes the fallback, so the
  preservation behavior itself is only exercised through a shim, never against
  a real implementation.
- **DI/context**, per the PR's own inline caveat: a moved component keeps
  whatever ancestor `provides` chain it resolved at first connect.

The PR body says `closes FEL-395, closes FEL-396`. Merging it will auto-close
FEL-396 with a narrower fix than the issue describes. Recommend either
retitling FEL-396 to the keyed-reorder scope, or splitting a follow-up for the
general-move case before letting the auto-close fire.

### Known adjacent defect, already carved out

The PR documents (and guards against) a pre-existing bug: a row whose body is
a bare structural (`each(..., (item,i) => when(...))`, `template_emit.rs:614`)
never refreshes its `appendedNodes` snapshot when the nested `when()` toggles
off, so it holds detached nodes. Real `moveBefore()` throws
`HierarchyRequestError` on those; the `node.parentNode !== null &&
node.getRootNode() === par.getRootNode()` guard is the mitigation. The
underlying staleness is filed as **fellwork/aihu#544** and is NOT fixed here.

### Blocking status

Same as FEL-395: #546 is CONFLICTING and has failing `Smoke tests` / `bench` /
`bench-arbor`.

---

## FEL-406 — [use] Wave 1a low-severity review findings

**Verdict: STILL OPEN. All three findings are present, verbatim, at PR #550's current head.**

PR #550 (`feat/use-wave1a`) head = `c9bc14ff`, a **single commit**
(`git log origin/main..origin/feat/use-wave1a` → one entry). No follow-up
commits after the review. `git grep -l FEL-406 origin/feat/use-wave1a` → no hits.
So the findings are genuinely outstanding follow-ups, not already-landed work.

### 1. `useTimeAgo` — reactive `date` source not tracked — OUTSTANDING

`packages/use/src/useTimeAgo/index.ts`, PR head:

```ts
const tick = (): void => {
  if (disposed) return
  const [text, nextDelay] = formatTimeAgo(rtf, Date.now() - toMs(toValue(date)))
  handle = setTimeout(tick, nextDelay)
  setTimeAgo(text)
}
```

`toValue(date)` is still read inside a plain `setTimeout` callback, outside any
tracked effect. Nor was the doc-only alternative taken: the JSDoc still reads
"Track a reactive relative-time string for `date`. Cleans up with the
surrounding effect scope; scopeless callers keep polling for the page's
lifetime unless they call the returned `pause()` themselves." — no statement
that the source is *polled, not tracked*.

### 2. `useIntersectionObserver` — `isActive` semantics — OUTSTANDING

`packages/use/src/useIntersectionObserver/index.ts`, PR head:

```ts
const resume = (): void => {
  if (stopped) return
  if (disposeEffect !== null) return
  setIsActive(true)                     // unconditional, before the effect runs
  disposeEffect = effect((onCleanup) => {
    const el = unrefElement(target)
    if (el == null) return              // early-out: no observer ever created
    ...
```

and the doc it contradicts is unchanged:

```ts
/** Reactive getter — whether the observer is currently attached. ... */
readonly isActive: () => boolean
```

Neither remediation (move `setIsActive(true)` after observer creation, or
narrow the doc to "resume() called / not paused") has been applied.

### 3. `useMeasure` — `box` option mapping — OUTSTANDING

`packages/use/src/useMeasure/index.ts`:

- line ~73: `box?: ResizeObserverBoxOptions` — still the full native union,
  which includes `'device-pixel-content-box'`.
- line ~143: `const boxSize = box === 'border-box' ? entry.borderBoxSize?.[0] : entry.contentBoxSize?.[0]`

`'device-pixel-content-box'` still silently falls through to content-box.
Neither the explicit third-branch handling nor the narrowed option type landed.

### Status of PR #550 itself

`check` and `chromatic` pass; `Smoke tests` fails. `mergeable: UNKNOWN`.
FEL-406 is correctly scoped as a follow-up *to* #550, so #550 merging does not
resolve it.

---

## FEL-399 — [ci] TS2307 build-ordering flake

**Verdict: STILL OPEN, and it should be re-scoped from "intermittent flake" to "the typecheck gate has no build-ordering guarantee." Each occurrence so far has been patched individually; the underlying race is intact and demonstrably still firing.**

### How `typecheck` is actually orchestrated

- `.github/workflows/plan-a.yml:98` — the `check` job runs `bun run typecheck`
  **with no preceding `bun run build`**. Nothing before it builds workspace dists.
- root `package.json:27` — `"typecheck": "moon run :typecheck"`.
- `.moon/tasks/tasks.yml` — the single inherited definition:

  ```yaml
  typecheck:
    command: "bunx tsc --noEmit"
    deps:
      - "^:build"
  ```

  The comment there already names this exact hazard: *"without `^:build` Moon
  may parallelize typecheck against the upstream's still-running build and fail
  with TS2307."*
- There are **no TypeScript project references** anywhere — no `composite`,
  no `references` in `tsconfig.base.json` (which has no `paths` at all;
  every alias is per-package).
- No moon cache is restored in CI (only `Swatinem/rust-cache`), and `dist/` is
  gitignored (`.gitignore:12`) and not committed. So on every CI run every
  dist must be produced within that same `moon run :typecheck` invocation.

So ordering is guaranteed **only** along explicit moon project-graph edges.

### Two independent, hand-maintained invariants must both hold

For `X:typecheck` to be deterministic, for every `@aihu/*` specifier reachable
from X's tsconfig `include`, one of these must be true:

1. X's tsconfig `paths` aliases it to the dependency's **raw source**, or
2. X's moon `dependsOn` closure reaches the owning project, so `^:build`
   emits its `.d.ts` first.

Neither is enforced by anything. `bun run check:deps` (`scripts/dep-check.ts`)
is the browser-bundle dep-free thesis scan — it never looks at `moon.yml`
`dependsOn` or tsconfig `paths`. `grep -rl dependsOn scripts/ .github/` →
**no hits**. There is no guard.

And 27 of 45 moon projects have **zero** graph dependencies
(`moon query projects` → `adapter-cloudflare, adapter-vercel, agent, agent-a2a,
agent-acp, agent-server, agent-service, ai, app, auth, baselines, cli,
compiler, compiler-conformance, context, create-aihu, magna, mcp, plugin,
plugin-demo, router, runtime, scraping, signals, templates, tsc, vscode-aihu`),
so for all of those `^:build` expands to nothing and invariant (1) is the *only*
thing holding.

### The fix history is a per-instance patch trail, not a systemic fix

| When | Site | Patch |
|---|---|---|
| pre-FEL-399 | `packages/css-engine` | `dependsOn: ['compiler']` added; its `moon.yml:5-11` comment cites the identical "TS2307 Cannot find module '@aihu/compiler'" symptom |
| pre-FEL-399 | `packages/primitives` | `dependsOn: [signals, arbor, css-engine]`, `moon.yml:5-8` "same rationale as css-engine's compiler dep" |
| `c83a96fa` (#547) | `packages/server` | `dependsOn: [signals, agent, agent-service, plugin]` |
| `c83a96fa` (#547) | `packages/seo` | new `moon.yml` + missing `@aihu/signals` paths entry |
| `c83a96fa` (#547) | `packages/plugin-agent-readiness` | `dependsOn: [server, agent]` + missing `@aihu/signals` paths entry — found by the *same signature failing on `main` HEAD itself* mid-PR |
| `4ba918d0` (#549, `ad6921a0`) | `packages/app`, `examples/agent-driven-demo` | mapped the `@aihu/signals/lifecycle` subpath |
| **today, unpatched** | `packages/editor` | `@aihu/compiler` — see below |

Five distinct sites, five bespoke edits, zero changes to the mechanism.

`4ba918d0`'s own commit message is the cleanest statement of the systemic
problem: *"That made `check` a build-order RACE rather than a deterministic
gate: it passed only while moon served `signals:build` from cache."*

### Today's PR #553 failure is instance #6, and it is still live on `main`

`editor:typecheck | tests/component-compile.test.ts(16,31): error TS2307:
Cannot find module '@aihu/compiler'`.

Confirmed root cause, all four facts verified on `ad6921a0`:

- `packages/editor/tests/component-compile.test.ts:16` —
  `const mod = (await import('@aihu/compiler')) as { transform: TransformFn }`
  (col 31 = the specifier).
- `packages/editor/tsconfig.json` `include` is
  `["src/**/*.ts", "tests/**/*.ts", "e2e/**/*.ts"]` — the test file **is**
  typechecked; its `paths` are only `@aihu/editor` and `@aihu/signals`, so
  invariant (1) fails.
- `packages/editor/moon.yml` has `dependsOn: [signals]` only, and
  `moon task editor:typecheck` confirms the resolved graph:

  ```
  Target: editor:typecheck
  Depends on:
    - signals:build
  ```

  so invariant (2) fails.
- `@aihu/compiler`'s `types` is `./dist/index.d.ts`, and `packages/compiler/dist`
  is gitignored and uncommitted.

So `editor:typecheck` needs `packages/compiler/dist/index.d.ts` with **no edge
requiring it**. `compiler:build` does get scheduled in the same
`moon run :typecheck` (pulled in by `css-engine`'s edge), which is exactly why
it usually wins the race and why a re-run passes. That is the definition of
"merely usually-ordered."

`packages/editor/package.json` also does not declare `@aihu/compiler` as a
dependency at all, so no dependency-mirroring guard would have caught it either.

### Independent corroboration inside the codebase

`packages/compiler/js/index.ts:1252-1262` is a deliberate in-source workaround
for this exact race:

```ts
// The optional-peer module specifier, held in a VARIABLE so TypeScript never
// statically resolves `@aihu/css-engine`'s declarations at typecheck time.
// [...] under CI's frozen install + moon build ordering, css-engine's
// `dist`/`.d.ts` are not guaranteed to exist when `compiler:typecheck` runs.
// A literal `import('@aihu/css-engine')` makes the compiler emit TS2307 in
// that window [...]
const _CSS_ENGINE_SPECIFIER = '@aihu/css-engine'
```

A developer had to hide a module specifier from the type checker because the
build order could not be relied upon. That is the race stated as fact, in the
source tree, by someone who hit it.

### Sweep for remaining latent instances

Cross-referenced every moon project's tsconfig-`include`d `@aihu/*` imports
against its `paths` aliases and its transitive moon `dependsOn` closure.
After discarding matches inside comments and template literals
(`packages/cli/src/templates-agent.ts` emits app source as strings;
`packages/mcp/tests/mcp.test.ts:281`, `packages/language-server/tests/volar-integration.test.ts:103`
are fixtures; `server/src/ssr.ts`, `magna/src/plugin.ts`, `app/src/vite-plugin.ts`
hits are prose in JSDoc):

- **`editor` → `@aihu/compiler`** — real, unguarded, currently failing intermittently.
- **`compiler` → `@aihu/css-engine`** — real, but neutralized by the
  `_CSS_ENGINE_SPECIFIER` variable hack above.

No other live instance today. But "no other instance today" is a property of
the current import graph, not of the build system — the next test file that
imports a workspace package its project has no edge to reintroduces it, with no
CI signal until it flakes.

### Verdict

**The underlying race is NOT fixed. Only its symptoms have been, one site at a
time.** Declaration output is guaranteed before a dependent typechecks *only*
where someone has hand-added a `dependsOn` edge or a raw-source `paths` alias;
everywhere else it is scheduler luck. FEL-399 should stay open, re-scoped to
the systemic fix, with the `editor`/`@aihu/compiler` gap as the immediate
unblocking patch.

Ranked remedies:

1. **Cheap + immediate:** add `compiler` to `packages/editor/moon.yml`
   `dependsOn` (and/or a `@aihu/compiler` raw-source `paths` entry). Closes
   instance #6.
2. **Cheap + systemic (highest value/effort):** a `check:moon-graph` guard in
   the `check` job that, for each project, resolves every `@aihu/*` specifier
   in its tsconfig program and fails unless it is covered by a `paths` alias or
   a `dependsOn` closure. Converts "flakes in CI months later" into "fails in
   the PR that introduces it." The sweep above is essentially this script.
3. **Structural:** run `bun run build` before `bun run typecheck` in the
   `check` job. Eliminates the race outright at the cost of a full build in the
   check job — but makes the gate deterministic regardless of graph hygiene.
4. **Proper:** TypeScript project references (`composite` + `references`)
   mirroring the workspace graph, so `tsc` itself enforces ordering. Largest
   change; makes both hand-maintained invariants unnecessary.

---

## Recommended Linear states

- **FEL-395** — IN PROGRESS (PR #546). Do not close until #546 is rebased off
  `ad6921a0` and merged; consider filing the reference-identity /
  derived-list-churn caveat as a follow-up.
- **FEL-396** — IN PROGRESS (PR #546), **partial**. #546 says `closes FEL-396`;
  either re-scope FEL-396 to keyed-`each()` reorder or split a follow-up for
  non-arbor moves + Safari/jsdom fallback + DI re-resolution before the
  auto-close fires. Related: fellwork/aihu#544.
- **FEL-406** — STILL OPEN. All three findings live at #550 head `c9bc14ff`;
  no follow-up commits exist. Independent of #550 merging.
- **FEL-399** — STILL OPEN, re-scope from "intermittent flake" to "typecheck
  has no build-ordering guarantee." **The underlying race is not fixed — only
  its symptoms, six times over.** Immediate patch: `editor` → `compiler` edge.
