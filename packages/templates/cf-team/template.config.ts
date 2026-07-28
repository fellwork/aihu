/**
 * @aihu/templates-cf-team — template manifest.
 *
 * Per arch-6 §2.3, this is the contract between `@aihu/cli` and this template
 * package. The CLI reads `config` (default export shape) at scaffold time and
 * uses it to drive prompts, conditional file inclusion, placeholder
 * substitution, post-install steps, and emitted `package.json` peer deps.
 *
 * §13 Q3 RESOLVED: `auth` is overridable across {better-auth, kinde, supabase}
 * with default `better-auth`. Each choice gates one config file under
 * `apps/web/src/auth/` and one `.env.example.<provider>`.
 *
 * §13 Q3 lock: `agentSurface` defaults to `'minimal'`; `.mcp.json` and
 * `apps/web/src/agent/aihu-expose.aihu` are emitted unless the user explicitly
 * opts out with `agentSurface: 'none'`.
 */

import type { TemplateManifest } from '@aihu/cli/template-manifest'

export const config = {
  name: '@aihu/templates-cf-team',
  displayName: 'Cloudflare · team-ready',
  description:
    'Cloudflare Workers + monorepo (bun workspaces + moon) + better-auth + Biome + commitlint + Vitest + agent-minimal',
  contractVersion: 1,
  cliRange: '^0.2.0',
  fixed: {
    vendor: 'cloudflare',
    persona: 'team',
    repo: 'monorepo-moon',
    lint: 'biome',
    ci: 'gh-actions-commitlint',
    test: 'vitest',
  },
  overridable: {
    auth: {
      // §13 Q3 RESOLVED: 3 third-party auth providers as a runtime prompt.
      // @aihu/auth joins this list once RFC #56 ratifies — not in v0.2.0.
      choices: ['better-auth', 'kinde', 'supabase'],
      default: 'better-auth',
    },
    starter: { choices: ['live-counter', 'empty'], default: 'live-counter' },
    agentSurface: { choices: ['minimal', 'none'], default: 'minimal' },
    css: { choices: ['style-block'], default: 'style-block' }, // tailwind in v0.2.1
    initGit: { choices: [true, false], default: true },
  },
  conditionalFiles: [
    { path: 'apps/web/src/components/live-counter.aihu', when: 'starter === "live-counter"' },
    { path: '.mcp.json', when: 'agentSurface !== "none"' },
    { path: 'apps/web/src/agent/aihu-expose.aihu', when: 'agentSurface !== "none"' },
    // Per-auth-provider conditional file sets (§13 Q3 propagation):
    { path: 'apps/web/src/auth/better-auth.ts', when: 'auth === "better-auth"' },
    { path: 'apps/web/src/auth/kinde.ts', when: 'auth === "kinde"' },
    { path: 'apps/web/src/auth/supabase.ts', when: 'auth === "supabase"' },
    // F-5b: rename provider-specific .env.example files to .env.example so
    // .gitignore patterns work and developer expectations are met.
    {
      path: 'apps/web/.env.example.better-auth',
      when: 'auth === "better-auth"',
      rename: '.env.example',
    },
    { path: 'apps/web/.env.example.kinde', when: 'auth === "kinde"', rename: '.env.example' },
    { path: 'apps/web/.env.example.supabase', when: 'auth === "supabase"', rename: '.env.example' },
  ],
  placeholders: [
    'APP_NAME',
    'APP_DESCRIPTION',
    'APP_VERSION',
    'AIHU_VERSION',
    'TEMPLATE_NAME',
    'SCAFFOLD_DATE',
  ],
  postInstall: [
    { kind: 'pm-install' },
    { kind: 'git-init', when: 'initGit' },
    { kind: 'lint-fix', allowFailure: true },
  ],
  // Aihu framework runtime peer deps. Pinned to ^0.2.0 because the framework
  // is shipping its v0.2.0 alpha alongside the CLI templates and the package
  // names must resolve against npm at scaffold time. Bumps to ^1.0.0 land
  // when the framework cuts its 1.0.
  appPeerDeps: {
    '@aihu/runtime': '^0.2.0',
    '@aihu/arbor': '^0.2.0',
    '@aihu/signals': '^0.2.0',
    '@aihu/router': '^0.2.0',
    '@aihu/server': '^0.2.0',
    '@aihu/adapter-cloudflare': '^0.2.0',
  },
  appPeerDepsConditional: {
    'better-auth': { version: '^1.0.0', when: 'auth === "better-auth"' },
    '@kinde-oss/kinde-typescript-sdk': { version: '^2.0.0', when: 'auth === "kinde"' },
    '@supabase/supabase-js': { version: '^2.0.0', when: 'auth === "supabase"' },
  },
} satisfies TemplateManifest

export default config
