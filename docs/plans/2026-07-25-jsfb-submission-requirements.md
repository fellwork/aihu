# Requirements to get aihu listed on js-framework-benchmark

Research-only. All facts below come from the upstream `krausest/js-framework-benchmark`
repo's own current files (fetched 2026-07-25 from the `master` branch — this repo has
no version tags for docs, so "current" means "as of that commit"), not from memory or
blog posts. Anything I could not verify against a primary source is marked **unverified**.

Sources fetched directly (raw GitHub content or `gh api`):

- [`README.md`](https://raw.githubusercontent.com/krausest/js-framework-benchmark/master/README.md) — root, section "4. Contributing a new implementation" is the spec
- [`.github/copilot-instructions.md`](https://raw.githubusercontent.com/krausest/js-framework-benchmark/master/.github/copilot-instructions.md) — the maintainer's actual PR-merge runbook (fed to an AI agent, "I'll give you the number of the PR")
- [`.github/fix-framework.md`](https://raw.githubusercontent.com/krausest/js-framework-benchmark/master/.github/fix-framework.md)
- [`docs/RESULT_CREATION.md`](https://raw.githubusercontent.com/krausest/js-framework-benchmark/master/docs/RESULT_CREATION.md) — result pipeline internals
- [Wiki: Process for merging a pull request](https://github.com/krausest/js-framework-benchmark/wiki/Process-for-merging-a-pull-request)
- `package.json` (root), `webdriver-ts/package.json`, `frameworks/keyed/solid/package.json`, `frameworks/keyed/lit/package.json`, `frameworks/keyed/vanillajs/index.html`
- `webdriver-ts/src/isKeyed.ts`, `server/src/frameworks/frameworksServices.ts`, `cli/rebuild-single-framework.js`, `cli/rebuild-check-single.js`
- `gh api search/issues` over closed, unmerged "Add X framework" PRs (#2014, #1989, #1986, #1971) for real rejection transcripts

There is **no `CONTRIBUTING.md`** in the repo (confirmed 404) and **no `.github/workflows/`
directory** (confirmed via `gh api repos/.../contents/.github` — only the two `.md` files
above exist there). PR review/merge is a manual, maintainer-run process (currently backed
by an AI agent following `copilot-instructions.md`), not automated CI.

---

## 1. Submission mechanism

- **PR directly to `krausest/js-framework-benchmark`, no pre-approval issue required.**
  The README's "Contributing a new implementation" section describes opening a PR
  directly; there's no gate of "file an issue first." ([README §4.4](https://raw.githubusercontent.com/krausest/js-framework-benchmark/master/README.md), lines 536-567)
- **Target branch**: the repo's default (`master`).
- **Target directory**: `frameworks/keyed/<name>/` or `frameworks/non-keyed/<name>/` —
  aihu is keyed (uses `each(list, r => r.id, rowNode)`), so `frameworks/keyed/aihu/`.
- **Scope discipline is enforced at merge time**, not by CI: the maintainer's own
  runbook (`.github/copilot-instructions.md`, "Review PR" step 1) requires diffing
  `gh pr diff {PR} --name-only` and rejecting anything outside `frameworks/` (root
  `.gitignore` tweaks are the one accepted exception). README echoes this: "Please
  push only files in your framework folder (not index.html or results.json)."
- **No CI runs on the PR itself.** The maintainer builds on their own machine/VPS
  (a Hetzner Linux server, per the wiki, chosen partly for security isolation from
  arbitrary `npm install`/`postinstall` scripts in untrusted framework code) and runs
  the validation commands manually (or via the AI-assisted runbook), then merges with
  a merge commit — "Merge the PR using merge commits as the merge strategy using git
  checkout and git merge (and NOT gh commands)."
- **GitHub Copilot may auto-review the PR**: "Github Copilot may review your PR. It's
  still experimental so feel free to ignore its comments." — but per the real
  transcripts in §8, the maintainer's own AI-assisted process *does* act on some of
  those comments (HTML structure mismatches, note-worthy patterns), so in practice
  ignoring them is risky even though the README says you may.

## 2. Required files and fields

### `package.json` — exact shape

```jsonc
{
  "name": "js-framework-benchmark-<name>",
  "version": "x.y.z",
  "js-framework-benchmark": {
    // EITHER:
    "frameworkVersionFromPackage": "<npm-package-name>",   // e.g. "solid-js", or "pkg-a:pkg-b" for multiple
    // OR, if not npm-sourced:
    "frameworkVersion": "0.0.1",                            // hardcoded string

    "frameworkHomeURL": "https://...",
    "language": "TypeScript",                                // conventional; not currently enforced by the loader (see below)

    // optional:
    "useShadowRoot": true,
    "customURL": "/target/web/stage",
    "includeInBuild": "public",                               // colon-separated paths, for `npm run zip` archiving
    "issues": [801]                                           // known-issue/note numbers you're declaring, see §4
  },
  "scripts": {
    "build-prod": "..."                                       // REQUIRED — must produce an openable build
  },
  "dependencies": { "...": "fixed, no ranges" }
}
```

Verified against `server/src/frameworks/frameworksServices.ts::loadFrameworkInfo`
(lines 61-107): the loader hard-errors (`result.error = ...`) if:
- `package.json["js-framework-benchmark"]` is missing entirely, or
- neither `frameworkVersionFromPackage` nor `frameworkVersion` (string) is present.

`language` is **not** checked by the loader — it's convention only (both `solid` and
`lit`'s current `package.json` include it; the README's canonical example also
includes it). Include it for consistency but it will not block anything if omitted.

### `frameworkVersionFromPackage` resolution — this is the load-bearing detail

`loadFrameworkInfo` resolves the version by reading **`package-lock.json`** in the
framework directory, not `package.json`:

```js
const packageVersion =
  packageLockJSON.dependencies?.[packageName]?.version ||
  packageLockJSON.packages?.[`node_modules/${packageName}`]?.version ||
  "ERROR: Not found in package-lock";
```

And critically, framework **discovery itself** requires both files to exist —
`isFrameworkDir()` (same file, line 48-54):

```js
return fs.existsSync(packageJSONPath) && fs.existsSync(packageLockJSONPath);
```

**A real npm-format `package-lock.json` is mandatory** — not optional, not
"recommended" as the wiki phrases it (the wiki's phrasing is about *including it in
the PR*; the server-side loader treats its absence as a hard discovery failure). A
Bun `bun.lock` will not be read by this code path at all.

### Required npm scripts

Only `build-prod` is contractually required (`npm install && npm run build-prod`
must produce an openable build) — confirmed in README §4.4 rule 3: "Each contribution
must be buildable by `npm install` and `npm run build-prod` command in the directory."
`dev` is common convention (seen in solid, lit) but not required.

### `index.html` requirements

- Must link the shared global stylesheet: `<link href="/css/currentStyle.css" rel="stylesheet" />`
- Must use Bootstrap classes matching vanillajs's structure exactly, including all
  `aria-hidden` attributes — "The html must be identical with the one created by the
  reference implementation vanillajs" (README §4.4, tied to issue [#634](https://github.com/krausest/js-framework-benchmark/issues/634) if violated)
- Must preload the glyphicon somewhere: `<span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>` — "or you will get terrible performance"
- Action-trigger button IDs, fixed, do not rename: `#run`, `#runlots`, `#add`,
  `#update`, `#clear`, `#swaprows`
- Row DOM shape is enforced by `webdriver-ts/src/isKeyed.ts::checkTRcorrect`, which
  asserts the tr's flattened descendant-element sequence is exactly
  `["td","td","a","td","a","span","td"]` with classes `td.col-md-1` (id),
  `td.col-md-4` (label, wraps `a`), `td.col-md-1` (remove, wraps `a>span` with
  `aria-hidden="true"` and `span` classes `glyphicon glyphicon-remove`), `td.col-md-6`
  (empty spacer). **This matches aihu's current `rowNode()` structure exactly.**
- Do not change ids in `index.html` — "the automated benchmarking relies on those ids."
- No `dist/` gzip artifacts — the static server "prefers these when they exist" and
  will silently serve stale content.
- No pre-install/post-install scripts in `package.json` — explicit rule in
  `copilot-instructions.md` §Review-PR step 3 (supply-chain hardening; this is why the
  maintainer builds on an isolated VPS at all).

## 3. Keyed vs non-keyed — determination and verification

Determined by **directory** (`frameworks/keyed/` vs `frameworks/non-keyed/`) combined
with a **declared** `framework.keyed` flag the runner infers from that directory, then
**behaviorally verified** by `webdriver-ts/src/isKeyed.ts`. The check instruments the
DOM with a `MutationObserver` and, for three operations, asserts:

- **run** (create 1000 → 2000 rows): `tradded >= 1000 && trremoved >= 1000` — TRs must
  actually be destroyed/recreated for a full replace, not reused
- **remove** (delete row 2): the *stored* `<tr>` reference must be the one physically
  removed (`removedStoredTr`)
- **swaprows**: `tradded > 0 && trremoved > 0 && newNodes == 0` — the two existing
  `<tr>` nodes must be *moved* (removed+reinserted, same node identity), not
  destroyed-and-recreated

If `framework.keyed !== (keyedRun && keyedRemove && keyedSwap)`, the check prints
`ERROR: Framework ... is not correctly categorized` and the CLI exits 1
(`webdriver-ts/src/isKeyed.ts`, `if (!allCorrect) process.exit(1)`).

**Misclassification consequence**: not a soft warning — it's a hard build/CI-check
failure that blocks merge. Real example: PR #2014 (LytJS) was told by the maintainer,
verbatim: *"Your implementation isn't really keyed... Keyed test for swap failed. Swap
must add the TRs that it removed, but there were 1000 new nodes... It'll appear as
non-keyed in the results."* PR #1971 (Abies) failed the same swap-keyed check during
the maintainer's actual merge attempt.

Command to self-check: `cd webdriver-ts && npm run isKeyed keyed/aihu` (add
`-- --headless true` to match how the maintainer runs it per the wiki).

## 4. Implementation rules / "no cheating"

Direct quotes from README §4.4 ("Please don't over-optimize...We've sharpened the
rules... will add errors or notes when an implementation handles things wrongly
(errors) or in a way that looks like a shortcut (notes)"):

| # | Rule (verbatim) | Consequence |
|---|---|---|
| — | "This benchmark is most useful if you apply an idiomatic style for the framework you're using." | governing principle |
| [#634](https://github.com/krausest/js-framework-benchmark/issues/634) | HTML must be byte-identical in structure/classes/aria-hidden to vanillajs | **error**, blocks merge |
| [#694](https://github.com/krausest/js-framework-benchmark/issues/694) | Keyed impls must pass `isKeyed`; "not sufficient, but just necessary" (loopholes exist) | **error**, blocks merge |
| [#796](https://github.com/krausest/js-framework-benchmark/issues/796) | `requestAnimationFrame` in client code, "especially when applied only for some benchmark operations" | note (using RAF for *all* ops is allowed; selective RAF is "considered cheating," cites #166 #430) |
| [#772](https://github.com/krausest/js-framework-benchmark/issues/772) | Manual DOM manipulation in end-user code (e.g. setting the `danger` class directly instead of through a binding) | note — "controversial," expected to score close to vanillajs |
| [#800](https://github.com/krausest/js-framework-benchmark/issues/800) | Per-row selection flag instead of one reference/id/index in shared state | note |
| [#801](https://github.com/krausest/js-framework-benchmark/issues/801) | Explicit event delegation written in client code (framework-internal delegation is fine) | note |
| [#1261](https://github.com/krausest/js-framework-benchmark/issues/1261) *(found in copilot-instructions.md, not yet in root README's rule list)* | Manual caching of (virtual) DOM nodes for perf | note |

The `issues` array in `package.json`'s `js-framework-benchmark` block is literally
where you (or the maintainer, during merge) declare which of these apply — see the
`lit` example (`"issues": [801]`, for its explicit event handling). An **undeclared**
note found later gets added by the maintainer directly into your `package.json` as
part of the merge commit (`copilot-instructions.md`, Build-PR step 6: "Before
committing, add any detected notes... to the `issues` array"). Declaring an issue
number that ISN'T in the results app's hardcoded `knownIssues` list
(`webdriver-ts-results/src/helpers/issues.ts`: currently 634, 772, 796, 800, 801,
1139, 1261) causes the framework to be silently filtered out of the results **table**
while still appearing in the framework-selector dropdown — a confusing failure mode
(`docs/RESULT_CREATION.md`, "Known Issues System").

Additional hard rules from README §4.4:
- "Do not start your implementation using vanillajs as the reference" — it's flagged
  #772 by definition and is explicitly called out as *not* a best-practice template.
  (aihu's current impl is hand-rolled against `@aihu/signals`/`@aihu/arbor` directly —
  worth checking this doesn't read as "vanillajs-with-extra-steps"; see §9.)
- Shadow DOM: avoid; if used, disable it so global CSS/Bootstrap still applies.

## 5. Dependency constraints

- **Fixed version numbers, no ranges**, in `package.json`: "Please use *fixed version*
  numbers, no ranges... Otherwise the build will break sooner or later - believe me."
  (README §4.4) — **Note**: this is stated as an absolute rule, but the *actual*
  merged `solid` and `lit` package.jsons currently in the repo both use caret ranges
  (`"solid-js": "^1.9.3"`, `"lit": "^3.0.0"`) in `dependencies`, and caret ranges
  throughout `devDependencies`. Real practice is looser than the stated rule for
  well-known, stable packages; treat "fixed version" as the safe default to follow,
  not something enforced mechanically.
- **Must be resolvable via a real npm install** — `workspace:*` (Bun/pnpm workspace
  protocol) cannot appear in the submitted `package.json`, because (a) the benchmark's
  own tooling runs plain `npm install`/`npm ci` against the framework directory in
  isolation outside any monorepo, and (b) the version-resolution loader reads
  `package-lock.json`, which `npm install` generates from real registry resolution,
  not from a workspace symlink.
- **Packages must be public and reachable** — `copilot-instructions.md` Review-PR
  step 4: "Check if the rendering library is available via npm and github. If not
  report a warning." Confirmed as a real rejection path: PR #1989 (Lattice) was
  closed because the linked GitHub repo returned HTTP 404.
- **`@aihu/signals`, `@aihu/arbor`, `@aihu/runtime` are already published to npm**
  (verified via `registry.npmjs.org` 2026-07-25: `@aihu/signals@0.4.0`,
  `@aihu/arbor@3.0.0`, `@aihu/runtime@4.0.0`, matching the versions in this repo's
  `CHANGELOG.md` for `bench/js-framework-benchmark/keyed/aihu`). This means the
  dependency-publication precondition is **already satisfied** — the remaining work
  is purely mechanical (swap `workspace:*` → pinned published versions, run a real
  `npm install` in the framework dir to produce an npm-format `package-lock.json`).
- **Security audit is part of merge review**: "Perform a security audit especially
  regarding supply chain attacks... Malicious packages are inacceptable." The
  maintainer explicitly will not bump versions on your behalf if issues are found —
  they report and stop.

## 6. Validation before submitting — exact commands

From the repo root, after `npm ci && npm run install-local` once:

```bash
# 1. Manual click-test first (README §4.1 step 8) — open in browser, verify:
#    create 1k/10k, append, update every 10th, clear, swap, select, remove all work.
npm start   # serves the whole tree including your new frameworks/keyed/aihu/

# 2. Keyed-classification check — must print no ERROR
cd webdriver-ts
npm run isKeyed keyed/aihu
# maintainer's actual invocation adds explicit runner/headless flags:
npm run isKeyed -- --runner playwright --headless true keyed/aihu

# 3. Full local benchmark run (optional but recommended) — sanity numbers
npm run bench -- --framework keyed/aihu keyed/vanillajs
cd .. && npm run results
# open webdriver-ts-results/dist/index.html (server from step 1 must still be running)

# 4. THE authoritative pre-submission gate — from repo root:
npm run rebuild-ci keyed/aihu
# = node cli.js rebuild-single --ci -f keyed/aihu
# internally runs, per cli/rebuild-check-single.js:
#   npm run bench -- --runner playwright --headless true --smoketest true keyed/aihu
#   npm run isKeyed -- --runner playwright --headless true keyed/aihu
# Success is this exact string:
#   "All checks are fine!"
#   "======> Please rerun the benchmark: npm run bench keyed/aihu"
# Anything else (including "checkElementExists failed") = do not submit.
```

Note: `rebuild-ci` requires `npm ci` to succeed, which requires a valid
`package-lock.json` already checked into the framework directory in your PR — this is
the same constraint as §2/§5, just enforced at validation time instead of discovery
time.

`npm run rebuild-ci` (no `--ci`) is the variant to use if you *don't* have a
lockfile yet and want it regenerated via `npm install` instead of `npm ci` — but the
PR you submit should include the resulting `package-lock.json` either way, since
that's what the results loader reads.

## 7. What gets published and when

- No fixed cadence. Merges happen on the maintainer's schedule; per the wiki, a single
  PR's build-review-merge cycle takes "something between minutes and hours" once the
  maintainer picks it up — but there's no SLA on when they pick it up.
- Official numbers ([krausest.github.io/js-framework-benchmark](https://krausest.github.io/js-framework-benchmark/index.html))
  come from full re-runs the maintainer performs on their own dedicated hardware, not
  from anything automatic on merge. A **"snapshot" page**
  ([current.html](https://krausest.github.io/js-framework-benchmark/current.html))
  exists that "may not have the same quality (i.e. results might be for mixed browser
  versions, number of runs per benchmark may vary)" — this appears to update more
  often than the official per-Chrome-version table, but I found no explicit statement
  of its refresh cadence. **Unverified**: how long after merge the snapshot updates,
  and how long until aihu appears on the *official* (not snapshot) table — likely tied
  to the next full Chrome-version benchmarking round, which historically happens on
  major Chrome releases (see the "History" section's per-Chrome-version archive
  entries in the README, e.g. chrome 131, 120, 119, 118).
- **Longevity risk once listed**: README's "History" section states frameworks are
  removed after "significant activity on github or npm for more than a year"
  lapses — meaning aihu must keep publishing/committing to stay listed, not just get
  merged once.

## 8. Common rejection reasons (from real closed/unmerged PRs)

Sampled recent closed-and-unmerged "Add X framework" PRs via `gh api search/issues`
(repo:krausest/js-framework-benchmark, type:pr, is:closed, is:unmerged) and read the
maintainer's actual comments:

| PR | Framework | Rejection reason (maintainer's own words) |
|---|---|---|
| [#2014](https://github.com/krausest/js-framework-benchmark/pull/2014) | LytJS | Missing `js-framework-benchmark` package.json section; failed `isKeyed` swap test ("Swap must add the TRs that it removed, but there were 1000 new nodes"); AI review flagged undeclared RAF use (#796) and manual DOM manipulation (#772); implementation didn't actually use the claimed library's advertised features |
| [#1989](https://github.com/krausest/js-framework-benchmark/pull/1989) | Lattice | Linked GitHub repo returned HTTP 404 — library not verifiably public |
| [#1986](https://github.com/krausest/js-framework-benchmark/pull/1986) | supergrain | Build failed outright; `isKeyed` check failed because the 1000th row never rendered (`tbody>tr:nth-of-type(1000)>td:nth-of-type(1)` was `undefined`); flagged as an unusual pattern — buttons/tbody pre-rendered as static HTML in `index.html` rather than by the framework, "which could affect benchmark validity" |
| [#1971](https://github.com/krausest/js-framework-benchmark/pull/1971) | Abies | HTML structure mismatch — extra `<span>` elements inside `<td>`s broke `checkTRcorrect`'s exact element-sequence assertion; also failed the keyed-swap test |

Cross-cutting pattern: **every one of these failures is mechanically caught by the
exact validation commands in §6** (`isKeyed`, `rebuild-ci`'s `checkTRcorrect`,
smoke-test element lookups). None were subjective "we don't like this framework"
rejections — they were all things a contributor could have caught by running
`npm run rebuild-ci keyed/<name>` before opening the PR. The one non-mechanical
rejection (#1989, dead link) is a due-diligence gap, not an implementation bug.

---

## 9. GAP TABLE — aihu's current state vs. requirements

Local implementation reviewed: `bench/js-framework-benchmark/keyed/aihu/` —
`package.json`, `index.html`, `src/main.ts`, `vite.config.ts`, `README.md`,
`moon.yml`, and the sibling `.github/workflows/js-framework-benchmark.yml` (which
runs the same flow against a fresh krausest checkout via `workflow_dispatch`, for
internal regression-detection — not the upstream submission path).

| Requirement | aihu status | What must change |
|---|---|---|
| Directory `frameworks/keyed/<name>/` | N/A — lives at `bench/js-framework-benchmark/keyed/aihu/` in aihu's own repo | Not a gap for *this* repo; becomes a copy/PR step when submitting into a krausest checkout (the repo's own README already documents this staging flow) |
| `package.json` → `js-framework-benchmark.frameworkVersionFromPackage` | Present: `"@aihu/runtime"` | OK as-is |
| `package.json` → `frameworkHomeURL` | Present: `"https://aihu.dev"` | OK as-is |
| `package.json` → `language` | **Missing** | Add `"language": "TypeScript"` (convention, not enforced, but every comparable example has it) |
| `package.json` → `issues` | `[]` | Revisit after auditing for notes #772/#796/#800/#801 (see row below); likely stays `[]` |
| **Dependencies use `workspace:*`** | `@aihu/signals`, `@aihu/arbor`, `@aihu/runtime` all pinned as `"workspace:*"` | **BLOCKING.** Must become fixed published versions, e.g. `"@aihu/signals": "0.4.0"`, `"@aihu/arbor": "3.0.0"`, `"@aihu/runtime": "4.0.0"` — confirmed these versions are live on npm today |
| **`package-lock.json`** | **Does not exist** — repo uses Bun workspaces (`bun.lock` at the monorepo root, not per-package) | **BLOCKING.** Krausest's own framework-discovery code (`isFrameworkDir`) requires a real npm-format `package-lock.json` in the framework directory; the version-resolution loader reads it directly. Must run a real `npm install` against the depublished-dependency `package.json` outside the Bun workspace to generate one, and commit it |
| `"private": true` in package.json | Present | No rule found forbidding it (searched README + all fetched docs) — **unverified but low risk**. Since `frameworkVersionFromPackage`/`frameworkVersion` and `build-prod` are what's actually checked, this field appears cosmetic to the harness. Leave as-is unless a maintainer flags it |
| `build-prod` script | Present: `vite build` | OK as-is |
| `index.html` — button IDs, structure, glyphicon preload, global CSS link | Present and matches krausest's own example almost verbatim (confirmed by diffing against `frameworks/keyed/vanillajs/index.html`'s button block) | OK as-is, contingent on the rendering actually working (see next row) |
| Row DOM shape (`td.col-md-1/4/1/6`, `a.lbl`, `a.remove>span.glyphicon`, `aria-hidden`) | `rowNode()` in `src/main.ts` builds exactly `branch('tr')` → `[td.col-md-1, td.col-md-4→a.lbl, td.col-md-1→a.remove→span, td.col-md-6]`, matching `checkTRcorrect`'s expected sequence `["td","td","a","td","a","span","td"]` | **At risk, not yet broken by design** — see next row. If the compiler/runtime is currently emitting *no* DOM output (0.00ms bug), this correct-on-paper structure may not be materializing in the actual rendered page at all |
| **Keyed classification (`isKeyed`)** | Implementation is genuinely keyed by design: `each(data, r => r.id, rowNode)` reconciles by id, `swaprows` reassigns array positions (should trigger node moves), `remove` filters the signal (should trigger exactly the removed node's teardown) | **At risk** — same caveat as above. `isKeyed`'s instrumentation watches real DOM mutation records; if `arbor`'s `each`/`mount` isn't producing DOM nodes at all post-#484/#489 (per the concurrent 0.00ms-everywhere finding, run 30162344830), the swap/run/remove keyed-ness can't even be measured, let alone pass |
| **Selective RAF (note #796)** | No RAF calls anywhere in `src/main.ts` | OK — no note expected |
| **Manual DOM manipulation (note #772)** | All row mutation goes through signals (`label`, `classSig`) bound via `branch`/`leaf`, not direct `.className =` or `.textContent =` calls in `main.ts` | OK as written — but this note is specifically about *end-user code* bypassing the framework; if the underlying primitives are broken (0.00ms bug) this can't be confirmed end-to-end right now |
| **Per-row selection flag (note #800)** | `select()` uses one `selected: Row \| null` module-level reference, touches only the previous and new row's `classSig` — matches the required pattern exactly | OK — no note expected |
| **Explicit event delegation (note #801)** | Each row's `a.lbl`/`a.remove` gets its own `onclick` via `branch`'s attribute binding (framework-level, not a container-level manual delegate-and-dispatch) | OK as written, same caveat as #772 row |
| **"Don't use vanillajs as your reference" concern** | README §9.5 (repo's own doc) explicitly frames this as "framework cost only — no SFC sugar" and hand-rolled against runtime primitives with no compiler | **Worth a second look before submitting.** This is exactly the shape krausest's README warns against as a starting point (raw, low-abstraction, closest to vanillajs). It's defensible as "this is genuinely how the framework's primitives work," same as `solid`'s low-abstraction reactive-primitive style is accepted — but it increases scrutiny risk and makes a #772-adjacent maintainer objection more likely if the review is stringent. Not a blocker, but be ready to justify it as idiomatic rather than shortcut-optimized |
| Pre/post-install scripts in `package.json` | None present | OK as-is |
| Gzip files left in `dist/` | `vite.config.ts` has no compression plugin configured | OK as-is, verify empirically once builds resume working |
| **Validation actually run against upstream harness** (`npm run rebuild-ci keyed/aihu`) | Not run — this repo's own `README.md` for the bench directory documents the staging steps but there's no evidence in this session of a green `rebuild-ci` result, and the CI workflow's own purpose statement calls its numbers noisy/non-authoritative, not a submission gate | **BLOCKING**, and gated behind the 0.00ms investigation. Cannot be truthfully run until whatever produces 0.00ms-across-the-board is fixed — a harness that reports 0.00ms for every op is either not finding real DOM mutations (same failure mode `isKeyed` would independently catch) or the runner isn't driving the page at all |

### Blocking gaps, summarized

1. `workspace:*` deps → must be pinned, published npm versions (mechanical, low
   effort — the packages are already public)
2. Missing `package-lock.json` in a real npm format (mechanical, but must be
   generated *outside* the Bun workspace against the pinned versions)
3. Whatever is causing the 0.00ms-everywhere measurement (run 30162344830, owned by
   another agent) — until resolved, **no amount of package.json/lockfile fixing makes
   this submittable**, because `rebuild-ci`'s smoke test and `isKeyed`'s DOM-mutation
   instrumentation will both fail if the app isn't actually rendering/updating the
   DOM. This doc does not attempt to diagnose or fix that; it only flags which
   upstream requirements it puts at risk (row DOM shape, keyed classification, and
   the rebuild-ci gate itself, per the table above).

**Total: 3 blocking gaps** (dependency pinning, lockfile generation, and the
render/measurement regression as a hard precondition for the other two mattering).
`language` field and the "don't look like vanillajs" scrutiny risk are non-blocking
but worth doing in the same pass.

## 10. Recommended sequence

1. **Do not touch this in parallel with the 0.00ms investigation** — it owns
   `bench/js-framework-benchmark/**`. Wait for that fix to land and confirm (locally,
   via the existing `js-framework-benchmark.yml` workflow_dispatch, or a manual click
   test) that the app actually creates/updates/removes DOM rows with real timing
   numbers.
2. Once rendering is confirmed working: swap `workspace:*` → pinned versions matching
   what's live on npm at that time (`@aihu/signals`, `@aihu/arbor`, `@aihu/runtime`);
   add `"language": "TypeScript"`.
3. Generate a real `package-lock.json` for `bench/js-framework-benchmark/keyed/aihu/`
   by running `npm install` (not `bun install`) against the pinned-version
   `package.json` in isolation (a temp copy outside the Bun workspace avoids Bun's
   root lockfile fighting with npm's).
4. Clone krausest fresh, stage the built `dist/` + this `package.json` +
   `package-lock.json` into `frameworks/keyed/aihu/` there (the existing
   `bench/js-framework-benchmark/keyed/aihu/README.md` already documents this staging
   flow, steps 1-9 — reuse it), and run the actual gate:
   `npm run rebuild-ci keyed/aihu` from the krausest repo root. Fix anything it
   reports before going further.
5. Run `npm run isKeyed keyed/aihu` explicitly and confirm no ERROR line.
6. Do a full manual click-test per README §4.1 step 8 (all 8 operations) with the
   krausest static server actually serving the page — this is the step that caught
   #1986's "1000th row never rendered" failure, which `rebuild-ci`'s smoke test alone
   might not have caught as clearly.
7. Open the PR containing only `frameworks/keyed/aihu/` (no root files, no
   `webdriver-ts` changes), linking `https://aihu.dev` and this framework's home
   README for context. Expect either a clean merge or maintainer/Copilot notes
   pointing at one of the note categories in §4 — treat those as expected review
   friction, not rejection.
8. After merge, there's no fixed timeline for appearing in the *official* results
   table (§7) — it depends on the next full benchmarking round the maintainer runs.
   The `current.html` snapshot may update sooner but its cadence is unverified.
