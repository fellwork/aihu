---
'@aihu/cli': patch
---

Stop `aihu app` and `aihu plugin` from scaffolding outside the project directory.

`aihu app ../../ESCAPED` wrote a complete 11-file project two directories
**above** the cwd and exited 0. Measured against the built `dist/bin.js`:

```
$ node dist/bin.js app ../../ESCAPED
  Next steps:
    cd ../../ESCAPED
$ echo $?
0
$ grep name ../../ESCAPED/package.json
  "name": "../../ESCAPED",
```

Both halves are broken. The files land where the user did not ask for them, and
`"name": "../../ESCAPED"` is not a legal npm package name — so `bun install`,
the very next command the CLI prints, fails on the tree it just created.

`scaffoldPage` had already grown a `.`/`..` guard for exactly this class of bug.
It was never extended to its two siblings, both of which called
`resolve(outDir ?? '.', name)` with no validation at all. Meanwhile the template
pipeline (`mergeOptions`) had been enforcing `/^[a-z][a-z0-9-]*$/` since it was
written — so the same string was a legal project name on one scaffold path and
not on the other.

That regex now lives in one place (`project-name.ts`) and all three paths use
it. Illegal names are **rejected**, never sanitised: silently renaming what the
author typed is the failure mode `scaffoldComponent`'s docblock already argues
against, so the error suggests the kebab form rather than applying it.

Three smaller things came out of the same pass:

- `scaffoldPlugin` could not actually traverse — `toKebab` rewrites `/` and `.`
  to hyphens — but it accepted the garbage and scaffolded `aihu-plugin--x`
  while reporting `created ../../X/package.json`. It also interpolates the raw
  name into a single-quoted JS string literal in the generated `src/index.ts`,
  so an unvalidated name was an injection into the file the user is about to
  run.
- `aihu plugin my-forms` reported `created  my-forms/package.json` for files
  written to `aihu-plugin-my-forms/` — the same wrong-path-in-the-listing defect
  the output prefixing was added to fix, one level further in.
- `scaffoldPage`'s guard split on `/` only, so a Windows-style `..\..\x` was a
  single segment and walked through it. Harmless on POSIX, where `\` is an
  ordinary filename character; a real traversal on Win32, where `join()` treats
  it as a separator. It now rejects on every platform.
