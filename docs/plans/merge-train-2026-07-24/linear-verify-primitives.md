# Linear verification — FEL-386 / FEL-397 / FEL-400

**Verifier pass, read-only.** Verified against `origin/main` = `ad6921a018ef4a479f6540278e549aa9a8cab387`
(local `HEAD` identical; working tree clean apart from this untracked report directory).

All three issues are in Linear state **Backlog** as of this pass. All line numbers below are
lines in the file *as it exists on `ad6921a0`*, not as cited in the (now-stale) issue bodies.

Merge facts confirmed via `gh`:

| PR | Title | Merged | Merge commit |
|---|---|---|---|
| #538 | fix(primitives): composed-tree traversal for shadow-boundary-correct focus | 2026-07-24 17:17 UTC | `6c4d9cbe` |
| #543 | fix(primitives): composed-tree low-severity correctness gaps | 2026-07-24 18:21 UTC | `aff5bf37` |
| #545 | fix(runtime): focus trap works in shadow contexts | 2026-07-24 18:21 UTC | `2ea4a8f4` |
| #537 | (GitHub issue) `<focusTrap>` compiler primitive leaks focus in shadow contexts | — | **still OPEN** |

Test evidence (executed on `ad6921a0`, `bunx vitest run`):
`packages/primitives/tests/composed-tree.test.ts` 25 passed ·
`packages/primitives/src/dialog/keyboard.test.ts` 9 passed ·
`packages/runtime/tests/a11y.test.ts` 15 passed / 2 skipped (pre-existing browser-only skips).

---

## FEL-386 — [primitives] Focus-trap shadow-DOM fix + expose

**Verdict: DONE (all three checklist items).**

| # | Checklist item | Verdict | Evidence | Quote / proof |
|---|---|---|---|---|
| 1 | Fix `createFocusTrap`'s shadow-boundary bug — it walks with `container.querySelectorAll<HTMLElement>(FOCUSABLE)`, which stops at shadow roots | **DONE** | `packages/primitives/src/dialog/focus-trap.ts:10,17-24,39,41,44` — landed in `6c4d9cbe` (#538) | The offending call is gone. The file now opens with `import { composedActiveElement, composedContains, queryTabbables } from '../composed-tree.ts'` and `focusables()` is `return queryTabbables(container, { includeElement: active })`. `querySelectorAll` no longer appears anywhere in the file. Boundary checks also switched from `container.contains(...)` to `composedContains(container, current)` (:41, :44), and `document.activeElement` to `composedActiveElement(...)` (:22, :39, :54). |
| 2 | Replace with a composed-tree tabbable walk (`TreeWalker`/shadow-root drilling) | **DONE** | `packages/primitives/src/composed-tree.ts:63-73` (`composedChildren`), `:124-129` (`walkComposedTree`), `:426-432` (`queryTabbables`) | The walk genuinely crosses the boundary rather than being renamed: `const shadow = node.shadowRoot; if (shadow !== null) return composedChildren(shadow)` (:66-67), plus slot resolution via `assignedElements({ flatten: true })` (:69). Behavior proven by `packages/primitives/tests/composed-tree.test.ts:315` "finds a tabbable button nested inside a shadow root that querySelectorAll cannot reach" and, at the dialog level, `packages/primitives/src/dialog/keyboard.test.ts:155` / `:175` ("Tab from the true last focusable (inside the nested shadow root) wraps to the true first, not past it" / "Shift+Tab from the true first focusable wraps INTO the nested shadow root"). |
| 3 | Expose `useFocusTrap`/`createFocusTrap` publicly from `@aihu/primitives` | **DONE (was already satisfied before the issue was filed)** | `packages/primitives/src/index.ts:48,52`; `packages/primitives/src/dialog/index.ts:262`; `packages/primitives/package.json` `"."` → `./dist/index.js`, `"./dialog"` → `./dist/dialog.js` | `export { … createFocusTrap, … type FocusTrap, } from './dialog/index.ts'` (index.ts:48/52) and `export { createFocusTrap, type FocusTrap } from './focus-trap.ts'` (dialog/index.ts:262). `git blame` dates **both** export lines to `af3e153f` (2026-05-24), i.e. the original dialog landing — the symbol has been public the whole time; the issue's "expose" premise was mistaken, not unfinished. |

### Skeptical notes (do not block closing)

- There is **no symbol named `useFocusTrap`** anywhere in source on `origin/main` —
  `git grep useFocusTrap origin/main` returns only `docs/plans/*.md` hits. This is
  intentional, not a gap: the source plan states the equivalents "already exist as
  `create*`/`Aihu*Root` primitives (`focus-trap`, `roving-focus`, `form-control`)"
  (`docs/plans/2026-07-24-use-categorical-parity.md:303-306`), and ruling B's own wording is
  "fix with a composed-tree tabbable walk …, then expose **it**"
  (same file, :55-58) — "it" being `createFocusTrap`. No `use*` alias is owed.
- The shared substrate `composed-tree.ts` is deliberately **not** re-exported from
  `index.ts` (`composed-tree.ts:35-38`: "Kept internal for now (not re-exported from
  `index.ts`)"). That is a documented choice, and FEL-386's trailing paragraph only asks that
  the substrate be *shared with / consistent with* future `use*` work — which it is, being the
  single module the fix is built on. Not a checklist item.

---

## FEL-397 — [runtime] Second focus-trap implementation in a11y.ts is broken in shadow contexts

**Verdict: PARTIAL.** The exact defect the issue describes is fixed. Two things the issue also
put on the table are not: the duplicate implementation still exists (remedy (b) declined), and
the residual light-DOM-only enumeration the fix explicitly punted has **no tracker anywhere**.

| # | Item | Verdict | Evidence | Quote / proof |
|---|---|---|---|---|
| 1 | Container located via `document.querySelector('[data-aihu-focustrap="<id>"]')` (cited at old line 106) — never descends into shadow roots, trap container never found, trapping does not happen at all | **DONE** | `packages/runtime/src/a11y.ts:162`, helper at `:103-117` — landed in `2ea4a8f4` (#545) | Replaced by `const host = _deepQuerySelector<HTMLElement>(document, \`[data-aihu-focustrap="${id}"]\`)`. `_deepQuerySelector` really recurses: `for (const el of Array.from(root.querySelectorAll('*'))) { const shadow = (el as HTMLElement).shadowRoot; if (shadow) { const found = _deepQuerySelector<T>(shadow, selector); … } }` (:109-115). Diff confirms the removed line was exactly `-    const host = document.querySelector<HTMLElement>(...)`. Proven by `packages/runtime/tests/a11y.test.ts:220` "finds the trap container and wires Tab-cycling when rendered inside a shadow root", which asserts the premise (`expect(document.querySelector('[data-aihu-focustrap]')).toBeNull()`) and then `expect(ev.defaultPrevented).toBe(true); expect(shadow.activeElement).toBe(m)`. |
| 2 | (Same defect class) current-focus read via `document.activeElement` stops at the outermost shadow host | **DONE** | `packages/runtime/src/a11y.ts:129-138` (`_deepActiveElement`), used at `:174`, `:190` | `while (active !== null && active.shadowRoot !== null) { const inner = active.shadowRoot.activeElement; … }` — same recursive drill as primitives' `composedActiveElement`. |
| 3 | (Found and fixed in the same PR, beyond the issue text) Shift+Tab containment check was `host.contains(t)`, shadow-blind | **DONE** | `packages/runtime/src/a11y.ts:204` | `if (t === first || !e.composedPath().includes(host))`. Regression test `packages/runtime/tests/a11y.test.ts:270` asserts `expect(ev.defaultPrevented).toBe(false)` when focus legitimately sits in a nested shadow leaf. |
| 4 | Remedy option (b): delete the duplicate, have runtime delegate to `@aihu/primitives`' `createFocusTrap` — eliminating two divergent implementations | **NOT DONE (deliberately declined)** | `packages/runtime/src/a11y.ts:79-80, 84-102, 147-221`; `packages/runtime/package.json` has no `@aihu/primitives` dep | The second implementation is fully intact, with its own private selector list `const _Q = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"]),…'` (:79-80), and the file documents the choice: "a deliberately minimal, single-selector inline kept local to `@aihu/runtime` rather than a `@aihu/primitives` dependency: the a11y primitives here are budgeted at ~800 B total … on top of `@aihu/runtime`'s whole-package 4500 B size-limit gate" (:93-101). Option (a) was taken instead — and via a `_deepQuerySelector` scan, not the `getRootNode()`+`ShadowRoot.host` hop the issue suggested. Divergent-implementation risk is unchanged. |
| 5 | Focusable **enumeration** inside the trap is shadow-correct | **NOT DONE** | `packages/runtime/src/a11y.ts:167` and `:174` | Still light-DOM-only: `const focusables = (): HTMLElement[] => Array.from(host.querySelectorAll<HTMLElement>(_Q))` (:167), and `const init = initialFocus ? host.querySelector<HTMLElement>(initialFocus) : focusables()[0]` (:174). The file admits it at :199-202: "`focusables()` above is still light-DOM-only — see the follow-up filed for full shadow-aware enumeration — so this fixes the wrongful-yank direction; it does not yet make `first`/`last` resolve to a focusable living inside a nested shadow root." Consequence: forward Tab can still walk past a focusable nested in a shadow leaf. |
| 6 | Tracker hygiene — the deferred work is actually tracked | **NOT DONE** | `gh issue view 537` → `OPEN`; `gh pr view 545 --json closingIssuesReferences` → `[]`; Linear search for `focusables` → 0 results, Linear `title contains "focus"` → only FEL-397/386/352 | Two dangling references. (i) `a11y.ts:200` says "see the follow-up filed" — **no such follow-up exists** in either GitHub or Linear. (ii) PR #545's body and commit trailer both say "Closes FEL-397, fellwork/aihu#537", but GitHub recorded no closing reference and **#537 is still open**. |

### Additional finding (not in the issue, not regressed by #545)

`packages/runtime/src/a11y.ts:208` — the forward-Tab branch is asymmetric with the Shift+Tab
branch: `} else if (t === last) {`. It has no escape-containment check at all, so unlike
Shift+Tab (:204), forward Tab never pulls focus back when it has genuinely left the host.
Pre-existing since `4c9df735`; worth folding into whatever ticket covers item 5.

---

## FEL-400 — [primitives] composed-tree: low-severity correctness gaps from PR #538 review

**Verdict: DONE (all three gaps, each with the requested regression test).**
All three fixes landed in `aff5bf37` (#543), confirmed by `git blame` on each site.

| # | Named gap | Verdict | Evidence | Quote / proof |
|---|---|---|---|---|
| 1 | **Positive tabindex ordering ignored** — `queryTabbables()` returns plain composed-DFS order; platform visits `tabindex > 0` first, scoped per shadow root; "no reordering logic exists in the file today" | **DONE** | `packages/primitives/src/composed-tree.ts:330-335` (`getPositiveTabindex`), `:337-350` (`ScopeMember`), `:381-413` (`orderScope`), `:426-432` (`queryTabbables`) — all blamed to `aff5bf37` | Reordering logic now exists and is scoped per shadow root: a new scope is opened at every open shadow root — `members.push({ el: child, index: index++, nested: orderScope(child.shadowRoot) })` (:392) — then within each scope `const positive = members.filter((m) => getPositiveTabindex(m.el) !== null); positive.sort(…ascending, ties by tree index…)` (:401-405) and emitted `for (const m of [...positive, ...natural]) { out.push(m.el, ...m.nested) }` (:409-411). `queryTabbables` now iterates `orderScope(container)` instead of `walkComposedTree`. The implementation goes beyond the filed item: a nested scope travels *with* its host rather than staying pinned at its document position (:352-379). **Tests:** `tests/composed-tree.test.ts:370` ("visits positive-tabindex elements first (ascending, ties by doc order), scoped PER SHADOW ROOT — not globally"), `:407`, `:437`. |
| 2 | **`contenteditable=""` not matched** — `FOCUSABLE_SELECTOR` used only `[contenteditable="true"]` | **DONE** | `packages/primitives/src/composed-tree.ts:256-260` — blamed to `aff5bf37` | Selector is now `'[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], '` (:260), with the spec rationale inline at :256-259. `plaintext-only` was fixed too, beyond the filed item. **Test:** `tests/composed-tree.test.ts:355` "matches contenteditable=\"\" and contenteditable=\"plaintext-only\", not just contenteditable=\"true\"". |
| 3 | **Unslotted light children mis-reported** — invisible to the downward walk yet `composedContains()` still reports them contained | **DONE** | `packages/primitives/src/composed-tree.ts:101-114` — blamed to `aff5bf37` | Resolved in favor of the downward walk: `if (isElement(parent) && parent.shadowRoot !== null) return null` (:114), i.e. an unslotted light child now has no composed parent either. Rationale recorded at :105-113 ("The alternative … would make `composedContains` report `true` for elements that `queryTabbables`/`composedQuerySelectorAll`/etc. can never reach"). Because `composedClosest`, `composedContains`, `composedCompareOrder` and `isInertOrAncestorInert` all route through `composedParent`, the fix is consistent across every up-walk consumer. **Test:** `tests/composed-tree.test.ts:167` "an UNSLOTTED light-DOM child of a shadow host is NOT reported as contained (agrees with the downward walk)". |

The issue's request that "each wants a regression test alongside the fix, following the
conventions established in `packages/primitives/tests/composed-tree.test.ts`" is satisfied —
that file grew from 333 to 461 lines in `aff5bf37`, and all 25 tests pass on `ad6921a0`.

---

## Recommended Linear states

- **FEL-386 → DONE.** Both halves verified: composed-tree traversal replaces the
  `querySelectorAll` walk (`6c4d9cbe`), and `createFocusTrap`/`FocusTrap` are publicly
  exported (`af3e153f`, pre-existing — the "expose" item was a mistaken premise).
- **FEL-397 → PARTIAL.** The filed defect (container unfindable, trap never wired) is fixed by
  `2ea4a8f4`. Remaining: `a11y.ts:167`/`:174` still enumerate focusables via light-DOM-only
  `host.querySelectorAll`/`host.querySelector`, so forward Tab can escape past a focusable in a
  nested shadow leaf; the duplicate implementation was kept (option (b) declined on size
  budget); the "follow-up filed" referenced at `a11y.ts:200` does not exist in GitHub or
  Linear; and GH #537 is still OPEN despite #545's "Closes" trailer.
- **FEL-400 → DONE.** All three named gaps fixed in `aff5bf37`, each with a named regression
  test in `tests/composed-tree.test.ts` (:370/:407/:437, :355, :167), all green on `ad6921a0`.
