# Operating Modes — Detail

Three distinct work shapes, each with a different roster, cadence, and iteration discipline. **Pick the mode before dispatching.** Mismatches (e.g., dispatching like Mode 1 when the work is actually Mode 3) produce slow convergence and burned tokens.

In every mode: substance roles fire continuously (Topic Director after every Verifier round; Synthesizer when Director routes); Historian fires at end of session.

---

## Mode 1 — Experiment loop (hypothesis sweep)

**When:** Many small experiments per session. Examples:
- Hyperparameter sweeps
- Performance tuning passes
- A/B comparison of approaches
- Optimization experiments
- Tier 1 / Tier 2 area sweeps per a project's program plan

**Researchers:** Scout, Builder, Verifier (Investigator on-demand for crashes).

**Substance cadence:**
- Topic Director fires every N experiments (default 3–5) or on Verifier signal
- Synthesizer fires when Director routes
- Historian fires at end-of-session

**Iteration budget:** 3 misses → Director recommends rotate; Team Lead dispatches rotation.

**Session granularity:** One session = one research direction (a single area inside a tier). Expected throughput: 3–5 sessions per overnight run, ~12–20 experiments per session.

**End-of-session triggers:**
- Topic Director recommends rotation (3 consecutive misses + synthesis says hypothesis space exhausted)
- ≥ 4 hours wall-clock (M-scope ceiling)
- Hard-stop condition fires
- User pause

**Mode 1 dispatch shape:**
- Scout validates state file vs reality
- Builder runs experiments (each: edit → run → keep/discard → commit)
- Verifier confirms TSV/log match commits; reruns evaluation script if available; bidirectional check
- After Verifier: Team Lead dispatches Topic Director, then Synthesizer if routed

---

## Mode 2 — Build / refactor (L-scope)

**When:** Building or substantially refactoring infrastructure. Examples:
- New decoder framework
- Ingestion pipelines
- Schema migrations
- Major refactors that touch ≥3 files
- Anything where "what's the right interface" is itself a question

**Researchers:** Scout, Architect, Builder, Verifier. Specialists on-demand.

**Substance cadence:**
- Topic Director fires after every Verifier round
- Synthesizer fires when Director routes
- Historian fires at end-of-build-arc (often spanning multiple sessions, not just end-of-day)

**Iteration budget:** Builder ↔ Verifier cycles. **Hard-stop at 5 ping-pong rounds** in the same defect class. If exhausted, Director recommends scope-shift to user.

**Mode 2 dispatch shape (phases):**
1. **Scout** — existing landscape, do-not-break list, risk register. Read-only.
2. **Architect** — `<topic>-architecture.md` with named interfaces + acceptance + alternatives. **No code.**
3. **Builder** — implement per spec; one commit per logical phase; tests must pass.
4. **Verifier** — bidirectional + sample-based audit against spec.
5. **Topic Director** — routes findings; refines next-round brief or signals scope-shift.
6. Loop steps 3–5 until Director says topic-complete.

**Mode 2 critical rule:** The Architect's spec is the source of truth. If the Builder thinks the spec is wrong, the Builder reports it as a finding — Builder does **not** revise the spec inline.

---

## Mode 3 — Defect fix (focused L-scope)

**When:** Fixing defects that don't decompose to a single Builder pass. Examples:
- Data-quality issues
- Extraction defects affecting downstream signal
- Root-cause-ambiguous failures
- Bugs that turned out to have multiple sources tangled together

**Researchers:** Verifier (audit-first), Builder (investigate-then-fix). Re-dispatched in tight loops.

**Substance cadence:**
- Topic Director fires after every Verifier round
- Director decides: continue same defect, switch defect, or surface scope-shift
- Synthesizer fires when Director routes
- Historian at end-of-arc

**Iteration budget:** **Resets to 0 when the work nature shifts.** Director's role here is critical — they're the ones who recognize "this is now a different problem." Without that recognition, the team will hit the iteration ceiling on a problem that's already morphed.

**Mode 3 dispatch shape (per defect):**
1. **Investigation** — write `<defect>-investigation.md`. Hex dumps, sample entries, root cause. **NO code yet** (Iron Law).
2. **Fix** — implement per investigation findings. Tests must pass.
3. **Re-extract / re-run** — produce updated artifact; push to branch.
4. **Self-audit** against acceptance BEFORE claiming done.
5. **Verifier** — bidirectional + sample-based audit.
6. **Topic Director** — route or scope-shift.
7. Loop until acceptance passes or Director surfaces.

**Mode 3 critical rules:**
- **One defect per dispatch.** No bundling. Multi-defect dispatches converge slowly (lesson #5 territory).
- **Acceptance is a runnable script**, not interpretive prose. "Output of `python verify_xyz.py` shows 0 mismatches" is acceptance. "Verifier should agree it looks better" is not.
- **Investigation `.md` documents are required** before fix code. Skipping this is the failure mode that produced lesson #10.

---

## Cross-mode iteration discipline

**Hard-stop ceiling.** 5 Builder ↔ Verifier rounds in the same defect class. If 5 rounds haven't converged, the Topic Director surfaces a scope re-question to the user.

**Budget reset on scope shift.** If the work fundamentally shifts character (e.g., "implement framework" became "fix classifier"), the iteration counter resets to 0. **The Director is responsible for recognizing this and signaling.** The Team Lead dispatches the budget reset; the Director's job is to spot the shift.

**Why this matters:** Lesson #8 — iteration budget exhausted on the wrong problem. Iters 1–4 were design + framework redesign; iter-4 audit revealed the core signal was missing. The team had been iterating against the wrong target.

**Surface-to-user triggers (autonomous mode):**
- Verifier reports BLOCKED with no path forward
- Topic Director's note says "surface to user" (substance signal)
- 5 iterations on the same defect class fail to converge
- Cross-repo conflict requiring user judgment
- Token-spend ceiling
- Safety-mode breach
- License/legal question outside prior guidance

The Topic Director is the substance-surface authority; the Team Lead is the logistical-surface authority. **Both can trigger surface; both should.**
