# Cascading docs-regen merge conflicts across a PR batch

**Topic:** aihu-v1-framework
**Round:** 13
**Category:** release-engineering, multi-branch-orchestration, ci-architecture
**Severity:** medium (predictable friction whenever 2+ PRs land in one batch)

## The lesson

Every feature branch's pre-commit docs hook regenerates the same autogen artifacts â€” `__bundle-sizes.json`, the per-package READMEs (via `sync-readme.ts`), and any other size/inventory file derived from the workspace. Because each branch commits its OWN regenerated copy of these shared files, a BATCH of PRs that all touch package metadata will hit SEQUENTIAL merge conflicts on the autogen artifacts: PR #1 merges clean, but PR #2..#N each conflict on `__bundle-sizes.json` / READMEs against the new main, even though none of them edited those files by hand.

This is NOT the same as the Release-PR autogen staleness problem (`release-pr-autogen-sync.md`): that one is about the Release-PR workflow committing stale artifacts. THIS one is about feature branches fighting each other over regenerated artifacts at merge time, because the artifacts are derived (not authored) yet are checked in and regenerated per-branch.

## How it bit us this session

The r13 close-out merged a batch of five PRs in sequence â€” #190 (`@aihu/primitives`), #191 (Bug 6), #192 (Bugs 7+8), #193 (Bug 4), #194 (Bug 9). Each branch's pre-commit hook had rewritten `__bundle-sizes.json` and the synced READMEs. After the first merge, every subsequent branch conflicted on those autogen files against the freshly-updated main â€” a conflict the author never introduced.

## The remedy

Merge one PR, then for each remaining branch:

```bash
git checkout <next-branch>
git merge main                 # pull in the just-merged batch
# autogen files conflict â€” DO NOT hand-edit them
git checkout --theirs __bundle-sizes.json packages/*/README.md  # take main's regenerated copy
bun run sync-readme            # OR just let the pre-commit docs hook regenerate
git add -A
git commit                     # the hook regenerates against the now-correct merged state
```

The key insight: the conflict markers are in DERIVED files, so the correct resolution is never a manual three-way merge â€” it is "take main's side (`--theirs`) and let the regen tool reproduce the right output from the merged source." Resolving by hand risks committing a hand-merged artifact that the next regen would overwrite anyway.

## The rule

For a batch of PRs that all touch package metadata: land them one at a time, and between each land, `git merge main` into the next branch and resolve autogen-artifact conflicts with `--theirs` + a regen run â€” never a manual edit. Better still, consider whether `__bundle-sizes.json` / synced READMEs should be `.gitignore`d and produced only in CI, which removes the per-branch conflict surface entirely (tradeoff: PR reviewers lose the in-diff size visibility).

## Related

- `release-pr-autogen-sync.md` (sibling family: derived artifacts that lie or fight â€” but that one is the Release-PR-staleness case, this is the feature-branch-batch case)
- `cross-package-version-drift.md`
- `publish-all-pkgs-array.md`
