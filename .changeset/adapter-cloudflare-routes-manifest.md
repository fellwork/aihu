---
"@aihu/adapter-cloudflare": patch
---

Fix SSR mode emitting an unresolvable `_worker.js`. When `cloudflare({ ssr:
true })` ran, the generated worker did `import routes from
'./routes-manifest.js'` but the adapter never wrote that file, so `wrangler
pages dev` failed with `Could not resolve "./routes-manifest.js"` and CI fell
back to an empty SPA shell (bad for SEO + agents). The adapter now serializes
`AdapterContext.routes` into a `routes-manifest.js` (default-exporting the
routes array consumed by `createRequestRouter`) and writes it to `outDir`
before `_worker.js`, keeping the filename in sync with the handler's import
specifier. The SSR test now exercises the real handler-source + manifest
emission (replacing the stub that masked the gap) and asserts the worker's
import resolves.
