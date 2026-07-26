---
'@aihu/cli': patch
---

Resolve auto-installed templates from the invoking project, not the CLI's cache.

`aihu app --template <pkg>` could not work for any user outside the monorepo,
on any package manager:

```
$ bunx @aihu/cli@latest app testapp --template cf-team --pm bun
Installing template package @aihu/templates-cf-team...
Resolved, downloaded and extracted [2]        <- install SUCCEEDED
ERROR: Failed to install template package     <- resolution FAILED
```

`autoInstallTemplate()` runs `<pm> add <pkg>` in `process.cwd()`, so the
template lands in the user's project. `resolveTemplatePackagePath()` then used
`import.meta.resolve()`, which resolves relative to the CLI module — and under
`bunx`/`npx` that module lives in a package-manager cache with no view of the
user's project. Install and resolve were looking in different places; the
package was on disk the whole time.

The existing fallback only searched `packages/templates/<short>`, which exists
only inside the aihu monorepo — so the one environment where this worked was
the one no user is in.

Adds a first-choice strategy that checks `<cwd>/node_modules/<pkg>`.
