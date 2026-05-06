---
'@aihu/templates-cf-team': patch
'@aihu/cli': patch
---

Fix `bunx @aihu/cli --template cf-team` on Windows (Node.js runtime path).

`bunx` resolves the `#!/usr/bin/env node` shebang and runs the CLI under Node.js,
which cannot dynamically import `.ts` files. `loadTemplateConfig` was silently
swallowing the import error and throwing a misleading "file not found" message even
when `template.config.ts` was present on disk.

- `@aihu/templates-cf-team`: ship compiled `template.config.js` alongside the
  TypeScript source so Node.js falls back to the JS module. Bun still prefers `.ts`.
- `@aihu/cli`: surface the last import error in the `loadTemplateConfig` throw
  message so future failures are immediately diagnosable.
