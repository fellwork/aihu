---
'@aihu/cli': minor
---

`create-aihu --template` now spans both template tiers.

npm users could only ever reach the built-in templates. The npm-published
`@aihu/templates-*` tier was reachable only through `aihu app --template <pkg>`,
and that command cannot run under npx at all:

```
$ npx -y @aihu/cli@latest app my-app --template cf-team
npm error could not determine executable to run
```

npx infers the executable from the package NAME — for `@aihu/cli` it looks for
a bin called `cli`, and the bins are `aihu` and `create-aihu`. `bunx` resolves
differently, so the failure was npm-only. `create-aihu` is the entry point npm
users actually reach, so it is now the complete one:

```
npm create aihu my-app -- --template cf-team
npx create-aihu my-app --template cf-team
```

Both tiers run the SAME scaffold pipeline, factored out of `bin.ts` into
`scaffold-pipeline.ts` rather than reimplemented.

Also fixes a silent-wrong-result path: `--template cf-team` previously fell
through to scaffolding a `minimal` app. The run "succeeded" and the user found
out later. Unknown, missing, and declared-but-unpublished template names now
each fail with an explicit message that LISTS what is available, and exit 1.

The catalogue distinguishes three states honestly — built-in, available from
npm, and declared-but-not-yet-published (`vercel-team`, `fly-team`, `cf-solo`,
`cf-full-agent` are in the registry but 404 on npm, and are shown as
unselectable rather than offered or hidden).
