# js-framework-benchmark · keyed/aihu

Hand-rolled aihu implementation of the [krausest js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) keyed protocol, built directly against `@aihu/signals` and `@aihu/arbor` with no compiler/SFC layer.

The runtime in flight is what consumers actually ship. Numbers from this directory are framework cost only — no SFC sugar, no defineComponent overhead.

## Layout

```
keyed/aihu/
  index.html       # krausest-standard markup (button IDs, table, preload icon)
  src/main.ts      # signal/each-driven impl of the 8 keyed operations
  package.json     # workspace deps; build-prod = vite build
  vite.config.ts   # ./-relative base, terser minify
  tsconfig.json    # ES2022 / DOM / strict
```

`index.html` button IDs (`run`, `runlots`, `add`, `update`, `clear`, `swaprows`) are fixed by the krausest WebDriver runner — do not rename.

## Implementation notes

- Row state is a `Signal<Row[]>` reconciled by `each(list, r => r.id, rowNode)`. The `each` reconciler is keyed by `id`, so `swaprows` and per-row `remove` move existing DOM nodes instead of re-mounting.
- Per-row `label` is its own `Signal<string>`. `update` writes 100 labels (every 10th row of 1,000); each write triggers a single `nodeValue` patch, not a re-render of the row.
- Per-row `classSig` is its own `Signal<string>`. `select` writes two signals (clear prior + set new), not a list update.
- `remove` writes a filtered array to `data`; `each` removes exactly the keyed scope for the dropped id.

## Run locally against the krausest harness

```bash
# 1. From repo root: build workspace deps the impl pulls from.
bun install
bun run --filter @aihu/signals build
bun run --filter @aihu/arbor build
bun run --filter @aihu/runtime build

# 2. Build this impl.
cd bench/js-framework-benchmark/keyed/aihu
bun install
bun run build-prod
# → produces dist/index.html + dist/assets/index.js

# 3. Clone krausest somewhere outside the repo.
cd /tmp
git clone --depth 1 https://github.com/krausest/js-framework-benchmark.git jsb

# 4. Stage this impl into the harness.
#    Note the trailing `/.` — the harness serves
#    frameworks/keyed/aihu/index.html, NOT .../aihu/dist/index.html, so the
#    *contents* of dist/ must land in the framework root.
mkdir -p jsb/frameworks/keyed/aihu
cp -r ~/git/aihu/bench/js-framework-benchmark/keyed/aihu/dist/. jsb/frameworks/keyed/aihu/
cat > jsb/frameworks/keyed/aihu/package.json <<'EOF'
{
  "name": "js-framework-benchmark-aihu",
  "version": "0.1.0",
  "js-framework-benchmark": {
    "frameworkVersion": "0.1.0",
    "frameworkHomeURL": "https://aihu.dev",
    "issues": []
  },
  "scripts": { "build-prod": "echo prebuilt" }
}
EOF
# REQUIRED — see "The package-lock.json trap" below. Omit this and the whole
# run silently measures nothing.
cat > jsb/frameworks/keyed/aihu/package-lock.json <<'EOF'
{
  "name": "js-framework-benchmark-aihu",
  "version": "0.1.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": { "": { "name": "js-framework-benchmark-aihu", "version": "0.1.0" } }
}
EOF

# 5. Build the comparison floor. (krausest renamed this dir: it is `vanillajs`,
#    not `vanillajs-1-keyed`. Check `ls jsb/frameworks/keyed` before assuming.)
cd jsb/frameworks/keyed/vanillajs
npm install && npm run build-prod

# 6. Build the harness.
cd ../../..
npm install
cd webdriver-ts && npm install && npm run compile

# 7. Start the static server (in a separate terminal).
cd /tmp/jsb && npm start
# → listens on http://localhost:8080

# 8. VERIFY THE HARNESS CAN SEE US before spending 20 minutes on a run.
#    A 200 on index.html proves nothing — the runner discovers frameworks
#    only through GET /ls.
curl -s http://localhost:8080/ls | grep -q '"directory":"aihu"' \
  && echo "aihu is discoverable" \
  || echo "aihu NOT discoverable — the run would measure nothing"

# 9. Run the benchmark.
cd /tmp/jsb/webdriver-ts
npm run bench -- --headless true --count 10 \
  --framework keyed/aihu keyed/vanillajs
# Sanity check the log: "Frameworks that will be benchmarked [ 'aihu-v...' ]"
# must be non-empty. An empty [] means nothing ran, and the runner still
# exits 0 with "PlausibilityCheck: successful run".

# 10. Generate the comparison table.
npm run results
open ../webdriver-ts-results/dist/index.html
```

## The package-lock.json trap

The harness's framework scanner
(`server/src/frameworks/frameworksServices.ts` → `isFrameworkDir`) only lists a
directory on `GET /ls` when **both** `package.json` and `package-lock.json`
exist:

```ts
return fs.existsSync(packageJSONPath) && fs.existsSync(packageLockJSONPath);
```

We build with bun, so there is no npm lockfile to copy and it has to be
synthesized. If it is missing, the failure is completely silent and looks like
success:

- `frameworks/keyed/aihu/index.html` still serves `200`
- `GET /ls` omits aihu entirely
- `webdriver-ts` logs `Frameworks that will be benchmarked []`
- all 13 benchmarks print `0.00 ms` (that number is the wall-clock of a loop
  over zero frameworks, not a measurement)
- `PlausibilityCheck` has nothing to check, so it prints `successful run`
- the process exits `0`

This burned run [30162344830](https://github.com/fellwork/aihu/actions/runs/30162344830):
a green external benchmark that measured nothing. The workflow now asserts
`/ls` discovery before running and asserts non-zero medians in the result JSON
afterwards.

## Run via GitHub Action

The `.github/workflows/js-framework-benchmark.yml` workflow runs the same flow on a clean Ubuntu runner. Trigger from the Actions tab:

1. Actions → "js-framework-benchmark" → Run workflow
2. Inputs:
   - `iterations` — count per benchmark, default `10`
   - `compare-with` — space-separated krausest framework dirs under
     `frameworks/keyed/` (default `vanillajs`). A name that does not exist
     upstream now fails the run rather than being skipped with a warning.
3. Results land as artifacts: `jsb-raw-results/` (per-benchmark JSON) and `jsb-results-pages/` (rendered tables).

The workflow fails if the harness does not list `keyed/aihu` on `/ls`, if the
runner reports an empty framework list, or if any benchmark's median is zero or
its result JSON is missing. A green run now means real numbers were recorded.

CI runners are noisy by design; treat the GitHub Action numbers as regression detection, not headline performance. For trustworthy absolute numbers, run locally on a quiet machine on AC power.

## Submitting upstream

Krausest accepts framework PRs but is opinionated. Before opening one:

1. Stabilize this impl across a few releases.
2. Match upstream conventions (look at recent merged framework PRs for the current `package.json` shape — krausest's metadata fields and Vite version expectations evolve).
3. Open the PR adding `frameworks/keyed/aihu/` with a link to this directory and aihu.dev.
