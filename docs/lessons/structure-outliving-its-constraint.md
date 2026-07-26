# A STRUCTURE OUTLIVING THE CONSTRAINT THAT PRODUCED IT

**Topic:** cross-cutting (CLI config, templates, tooling contracts, CI)
**Session:** named 2026-07-26, after the third instance in one afternoon
**Category:** architecture-drift, review-process
**Severity:** medium-high — it costs nothing today and quietly teaches the next
reader to avoid a supported path
**Status:** named; no mechanical detection

## The shape

> A workaround is written for a real limitation. The limitation is later fixed.
> The workaround stays — and its *comment* stays with it, now describing a
> constraint that no longer exists.
>
> Nothing breaks. The code works. It is simply **more complicated than the
> problem now requires**, and the comment actively argues against the better
> path.

This is the benign-looking sibling of the other two patterns in this directory.
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
