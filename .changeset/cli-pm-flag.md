---
'@aihu/cli': patch
---

Make `--pm` actually set `packageManager` — it was a no-op under the published binary.

Three generators (`appPackageJson`, `agentPackageJson`, `ssrPackageJson`) each
carried their own copy of:

```ts
const bunVersion = globalThis.Bun?.version ?? process.versions.bun
const packageManager = pm === 'bun' && bunVersion ? `bun@${bunVersion}` : undefined
```

Two things were wrong, and the second hid the first. `pm === 'bun' &&` meant
`--pm pnpm` could only ever produce no field — the flag was threaded from argv
into the generator and dropped. And the published binary's shebang is
`#!/usr/bin/env node`, where neither `globalThis.Bun` nor `process.versions.bun`
is set, so `--pm bun` produced no field either. Measured against the built
`dist/bin.js`, `aihu app x --pm bun` and `aihu app x --pm pnpm` emitted
**byte-identical** trees: `--pm` changed nothing at all on this path.

One shared helper now resolves `<pm>@<version>` for all four package managers by
asking the tool (`<pm> --version`, memoised per process), still preferring the
in-process Bun version when the CLI is running under Bun. A version that cannot
be established — the tool is not installed, or answers with something that is
not a version — emits **no** field rather than a guess. The original comment
already made that call for bun ("drop the field entirely rather than emit a
malformed `bun@1` string") and it generalises: corepack enforces
`packageManager` and refuses to run when it disagrees, so a wrong pin is worse
than none.
