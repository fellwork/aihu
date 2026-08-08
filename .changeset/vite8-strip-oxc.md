---
'@aihu/compiler': patch
---

Fix `.aihu` builds failing with `[PARSE_ERROR]` on a fresh `vite: ^8` install,
and stop the TypeScript strip from failing silently.

**The break.** Vite 8 made esbuild an OPTIONAL PEER while still *exporting*
`transformWithEsbuild`, which now throws the moment it is called:

```
Failed to load `transformWithEsbuild`. It is deprecated and it now requires
esbuild to be installed separately. … please migrate to `transformWithOxc`
```

The plugin's strip only reached for `transformWithOxc` in a SERVER environment
and preferred esbuild everywhere else, so the CLIENT build took the esbuild
branch and threw. A single `catch` around the whole chain swallowed that and
returned un-stripped TypeScript, which the bundler rejected far downstream:

```
[PARSE_ERROR] Expected a semicolon … │ let __aihu_setup__: ((ctx: any) => any) | undefined
```

Every output mode (`spa`, `static`, `ssr`) runs a client build, so all three
failed. It is invisible on an incremental `bun add -d vite@8` — esbuild survives
from the previous install — and invisible inside this repo, where vite resolves
esbuild from its own realpath in bun's store. It reproduces on a **fresh**
install at `^8`, which is what a new consumer gets.

**`transformWithOxc` is now preferred wherever it exists, in every
environment.** Vite 6 does not export it at all (`'transformWithOxc' in vite` is
literally `false` on 6.4.3), so vite 6 and 5 keep taking the esbuild branch —
verified byte-identical `dist/` before and after on a vite-6 scaffold.

**Approved behaviour change on vite 8.** oxc and esbuild do not lower TypeScript
identically. Invisible for compiler-generated code, observable for
user-authored classes and enums in an `.aihu` script block:

| source | esbuild (before) | oxc (now) |
| --- | --- | --- |
| `private x: number = 1` | `constructor(){ this.x = 1 }` | `x = 1` |
| `enum Level { … }` | arrow IIFE, param renamed `Level2` | `function` IIFE |
| `Level.High` | inlined to `1 /* High */` | left as `Level.High` |

The class-field difference is the meaningful one: oxc uses
`useDefineForClassFields: true`, the modern TypeScript default, so a field
initialiser now *defines* rather than *assigns*. Both forms are pinned in
`tests/strip-branch.test.ts` so any future move is deliberate and visible.

**A strip failure is now LOUD.** Any failure with Vite present throws an error
naming the branch, the Vite version, the environment and the file, instead of
returning un-stripped TypeScript that resurfaces as an unrelated `PARSE_ERROR`
hundreds of lines later. The one legitimate case still works: running outside
Vite entirely — a standalone `transform()`, a unit test — returns the code
unchanged. The two are told apart by inspecting the `import('vite')` rejection
itself (a module-resolution failure naming the `vite` specifier), so "vite is
installed but broken" is loud rather than silently swallowed.

**A second, pre-existing bug the loud error immediately caught.**
`_buildStaticIsland` rewrote the head of a `defineElement(...)` call while its
tail rewrite silently no-opped whenever `_injectShadowMode` had already appended
an options object, emitting a module with an unclosed class body. Reachable with
`compiler: { islands: true }` + `css: { shadowMode: 'shadow' }`, and it broke
consumer builds on **vite 6 as well as 8** (`content contains invalid JS
syntax`, pointing at the `.aihu` file). A trailing `{ shadowMode: 'shadow' }` is
now absorbed — the island attaches its own `{ mode: 'open' }` shadow root, so
the option is redundant — and any other option makes the island decline rather
than emit a half-rewritten module.
