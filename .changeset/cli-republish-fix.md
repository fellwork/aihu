---
"@aihu/cli": patch
---

Re-publish `@aihu/cli` without the broken `@aihu/mcp` workspace dependency.

`@aihu/cli@0.3.1` shipped with `"@aihu/mcp": "workspace:*"` in its published
manifest. The `workspace:*` protocol is monorepo-internal — outside the workspace
it cannot resolve, so `bunx @aihu/cli ...` failed at install time with:

```
error: Workspace dependency "@aihu/mcp" not found
error: @aihu/mcp@workspace:* failed to resolve
```

If you hit this on 0.3.1, pin to the previous good version as a workaround:

```
bunx @aihu/cli@0.3.0 app my-app
```

0.3.2 ships from a clean manifest (no `@aihu/mcp` runtime dep) and the release
pipeline now publishes via `scripts/publish-all.sh`, which runs `bun publish`
per-package. `bun publish` rewrites `workspace:*` to a real version range at
pack time, so the protocol cannot leak into a published artifact again.

0.3.1 has been deprecated on npm.
