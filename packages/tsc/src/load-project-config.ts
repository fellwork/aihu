/**
 * Read a project's `compiler.target` (and `typecheck.strictTemplates`) out of
 * `vite.config.ts`, the same source-of-truth `aihu build`/`aihu dev` read via
 * `@aihu/cli`'s `load-project-config.ts` — this is a deliberate, narrower
 * duplicate of that file's pattern, not a shared import.
 *
 * `aihu-tsc`/`aihu check` and the language server are invoked directly
 * (`"typecheck": "aihu-tsc"` in a scaffolded package.json — no orchestrating
 * CLI command threads flags in), so without this, `compileSidecar` always ran
 * with the binary's own `universal` default regardless of what the project's
 * `vite.config.ts` actually configured — a real build-vs-typecheck
 * divergence for any project setting `compiler.target`, since target changes
 * what `sidecar_ts` is derived from (see `compileSidecar`'s doc comment).
 */

interface ProjectConfig {
  readonly compiler?: { readonly target?: 'client' | 'server' | 'universal' }
  readonly typecheck?: { readonly strictTemplates?: boolean }
}

/**
 * `@aihu/app` is resolved at RUNTIME from the user's project, not linked at
 * build time — `@aihu/tsc` deliberately does not depend on it (same
 * zero-non-Node-builtin-dependency discipline `@aihu/cli`'s loader documents),
 * and a scaffolded project always has it.
 *
 * Held in a variable, not a literal specifier, so tsc does not attempt to
 * resolve `@aihu/app`'s types while building `@aihu/tsc` itself — a literal
 * `import('@aihu/app')` would be green locally (a stale dist/ satisfies it)
 * and red in CI, which typechecks this package without building `@aihu/app`
 * first.
 */
const AIHU_APP = '@aihu/app'

interface AihuAppModule {
  loadAihuConfig: (
    root: string,
    opts?: { mode?: string; command?: 'build' | 'serve' },
  ) => Promise<{ config: ProjectConfig } | null>
}

/**
 * Load `{ target, strictTemplates }` from `root`'s `vite.config.ts`.
 *
 * Returns `{}` (not throwing) whenever there's nothing to read — `@aihu/app`
 * not installed, no vite config present, or the config itself threw. Every
 * caller already has its own default for both fields, so a project with
 * neither concern configured behaves exactly as it did before this file
 * existed.
 */
export async function loadTscProjectConfig(
  root: string,
): Promise<{ target?: 'client' | 'server' | 'universal'; strictTemplates?: boolean }> {
  try {
    const { loadAihuConfig } = (await import(AIHU_APP)) as AihuAppModule
    const loaded = await loadAihuConfig(root)
    if (!loaded) return {}
    return {
      ...(loaded.config.compiler?.target ? { target: loaded.config.compiler.target } : {}),
      ...(loaded.config.typecheck?.strictTemplates !== undefined
        ? { strictTemplates: loaded.config.typecheck.strictTemplates }
        : {}),
    }
  } catch {
    return {}
  }
}
