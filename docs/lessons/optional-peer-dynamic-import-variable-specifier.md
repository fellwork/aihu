# Optional/circular peer: use a variable import specifier, not a literal — TS statically resolves the literal even behind a cast

**Topic:** css-engine
**Session:** 2026-05-25 (PR #222 — defensive css-engine optional import)
**Category:** typescript, ci, optional-peers
**Severity:** medium (CI typecheck red; works locally where the peer's .d.ts is built)

## Symptom

CI fails with `error TS2307: Cannot find module '@pkg' or its corresponding type declarations` on a line like:

```ts
const mod = (await import('@aihu/css-engine')) as unknown as SomeType;
```

It passes locally because the optional/circular peer's `.d.ts` happens to be built in your workspace, but on a clean CI checkout (where the peer is optional, circular, or not yet built) the literal specifier has no types to resolve.

## Root cause

TypeScript **statically resolves a literal string specifier** in `import('...')` at type-check time, regardless of any value-level `as unknown as` cast — the cast affects the *value* type, not the *module resolution*. So even a fully type-erased dynamic import of a literal still demands the module's declarations exist. For an optional peer that may be absent, or a circular peer whose `.d.ts` isn't built first, that demand fails with TS2307.

## Fix / recipe

Hide the specifier behind a **variable**, so TS cannot statically resolve (and therefore cannot type-check) the module, and declare a **local interface** for just the surface you call:

```ts
// Local minimal surface — don't import the peer's types.
interface CssEngineSurface {
  compileSfc(src: string, opts: CompileOpts): CompileResult;
}

// Variable specifier: TS does not statically resolve this.
const SPEC = '@aihu/css-engine';
let engine: CssEngineSurface | undefined;
try {
  engine = (await import(SPEC)) as unknown as CssEngineSurface;
} catch {
  engine = undefined; // optional peer genuinely absent — degrade gracefully
}
```

The variable specifier defers resolution to runtime (where the optional-peer try/catch handles absence) and the local interface gives you typed access to the methods you use without depending on the peer's emitted declarations.

## How it bit us

The css-engine SFC integration hook (in `@aihu/compiler`) optionally imports `@aihu/css-engine`, which sits in a circular relationship with the compiler. A literal `await import('@aihu/css-engine')` behind a cast type-checked locally (css-engine `.d.ts` was built) but threw TS2307 on CI. Switching to a variable specifier + local interface (PR #222) made the typecheck pass while keeping the import genuinely optional.

## Related

- `css-engine-ci-binary-build.md` — the other css-engine "passes locally, fails in CI" class (binaries, not types).
