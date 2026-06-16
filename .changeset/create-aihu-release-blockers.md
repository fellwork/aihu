---
"@aihu/cli": minor
---

fix create-aihu / `bun create aihu` public-release blockers

- **P0 — scaffolded apps now declare `trustedDependencies: ["@aihu/compiler"]`.**
  Without it, `bun install` blocks `@aihu/compiler`'s postinstall (the step
  that arch-validates and downloads the correct native binary), so the
  wrong-arch binary baked into the published tarball stayed in place and
  `bun run build` failed with `ENOEXEC` (`Unknown system error -8`) on
  macOS/Windows. `npm install` was unaffected (npm runs postinstall by
  default); the break was bun-specific — and bun is the flagship path.
- **Non-interactive / pipe-safe scaffolding.** New flags `--template`,
  `--pm`, `--yes` / `-y`, `--no-git`. When `--yes` is passed or stdin is not a
  TTY, the wizard runs fully non-interactively with documented defaults. This
  fixes the prior behavior where piped input silently created nothing and
  exited 0 (Node `readline.question` losing buffered lines at EOF), and
  unblocks CI/scripted use.
- **Template selection now actually differentiates output.** `minimal`,
  `full`, and `docs` previously produced byte-identical scaffolds;
  `scaffoldApp` now honors the choice (`full` adds a default layout + a second
  page; `docs` ships a docs-flavored landing + guide page). Every variant
  scaffold → install → build is verified on both bun and npm.
