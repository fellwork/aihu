# A SECOND INSTRUMENT BEATS A SECOND REVIEWER

**Topic:** verification methodology, multi-agent review
**Session:** 2026-07-25 (proposed 20:21:46 EDT, granted 20:26:39, demonstrated 20:44)
**Category:** measurement-integrity, review-process
**Severity:** high — this is the *positive* lesson of the session, and the one most
likely to be lost, because it is a practice rather than a bug
**Status:** demonstrated once, adopted in principle, not yet a standing protocol

## The claim

> **A second measurement path, built by someone who did not write the first, is
> worth more than another pair of eyes on the diff.**

Both senior agents arrived at this independently within five minutes, from opposite
directions, and one of them was proven right *by being caught with it*.

## Why the session concluded this

The day's own thesis, stated three times:

> *"**A test that cannot fail is the through-line of this entire day.**"*
> — 12:30:15

> *"a bench that measured a literal no-op for two months, a test that could not
> fail, a guard that passed on the wrong set, and a README publishing a fabricated
> number **as data**. **Every one of those survived review by someone looking at the
> diff.**"*
> — 20:26:39

That last clause is the whole argument. Every defect in
`absent-value-rendered-as-real.md` and `checked-thing-is-not-the-changed-thing.md`
was **reviewable**. The code was clear. The logic was right. A reviewer reading the
diff would approve it, correctly, because the diff was fine — the *subject* or the
*liveness* was wrong, and neither is visible in a diff.

A reviewer checks whether the code says what the author meant.
**An instrument checks whether reality agrees.**

## The demonstration — FEL-415, three instruments, three authors, one number

The keyed-swap DOM-move count was verified by three independent measurement paths:

| instrument | author | tree | result |
|---|---|---|---|
| blind harness, own `Node.prototype` patch | docs-next | pre-fix | **1994 moves** |
| original instrumentation | team-lead | pre-fix | **1994 moves** |
| third harness, merge order verified | team-lead | post-fix | **4 moves** |

> *"this is the strongest single artifact anyone has produced on FEL-415 today.
> **Three instruments, three authors, one number.**"* — 20:43:32

Landed as **#589** (`c85dfab7`, *"test(arbor): independent DOM-mutation guard for a
keyed swap"*). The blind arm is the point: its author did not read the other
harness before building it.

## The proof that it works — it caught its own proposer

The agent who proposed the method committed a clean instance of the very pattern he
had spent the day naming in other people's systems, and the *second instrument*
caught it — not a code review:

> *"**I spent the day naming this pattern in other people's systems and then
> committed a clean instance of it.**"* — 20:44:01

> *"Your catch was better than a review of my diff. **You did not read my code — you
> measured the same thing on a tree whose ancestry you had verified with
> `merge-base --is-ancestor` rather than assumed.** That is the whole argument for
> the second-instrument approach, demonstrated on me."* — 20:44:01

And the score, recorded by the agent who lost it:

> *"That is now two corrections in this thread going the other direction — you
> caught my tree, I caught nothing of yours, and you volunteered the error in your
> own reasoning anyway. Noting it because it is the reason the three-instrument
> result is trustworthy: **neither of us defended a position once it stopped
> matching a measurement.**"* — 20:44:55

## Recipe

When a number, a gate, or a claim is load-bearing:

1. **Build a second path, do not review the first.** Different author, different
   mechanism, ideally blind to the first implementation.
2. **Verify the tree's ancestry, do not assume it.**
   `git merge-base --is-ancestor <base> <head>` — the catch above turned on exactly
   this. See `checked-thing-is-not-the-changed-thing.md` for what happens otherwise.
3. **Measure pre-fix AND post-fix.** An instrument that has only ever seen the fixed
   state cannot distinguish "fixed" from "not measuring."
4. **Agreement across instruments is the evidence.** One instrument reporting a
   plausible number is not a result; it is an input.
5. **Drop the position when the measurement stops matching it.** Both agents did,
   repeatedly, including on their own work. This is the part that cannot be
   automated and the part that made the rest work.

## The corollary, learned the hard way: two instruments of the *same kind* can both be wrong

The FEL-415 case above worked because the two instruments were **mechanically
different** — a blind harness and the original instrumentation. That is the
load-bearing property, not the count.

On 2026-07-26 two agents applied "second instrument" to `plan-a.yml`'s
`changes.code` filter and **still got opposite answers**, because both
instruments were the same kind: *a careful human-style reading of the YAML*.

| | instrument | conclusion |
|---|---|---|
| verifier | read the filter + `filter.ts:106-115` | the sample gate runs *only because* the filter is broken |
| historian | read the filter | `check` is *skipped* on doc-only PRs |

Both confident, both reasoned, **one wrong**. What settled it was an instrument
of a *different kind* — three real CI runs on single-`docs/`-file PRs (#617,
#607, #598), all showing `check: success` — plus executing the matcher directly
under picomatch.

> **Two readings are not two instruments. A reading and a measurement are.**

Practical form: when the disagreement is about what a config *does*, stop
producing more readings. Run it, or go read what it already did — CI history is
free, and it is evidence rather than interpretation.

*"Neither of us should have trusted the file."*

## The mutation matrix — how to find a test that cannot fail

*"A test that cannot fail is the through-line of this entire day."* That names the
problem. This is the method that finds one.

**The problem is self-concealing.** A test that passes before *and* after a fix is
**invisible to a green run by construction**. No amount of reading the suite finds
it reliably, and spot-checking cannot, because you would have to already suspect
the specific test. Builder asked directly — *"please confirm I did not leave a
second one like it"* — and the honest answer required a systematic instrument.

**The method:** break the fixed code in N independent ways. Record, per mutation,
**which tests go red**. Then **invert it**:

> For each **test**, look across **every** mutation and ask: *did this test ever
> go red?*

Read it that way and not the other way. The table below is laid out
mutation-per-line because that is how you *collect* the data — but scanning it in
that direction only tells you which mutations were effective, which is not the
question. **The defect you are hunting is a test that is green everywhere, and it
is only visible by following one test across all runs.** Lay the table out the
other way round and the method silently does nothing — which would be a
particularly fitting bug for this file.

```
MUTATION                                   TESTS RED
M1  reintroduce html={} in the component    1, 28
M2  remove decode-before-validate           13
M3  remove item loader trust boundary       25
M4  bypass safeHref entirely                3,4,5,6,7,12,21,28
M5  stop decoding entities in text          14,15
M7  reject EVERY href — over-reject         8,9,10,11,13,22,28
M8  marks[0] instead of marks[last]         23
M9  disable tag recognition entirely        2,3,8,9,10,11,13,16,22,23,25,26,28
M10 remove user loader boundary             26
--  CI=1 with no compiler binary            27
```

**Any test red under no mutation is either testing nothing, or testing something
no mutation touched — and you must say which.** Here, 23 of 28 were falsifiable.
Four were not:

> Tests 17–20 assert that malformed markup *"degrades to text"* — and stayed green
> under **all ten**, including **M9, which disables tag parsing completely**. That
> is the tell: the assertion is equally true when **nothing is parsed at all**, so
> it cannot distinguish a working parser from an absent one.

Note the verdict was *weak*, not *lying* — a distinction worth keeping. The
remedy is to assert the **parsed structure** (block/span kinds), which M9 would
then catch, rather than that the payload merely appears as text.

### Two techniques that make the matrix sharper

**1. Opposing mutations.** Mutate in *both* directions: break the thing, then
over-apply it. `M4` (bypass `safeHref` entirely) and `M7` (reject *every* href)
are a pair, and `M7` is what proves rejection is **not indiscriminate** — it
reddens the four tests asserting that `http(s)`, `mailto:` and same-origin links
are *kept*. A suite that only ever tests "the bad thing is blocked" passes
happily when everything is blocked.

**2. Assert that the mutation actually applied.** The near-miss, recorded by the
verifier against their own instrument:

> The first `M9` used a `perl` substitution that **silently did not match**. The
> file was unchanged, the run reported **0 red**, and that was one keystroke from
> being written down as *"these tests are unfalsifiable."* Caught only by printing
> the mutated line and seeing it identical. Redone with an asserted anchor
> (`assert old in s`).

**An absent mutation rendered as a passing result** — the repo's core pattern,
aimed at the instrument built to hunt that exact pattern, mid-hunt. **If your
mutation harness cannot prove it changed the file, its zeroes mean nothing.**

That is advice. Here is the practice — one line, before every replace:

```python
assert old in s          # the mutation must have something to bite on
s = s.replace(old, new)
```

A `sed`/`perl`/`replace()` that matches nothing exits successfully and changes
nothing. Without the assert, "0 tests red" is indistinguishable from "the
mutation never happened," and the two readings point in opposite directions.

## When a reviewer *is* the right tool

This lesson is not "stop reviewing." Diff review catches intent bugs, API misuse,
naming, and missing cases. It is specifically **useless against a wrong subject or a
dead binding**, which is what this repo keeps producing. Use both; do not substitute
review for instrumentation on anything you intend to publish as a number.

## Related

- `absent-value-rendered-as-real.md` — the defect class this method is for
- `checked-thing-is-not-the-changed-thing.md` — why ancestry verification is step 2
- `docs/state/verifier.md` — the verifier role runs this method by default
  (*"run the gate, do not read it"*; *"mutation-test in both directions"*)
- #589 (`c85dfab7`) — the artifact
- #610 (`3059eaa1`) — the R0 DOM-liveness gate, the mechanised descendant
