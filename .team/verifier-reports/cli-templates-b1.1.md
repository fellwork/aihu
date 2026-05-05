# Verifier-report · cli-templates · B1.1 · 2026-05-05

**STATUS: PASS**

Audited Builder B1.1's deliverable on `feat/cli-templates-b1` (HEAD `44b0e55`) against
`.team/director-notes/cli-templates-002.md` §"Refined brief for B1.1" and `docs/roadmap/arch-6-cli-templates.md` §2.3 / §3.4 / §4.

## Acceptance criteria results

| # | Check | Exit | Notes |
|---|---|---|---|
| 1 | `bun run typecheck` | **0** | Stable on rerun (26 cached tasks complete). First fresh run had a transient `adapter-vercel:typecheck` failure that did not reproduce; running `bunx tsc --noEmit` directly in `packages/adapter-vercel` and `packages/cli` both exit 0. Likely a moon scheduling race against `arbor:build`/`context:build` outputs; not a B1.1 defect. |
| 2 | `bun run test packages/cli/tests/template-manifest.test.ts` | **0** | 13/13 tests passed |
| 3 | `bun run test packages/cli/tests/conditional-eval.test.ts` | **0** | 28/28 tests passed |
| 4 | `bun run test packages/cli/tests/scaffold-pipeline.test.ts` | **0** | 27/27 tests passed |
| 5 | `bun run test packages/cli/tests/prompts.test.ts` | **0** | 17/17 tests passed |
| 6 | `bun run test packages/cli/tests/templates-registry.test.ts` | **0** | 9/9 tests passed |
| 7 | `bun run test packages/cli/tests/cli.test.ts` (legacy) | **0** | 44/44 tests passed — backward-compat preserved |

**Total new + legacy CLI tests: 138 passing.**

## Bidirectional audit

### Under-implementation

| Check | Result |
|---|---|
| `template-manifest.ts` exports both `TemplateManifest` type AND `validateManifest()` function | **PASS** — both exported (lines 38, 150) |
| `validateManifest` throws on malformed input with a clear message | **PASS** — confirmed via direct invocation: `{}` → `Invalid TemplateManifest: name must be a string`; `{name:'x'}` → `displayName must be a string`; wrong type for `contractVersion` → `must be a finite number` |
| `conditional-eval.ts` rejects `eval`/`Function`/`vm` | **PASS** — `grep -nE "\beval\b\|\bFunction\b\|\bvm\b\|require\("` returned only the comment that prohibits them; uses recursive-descent parser (lines 146-238) |
| Handles all spec operators (`===`, `!==`, `&&`, `||`, `!`, parens) | **PASS** — sample `evalWhen("a === \"x\" && !b", {a:"x", b:false})` returned `true`; tests cover all operators including precedence, double-negation, and parenthesized grouping |
| `templates-registry.ts` has all 5 templates | **PASS** — `cf-team`, `vercel-team`, `fly-team`, `cf-solo`, `cf-full-agent` all in `KNOWN_TEMPLATES` (lines 10-16) |
| `resolveTemplateName('cf-team')` → `'@aihu/templates-cf-team'` | **PASS** — confirmed for all 5 short names; returns `undefined` for `unknown` |
| `prompts.ts` exports the 3 functions and errors with a clear message in non-TTY mode | **PASS** — `promptText`, `promptSelect`, `promptYesNo` all exported; `assertTTY` helper (line 39) emits `"Cannot prompt in a non-TTY shell. Pass --no-interactive ..."` |
| `scaffold-pipeline.ts` exports the 6 pure functions per §4.4 | **PASS** — `resolveTemplate`, `mergeOptions`, `enumerateFiles`, `readSubstituteWrite`, `runPostInstall`, `printNextSteps` all exported; first three do no I/O (manifest-only operations); fs/spawner injected via `FileSystem` / `Spawner` interfaces for the I/O-touching three |
| `bin.ts` recognizes `--template <T>` flag AND falls through to legacy when template doesn't resolve | **PASS** — confirmed end-to-end: `app foo --template cf-team` writes `STUB: new pipeline not yet wired in B1.1` to stderr and exits 0; `app foo --template unknown-thing` falls through to `scaffoldApp()` and writes the legacy file list |

### Over-implementation (out-of-scope creep)

| Check | Result |
|---|---|
| `packages/templates/cf-team/` created? | **PASS (no creep)** — directory does not exist |
| Scaffold-and-compile e2e harness file added? | **PASS (no creep)** — no `scaffold-and-compile.test.ts`, no `legacy-snapshot.test.ts` |
| `packages/cli/src/create.ts` modified? | **PASS (no creep)** — `git diff origin/main -- packages/cli/src/create.ts` is empty |
| `.changeset/*.md` added for new files? | **PASS (no creep)** — `.changeset/` only contains pre-existing `README.md`, `config.json`, `initial-release.md` |
| New entries in `packages/cli/package.json` `dependencies`? | **PASS (no creep)** — `git diff origin/main -- packages/cli/package.json` is empty (zero-runtime-dep contract preserved) |
| Stray new packages | **PASS (no creep)** — `packages/` count is 19 on both main and B1.1 branch |

### Sample behavioral checks

- `validateManifest(<minimal hand-crafted manifest>)` succeeds and round-trips `name` correctly. ✓
- `evalWhen("a === 'foo'", {a: "foo"})` returns `true`. ✓
- `evalWhen("a === \"x\" && !b", {a: "x", b: false})` returns `true`. ✓
- `resolveTemplateName('vercel-team')` returns `'@aihu/templates-vercel-team'`. ✓
- `bun packages/cli/src/bin.ts app foo --template cf-team` → exits 0; stderr exactly `STUB: new pipeline not yet wired in B1.1`. ✓
- `bun packages/cli/src/bin.ts app foo --template unknown-thing` → exits 0; stderr empty; stdout shows legacy `created  package.json` etc. (fall-through preserved). ✓

## Findings

1. **Test quality is high.** 94 new tests across 5 new files, each module has both happy-path and rejection-path tests. `conditional-eval.test.ts` explicitly tests that escape-hatches like function calls, member access, arithmetic, single `=`, escape sequences, unterminated strings, and unmatched parens are all rejected — exactly the security-relevant edge cases for an evaluator that handles untrusted manifest input.
2. **Pure-function contract honored.** `resolveTemplate`, `mergeOptions`, `enumerateFiles` do zero I/O; the I/O-touching three (`readSubstituteWrite`, `runPostInstall`) inject `FileSystem` and `Spawner` interfaces with `realFileSystem` / `realSpawner` defaults. Tests pass `Map<path,content>`-backed fakes — no real fs writes during unit tests.
3. **bin.ts edit is minimal and correct.** The new `extractTemplateFlag` helper handles both `--template foo` and `--template=foo`. Dispatch logic is exactly what the brief specified: stub-and-exit-0 if registry resolves, fall through to `scaffoldApp` if not (preserves R-CT-06 backward compatibility from arch-6 §7.2).
4. **README churn is the pre-commit autogen hook side effect.** 26 README files updated with refreshed commit-hash watermark and size-budget measurements (`@aihu/context` and `@aihu/signals` flipped from `_no dist_` to actual measured sizes). Per the brief: this is explicitly NOT a Builder violation. No action needed; surfacing only because the verifier checked.
5. **Transient typecheck flake on first run.** A first `bun run typecheck` after `bun install --frozen-lockfile` reported `adapter-vercel:typecheck` failed via moon, but the second run passed all 26 tasks (some cached). Direct `bunx tsc --noEmit` in `adapter-vercel` exits 0. Looks like a moon task-scheduling race against `arbor:build` / `context:build` declaring outputs needed by other typecheck tasks. Not a B1.1 regression — neither `adapter-vercel` nor any of its inputs were touched in this branch. Worth noting to the Director only as ambient noise; should NOT block B1.1.
6. **Type-only consideration.** `KnownTemplate = (typeof KNOWN_TEMPLATES)[number]` is a precise literal-union type, and `resolveTemplateName` returns `KnownTemplate | undefined`. The brief said "returns `string | undefined`" but the stronger return type is a strict improvement, fully assignable to `string | undefined`. Not a defect.

## Verdict for next Director round

B1.1 is a clean, well-tested, scope-disciplined deliverable. All 7 acceptance checks (typecheck + 6 test files including legacy) pass. Zero out-of-scope creep across all 6 audit dimensions. Sample behavioral probes confirm each module behaves as specified. The Director should route to **Synthesizer** (capture this round's substantive findings — pipeline machinery landed, contract between CLI and templates is now concrete in code) and dispatch **Builder B1.2** (template content for `@aihu/templates-cf-team`) on a fresh worktree off main once B1.1 merges. No need to send back to Builder for round 2.
