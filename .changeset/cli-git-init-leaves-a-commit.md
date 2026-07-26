---
'@aihu/cli': patch
---

**`aihu app` left an unborn HEAD — the scaffold reported success and the repo had no commit.**

`create.ts` has always run init + add + commit; `scaffold-pipeline.ts` ran `init`
alone, because `commandFor` returned a single command and the shape could not
express a sequence. One capability, two implementations, and only the untested
one was broken.

Before, on a fresh scaffold:

```
aihu app demo --template cf-team --pm bun --no-install  -> exit 0
git rev-parse HEAD                                      -> exit 128
git rev-list --count --all                              -> 0
```

Git identity is passed **explicitly** rather than read from ambient config.
`git commit` fails outright with no resolvable `user.name`/`user.email`, which is
the normal state of CI runners and fresh containers — using ambient config would
have fixed this on a developer machine and left the unborn HEAD in exactly the
environment the scaffold matrix runs in. Verified with `HOME` redirected and both
`GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` neutered.

Fixes FEL-431 defect 5.
