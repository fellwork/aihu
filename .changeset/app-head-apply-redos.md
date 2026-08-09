---
'@aihu/app': patch
---

Fix two `js/polynomial-redos` (CWE-1333) alerts in `applyHeadToHtml`
(`packages/app/src/head-apply.ts`), surfaced by a fresh CodeQL pass during a
full-diff release review. `applyHeadToHtml` runs at build/prerender time
against the build's own `index.html` template — attacker-reachable the same
way `.aihu` source is elsewhere in this repo's threat model (an untrusted PR
can commit its own template), and per this file's own "build-time only" note,
a slow build IS the DoS here, not a runtime one.

**`<title>` matching** — `/<title[^>]*>[\s\S]*?<\/title>/i` re-ran its lazy
`</title>` scan from EVERY `<title` occurrence in the string when none of
them actually closed. Split into two independent linear scans: find the
first `<title...>` (an `exec` without the `g` flag stops at the first match;
it does not retry-and-rescan per occurrence the way the combined pattern's
backtracking did), then search once for `</title>` in the remainder.

**Canonical `<link>` matching** — `/<link\s+[^>]*rel="canonical"[^>]*>/i` had
two separate defects, both measured directly. The `\s+[^>]*` boundary let a
long whitespace run split ambiguously between the two adjacent quantifiers.
Worse, and the one that mattered: a string containing many repetitions of the
literal prefix `<link rel="canonical"` with no closing `>` anywhere took the
original regex ~2.4s to fail at 1,000 repetitions and ~22.9s at 2,000 — worse
than quadratic. A first attempt at a fix (enumerating `<link ...>` tags via
`/<link\b[^>]*>/gi` and checking each with a plain substring search) closed
the worst failure mode but was still measurably O(n²) on the same adversarial
shape, because the regex's own unbounded `[^>]*` re-scans the remaining
string from every `<link` position before concluding there's no `>`. Replaced
with a manual `indexOf`-based scan instead: no regex for the tag boundary at
all, `searchFrom` only ever advances, and if a tag's own `>` is never found
the function returns immediately rather than retrying at the next `<link` —
confirmed via direct timing to stay under 1.1ms at 100,000 repetitions of the
adversarial prefix (was multiple seconds, unmeasurable, at 2,000).

Both preserve exact prior matching behavior, including quirks: case-
insensitivity on tag names and the `rel="canonical"` literal, and — verified
this is what the ORIGINAL regex also did, not a new gap — matching on the raw
literal substring `rel="canonical"` anywhere within a `<link ...>` tag's text
rather than parsing real attribute boundaries. Regression suite in the new
`head-apply-redos.test.ts` (14 tests): behavior-preservation cases for both
matchers plus adversarial-timing proofs, mutation-tested against the original
patterns (reintroducing either one reproduces the original blowup — the
title case measurably, the link case by hanging past a 30s hard kill).
