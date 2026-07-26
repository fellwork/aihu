---
'@aihu/cli': patch
---

Fix the agent template's own typecheck failing on a fresh scaffold.

`npm create aihu --template agent` then `npm run typecheck` — the script the
template emits, and the one its own next-steps output tells you to run —
failed immediately with 12 errors:

```
mcp.ts(72,1):     error TS2868: Cannot find name 'Bun'.
server.ts(115,1): error TS2868: Cannot find name 'Bun'.
mcp.ts(74,9):     error TS7006: Parameter 'req' implicitly has an 'any' type.
```

The template emits `server.ts` and `mcp.ts` calling `Bun.serve()` while
declaring `types: ['node']` with nothing providing Bun's globals. Under
`strict: true` the missing namespace also made every callback parameter an
implicit-any, so one missing dependency produced twelve errors.

Adds `@types/bun` and `types: ['node', 'bun']`, plus `skipLibCheck` — required
because `@types/bun` and vite declare `ImportMeta.hot` incompatibly (TS2430)
with no user code involved.

Verified on both package managers: typecheck and build exit 0.
