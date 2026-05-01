# airtime-quote

A minimal `.scribe` SFC demonstrating the Phase 1 `<agent>` block: enum + number inputs, a state declaration, and a single action with a typed returns block. Compile with `./packages/compiler/target/release/scribe-compile examples/airtime-quote/airtime-quote.scribe --out examples/airtime-quote/dist/`. The compiler emits `airtime-quote.ts` (the custom-element module) and `agent-manifest.json` (the MCP tool descriptor — `name: "airtime_quote"`, `tag: "airtime-quote"`, two inputs, one action). Use this example as the canonical reference when reading `docs/grammar.md`.
