---
'@aihu/cli': patch
---

Reject an unusable `--pm` instead of silently scaffolding a bun project.

`aihu app x --pm garbage` and a bare trailing `--pm` both resolved to `'bun'`
and said nothing:

```
$ node dist/bin.js app demo --pm garbage && grep packageManager demo/package.json
  "packageManager": "bun@1.3.8"
```

This is the exact failure `resolvePmFlag`'s own docblock was written about, one
level up: the emitted `packageManager` field is enforced by corepack, so
`pnpm install` — the command the CLI prints as the next step — refuses to run
before resolving a single dependency (`ERROR: This project is configured to use
bun`). The previous release fixed `--pm` for *valid* values and left every
invalid one falling into the same trap, with no indication the flag had been
discarded.

`create-aihu` had the same hole with a different default: unknown values
returned `undefined`, which meant "the user did not choose", so the *detected*
package manager got pinned instead.

Both now fail loudly and exit 1, naming the valid set — the same triage
`--template` already got in the cleanup that wrote the docblock. `--pm` was the
last silent one of the three (`--css`/`--shadow` at least warn to stderr), and
the only one whose wrong value breaks the next command.

The classifier is shared (`argv.ts`'s `classifyPmFlag`), so the two entry points
cannot drift apart on this flag a third time. It distinguishes absent (default
to bun) from present-but-unusable, which is why a dangling `--pm` is now an
error rather than a default.
