---
'@aihu/cli': patch
---

`create-aihu --version` printed no version and created a directory instead.

```
$ node dist/create.js --version </dev/null
  ✓ Done!
  Next steps:
    cd my-aihu-app
$ echo $?
0
```

`create.ts`'s argv handling special-cased `--help`/`-h` and nothing else, so
`--version` fell through to the positional/non-interactive path, took the
documented defaults, and scaffolded `my-aihu-app/`. A companion commit had added
real `--version` support to `bin.ts` and never to `create.ts`.

That is the worse of the two places to miss it. `create-aihu` is the only bin in
this package npm users can actually reach — `npx @aihu/cli app my-app` cannot
work, because npx infers the bin from the package name, as `create.ts`'s own
docblock explains. So the advertised flag was unreachable exactly where it is
advertised, and its invocation had a filesystem side effect rather than being
the no-op an informational flag is supposed to be. Non-TTY stdin (any script,
any CI job) is where this bites: with no prompt to stop at, nothing interrupts
the fall-through.

It now prints the version and exits 0, from the same build-time literal
`bin.ts` uses, so the two bins in one package cannot report different versions
of themselves. `--version` is also listed in `create-aihu --help`, which it
was not.

`aihu --version` had the mirror-image gap: it was tested against `argv[2]`
alone while `--help` was recognised anywhere in argv, so `aihu app foo
--version` scaffolded a project — two flags documented side by side under
"Global:", only one of which was. Both are now global.

Also unified the two error dialects in `bin.ts`'s dispatcher: `aihu mcp` and
`aihu migrate` with no arguments printed a bare usage block with no `ERROR:`
marker and no pointer to `--help`, while every other malformed invocation in the
same function routed through `failUsage`. They now use `failUsage` too, and
`aihu mcp <typo>` names the subcommand it did not recognise.
