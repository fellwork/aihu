# legacy-snapshot.golden — provenance

This directory is the frozen golden tree for the arch-6 §7.3 backward-compat
freeze (R-CT-06): `aihu app <name> --pm bun` with no `--template` flag must
keep producing this exact artifact, byte for byte. It is compared by
`packages/cli/tests/legacy-snapshot.test.ts`; this README is the one file the
harness skips when walking the golden (provenance annotation, not scaffold
output).

## Regeneration log

### 2026-07-21 — DA4 flip: binary shadow vocabulary, pin becomes `$shadow: 'light'` (#437)

- **Why it moved:** the founder-ratified DA4 flip landed together with the
  binary `ShadowMode = 'light' | 'shadow'` API (`'open'`/`'closed'`/`'none'`
  retired; `'closed'` never worked — it nulls `this.shadowRoot` and
  misdetects as light DOM). The legacy scaffold emitter
  (`packages/cli/src/index.ts::appIndexAihu`, plain/non-css branch) now pins
  `$shadow: 'light'` — the same light-DOM posture as before, spelled in the
  new vocabulary. Pages default to light DOM as of this release, so the pin
  is simply explicit about the default.
- **Regenerated:** 2026-07-21, on `feat/da4-light-dom-flip` (base
  `origin/main` at `89d9c9d5`). Only `src/pages/index.aihu` moved; verified
  byte-identical by a full harness run
  (`vitest run packages/cli/tests/legacy-snapshot.test.ts --config
  vitest.gates.config.ts`).
- **Diff vs previous golden:** exactly one line, in `src/pages/index.aihu` —
  `$shadow: 'none'` → `$shadow: 'light'`. No other file changed.

### 2026-07-20 — DA4 scaffold `$shadow: 'none'` pin (#437)

- **Why it moved:** DA4 phase 1 (founder-ratified, issue #437) intentionally
  changed the legacy scaffold emitter (`packages/cli/src/index.ts::appIndexAihu`,
  plain/non-css branch) to pin `$shadow: 'none'` in the generated index page's
  `@state` block. Pages default to light DOM at the next major; new apps adopt
  that now, and the pin keeps a fresh scaffold free of the new W472 warning.
- **Regenerated:** 2026-07-20, from the emitter on `fix/da4-classifier`
  (base `origin/main` at `774b38cf`). Only `src/pages/index.aihu` was
  rewritten — regenerated directly from `appIndexAihu('legacy-snapshot',
  false)` and then verified byte-identical by a full harness run.
- **Diff vs previous golden:** exactly one hunk, in `src/pages/index.aihu` —
  the `$shadow: 'none'` line (plus its blank separator) at the top of
  `@state`. No other file changed.

### 2026-07-20 — aihu-tsc typecheck (#434)

- **Why it moved:** PR #395 (commit `81279254`, 2026-07-13, "type-check .aihu
  files (aihu-tsc)") intentionally changed the legacy scaffold emitter
  (`packages/cli/src/index.ts::appPackageJson`) to emit
  `"typecheck": "aihu-tsc"` (plain `tsc` cannot see inside `.aihu` files) and
  a `"@aihu/tsc": "latest"` devDependency. The golden — last written
  2026-06-16 (`6a0d8e42`, #374) — was never regenerated, because the CI gate
  naming this test was silently no-opped by the root vitest exclude (#445).
- **Founder-ratified:** accept the evolution, regenerate the golden
  (investigation D1 option (a); ratified 2026-07-20 via /autoplan, issue #445).
- **Regenerated:** 2026-07-20, from emitter at commit `94ad14f7` (worktree of
  `fix/ci-honesty`, base `origin/main`).
- **Diff vs previous golden:** exactly two hunks, both in `package.json` —
  the `typecheck` script line and the `@aihu/tsc` dep addition. No other file
  changed.

## How to regenerate (intentional scaffold changes only)

Delete this directory and run the test twice through the gates config:

    bunx vitest run packages/cli/tests/legacy-snapshot.test.ts --config vitest.gates.config.ts

First run bootstraps a fresh golden (and fails loudly to say so); second run
verifies. The harness REFUSES to bootstrap when `process.env.CI` is set.
Record the regeneration here (why, date, emitter SHA) and commit.
