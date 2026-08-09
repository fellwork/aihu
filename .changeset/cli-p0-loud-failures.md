---
'@aihu/cli': patch
---

Fix two live bugs on the CLI surface found in a pre-release audit.

`aihu app <name> --template <bad-value>` (and `--template` with no value)
silently scaffolded a `minimal` app and exited 0. `create-aihu` already fixed
this exact failure mode for its own entry point — its own docblock names it
"the worst of the available failure modes... the run 'succeeds' and the user
finds out much later" — but the legacy `aihu app` dispatcher in `bin.ts` never
adopted the fix. Both cases now fail loudly with the template catalog and
exit 1, matching `create-aihu`'s existing behavior.

`aihu page '../../../../../ESCAPED'` wrote a file outside the project tree
(`src/pages/../../../../../ESCAPED.aihu` resolves via `join()` like any other
path) and exited 0. `scaffoldPage` split the route into segments but never
rejected `.`/`..`, unlike the sibling `scaffoldComponent`, which already
validates its input. Now throws before writing.
