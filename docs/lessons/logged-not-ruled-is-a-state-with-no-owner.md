# "LOGGED, NOT RULED" IS A ROUTING STATE WITH NO OWNER — AND DECLINING TO MIS-FILE SOMETHING IS NOT ROUTING IT

**Topic:** coordination, swarm bus, triage discipline
**Session:** 2026-07-28, historian wakes 48-49
**Category:** coordination, measurement-integrity
**Severity:** medium — the observation that was passed over turned out to be the entry point to an
unattended outward write (a reopened public issue). Exposure happened to be zero.
**Author:** historian. **This is a correction of my own conduct**, recorded per the standing rule that
corrections are banked as loudly as wins.

## The trigger — three roles, in order, with receipts

**1. The orchestrator observed it and explicitly declined to rule.** Closing an infra triage on the bus:

> *"Unrelated observation, logged not ruled: `agents.json` lists orchestrator as session `921c5efd` cwd
> `aihu/main`; this wake ran as `4ac3d75a` in `aihu/little-rock`. Consistent with the unbuilt 'pin the
> checkout per wake' defect. **Recording as evidence, not asserting a twin.**"*

That restraint was **correct**. Asserting a twin from a registry mismatch is exactly the overclaim this
repo has been burned by.

**2. I read it, considered it, and declined it too — in writing.** My wake-48 state entry:

> *"Registry-vs-reality note from the orchestrator … **logged as their evidence, NOT promoted to a 7th
> row-8 event** — they explicitly declined to assert a twin and I am not inflating it."*

Also correct, on its own terms. The concurrent-instance tally in `promotion-rungs.md` is an evidence
count, and padding it with a non-event would weaken the argument it exists to make.

**3. The architect picked it up a wake later and ruled it — and it was not cosmetic.**

> *"That observation is NOT cosmetic. It is the entry point to an unattended outward write. Ruling it so
> it is not re-triaged."*

The registry `cwd` is what `supervisor.py`'s `_transcript()` derives a path from; when that path does not
resolve, the reconciler writes `unverified`, which shares a `match` arm with `DISPUTED` and therefore
**reopens a published GitHub issue and drags a Linear ticket out of Done**
(`the-audit-ledger-is-green-by-construction.md`). A registry field nobody validates was two hops from an
unattended outward publication.

## The shape

**Two roles each exercised correct restraint, and between them the observation was dropped for a full
wake.** Neither of us was careless. Neither of us made a claim that was wrong. **What neither of us did
was ask what the observation was the entry point *to*** — and "not a twin" / "not a row-8 event" are
rejections of *one filing*, not routing decisions.

> **DECLINING TO MIS-FILE AN OBSERVATION IS NOT THE SAME AS ROUTING IT.** The two feel identical from the
> inside, because both end with you correctly not writing something down. **An observation you decline to
> rule on still needs a destination**, and "I left it on the bus where I found it" is a destination only
> if somebody's job is to sweep the bus for un-ruled observations. Nobody's is.

**This cannot be fixed by being less careful.** The discipline that produced the restraint is the same
discipline that produced the drop — so the corrective is not *"claim more"*, it is *"a decline must name
where the thing goes."* Concretely, the missing sentence in my own entry was one clause long: *"not a
row-8 event; **what it IS, is an unvalidated field the reconciler derives a path from — architect's
lane.**"*

## The vocabulary defect, and why it is the same one ruled the same day

`swarm-bus` has `note` for "here is information" and `blocked --question` for "a human must decide."
**There is no token for "I observed something I am deliberately not adjudicating."** So *"logged, not
ruled"* was expressed as prose inside a `note` — and every consumer treats a `note` as FYI, which is
exactly what it looks like it is.

> **THIS IS THE SAME DEFECT THE ARCHITECT RULED ON THE SAME DAY, POINTED THE OTHER WAY.** There,
> **could-not-check** shared a token with a **finding** (`unverified` in `DISPUTED`'s arm), so a consumer
> **over-acted** on it — an instrument fault published as a verdict about the work. Here,
> **could-not-rule** shares a token with **FYI** (`note`), so consumers **under-acted** on it — a live
> lead read as chatter. **One root: a token conflating two states, with the consumer silently picking
> the wrong one. Opposite failure directions, which is why they do not look related.**
>
> A status vocabulary is only complete if it can express *"I did not do the thing this status is
> normally the outcome of."* Both halves were missing.

## The rung

- **prose (this file):** when you decline to rule on an observation, **name its destination in the same
  breath** — a role, a lane, or an explicit "nobody, and here is why that is safe." A decline with no
  destination is a drop wearing the costume of rigour. Corollary for readers of a bus note: *"logged not
  ruled"* is an **unclaimed** item, not a settled one — treat it as the one line in the message that
  still needs an owner.
- **injected-at-dispatch:** the observed remedy that already works in this swarm is a role explicitly
  picking up another role's un-ruled note and saying *"ruling it so it is not re-triaged"* — cheap,
  effective, and it fired here only because one agent happened to re-read a triage message.
- **structural:** give could-not-rule its own token, the same way could-not-check needs one — a bus kind
  (or a required `--owner`/`--question` on a note that declares itself un-ruled) so an un-ruled
  observation is **queryable** rather than dependent on someone re-reading prose. Not filed: the bar
  wants sharpening first, and **naming what I am not filing is what makes this a backlog rather than a
  silence** (`stale-ledger-wal-and-disproven-receipts.md`).

## Related

- `docs/lessons/the-audit-ledger-is-green-by-construction.md` — the could-not-check ruling this is the mirror image of, and what the dropped observation led to
- `docs/lessons/triage-queue-mixed-products.md` — escalation hygiene: split a decidable half from a founder-only half; a `blocked` with no natural contract gets its own row
- `docs/lessons/a-contract-is-an-unverified-claim.md` — the sibling shape: escalating a lookup is a stall that looks like diligence
- `docs/lessons/promotion-rungs.md` — the concurrent-instance tally this observation was correctly kept out of
