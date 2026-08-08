/**
 * @aihu/templates-cf-team — template manifest (compiled JS for Node.js compat).
 *
 * Authoritative source is template.config.ts. This file is the compiled
 * equivalent so that `loadTemplateConfig` can import it when running under
 * Node.js (which cannot import TypeScript natively). Bun prefers the .ts
 * file; Node.js falls through to this one.
 *
 * Keep in sync with template.config.ts — the two files must be semantically
 * identical. Only TypeScript-specific syntax is removed here.
 */

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
      choices: ['better-auth', 'kinde', 'supabase'],
      default: 'better-auth',
    },
    starter: { choices: ['live-counter', 'empty'], default: 'live-counter' },
    agentSurface: { choices: ['minimal', 'none'], default: 'minimal' },
    css: { choices: ['style-block'], default: 'style-block' },
    initGit: { choices: [true, false], default: true },
  },
  conditionalFiles: [
    { path: 'apps/web/src/components/live-counter.aihu', when: 'starter === "live-counter"' },
    { path: '.mcp.json', when: 'agentSurface !== "none"' },
    { path: 'apps/web/src/agent/aihu-expose.aihu', when: 'agentSurface !== "none"' },
    { path: 'apps/web/src/auth/better-auth.ts', when: 'auth === "better-auth"' },
    { path: 'apps/web/src/auth/kinde.ts', when: 'auth === "kinde"' },
    { path: 'apps/web/src/auth/supabase.ts', when: 'auth === "supabase"' },
    { path: 'apps/web/.env.example.better-auth', when: 'auth === "better-auth"' },
    { path: 'apps/web/.env.example.kinde', when: 'auth === "kinde"' },
    { path: 'apps/web/.env.example.supabase', when: 'auth === "supabase"' },
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
  // GENERATED ranges — see the same block in template.config.ts, and
  // scripts/sync-template-versions.ts.
  appPeerDeps: {
    '@aihu/runtime': '^6.0.0',
    '@aihu/arbor': '^4.1.0',
    '@aihu/signals': '^0.5.0',
    '@aihu/router': '^0.4.4',
    '@aihu/server': '^0.5.0',
    '@aihu/adapter-cloudflare': '^12.0.0',
  },
  appPeerDepsConditional: {
    'better-auth': { version: '^1.0.0', when: 'auth === "better-auth"' },
    '@kinde-oss/kinde-typescript-sdk': { version: '^2.0.0', when: 'auth === "kinde"' },
    '@supabase/supabase-js': { version: '^2.0.0', when: 'auth === "supabase"' },
  },
}

export default config
