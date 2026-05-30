/**
 * Test-only stub for `@aihu/magna-gqlmin`.
 *
 * `@aihu/magna-gqlmin` is an OPTIONAL dependency of `@aihu/magna`, dynamically
 * imported only inside the build-time `beforeCompile` hook (SDL codegen). This
 * example's runtime path (createMagnaFetch / createMagnaResource) never reaches
 * that hook, and the package is intentionally NOT installed (the dep-free
 * thesis). Vite's import-analysis statically scans the dynamic-import specifier
 * in `@aihu/magna`'s built `dist/index.js`, so it must resolve to *something* —
 * this empty stub satisfies that scan without pulling in a real dependency.
 */
export const parseSchema = (_sdl: string): void => {}
