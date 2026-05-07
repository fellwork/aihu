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
# → produces dist/index.html + dist/assets/main.js

# 3. Clone krausest somewhere outside the repo.
cd /tmp
git clone --depth 1 https://github.com/krausest/js-framework-benchmark.git jsb

# 4. Stage this impl into the harness.
mkdir -p jsb/frameworks/keyed/aihu
cp -r ~/git/aihu/bench/js-framework-benchmark/keyed/aihu/dist jsb/frameworks/keyed/aihu/
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

# 5. Build the comparison floor.
cd jsb/frameworks/keyed/vanillajs-1-keyed
npm install && npm run build-prod

# 6. Build the harness.
cd ../../..
npm install
cd webdriver-ts && npm install && npm run compile

# 7. Start the static server (in a separate terminal).
cd /tmp/jsb && npm start
# → listens on http://localhost:8080

# 8. Run the benchmark.
cd /tmp/jsb/webdriver-ts
npm run bench -- --headless true --count 10 \
  --framework keyed/aihu keyed/vanillajs-1-keyed

# 9. Generate the comparison table.
npm run results
open ../webdriver-ts-results/dist/index.html
```

## Run via GitHub Action

The `.github/workflows/js-framework-benchmark.yml` workflow runs the same flow on a clean Ubuntu runner. Trigger from the Actions tab:

1. Actions → "js-framework-benchmark" → Run workflow
2. Inputs:
   - `iterations` — count per benchmark, default `10`
   - `compare-with` — space-separated krausest framework dirs (default `vanillajs-1-keyed`)
3. Results land as artifacts: `jsb-raw-results/` (per-benchmark JSON) and `jsb-results-pages/` (rendered tables).

CI runners are noisy by design; treat the GitHub Action numbers as regression detection, not headline performance. For trustworthy absolute numbers, run locally on a quiet machine on AC power.

## Submitting upstream

Krausest accepts framework PRs but is opinionated. Before opening one:

1. Stabilize this impl across a few releases.
2. Match upstream conventions (look at recent merged framework PRs for the current `package.json` shape — krausest's metadata fields and Vite version expectations evolve).
3. Open the PR adding `frameworks/keyed/aihu/` with a link to this directory and aihu.dev.
