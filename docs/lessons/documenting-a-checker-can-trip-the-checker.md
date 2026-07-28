# DOCUMENTING A CHECKER IN PROSE CAN ITSELF TRIP THE CHECKER

**Topic:** static gates whose input is prose (grep/regex-based), `lesson-refs`
**Session:** named 2026-07-27/28, promoted from the historian's state file at the
orchestrator's request after it recurred three times in one session
**Category:** measurement-integrity, ops
**Severity:** medium — self-inflicted CI red, always caught by the gate (never a
silent pass), but it reddens the very artifact that documents the gate, and the
author is the person who best understands the rule.

## The shape

A checker that scans **prose** for a pattern cannot tell a *use* of the pattern from
a *mention* of it. So the moment you DOCUMENT the checker — spell out the pattern it
looks for, or name a target it resolves — your documentation becomes input the
checker matches. **The description of the rule is parsed as an instance of the rule.**

> Any checker whose input is natural-language text is vulnerable to its own
> description. Writing "it matches `X`" can make it match `X`.

## The checker here

`scripts/check-lesson-refs.sh` fails if a citation under `docs/` points at a
`docs/lessons/<name>.md` that is not reachable in the tree. It recognises two
citation forms by regex: an absolute `docs/lessons/`-prefixed path, and a relative
markdown link `](<name>.md)`. It deliberately does **not** match a filename written
in plain backticks — which is what makes the two failures below avoidable.

## Three instances, one session, all the historian's own

1. **The documentation-emits-a-citation instance.** A state-file bullet EXPLAINED the
   gate by spelling its two patterns out with example filenames. The examples were
   themselves valid citation syntax, so the gate resolved them as real citations and
   failed on a path that exists nowhere. `check-lesson-refs` exit 1 → the dangling
   "example" → reworded to name the forms without illustrating them → exit 0. *The
   documentation of the gate tripped the gate.*
2 & 3. **The cross-branch dangling-path instance (twice).** A state bullet cited a
   lesson by its full `docs/lessons/<name>.md` path — but that lesson lived on a
   DIFFERENT branch (a PR not yet merged), so the path resolved to nothing in this
   branch's tree. A full-path citation asserts *"reachable here, now"*; a lesson on
   another branch is not. Reworded to a bare-backtick filename (not a matched form),
   which records the relationship without asserting present reachability → exit 0.

The through-line: in every case the fix was to **name the thing without writing it in
the checker's matched form** — describe the pattern, don't exhibit it; reference a
not-yet-landed file by bare name, not by resolvable path.

## The rung

- **prose (today, and it failed three times):** "when you document a grep-based gate,
  don't write its pattern or a dangling target in the matched form." It depends on the
  author remembering the exact regex while writing prose about it — and the author who
  knows the regex best is exactly the one who tripped it, repeatedly.
- **structural (the promotion this recurrence argues for):** the gate should not treat
  a pattern that appears inside a **fenced code block, an indented example, or plain
  inline backticks** as a live citation — a *mention* is not a *use*. Equivalently, a
  citation-checker for docs should exempt its own documentation by context, the same
  way a linter ignores a rule name inside a string literal. Until it does, every doc
  that explains the gate is a latent red.

A rung that fails three times in one session is evidence for the next rung up, not for
saying it louder a fourth time.

## Why it generalises past this repo

This is not about lesson files. It is about **any gate whose corpus is prose**: a
secret-scanner that flags its own README's example token; a profanity filter tripped by
its own policy doc; a link-checker that follows the example URL in its own manual. The
defense is uniform — a checker over prose must distinguish mention from use, and until
it does, its own documentation is inside its blast radius.

## Related

- `absent-value-rendered-as-real.md` — `check-lesson-refs` exists because a "committed" citation rendered as an "on-main" one; this is that gate biting its own documentation
- `a-contract-is-an-unverified-claim.md` — a header/comment asserting a behaviour the code contradicts; the mention-vs-use confusion is the same family pointed at prose
- `gate-fix-armed-a-sibling-false-red.md` — the other gate lesson from this wake; both are "the rule and its description disagree"
