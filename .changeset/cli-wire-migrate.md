---
"@aihu/cli": minor
---

Wire up the `aihu migrate <files...>` command. The v0→v1 grammar codemod was
fully implemented but never registered in the CLI entrypoint; it is now
available and listed in `aihu --help`, which makes the `C304`/`C305`/`C306`
compiler errors' "Run: npx aihu migrate" guidance accurate. Fixes upstream
Bug 9c.
