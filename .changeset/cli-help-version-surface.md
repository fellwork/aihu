---
'@aihu/cli': minor
---

Give `aihu` a real command surface: `--help`, `--version`, and errors you can tell apart.

`usage()` wrote the same block to **stderr** and exited **1** for all four of
`--help`, `--version`, an unknown command, and no arguments at all. Every one of
those produced byte-identical output on the same stream with the same exit code,
so nothing — a person, a shell script, a CI job — could tell a typo from a
request for help, and `aihu --help | less` showed an empty screen. There was no
`--version` at all.

Now:

- `--help` / `-h` (and bare `aihu`) print usage to **stdout** and exit **0**,
  matching `create-aihu`'s existing convention.
- `--version` / `-v` print the CLI's own version and exit **0**. The version is
  read from this package's `package.json` at build time, so it cannot disagree
  with the package it shipped in.
- An unknown command says `unknown command '<x>'` on stderr and exits 1.
- A missing positional says what is missing (`aihu app needs a project name`)
  instead of reprinting the whole usage block.

Two accuracy fixes came with it. The help text now lists every flag the
dispatcher actually reads: `--style` (a real `aihu add` flag), `aihu migrate
--state`, and the seven `aihu app` flags (`--pm`, `--no-git`, `--no-install`,
`--options-json`, `--no-auto-install-template`) that previously existed only in a
code comment and appeared in no user-facing help. And `aihu app`'s positional is
now parsed with the same `firstPositional` helper `create-aihu` uses — reading
`rest[0]` meant `aihu app --pm pnpm` scaffolded a complete project into a
directory literally named `--pm` and exited 0.

The legacy `aihu app` path's own output is brought in line with the other two
scaffold paths. It stopped at `Done. N file(s) created.` with no cd/install/dev
guidance, while both `dispatchTemplate` and `create-aihu` end with
`printNextSteps()`; it now calls the same function, so the three cannot drift
into three different sets of instructions. Its `created` lines are prefixed with
the project directory too — `created  package.json` named a file that is not at
`./package.json`. `page`/`component` are deliberately left unprefixed: they write
into the *current* project, so their paths were already correct.

`--use-defaults` and `--no-interactive` are **removed**. They parsed into
variables that were immediately `void`-discarded under a "Reserved for B2+
wiring" comment, so a scripted `aihu app x --use-defaults` looked supported and
did nothing. `aihu app` issues no prompts, so their documented behaviour ("use
manifest defaults for unspecified overridable cells") is what `mergeOptions()`
does unconditionally — they could not have changed the output even wired up.
