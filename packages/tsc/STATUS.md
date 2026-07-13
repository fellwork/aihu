# @aihu/tsc — WORK IN PROGRESS. DOES NOT WORK YET. DO NOT WIRE INTO `typecheck`.

## What is wrong

The virtual code never reaches the TypeScript program. Measured against the
fellwork web app (53 `.aihu` roots):

    aihu roots: 53 | got VIRTUAL code: 0 | left RAW: 53

TypeScript is parsing the **raw `.aihu` text** as TypeScript. So the diagnostics
it produces (105 "semantic", 86 "syntactic" at last run) are garbage — `TS1146
Declaration expected` pointing at `@state {` — not real findings. Anything this
tool currently reports is noise, and a passing run would mean nothing.

`src/index.ts` and `src/language-plugin.ts` are otherwise structurally complete:
config parsing, `proxyCreateProgram` wiring, the diagnostic filter, and the
line-preserving source mapping are all written. The break is specifically that
`LanguagePlugin.createVirtualCode` / `typescript.getServiceScript` are not
handing the generated surface to the program.

## Two things already learned the hard way

1. **`allowNonTsExtensions` is required.** Without it TypeScript rejects every
   `.aihu` root as an unsupported extension (TS6054 × 53) and checks nothing —
   and because that lands in `getOptionsDiagnostics()`, a caller that only reads
   the semantic set sees a clean **exit 0**. A green check over files the
   compiler refused to read is the precise failure this tool exists to remove.
   `run()` sets the flag and collects `getOptionsDiagnostics()` for this reason.

2. **A file whose SFC does not compile still gets a source file** — TypeScript
   parses its raw text — so "did it get a source file" is NOT a sufficient check
   for "was it type-checked". The `unchecked` guard in `run()` tests exactly that
   and is therefore wrong as written; it must test for the presence of virtual
   code instead.

## Where to pick up

Compare `src/language-plugin.ts` against a known-good Volar 2.4 consumer
(`vue-tsc`'s `@vue/language-core`) — specifically the `typescript.getServiceScript`
contract and whether the root virtual code must expose `embeddedCodes`. Verify
with the one-liner that produced the numbers above: count how many `.aihu`
source files in the program have text containing `__aihu_template`. It must be
53, not 0, before ANY diagnostic this tool prints can be believed.

The compiler side it depends on is done and tested: `compileSidecar()` /
`aihu-compile --sidecar-stdout` return the surface as a string.
