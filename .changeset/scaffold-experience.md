---
'@aihu/cli': minor
---

Scaffold experience: agent tooling, honest per-build-target claims, teaching voice.

Adds `AGENTS.md`, `CLAUDE.md` (a one-line `@AGENTS.md` import, per Anthropic's
guidance) and `.mcp.json` to scaffolded projects, gated behind
`--no-agent-tooling` for users who want a clean tree. `.mcp.json` registers
`npx aihu mcp serve` — the `@aihu/mcp` server exposing `aihu_validate`
(compiles source, returns real diagnostics) and `aihu_example` (cookbook
recipes), so an agent working in a scaffolded project can check its own work
against the compiler instead of guessing at novel syntax.

Previously only the cf-team template emitted any of this; the built-in
templates shipped `.vscode/*` and nothing else.

Also corrects what a static build claims about itself. The starter page said
"These actions are exposed to AI agents as MCP tools" and linked an MCP server
card — neither true for a client build, where `emit.rs`'s `elide_agent` strips
agent metadata by design. It now distinguishes the declaration a static build
genuinely publishes from the live, callable tools a server provides.
