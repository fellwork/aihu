# A STRUCTURE OUTLIVING THE CONSTRAINT THAT PRODUCED IT

**Topic:** cross-cutting (CLI config, templates, tooling contracts, CI)
**Session:** named 2026-07-26, after the third instance in one afternoon
**Category:** architecture-drift, review-process
**Severity:** medium-high for the passive form (instances 1-3) — it costs nothing
today and quietly teaches the next reader to avoid a supported path. **HIGH for
the active form (instance 4)**, where the stale copy is an *instruction artifact*
that keeps teaching the pre-correction error to whoever reads it next.
**Status:** named; no mechanical detection

## The shape

> A workaround is written for a real limitation. The limitation is later fixed.
> The workaround stays — and its *comment* stays with it, now describing a
> constraint that no longer exists.
>
> Nothing breaks. The code works. It is simply **more complicated than the
> problem now requires**, and the comment actively argues against the better
> path.

This is the benign-looking sibling of the other patterns in this directory — with
one variant that is not benign at all (see "The dangerous variant" below).
It does not produce a wrong number or a false green. It produces **a false
explanation**, which is worse in one specific way: it survives review, because a
reviewer reads the comment and finds the code consistent with it.

**The comment is the payload.** A structure with no rationale gets deleted the
first time someone touches it. A structure with a confident, obsolete rationale
is *defended*.

## Instances — all found on 2026-07-26, in unrelated subsystems

| # | The structure | The constraint that produced it | When the constraint died |
|---|---|---|---|
| 1 | `viteAgentReadinessIntegration` wired **directly**, bypassing `viteAihuPlugin`'s `agentReadiness` option, with the comment *"Wired directly (rather than via viteAihuPlugin's agentReadiness option) **so it loads as an ESM import**"* | `require`/`createRequire` on that path threw `ERR_PACKAGE_PATH_NOT_EXPORTED` | **#53** — `vite-plugin.ts:142-151` already uses dynamic `import()` for exactly that reason, and `config.ts:153` already types the option. Found by builder-b resolving a #609/#612 conflict: `git log -S agentReadiness origin/main -- vite-plugin.ts` → #53. Corroborated independently by the orchestrator on FEL-423: *"it exists and no template has ever used it"* |
| 2 | `svelte.config.js` as a second config file alongside `vite.config.js` | The language server could not parse the Vite config | **sveltejs/language-tools#3031.** SvelteKit 2.62 now accepts `KitConfig` inline on the `sveltekit()` plugin, and SvelteKit 3 makes `vite.config.js` the required location. Found by docs-next while researching where aihu's own config should live — and it *superseded that agent's own open PR* (#605) |
| 3 | The **R-CT-06 freeze contract**, pinning a v0.2.0 golden fixture | A snapshot contract taken when that golden was current | The golden **predated `aihu.config.ts` existing at all**, so honouring the contract *required* shipping configless projects. Retired by the founder: *"freezing it to a version that never worked doesn't make sense."* Mechanism kept, contract dropped, fixture regenerated |

Two of these were found by **different agents, from opposite directions, within
the same afternoon** — which is why it got named rather than fixed twice.

## The dangerous variant: the stale copy keeps teaching the *pre-correction* error

Instances 1–3 are structures whose **rationale** went stale — a comment defending
a workaround after the workaround stopped being needed. Costly, but passive.

**Instance 4 is active.** Handed over by builder-b while executing a "delete the
dead code" ruling:

`packages/cli/src/templates/AGENTS.md` has **zero importers repo-wide**, is
reachable from none of `rolldown.config.ts`'s three entries, and
`templates-tooling.ts:43-46` **already records it as "emitted by nothing."** It
never shipped. By every normal test it is dead.

**It is not dead, because `AGENTS.md` is a file coding agents read automatically.**
And its rule 5 contradicts itself — verified on `origin/main`:

> Prose: *"event handlers use `on:click` … two-way binding uses `bind:value` …
> Generating `$on.click`, `$bind.value`, `$if=`, or `$each=` as template
> attributes is **always wrong** (compile errors C606/C607)."*

```html
<!-- Correct template directive syntax -->      ← labelled Correct
<input $bind:value="draft" $on:input={…} />        …the forms the prose forbids
<button $on:click="submit">Submit</button>

<!-- Wrong — dot form is not valid -->          ← labelled Wrong
<button on:click={submit}>Submit</button>          …the form the prose requires
```

The "Wrong" annotation is confused twice over: it says *dot form*, and the example
it condemns is the **colon** form.

So a file **inside `packages/cli/src/`** — the package an agent working on the CLI
is most likely to be editing — teaches the exact inverse of its own stated rule,
in the two forms the compiler rejects with named error codes.

**Why this variant is worse:** the rule *was* corrected, in
`templates-tooling.ts`. The fix shipped. The stale copy stayed reachable and kept
teaching the pre-correction error. **The fix landing is what made this invisible**
— everyone who checked the live path found it correct.

> **Dead code that is *read* is not dead.** An `AGENTS.md`, a README, a docstring,
> a prompt file: these are instruction artifacts. A stale one does not merely fail
> to help — **it propagates the error into new work**, and it does so through the
> readers least able to notice, because they have no history of the correction.

**Recipe addition:** when you delete or supersede an instruction artifact, grep
for *copies* of it — and treat "no importers" as evidence it is unshipped, **never
as evidence it is unread**. The reachability test for prose is *who reads it*, not
*who imports it*.

## Why it survives

1. **It is never wrong at runtime.** No test fails. Nothing is slower. The only
   cost is complexity and a misleading explanation, and neither has a gate.
2. **The rationale outranks the reader.** A comment saying *"wired this way
   because X fails"* is read as institutional knowledge. Disproving it means
   going and reading someone else's package internals.
3. **Fixes are announced where the workaround is not.** #53 fixed the ESM path
   in `vite-plugin.ts`. Nothing walked the tree looking for consumers who had
   routed around it.
4. **The workaround is often in a different repo, package, or language** from the
   fix. Instance 2 spans aihu and `sveltejs/language-tools`.

## Recipe

- **When you fix a limitation, grep for its workarounds.** The fix is only half
  the change. `git log -S<symbol>` on the fixed path finds who avoided it.
- **Date a workaround's rationale, and name what would retire it.** Write *"until
  X supports Y"*, not *"because X cannot do Y"*. A comment with an exit condition
  is falsifiable; one without is permanent.
- **Treat a confident rationale as a claim, not as context.** Verify it before
  building on it — builder-b did, with `git log -S`, which is what turned a
  mechanical conflict resolution into a finding.
- **Prefer deleting the workaround to carrying it forward** through a rebase.
  Carrying it forward is what promotes it from accident to decision. Builder-b's
  ruling: *carrying it forward documents a workaround for a solved problem and
  would teach the next reader to avoid the supported path.*
- **A second file is a smell.** Two config files, two dialects, two entry points
  — ask which constraint forced the split and whether it still holds. Instances 1
  and 2 are both "there are two of these because one of them used to not work."

## Related

- `absent-value-rendered-as-real.md` — the pattern where the *value* is fictitious
- `checked-thing-is-not-the-changed-thing.md` — where the *subject* is wrong. This
  lesson is where the **explanation** is wrong while code and subject are both fine
- `second-instrument-beats-second-reviewer.md` — instance 1 and FEL-423 reached the
  same conclusion from opposite directions; that agreement is the evidence
- `docs/state/orchestrator.md` — the config-home ruling that instance 2 produced
