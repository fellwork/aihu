#!/usr/bin/env node
// create-aihu — the public scaffolder entry point.
//
// `npm create aihu` / `npx create-aihu` / `bun create aihu` all resolve to the
// UNSCOPED npm package `create-aihu`. This package is a thin delegator: the
// real scaffolding logic lives in @aihu/cli's `dist/create.js` (also exposed
// as the `create-aihu` bin of @aihu/cli). We forward the user's args to it,
// inheriting stdio so both the interactive prompts AND the non-interactive
// (`--yes` / non-TTY) path work, then propagate the child's exit code.
//
// Resolution note: @aihu/cli's package.json `exports` only exposes the "."
// entry (→ dist/index.js). That encapsulation BLOCKS resolving
// `@aihu/cli/package.json` or `@aihu/cli/dist/create.js` directly. So we
// resolve the allowed "." export to get .../@aihu/cli/dist/index.js and derive
// its sibling create.js (both are emitted into the same dist/ directory).
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// `import.meta.resolve`, NOT `createRequire().resolve`. @aihu/cli is
// `"type": "module"` and its exports map declares only `types` and `import`
// conditions — there is no `require` condition, so the CJS resolver cannot
// satisfy it and throws:
//
//   Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined in
//   .../create-aihu@0.1.6/node_modules/@aihu/cli/package.json
//
// That is a hard failure of `pnpm create aihu` and `yarn create aihu` — both
// hit it on every template, including `minimal`. Reproduced minimally: against
// an exports map with no `require` condition, `require.resolve()` throws
// ERR_PACKAGE_PATH_NOT_EXPORTED while `import.meta.resolve()` returns the file.
//
// This file is already ESM and already uses `import.meta.url`, so the native
// ESM resolver is available and honours the `import` condition correctly. It
// also keeps working under npm and bun, whose hoisting happened to mask the
// bug rather than avoid it.
const cliIndex = fileURLToPath(import.meta.resolve('@aihu/cli')) // "." export → .../dist/index.js
const createJs = join(dirname(cliIndex), 'create.js') // sibling: .../@aihu/cli/dist/create.js

const res = spawnSync(process.execPath, [createJs, ...process.argv.slice(2)], { stdio: 'inherit' })
if (res.error) {
  console.error(res.error.message)
  process.exit(1)
}
process.exit(res.status ?? 0)
