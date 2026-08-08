---
'@aihu/adapter-cloudflare': patch
'@aihu/app': patch
---

Fix three defects in the generated Cloudflare deploy config, each of which
produced a broken or silently-degraded deployment from a green build.

**1. `main` was hardcoded while the SSR output directory is configurable.**
`generateWranglerToml` wrote the literal `main = "dist-server/_worker.js"`, and
the comment above it asserted a "sibling `dist-server/`" as though that were
fixed. It has not been since `ssrOutDirFor` existed: `@aihu/app` derives the SSR
outDir from the client `build.outDir`, so a project configuring
`outDir: 'build'` gets its worker emitted at `build-server/_worker.js` while
wrangler was pointed at a path the build never wrote. `wrangler deploy` fails to
find its entry point. `[assets] directory` was already parameterized from the
same input — `main` was the half that was not.

`ssrOutDirFor` is now exported from `@aihu/app` and called by the adapter, so
there is one derivation rather than two. A test pins the adapter's answer
against the framework's own function across four outDir shapes rather than
against a second copy of the rule.

**2. The Worker was never invoked for `/`.** Cloudflare's Workers Assets routing
serves a matching static asset *before* running the Worker —
`assets.run_worker_first` defaults to `false` — and `html_handling` (default
`auto-trailing-slash`) maps `/` to `index.html`, which the SSR build writes into
the very directory `[assets] directory` points at. So an `output: 'ssr'` site
served the **empty SPA shell** for its home page and never server-rendered it.
The adapter's documented route priority (handler → ASSETS → index.html) was not
what was deployed.

Generated SSR configs now set `run_worker_first = true`, with a comment in the
emitted file explaining why. `true` rather than a path list because SSR routes
are dynamic and known only to the router; unmatched paths still reach ASSETS via
the wrapper's existing 404 fallthrough. SPA mode deliberately does **not** set
it — there, serving the asset first is the entire point.

*Verification:* checked against Cloudflare's live documentation on 2026-08-08
(`workers/static-assets/routing/worker-script/`, `.../advanced/html-handling/`,
and `workers/wrangler/configuration/`). `run_worker_first` is the current,
non-deprecated key, accepts `true|false` or an array of glob patterns, and
defaults to `false`; `html_handling` defaults to `auto-trailing-slash`.

**3. The SPA fallback was dead code and had never once run.** All three
generated worker shapes wrapped the ASSETS call as
`try { return await env.ASSETS.fetch(req) } catch { …serve /index.html… }`.
`env.ASSETS.fetch` does not reject on a miss — it is documented as returning
`Promise<Response>`, and an unmatched request comes back as a *Response* whose
status reflects `not_found_handling` (default `none`, a plain 404). The catch
was therefore unreachable, and the client-side-routing fallback this adapter has
advertised since it was written had never executed: a deep link to an SPA route
returned Cloudflare's bare 404 instead of the shell that would have routed it.

Now a status check, shared by all three shapes. Serving the shell for any 404
matches Cloudflare's own `not_found_handling = "single-page-application"`
semantics rather than inventing a narrower rule the platform does not have.
Proven by *driving* the emitted worker in a child Node process with an ASSETS
stub that 404s exactly like the real binding — a string assertion would have
passed against the dead catch as happily as against the fix.

This whole branch of the adapter was previously **untested**: the only fixture
exercising `output: 'ssr'` end to end passes `generateWrangler: false`, so
nothing had ever read the file this adapter tells people to deploy with.
