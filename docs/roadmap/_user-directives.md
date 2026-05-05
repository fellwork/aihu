# User Directives — v1.1 Roadmap Planning

These are explicit user instructions that supersede architect autonomy where they conflict. Synthesizer must enforce.

## Directive 1 — Interactive playground on homepage is P0

**Issued:** 2026-05-05 mid-planning, after architects A1-A4 dispatched.

**Statement:** The homepage MUST embed an interactive Aihu playground. This is the flagship "flex of our code power" — the single artifact that proves the framework's value to a visitor in under 30 seconds. It is not a M3/M4 nice-to-have; it is M1 across all relevant work-streams.

**Implications by work-stream:**

- **A1 (website)** — Homepage IA: hero copy on top, full-width playground BELOW THE FOLD on mobile / SIDE-BY-SIDE with hero on desktop. Theme-aware. URL state preserves snippets so demos are shareable. Default snippet must demonstrate signals + agent block within 10 lines (the dual-audience thesis).
- **A2 (examples)** — Each official example must have a "Open in Playground" preset. The playground's example picker pulls from the curated set. Ship at least 6 preset snippets at M1.
- **A3 (plugins)** — When plugins are loaded into the playground, agent tools panel renders live AgentMetadata. This is the fastest way for a visitor to grok "humans + AI."
- **A4 (DX)** — The compile-in-browser path is the gating dependency. WASM build of `aihu-compile` (Rust → wasm-bindgen) needs to be M1 priority, not deferred. This may require accelerating the pre-built binary work to also produce a `.wasm` artifact in the same release pipeline.

**Acceptance criteria (Synthesizer to enforce in roadmap rollup):**
1. M1 includes a working playground — not a placeholder, not a mockup
2. Compile latency target: < 200ms for a 50-line `.aihu` source
3. Playground bundle size budget: < 1 MB initial JS (the compiler.wasm can lazy-load)
4. URL-encoded snippet sharing: works
5. Mobile responsive: editor + preview stack vertically below 768px
6. Six preset examples loaded at launch (counter, todo, agent-block, ssr, route, plugin)
