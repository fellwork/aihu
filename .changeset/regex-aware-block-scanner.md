---
"@aihu/compiler": patch
---

Block delimiting: lex regex literals, and stop treating `//` as a comment in HTML
and CSS.

The block scanners counted raw bytes. They knew strings and comments, but not
regex literals, so a regex's braces and quotes were read as structure:

- `/\{/` opened a depth that never closed — `@state` swallowed the template and
  the parser died on markup the author never wrote.
- `` /}/ `` closed `@state` EARLY, silently dropping every statement after it and
  emitting a truncated `const re = /` — while exiting 0.
- `/['"]/` — the quote opened string mode and ate the rest of the block.
- A regex inside a `$action` handler ran the collection splitter past the comma
  that ended the entry (C447).

`//` was also treated as a line comment inside `@template` and `@style`. Neither
language has one — HTML uses `<!-- -->`, CSS uses `/* */` — so any `https://` URL
commented out the rest of its line, closing brace included. A CSS
`background: url(https://…)` was enough to fail the build.
