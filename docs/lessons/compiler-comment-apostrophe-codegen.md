# TWO APOSTROPHES IN ADJACENT COMMENTS BREAK CODEGEN — a new compiler trap

**Topic:** compiler (comment / string-aware splitter, codegen)
**Session:** named 2026-07-27 (retro C-FEL-RETRO-0727, incident 6)
**Category:** compiler
**Severity:** medium — breaks codegen for an innocuous source shape; **root cause
OPEN**, banked here so the next person who hits it does not re-derive it from zero.

## The trigger

Two apostrophes in **adjacent line comments**, where the **second is parenthesised**,
make the compiler emit a **stray comma-paren** and break codegen. Found while
building the swarm console — ordinary English contractions in comments, not exotic
input. The reported minimal shape:

```js
// it's fine
// (it's broken)
```

Two consecutive `//` comments, each containing an apostrophe; the second wrapped in
parentheses. Remove either apostrophe, or the parentheses around the second, and
codegen is clean again.

## The suspected mechanism

aihu's expression handling uses a **comment-and-string-aware splitter** so that
commas/brackets **inside** strings, template literals, comments, and regex do not
count as structural. That machinery is in
`packages/compiler/src/parser/directives.rs:633-759` — its own doc comments say it
splits *"outside strings, template literals, comments, regex, and all bracket"*
nesting (`:633`) and that a delimiter *"inside a string, template literal, comment,
or regex never splits"* (`:742`, `:759`).

The failure is consistent with that splitter treating an apostrophe **inside a `//`
comment** as an **open string quote**: the first `'` opens a pretend string that the
newline does not close, the second (parenthesised) `'` interacts with bracket-depth
tracking, and the mismatch surfaces downstream as a stray `,)` in the emitted code.
**This is a hypothesis from reading the splitter, not a proven line.** The bug has
**not been root-caused to a single statement**, and it was **not independently
re-reproduced during this retro** — doing so needs a compiler built from source
(`AIHU_COMPILE_BIN`; testing the published addon would be the trap named in
`css-engine-ci-binary-build.md`).

## The promotion rung: prose (documented), fix OPEN

This lands on **prose** only — it is now written down with a repro and a suspected
site. That is the honest current state, and naming it as *only* prose is the point:
the fix has not landed, so nothing stops it recurring.

**Promotion path:**
1. **Reproduce from a source-built compiler** and bisect the two-apostrophe shape to
   the exact character-class branch in `directives.rs` that mis-classifies `'`
   inside a `//` comment.
2. **Add a regression test** that compiles the minimal shape above and asserts the
   emitted code contains no stray `,)` — asserting the *structure*, not merely that
   compilation exits 0 (a codegen bug can emit broken code and still exit 0; see the
   mutation lesson in `checked-thing-is-not-the-changed-thing.md`).
3. Fix the classifier so a `'` inside a `//` comment never opens a string.

## Recipe

- **Comment-aware splitters must treat comment interiors as fully opaque** — no quote,
  bracket, or comma inside a comment can affect structural state. An apostrophe in a
  comment is the canonical adversarial input; test it explicitly.
- **A "compiles without error" check does not cover codegen.** Assert the emitted
  output's shape, or a codegen bug rides a green exit code.

## Related

- `promotion-rungs.md` — incident 6 in the retro audit table (prose, fix OPEN)
- `checked-thing-is-not-the-changed-thing.md` — "compiles clean" is not "emits correct code"
- `css-engine-ci-binary-build.md` — reproduce against a source-built compiler, not the published addon
