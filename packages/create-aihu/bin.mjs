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
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const cliIndex = require.resolve('@aihu/cli') // "." export → .../@aihu/cli/dist/index.js
const createJs = join(dirname(cliIndex), 'create.js') // sibling: .../@aihu/cli/dist/create.js

const res = spawnSync(process.execPath, [createJs, ...process.argv.slice(2)], { stdio: 'inherit' })
if (res.error) {
  console.error(res.error.message)
  process.exit(1)
}
process.exit(res.status ?? 0)
