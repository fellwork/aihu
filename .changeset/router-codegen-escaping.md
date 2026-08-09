---
'@aihu/router': patch
---

Escape values embedded in the four generated virtual modules against
code-construction breakout, and fix a runtime `TypeError` found while tracing
one of the flagged flows.

Closes three OPEN CodeQL `js/bad-code-sanitization` alerts (CWE-79/94/116,
severity error), all in `packages/router/src/vite-plugin.ts`: **#61** and
**#86** (the module specifier in `genC`'s and `genSC`'s `import(...)`) and
**#62** (`genC`'s transitive `Promise.all([...])` loader).

**The vulnerability class.** `genR`, `genL`, `genC` and `genSC` each build
JavaScript SOURCE by string concatenation, interpolating values read off disk
with a bare `JSON.stringify`. `JSON.stringify` escapes for the JSON grammar —
quotes, backslashes, C0 controls — and passes `<`, `>`, U+2028 and U+2029
straight through. Those four are exactly the characters that matter in the
grammars a chunk of JS source can end up inside: `</script>` terminates an
inline `<script>` element, `<!--` opens an HTML comment inside script data, and
U+2028/9 are LineTerminators to a pre-ES2019 parser. Sanitizing for the wrong
context is the whole of the rule.

**What was actually reachable — traced, not assumed.** Two distinct sources
feed these sinks, and they are not equally exposed.

| sink | value | existing guard | `<`/`>` blocked? |
| --- | --- | --- | --- |
| `genC` / `genSC` `import(...)` | filesystem path from the `readdirSync` walk | `SAFE_MODULE_PATH` | **no** |
| `genC` / `genSC` registry key | component tag | `CUSTOM_ELEMENT_TAG` | yes |
| `genR` `name:` / `layout:` | text of the SFC's own `@route` block | *none* | **no** |
| `genR` `head:`/`middleware:`/… | a `.route.json` sidecar's JSON | *none* | **no** |
| `genL` key / `tag` / `components` | layout stem, `@template` text | *none* | **no** |

`SAFE_MODULE_PATH` bans quotes, backslashes and line terminators but says
nothing about angle brackets, and `<`/`>` are legal in a POSIX filename. So a
component under a directory named `a</script>b` put a literal `</script>` into
the generated registry, with a perfectly valid tag. Reproduced on a real
fixture: the emitted `virtual:aihu-components`, wrapped in a
`<script type="module">`, contained **five** `<script`/`</script` tokens where
two were intended.

The `genR` and `genL` sinks CodeQL did **not** flag turned out to be the more
exposed ones: those values are not filesystem paths but the *contents* of a
`.aihu` file, lifted by regex (`@route { name: '…' }`) straight into the route
table with no shape check at any point. A one-line payload in a page file put
both a raw `</script>` and a raw U+2028 into the generated module. Fixed too —
an escaper used at three of five structurally identical sites is worse than one
used at all five.

None of this is a live exploit in the first-party pipeline as shipped: the
client entry is always injected as `<script type="module" src=...>`, never
inlined, so the generated module is served as an external `.js` where `<` is
inert. It becomes live the moment anything inlines a chunk — a
single-file/inline-script plugin, a CSP-driven inlining step, a downstream
consumer's own HTML template. Given that the value is attacker-influenceable
under a realistic threat model (a monorepo whose CI builds untrusted PRs: a
contributor controls both component filenames and `@route { name }`), and that
the fix is free at every normal input, defense in depth was the call rather
than dismissal. All three alerts are fixed; none dismissed.

**The fix.** One shared helper, `jsSourceLiteral()` (new
`packages/router/src/codegen.ts`, exported from `@aihu/router/plugin` alongside
`escapeForJsSource` so the sibling emitters in `@aihu/app`, the adapters and
`@aihu/magna` can adopt it rather than re-deriving it). It is `JSON.stringify`
plus the escaping pass the CodeQL rule's own remediation prescribes, over
`< > BS FF LF CR TAB NUL U+2028 U+2029`. Every replacement is a `\uXXXX`
escape, which denotes the same character inside a JS string literal, so the
emitted module evaluates identically — specifiers still resolve, tags still
match. It now backs all 11 interpolation holes across the four generators.

One deliberate divergence from the rule's example charMap: NUL is spelled
`\u0000`, not `\0`. `\0` immediately followed by a digit is a legacy
OctalEscapeSequence and a **SyntaxError** in module code — verified, and pinned
by a test that asserts the rule's own spelling throws while ours round-trips.

**A real bug, found by tracing alert #62.** That sink interpolates the child
tags of `genC`'s transitive loader, and the value arriving there was not merely
unescaped — it was unchecked against the registry it indexes into. The child
filter accepted any key of `mods` (the raw directory scan) rather than any
member of `tags` (what survived the codegen-boundary filter). A single-word
component — `button.aihu` → tag `button`, no hyphen — is dropped by
`CUSTOM_ELEMENT_TAG` but stays in `mods`, so a parent referencing `<Button />`
emitted `__m["button"]()` against a registry with no `button` key:

```
TypeError: __m["button"] is not a function
```

thrown out of the *parent's* loader, taking `site-header` down with the child
that was only ever meant to be skipped. Now filtered on the emitted set.

**Verified before and after, on real fixtures.**

| check | before | after |
| --- | --- | --- |
| hostile dir name → `genC`/`genSC`, script tokens when inlined | `<script`,`</script`,`<script`,`</script`,`</script` | `<script`,`</script` |
| hostile `@route { name }` → `genR` | raw `</script>` **and** raw U+2028 | `\u003C/script\u003E`, `\u2028` |
| dangling `__m["button"]()` | emitted; loader throws `TypeError` | not emitted; loader resolves |
| escaped literal round-trips through `new Function` (strict) | — | all 7 payloads exact |
| **normal tree, output byte-identical to pre-fix** | — | `genR` ✓ `genL` ✓ `genC` ✓ `genSC` ✓ |

That last row is the one that matters for blast radius: on a tree with no
hostile characters, all four generators emit byte-for-byte what they emitted
before, diffed against `HEAD`'s `vite-plugin.ts` loaded side by side in the
same process. Nothing about normal output changed.

Pinned by 11 new tests in `packages/router/tests/codegen-escaping.test.ts`.
Reverting `vite-plugin.ts` alone turns 4 of them red (one per generator, plus
the dangling-lookup case) and leaves the other 7 — the helper's own unit tests
— green, so each half of the change is independently guarded. Full
`packages/router` suite: 199 passed / 16 files. Full repo suite: 4787 passed,
with the same 25 pre-existing failures the unmodified base produces (all
build-artifact-dependent — they need `cargo build --release` and `bun run
build`), confirmed by a baseline run on the same worktree. `biome ci` clean,
`moon run :typecheck` clean across 63 tasks.

No size impact on the measured surface: the helper is reachable only from the
build-time `@aihu/router/plugin` entry. `dist/index.js` — the browser runtime
under the 2400 B budget — does not contain it and stays at 1780 B gzip.
