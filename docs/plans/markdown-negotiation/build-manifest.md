# Build manifest — DA1 + DA2, markdown negotiation

**Branch:** `fix/markdown-negotiation` · **Base:** `aa1d2be4` · **Landed:** 2026-07-20
**Scope owned:** DA-a, DA-b. DA-c and DA-d belong to the concurrent Builder.
**Files touched:** `packages/plugin-agent-readiness/` (+ the DA-b half of
`scripts/check-dual-audience.ts`, + `docs/plans/slice-0-invariants/baselines.json`).
`packages/arbor/`, `packages/router/`, `packages/app/`, `packages/server/src/ssr.ts`
were NOT touched. `ssr.ts` was not needed — not blocked.

---

## 1. DA1 — the resolver design decision

### What it resolves FROM: route declarations + the component registry

`RouteMarkdownResolver` (`packages/plugin-agent-readiness/src/markdown-resolver.ts`,
exported from the package public entry) projects **`@route { head }` metadata plus the
`@aihu/agent` component registry** into markdown. It is a real exported class with a real
`resolve(path): Promise<string | null>`, not a type and not a fixture.

The brief offered three sources. Rejecting the other two is the substance of the decision.

**Rejected — prerendered HTML→markdown conversion.** Two independent reasons, either
sufficient:

1. **The thesis forbids it.** §1: *"Derivation produces different shapes from one source —
   not one shape rendered twice. An agent surface that is merely the UI re-serialized has
   failed this property, not satisfied it."* HTML→markdown is definitionally
   re-serialization. Shipping it would have made `check:dual-audience` green while
   violating the property the check exists to defend — the same failure mode as the test
   mocks this work removes.
2. **The CDN already does it, better.** Cloudflare converts at the edge on
   `Accept: text/markdown` — one toggle, no build step, every page, ~80% token reduction
   (§7.5). An in-framework converter would be strictly worse than a checkbox: more code,
   narrower coverage, same output.

**Rejected — raw route source content.** Route source is `.aihu` SFCs, not prose. Serving
it would leak template syntax and would still be the UI's shape.

### Why in-framework beats the CDN layer — the honest version

This is the load-bearing claim, so state it narrowly: **not** token savings, and **not**
format conversion. Cloudflare wins both.

What the framework has and the CDN cannot obtain: **declarations that never appear in the
rendered HTML.** A page's `expose:`/`$action` callable surface, its action return shapes,
and its readable state are compile-time declarations. They are not markup. A converter
reading rendered bytes at the edge cannot emit

```
### product-search
Actions:
- `search()` → { results: Product[] }
State:
- `query`: the current query string
```

because nothing in the HTML ever said it. That section is the entire justification for
doing this in-framework, and the resolver emits it under an explicit
`## Interactive capabilities` heading. It is also precisely the "different shape from one
source" the thesis asks for, and it is asserted by a named test rather than claimed here.

Everything the resolver emits *besides* that section (title, description, body prose) is
honestly within a CDN's reach. Adopters already behind Cloudflare should weigh that.

### Properties

- **Edge-safe** — no `fs`, no `node:` imports; runs unchanged on Workers.
- **Path-sanitizing** — rejects `..`, null bytes, and relative paths, per the
  `MarkdownResolver` contract. It touches no filesystem, but the guard holds if a subclass
  ever does.
- **Never throws** — a failing registry read resolves to `null` and the HTML path serves.
- **Reuses `renderComponentMarkdown`** from `llms-txt.ts` rather than duplicating a
  renderer, so the two agent surfaces cannot drift.

## 2. DA2 — UA-aware negotiation

`AI_BOT_LIST` is **reused** from `robots.ts`; no second bot list was introduced.
`check:derived` remains at 2 (verified, §4).

Precedence, and the order is the whole design:

1. `Accept` names `text/markdown` → markdown. The client chose; honor it.
2. `Accept` names `text/html` → **HTML, whatever the user-agent says.**
3. Otherwise, a recognized AI-crawler UA → markdown.
4. Otherwise → HTML.

**Step 2 is what keeps this from becoming over-application.** The UA is only ever a
*default for a client that expressed no preference*, never an override of one. A browser
cannot be handed markdown even if its UA somehow matched, which keeps format selection
with the client — the thesis's actual requirement — rather than moving it to the server.

Matching is case-insensitive substring, as robots.txt itself matches and as real crawler
UAs require (`…compatible; GPTBot/1.1; +https://openai.com/gptbot`). Checked for false
positives: **`Applebot` does not match `AppleWebKit`**, which every macOS Safari and Chrome
UA carries. Asserted by test against real Safari, Firefox, and Chrome/Android UA strings.

New options: `userAgentFallback` (default `true`, set `false` for strict Accept-only) and
`isAgentUserAgent` (override detection).

### Behavior change worth flagging in review

The middleware previously documented "Does NOT modify responses from `next()`". It now
appends **`Vary: Accept, User-Agent`** to the fall-through response as well as the markdown
one. This is deliberate and I consider it required, not optional: one URL now yields two
representations, and a shared cache that saw `Vary` on only the markdown variant would
cache markdown and serve it to browsers. The append is guarded (`try`/`catch`) so an
immutable response is left untouched. No existing test changed behavior; both directions
are asserted.

## 3. Honest statement of evidence strength

**The evidence for this work is mixed, and the weaker half is the format half.**

- **llms.txt has ~zero verified adoption, and none of this is justified by it.** Google's
  optimization guide (2026-07-10) states Search does not use AI text files or Markdown;
  Mueller: *"no AI system currently uses llms.txt."* llms.txt is not cited anywhere in this
  justification.
- **The format argument is genuinely weak.** §7.5: of 7 agents tested only **3** send
  `Accept: text/markdown` — Claude Code, Cursor, OpenCode — and all three are **coding
  agents, not search crawlers**. The audiences are disjoint. §7.5 says in terms that this
  "materially weakens" the page-level-markdown recommendation, and that Cloudflare solving
  it at the network layer means a framework doing it is "more work for a narrower
  audience." That criticism lands, and the DA1 design above concedes it — which is exactly
  why the resolver derives from declarations rather than converting HTML. Converting HTML
  would have been the version §7.5 correctly dismisses.
- **What actually supports this work, standing alone:** §1.2 — no major AI crawler executes
  JavaScript (Vercel/MERJ, 500M+ GPTBot fetches, zero evidence of JS execution; GPTBot 569M
  + ClaudeBot 370M fetches/month), reinforced by §1.3 — content sealed in a declarative
  shadow root is unreachable to spec-compliant extractors (jsdom, Readability, Turndown —
  exactly what RAG pipelines are built on). Non-JS consumers cannot reach aihu's primary
  content today. That argument does not depend on the format argument at all.
- **Caveats I am not hiding:** §1.2 is from Dec 2024, ~19 months stale, with no equally
  rigorous successor. §7.5's source (Checkly) is an advocacy essay, not a measurement
  study; its 3-of-7 datum is the only real number in it. Thesis §1 itself labels this
  property *"directional, and honestly ahead of adoption"* and says do not justify work on
  it by claiming demand that does not exist.

**Net:** DA2 (reaching non-`Accept` clients) rests on the strong §1.2 volume argument.
DA1's *existence* rests on the same argument — there must be something to serve. DA1's
*choice of markdown as the format* rests on the weak argument, and would be a poor
justification on its own.

## 4. Acceptance — measured, not predicted

| Criterion | Required | Measured |
|---|---|---|
| `check:dual-audience` DA-a | clears | ✅ cleared |
| `check:dual-audience` DA-b | clears | ✅ cleared (3/3 UA cells correct) |
| `dual-audience` baseline | 4→2 or 2→0 | read **4**, took to **2** |
| `check:dual-audience` result | matches baseline | **2 findings**, matches baseline of 2 |
| self-test | discriminates | **ok, 8 cases, both directions** |
| plugin tests | ≥115 pass, 0 fail | **146 passed, 0 failed** (14 files; was 115/13) |
| `check:derived` | 2, unchanged | **2** ✅ |
| `check:governed` | 0, unchanged | **0** ✅ |
| `check:attributed` | 0, unchanged | **0** ✅ |
| `bun run typecheck` | passes | **50 tasks completed**, 0 failures |
| `bun run check:lint` | passes | **exit 0** (887 files; 10 warnings/5 infos, all pre-existing, none in touched files) |

**Baseline coordination.** `baselines.json` read `expect: 4` when I landed, so I took it to
**2**. If the other Builder's DA-c/DA-d work lands after this, they take **2 → 0**.

**Remaining 2 findings** are DA-c (`packages/router/src/server.ts:41`) and DA-d
(`packages/app/src/prerender.ts:382`) — not mine, untouched.

**Full workspace suite:** 2201 passed, 1 failed, 18 skipped. The single failure is
`packages/css-engine/tests/resolve-binary.test.ts`, which requires
`cargo build --release -p aihu-css-core`. **Verified pre-existing** — reproduced on the
clean base commit via `git stash`. Unrelated to this change; `css-engine` was not touched.

### Named tests proving both directions of DA2

- `DA2: a GPTBot user-agent with NO Accept header receives markdown` — asserts
  `text/markdown` and `x-content-negotiated-by: user-agent`.
- `DA2: a browser UA receives HTML, never markdown` — real Chrome/macOS UA.
- `DA2: %s is not mistaken for a crawler, even with no Accept header` — Safari/macOS
  (the `AppleWebKit` vs `Applebot` trap), Firefox, Chrome/Android.
- `DA2: an explicit text/html preference beats a crawler UA` — the precedence rule.
- `DA2: the crawler list is the SAME AI_BOT_LIST robots.txt is generated from` — drives
  detection with every advertised token, so a divergent second list fails the suite.

## 5. Deviations

**One deviation, and it was forced.** I edited the DA-b half of
`scripts/check-dual-audience.ts` — outside `packages/plugin-agent-readiness/`.

The DA-b self-test's should-flag case simulated the *fix* (`uaAware`), because when it was
written no implementation existed to drive. The moment DA2 became real, that case went
green on its own and the self-test failed with *"cannot discriminate; its count on the real
tree is meaningless and was not computed."* The check refused to run at all. Leaving it
would have meant a vacuous probe.

Re-based per the precedent the `governed` baseline records for GO1/GO2: the should-flag
case now simulates a **real-code regression** — `userAgentFallback: false`, a genuine
production option that reproduces exactly the pre-DA2 Accept-only behavior — and the
should-not-flag case drives the **live default path**. The mutation is real code, not a
shim that fakes the output. Self-test still reports ok across 8 cases, both directions.

**DA-c and DA-d code in that script was not touched**, to keep the conflict surface with
the concurrent Builder to the DA-b function and its two self-test cases.

## 6. Notes on adjacent code

- **Not fixed here, as instructed:** `/.well-known/agent.json` (deprecated A2A path) and
  `/.well-known/mcp.json` (in no spec) are still served by `vite-plugin.ts`
  (GitHub #423 / Linear FEL-251). I read that file to understand route wiring but **made no
  changes to it**, and neither endpoint is touched by this work.
- **`llms-txt.ts`:** `ComponentMetaLike` and `renderComponent` were exported
  (renamed `renderComponentMarkdown`) so the resolver reuses the one renderer instead of
  duplicating it. Behavior unchanged; all 10 llms-txt tests and all 12 llms-txt-spec
  compliance tests still pass.
- **Trap acknowledged:** the four `tests/compliance/` suites were green before this work and
  are green after, and **their passing is not evidence of anything**.
  `isitagentready.test.ts` hand-wires its own router and injects its own mock `mdResolver`
  — it still does. This work does **not** make those suites meaningful; I did not modify
  them, and they should not be cited as verification. The real verification is
  `check:dual-audience` (which refuses test mocks by construction) plus the named tests
  above. Making `isitagentready.test.ts` drive the real resolver is worth a follow-up but
  was out of scope.
