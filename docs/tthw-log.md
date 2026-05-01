# TTHW Log

Time-to-Hello-World measurements: how long it takes a developer to go from
`git clone` to a working `.scribe` component.

## Methodology

- **TTHW_UI**: time to a custom element rendering in browser
- **TTHW_MCP**: time to an agent calling the MCP tool

## Measurements

| Date | Setup | TTHW_UI | TTHW_MCP | Notes |
|------|-------|---------|----------|-------|
| _TBD_ | macOS, Bun 1.3.8 | _TBD_ | _TBD_ | First measurement after Lane D pre-built binaries land |

## Target

- TTHW_UI ≤ 5 minutes (cargo-build-not-required)
- TTHW_MCP ≤ 10 minutes
