# State — builder

**Role:** BUILDER · **Workspace:** `almaty` · **Branch:** `srmcguirt/builder-await-assignment`
**Base:** rebased onto `origin/main` @ `bc1c4eac` (picked up #615, #616, #617)
**Last updated:** 2026-07-26, FEL-426 complete (rebuilt twice), #619 ready for review.

> Ownership note: `historian` claimed `docs/state/` at 13:24. This file was
> flagged to them and to team-lead (ts `1785087210.788909`); rename or delete on
> request.

## FEL-426 — DONE (founder-ruled: "not use an unsafe component… check by CI")

Both halves landed together. Half A alone re-breaks the moment someone edits the
file, which is why the ruling bound them.

> **The first shipped approach was REJECTED and superseded.** I sanitised and
> re-fed `html={}`. The orchestrator's HOLD arrived after I pushed. Rebuilt to
> the ruling: parse to structured data, render escaped, drop `html={}` entirely.
> Lesson for me: I announced an approach, got no reply in two minutes, and
> treated silence as assent — on a transport I had *personally just proven*
> delivers dispatches invisibly. Standing rule now: say "blocking on a ruling"
> and stop.

### Half A — the XSS

`html={}` is unsafe *by design* and stays a legitimate primitive; the defect was
what it pointed at. Since **#572**, `ssr_string_emit.rs:669` interpolates its
value **unescaped into served bytes** (`String((expr) ?? '')`) — before #572 it
was SSR-transparent, so the blast radius was client DOM only. Correct for
docs-next's authored markdown; stored XSS for `examples/hacker-news`, which
points it at the HN Firebase API at three sites.

The tell is inside one element: `comment().by` → `__aihu_stext(...)` (escaped),
`comment().text` → `String(...)` (raw), three lines apart.

**Fix (final):** `src/lib/parse-hn-markup.ts` parses at the loader ingress into
structured blocks/spans; `src/components/hn-rich-text.aihu` renders them through
ordinary escaped bindings. **All three `html={}` bindings are gone.** `safeHref`
is *reused* from `@aihu/editor/safe-href`, not reimplemented.

The safety property no longer depends on the parser being correct — output is
plain strings through `__aihu_stext`, so a parser bug is a *display* bug and
cannot be injection. A sanitiser structurally cannot promise that. Doctrine came
from `packages/editor/src/paste-sanitize.ts`: *"never re-serializes to HTML."*

**Compiler untouched.** It did exactly what `html={}` means.

### Half C — the coverage floor was satisfied BY the vulnerability

`MUST_BE_LIVE` guaranteed `html` was live-exercised. The only thing making that
true was the XSS hole. **The guarantee and the defect were one line of code**, and
the guarantee is why nobody looked. Distinct from FEL-428 (a gate measuring
nothing): this gate measured exactly what it claimed — presence of a usage,
never safety of one.

Ruled by Shane and the orchestrator independently, same answer: keep the floor,
move the exerciser. `examples/ssg-site/src/pages/about.aihu` now renders an
authored in-repo constant through `html={}`, backed by a **prerender needle** so
the row is proven in built bytes. Rows unchanged at 54 — relocated, not reduced.

### Half B — the CI gate (the brief's prescribed fix was wrong)

The brief said both loops enumerate by hand-typed literal and to derive from
disk. Half true, and applying it literally would have turned CI red:

1. `scripts/build-governed-examples.ts:64` **already** derives from disk
   (`readdirSync` + `coverage.manifest.json`). hacker-news is *in* that set,
   declares `ci: "compile+smoke"`, and declares it exercises `html`. It had no
   smoke suite, so the runner printed `compile-only (no smoke suite…)` and ran
   nothing. **It is the only governed example declaring `html`, and the only
   `compile+smoke` one with no suite.**
2. The `ran === 0` anti-vacuous guard is real and fires — but it is *global*, so
   eight passing neighbours mask one item's no-op.
3. Globbing `examples/*` into the `examples` job's `vite build` loop would fail:
   hacker-news's manifest says it is *not vite-buildable* (server/SSR wiring).
   The fix for that would be a skip-list — the literal list again.

**So Half B was not "derive the list" but "make a declared tier that silently
degrades to nothing be RED".** `plan-a.yml` needed **zero changes**:
`packages/compiler/**` is already in the `governed` paths filter, so #572 *did*
trigger this lane. It ran, reassured, and passed.

Also fixed: derive-from-disk **cannot detect deletion** (verified — removing the
example made its row vanish and the lane still passed). `examples/governed-roster.json`
is the committed floor. Adding an example still needs nothing there; removing one
requires an explicit, reviewable line deletion.

## Receipts — every direction proven, real exit codes

`PIPESTATUS` is a bash-ism; this shell is zsh, so piped `EXIT=` readings were
silently empty. These are unpiped `$?`.

```
MUST-FAIL-FIRST  payload live in served bytes, pre-fix        -> exit 1
  <div class="text" …>Interesting point. <img src=x onerror="…"></div>
delete example (roster tripwire)                              -> exit 1
compile+smoke tier with no smoke suite                        -> exit 1
break the SFC (smoke suite fails)                             -> exit 1
sanitiser neutered to identity                -> 10 of 16 red, incl. served-bytes
loader trust boundary removed                 -> 1 red (the wiring test)
FIXED: bun run test (examples/hacker-news)                    -> exit 0, 16/16
FIXED: build-governed-examples.ts hacker-news                 -> exit 0
check:coverage-manifest                                       -> exit 0
biome check (8 files)                                         -> exit 0
```

Compiler was built **from this tree** (`cargo build --release --bin aihu-compile`),
not the published napi addon.

### Two assertion traps hit and fixed while writing this
- `not.toContain('onerror=')` **fails on correct output** — the literal text
  survives inside `&lt;img … onerror=&quot;`, which is inert. Assert the property
  (`/<[a-zA-Z][^>]*\son[a-z]+\s*=/`), not the substring, or the next reader
  weakens the sanitiser to satisfy a wrong test.
- Sanitiser unit tests + the SSR test both pass with the loader call deleted.
  Added `loader trust boundary` tests (stubbed `fetch`, `loader.fn(ctx)`) so the
  fix is asserted **on the data path**, not merely present.

## No changeset — deliberate, with receipt

No published package changed (only `examples/` + `scripts/`), and
`@aihu/example-hacker-news` is explicitly in `.changeset/config.json`'s `ignore`
list. Stating it rather than silently skipping.

## What the next instance must not redo

- Do **not** "fix" `plan-a.yml`'s hand-typed lists as part of FEL-426. It is a
  real coverage gap (5 of 25 examples built, 7 tested) but a **separate** issue,
  and the naive fix reddens CI. Flagged, not claimed.
- Do **not** re-derive the alias map in `examples/hacker-news/vitest.config.ts`.
  It imports root's 34 aliases on purpose; hand-copying the subset needed today
  is how it rots.
- The vitest config is deliberately **not** an extension of the example's
  `vite.config.ts` — inheriting it drags in `@aihu/router`'s built plugin, so a
  missing `dist/` would make the security gate a build-ordering casualty.
- Local `bun run test` at repo root has ~20 pre-existing failures from a missing
  `aihu-css-core` binary (`cargo build --release -p aihu-css-core`). Four
  governed examples also fail locally on unbuilt `dist/`. **Not mine** — verified
  by running them on a clean tree.

## Queue behind this (from orchestrator, 15:05)

1. `.tastemaker/check_contrast.py` — derive hexes from `packs.ts`; 8 of 30 values
   have drifted, `accent`/`border` is 0.12 above the 3.0 floor while the tool
   prints 0.62 of headroom. Third and last open instance of FEL-428.
2. FEL-423 — `full`/`minimal`/`docs` adopt `createAgentReadinessRoutes()` via
   `viteAihuPlugin()`'s existing `agentReadiness` option. Needs a floor assertion
   that goes RED on zero tools.

`#609` and FEL-391 went to **builder-b**. Not mine.
