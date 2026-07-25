# State — merge-train

**Project slug:** `aihu`
**Last session:** 2026-07-24 / 2026-07-25 (Mode 3 — merge train + defect fix)
**Active topic:** `merge-train`
**Mode:** 3

> **Why this file lives at `docs/state/` and not `state-merge-train.md`:**
> `.gitignore:98` matches `state-*.md`, so a repo-root state file is untracked,
> invisible to every other clone, and lost on a fresh worktree. The
> `fw-agent-skill` resume protocol previously pointed at that path, which made
> resume step 1 a silent no-op — see lesson #20 in
> `.claude/skills/fw-agent-skill/references/lessons.md`.

## Substrate (resolved 2026-07-25)

**File substrate** — durable artifacts under `docs/plans/<slice>/`, `docs/lessons/`.

A gbrain server *is* reachable at user scope as **`gbrain-local`**
(`mcp__gbrain-local__search` / `__get_page` / `__put_page`). The project-scope
`gbrain` entry in `.mcp.json` does **not** run: `.claude/scripts/gbrain-mcp.sh`
exits unless `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are exported, so
`mcp__gbrain__*` does not exist. Re-resolve every session:

```
ToolSearch  query: "gbrain search put_page get_page"
```

## Current focus

Land the four open PRs in order, then clear the unfiled items in
`docs/plans/merge-train-2026-07-24/RETRO.md` §5.

Landing order: **#546 → #550 → #556 → #539.**

## Recent decisions

- 2026-07-24: `main` advanced `7462edd4` → `3790c913`; 10 PRs merged.
- 2026-07-24: #552 fixes the `@state` splice TDZ; the fix only reaches CI
  because `bun.lock` pins a nonexistent platform package, so `target/release`
  wins resolution. **Repairing that pin silently flips `deploy-docs-next.yml`
  onto the published compiler** — re-verify when it happens.
- 2026-07-24: `#556` re-scoped — its `AIHU_COMPILE_BIN` half shipped with #552;
  only the contested `paths`-filter half remains, which INV-A says should not
  land as written.
- 2026-07-25: `#546`'s `closes FEL-396` trailer removed and verified, so
  FEL-396 stays open when #546 merges.
- 2026-07-25: `fw-agent-skill` converted to capability notation + Step 0
  substrate preflight; 8 lessons added (14–21).

## Open scope-shift signals

- **FEL-399 is mis-scoped as an intermittent flake.** It is "the typecheck gate
  has no build-ordering guarantee" — six patched sites, zero mechanism changes.
  A `check:moon-graph` guard is the proposed systemic fix. Unfiled.
- Bench gates have **no green baseline on `main`** in the last 200 runs.
  Re-baselining without first explaining the 470× `attr-thrash-100x100` and
  20× `update-1-of-10k-leaves` deltas would bless a possibly-real regression.

## Pointer to active artifacts

- Retro: `docs/plans/merge-train-2026-07-24/RETRO.md`
- Investigations + verifications: `docs/plans/merge-train-2026-07-24/`
