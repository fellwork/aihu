# Phase-0 spike — findings & verdict

**Scope:** de-risk architecture.md §3 (beforeinput view layer), §4 (selection & IME), §4.3
(MutationObserver read-back) before MVP commitment, per §10 "Phase 0" and §11 risk #1/#2.
**This directory is disposable evidence, not product code.**

**Run it:**

```bash
bun install                       # @playwright/test is a root devDependency now
cd docs/plans/editor/spike
bunx playwright install chromium webkit firefox   # one-time
bunx playwright test --config playwright.config.ts
# manual poking: bun serve.ts 4187 → http://localhost:4187
```

## Verdict: **GO — WITH AMENDMENTS** (listed precisely below)

The three hardest calls in the spec survived contact with reality on all three desktop
engines. One of them (§4.3's "drain the MutationObserver queue first") was **wrong as
written in a way the spike caught on the first real-IME run** — fixable with a one-line
ordering change, now amendment A1. Nothing observed suggests the architecture is
untenable; the real residual risk is entirely in the untested real-device column
(Safari system IME, Android GBoard), which no desktop harness can discharge.

## Test matrix actually executed

Playwright 1.59.1, macOS (Darwin 25.5.0), engines: Chromium (Desktop Chrome),
WebKit 26.4 (Desktop Safari), Firefox 148 (Desktop Firefox). 28 passed, 0 failed,
2 skipped (CDP IME is a Chromium-only capability). `workers: 1`, no retries.

| # | Scenario | chromium | webkit | firefox |
|---|---|---|---|---|
| a1 | Plain typing → model ≡ DOM, all trs `user.typing`, zero read-backs | PASS | PASS | PASS |
| a2 | Enter mid-block → splitBlock, typing continues in new block | PASS | PASS | PASS |
| a3 | Backspace at block start → mergeBlock, caret at seam | PASS | PASS | PASS |
| b | Mid-word bold toggle; selection survives active-block re-render; typing inherits mark; re-toggle clears | PASS | PASS | PASS |
| c1 | **Real IME** (CDP `Input.imeSetComposition` ×4 + `Input.insertText` commit): 0 trs during composition, **exactly 1** on commit, model ≡ DOM, caret correct | PASS | skip | skip |
| c2 | Synthetic composition (CompositionEvent + `beforeinput isComposing` + direct DOM mutation): 0 trs during, 1 on compositionend | PASS | PASS | PASS |
| d1 | Spellcheck-style `nodeValue` replacement → reconciler converges, origin `dom.readback` | PASS | PASS | PASS |
| d2 | Extension-style `<span>` injection → folded in as text, foreign element evicted on re-render | PASS | PASS | PASS |
| d3 | Replacement wiping a block's children (`textContent =`) → text converges, **mark lost** (limitation pinned as a passing test) | PASS | PASS | PASS |
| e | Backspace across a strong/plain mark boundary → runs stay normalized, caret proven by typing | PASS | PASS | PASS |

## What worked (the load-bearing claims that held)

1. **`beforeinput` interception is sufficient for desktop editing** (§3.2). On all three
   engines, `insertText` / `insertParagraph` / `deleteContentBackward` / `formatBold`
   arrived, were cancelable, and were the *only* path exercised during plain typing —
   asserted by "no `dom.readback` origin appears" in scenario (a). Firefox included.
2. **Composition = browser-owned + one compositionend diff** (§4.2) holds. Under real
   Chromium IME (CDP-driven, actual composition events + preedit DOM mutations): zero
   transactions during 4 preedit updates, exactly one transaction on commit, model ≡ DOM,
   caret usable immediately after. The synthetic sequence reproduces this on WebKit and
   Firefox.
3. **MutationObserver read-back converges the model for every uncontrolled mutation we
   could produce**: characterData replacement, foreign-element injection, whole-block
   child wipe. One code path handled all three, exactly as §4.3 hopes. The re-render
   after read-back also *evicts* foreign DOM (extension widgets), which is the right
   ownership posture.
4. **(blockId, charOffset) ↔ DOM mapping survives re-render of the active block** (§3.3,
   §4.1). After a bold toggle rebuilds the block's element tree, the DOM selection still
   reads back as the same range (`getSelection().toString() === 'world'`), and typing
   lands where the model says the caret is.
5. **Single `apply()` door with clone-validate-commit** made every recovery path cheap to
   reason about: read-back, composition, and keystrokes all emit ordinary origin-tagged
   transactions (G1/G3 in miniature).

## What broke (honest failures — both were caught by the harness, not by inspection)

1. **§4.3 as written loses the composition-commit race** (observed live, chromium c1
   first run). The commit's mutation records are *queued* before `compositionend` fires
   but *delivered* on a microtask after it. The handler sets `composing = false`,
   schedules the rAF read-back — and then the MutationObserver callback runs first, sees
   `composing === false`, and performs the read-back itself with origin `dom.readback`.
   Convergence still happened (one transaction, correct text — the recovery path really
   is universal), but **attribution and the "single compositionend diff" contract were
   silently wrong**. Fix: `compositionend` must **synchronously** drain
   (`observer.takeRecords()`) before scheduling the rAF read-back. One line; without it
   every IME commit on Chromium is misattributed. → **Amendment A1**.
2. **Text-level read-back strips marks when an uncontrolled mutation spans/destroys mark
   elements** (pinned as test d3). `textContent`-diff cannot see run structure, so a
   spellcheck rewrite of `t|**eh**` to `the` converges the text but drops `strong`.
   Acceptable floor for a spike; not acceptable silently in the product. → **Amendment A2**.

Also learned (harness-level, but it will bite the product too): `selectionchange` is
async — code that writes the DOM selection and then reads the model selection signal in
the same task sees the *old* value. Commands must resolve their selection from the DOM at
dispatch time (or the signal must be written synchronously on programmatic selection
writes). → **Amendment A4**.

## Browser deltas observed

- **Chromium**: everything per spec; the only surprise was the record-delivery ordering
  in "what broke" #1 (this is per-spec MutationObserver semantics, not a Chromium quirk —
  expect it everywhere).
- **WebKit**: no deltas in the exercised scenarios — beforeinput coverage, cancelability,
  mutation delivery, and selection mapping behaved identically. (Real Safari *system* IME
  is explicitly not covered by the Playwright WebKit build — see UNTESTED.)
- **Firefox**: no deltas; slower per-test (~3×) but functionally identical. `formatBold`
  arrives from Ctrl/Cmd+B as expected.
- No engine needed the fail-closed unknown-`inputType` branch during these scenarios —
  that branch exists but was **not** meaningfully exercised (drag/drop, paste, and
  spell-check context menus are out of spike scope).

## Does the compositionend single-block-diff strategy hold?

**Yes, with A1.** With the synchronous drain in place, real Chromium IME produces exactly
one `user.typing` transaction per composition, no churn during preedit, and the
post-commit re-render from the model does not disturb the caret. The rAF deferral (§4.3
Safari mitigation) caused no harm on any engine and folds any post-compositionend
stragglers into the same read-back. Caveat: the *Safari-specific* late-mutation ordering
it exists for was not reproducible here (see UNTESTED).

## Is MutationObserver read-back sufficient as the universal recovery path?

**For text convergence: yes** — every uncontrolled mutation we produced (characterData,
element injection, child wipe) converged model ≡ DOM through the single `readBack`
routine, and the plain-typing scenario proves it stays *silent* when the event layer is
doing its job. **For mark fidelity: no, not as flat-text diff** (test d3). The MVP
read-back should walk the block's DOM to recover run structure (element → mark mapping is
trivial since we rendered it) and fall back to flat-text diff only when the DOM is no
longer parseable as our output. That closes the mark-loss hole for the dominant cases
(spellcheck replaces within a text node) without changing the architecture.

## Spec amendments (precise)

- **A1 — §4.2 (compositionend) and §4.3 row 1:** add: "`compositionend` MUST synchronously
  call `observer.takeRecords()` (discarding the composition's own records) *before*
  scheduling the rAF read-back; otherwise the MutationObserver tripwire — whose callback
  is delivered on a microtask after `compositionend` — performs the read-back first and
  the commit is misattributed to the recovery path." (Observed on Chromium; standard
  MutationObserver semantics, so assume all engines.)
- **A2 — §4.3 (read-back reconciliation):** read-back SHOULD be structure-aware: rebuild
  runs by walking the block's DOM (our own rendered shape: text nodes + mark elements),
  falling back to flat-text diff for unrecognizable DOM. Flat-text diff alone silently
  strips marks when a mutation spans or destroys mark elements. Add the d3 case to MVP
  acceptance (today its *loss* is the pinned expectation; MVP should flip it).
- **A3 — §1.2 (addressing):** pin `offset` units explicitly as **UTF-16 code units**
  (what `nodeValue.length`, `Selection` offsets, and JS `.slice` agree on). The spike
  mixed code-point iteration internally and got away with it only because 日本語 is BMP;
  astral-plane input (emoji) is a straightforward off-by-two otherwise. Add an
  emoji/astral acceptance case to A9.
- **A4 — §4.1 (selection sync):** note that `selectionchange` is asynchronous; command
  dispatch MUST resolve the live selection from the DOM (or flush the signal
  synchronously after programmatic `setBaseAndExtent`), never trust the signal within
  the same task as a selection write.

None of these change the architecture; A1/A4 are ordering contracts, A2 is a stronger
reconciler, A3 is a definition.

## UNTESTED — real-device risks this spike cannot discharge

These are §10's remaining exit criteria. The desktop matrix passing is necessary, not
sufficient; **MVP work can start (GO), but these must run before the MVP is declared
done**, because §11 ranks them risk #1 and a desktop harness cannot reach them.

1. **macOS Safari system IME (Japanese/Korean)** — Playwright's WebKit is not Safari's
   input stack; the §4.3 "compositionend before final mutation" ordering was not
   reproducible synthetically.
2. **iOS Safari IME + autocorrect/predictive text** — untested entirely.
3. **Android Chrome + GBoard backspace/word-composition** (§4.3 row 2) — untested
   entirely; the "never trust inputType during composition" rule is unexercised.
4. **Korean syllable composition** (per-keystroke syllable reshaping churn) — only a
   Japanese-style preedit sequence was simulated.
5. **Real spell-check UI replacement** (context-menu correction) — simulated via
   equivalent DOM mutations only.
6. Out of spike scope by design: paste/drop, cross-block selections (spike rejects them),
   `historyUndo`/`historyRedo` routing, RTL/bidi.

### Manual test script (run on each real device above)

Setup: `bun docs/plans/editor/spike/serve.ts 4187`, open `http://localhost:4187` on the
device (same LAN). The status panel below the editor shows `trs` (transaction count) and
the doc JSON live.

1. **Japanese IME**: click into the editor after "abc" (type it first; `trs` should
   increase by 3, one per keystroke). Switch to Japanese input. Type `nihongo`, watch the
   preedit underline — **`trs` must NOT change while the underline is visible**. Press
   Enter/Space to commit 日本語 — **`trs` must increase by exactly 1**, and the doc JSON
   must show `abc日本語` with no duplicated or missing preedit fragments. Type `!` — it
   must land after 語.
2. **Korean IME**: type `안녕` (an-nyeong; syllables reshape as you type). Same
   assertions: 0 transactions during reshaping, 1 per commit boundary, doc JSON matches
   the visible text exactly.
3. **GBoard backspace (Android)**: type `hello world`, put the caret at the end, press
   backspace 5×. The doc JSON must read `hello ` (GBoard often delivers these as
   composition rewrites, not `deleteContentBackward` — the diff must absorb it). Then
   backspace through the space and into `hello` — no duplicated letters, no stuck text.
4. **Autocorrect (iOS)**: type `teh ` and let autocorrect flip it to `the `. Doc JSON
   must converge to `the ` (one extra `dom.readback` or composition transaction is
   acceptable; divergence or duplication is a FAIL).
5. **Spellcheck replace (desktop Safari/Chrome)**: type `mispeled`, right-click, accept
   the suggestion. Doc JSON must converge to the corrected word; with A2 implemented,
   marks on adjacent text must survive.

Record for each: device/OS/keyboard, per-step `trs` delta, final doc JSON, any
divergence. A FAIL on any of 1–3 re-opens §11's fallback discussion (`mode: 'source'`);
a FAIL on 4–5 is an A2-scope bug, not an architecture question.

## Spike ↔ spec deltas (so nobody mistakes spike shortcuts for decisions)

- Spike model: paragraphs + one mark only; no history, serializers, input rules, GX.
- Spike re-renders the whole touched block per transaction instead of §3.3's
  `nodeValue`-patch fast path — deliberately *harsher* on selection survival, which is
  why passing (b) is meaningful. The fast path remains desirable for MVP.
- Read-back synthesizes `origin: 'dom.readback'` (spec §4.3 says `user.typing`) — spike
  keeps them distinct so the tests can prove *which* path ran. Recommend the spec adopt a
  distinct origin for read-back; it is strictly more attributable (G3) and cost-free.
- `arbor` `branch`/`leaf` were not used (plain `document.createElement`); nothing here
  contradicts §3.3, but the arbor-idiom claim remains unproven until MVP.
