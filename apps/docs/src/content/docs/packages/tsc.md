# @aihu/tsc

`aihu-tsc` — the type-checker for a project containing `.aihu` Single File Components. It is to `.aihu` what [`vue-tsc`](https://github.com/vuejs/language-tools) is to `.vue`, and it is built on the same foundation ([Volar](https://volarjs.dev/)'s `proxyCreateProgram`).

Dev-time tooling only — it never enters browser bundles and has no size-limit row.

## Why it exists

**Plain `tsc` cannot see inside a `.aihu` file.** It does not fail on one, and it does not warn about one — it reports a clean pass over every SFC in your project without having type-checked a line of any of them. A `const total: number = 'a string'` in a `@state` block, or a property that does not exist, sails through `tsc --noEmit` with exit code 0.

`aihu-tsc` projects each `.aihu` into the TypeScript program as a **virtual** TypeScript file, so the compiler actually reads your components. Diagnostics are reported against the `.aihu` file, on the line you wrote:

```
src/pages/study/[ref].aihu:69:36 - error TS2531: Object is possibly 'null'.

69   const apparatus = () => (doc() ? doc().apparatus : [])
                                      ~~~~~
```

Nothing is written to disk. Earlier versions of the compiler emitted a `<name>.aihu.ts` sidecar next to every source so that `tsc` had something to read; those files are gone. If you have any left over, delete them and drop `*.aihu.ts` from your `.gitignore`.

## Install

```bash
bun add -d @aihu/tsc     # npm i -D @aihu/tsc
```

## Usage

Replace `tsc --noEmit` in your `typecheck` script:

```json
{
  "scripts": {
    "typecheck": "aihu-tsc"
  }
}
```

New projects scaffolded by `npm create aihu` are wired this way already.

```bash
aihu-tsc                        # check the project in the current directory
aihu-tsc -p packages/web        # check a specific tsconfig / directory
aihu-tsc --strict-templates     # also report implicit `any` inside .aihu files
```

It reads your `tsconfig.json` — same `strict` settings, same `paths`, same `include`. It exits non-zero when there are type errors, so it drops straight into CI.

## What gets type-checked

The whole `@state` block: your bindings carry their real types, your imports resolve, and the expressions in `@template` are checked against them.

Two things are still `any`:

- **Loop aliases.** `{#each xs as m}` binds `m` in the template, so there is no declaration to take a type from. Deriving the element type from the iterable is planned.
- **Macro bodies.** `$prop:` / `$action:` / `$computed:` blocks are aihu syntax, not TypeScript, so their bodies are not yet checked. What they *bind* is declared — and a `$prop` carries the type you declared for it.

## Implicit `any`

By default, `aihu-tsc` does not report implicit-`any` diagnostics (`TS7006` and friends) **inside `.aihu` files**. A `@state` body is ordinary JavaScript — `const noGloss = (m) => !m.locked` — and until now none of it was type-checked at all, so no existing codebase has ever annotated it. Under `strict`, turning checking on lights up hundreds of these, and they bury the diagnostics that actually indicate bugs.

Your real `.ts` files are unaffected: the relaxation is scoped to `.aihu` only, which is why it lives here rather than in your `tsconfig` (`noImplicitAny: false` there would weaken your whole project).

Once you have annotated your components, `--strict-templates` turns it on.

## Expect errors on the first run

This is code that has never been type-checked. On a mature codebase the first `aihu-tsc` run typically surfaces a real backlog — most of it clustered around a few idioms. The most common by far:

```js
const [doc, setDoc] = signal(null)   // T is inferred as `null`
```

`doc()` is then `null`, `setDoc(realDoc)` is an error, and every property read off it lands on `never`. Give the signal its type:

```js
const [doc, setDoc] = signal<Doc | null>(null)
```

## Files that do not compile

If an SFC fails to *compile*, there is no surface to type-check, and `aihu-tsc` says so by name rather than passing over it silently:

```
2 .aihu file(s) could not be compiled, so nothing in them was type-checked.
Run `aihu build` for the compile error:
  src/agent/expose.aihu
  src/components/live-counter.aihu
```

They count as failures. A green run from `aihu-tsc` means every `.aihu` in your project was read and checked — never that some were skipped.
