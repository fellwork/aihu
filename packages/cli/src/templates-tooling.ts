/**
 * Agent-tooling files emitted into every scaffolded project (on by default,
 * `--no-agent-tooling` opts out — see docs/plans/2026-07-26-scaffold-experience-design.md §6.7).
 *
 * Two different "AI" surfaces exist in an aihu scaffold, and this module is
 * only ONE of them: these files help a coding assistant work ON the codebase
 * (AGENTS.md rules, CLAUDE.md import, .mcp.json validation/example tools).
 * The app's own runtime agent surface — `$action`, llms.txt, the cards, the
 * capability bridge — is the product thesis and is never touched by the
 * opt-out flag.
 *
 * File-convention ground truth (verified against primary sources, 2026-07-26):
 *   - AGENTS.md is the open standard read natively by Codex, Cursor, GitHub
 *     Copilot, Google Antigravity, Jules, Zed, Devin, Amp, Windsurf, …
 *   - Claude Code reads CLAUDE.md, not AGENTS.md; Anthropic's docs recommend a
 *     one-line CLAUDE.md containing the `@AGENTS.md` import. The import beats
 *     create-astro's symlink: Windows-safe, and leaves room for Claude-specific
 *     lines later without forking the source of truth.
 *   - Root `.mcp.json` ({"mcpServers": …}) is Claude Code's project-scope MCP
 *     registration; Cursor reads the same schema at `.cursor/mcp.json`.
 *
 * The `.mcp.json` command is `npx aihu mcp serve` — NOT the bare `aihu` the
 * cf-team template uses, which only resolves when the CLI is globally
 * installed. Scaffolds carry `@aihu/cli` as a devDependency, so the command
 * must go through the package runner to find `node_modules/.bin/aihu`.
 *
 * Per the repo's dep-free thesis: pure string generators, no runtime file reads.
 */

/** Per-template facts AGENTS.md must state truthfully. */
export interface AgentsMdFacts {
  /** Project name (used for the title only). */
  readonly name: string
  /** `command` → one-line description; MUST match the emitted package.json scripts. */
  readonly commands: ReadonlyArray<readonly [string, string]>
  /** `path` → one-line description; MUST match the emitted file set. */
  readonly map: ReadonlyArray<readonly [string, string]>
}

/**
 * AGENTS.md — project rules for coding agents, per the agents.md standard.
 *
 * The five rules are the ones agents actually get wrong in `.aihu` files
 * (originally packages/cli/src/templates/AGENTS.md — which was emitted by
 * nothing, and whose rule-5 "Correct" example used the `$on:click` form its
 * own prose forbids; fixed here, source-of-truth'd here).
 */
export function projectAgentsMd(facts: AgentsMdFacts): string {
  const commandRows = facts.commands.map(([cmd, what]) => `| \`${cmd}\` | ${what} |`)
  const mapRows = facts.map.map(([p, what]) => `| \`${p}\` | ${what} |`)
  const lines = [
    `# ${facts.name} — agent guide`,
    '',
    'This is an aihu application: `.aihu` single-file components compiled to vanilla',
    'custom elements. The rules below are the patterns coding agents most often get',
    'wrong in `.aihu` files — follow them exactly. When unsure whether generated',
    'source compiles, use the `aihu_validate` MCP tool (registered in `.mcp.json`);',
    'for a canonical example of a pattern, use `aihu_example`.',
    '',
    '## Commands',
    '',
    '| Command | What it does |',
    '| --- | --- |',
    ...commandRows,
    '',
    '## Project map',
    '',
    '| Path | What it is |',
    '| --- | --- |',
    ...mapRows,
    '',
    '## 5 rules for .aihu files',
    '',
    '1. **Signal mutation goes through the setter, never direct assignment.** Signals',
    '   declared with `const [value, setValue] = signal(initial)` are read-only tuples:',
    '   `value` is a getter function, `setValue` is the only way to update it. To update',
    '   from the previous value, use the updater form: `setValue(prev => prev + 1)`.',
    '   Never write `value = newVal`, and never assign `$prop` values directly.',
    '',
    '   ```ts',
    '   // Wrong',
    '   count = 5',
    '   items = [...items, newItem]',
    '',
    '   // Correct',
    '   setCount(5)',
    '   setItems(prev => [...prev, newItem])',
    '   ```',
    '',
    '2. **Use v2 collection-form macros in `@state`, not v1 statement macros.** The v1',
    '   syntax used top-level statements (`$action name() { }`, `$computed name = expr`,',
    '   `$lifecycle.mount(() => { })`). Current v2 syntax groups these into object-literal',
    '   collection blocks. Never generate v1 statement macros; run `npx aihu migrate` to',
    '   upgrade old sources.',
    '',
    '   ```ts',
    '   // Wrong (v1)',
    '   $action increment() { setCount(count() + 1) }',
    '   $computed doubled = count() * 2',
    '',
    '   // Correct (v2)',
    '   $action: {',
    '     increment: {',
    "       describe: 'Add 1 to the value',",
    '       handler: () => setCount(count() + 1),',
    '     },',
    '   }',
    '   $computed: {',
    '     doubled: () => count() * 2,',
    '   }',
    '   ```',
    '',
    '3. **Import from `@aihu/*`, never `@scribe/*`.** The framework was renamed from',
    '   Scribe to aihu; there is no `@scribe/` scope. Any `@scribe/*` import is a build',
    '   failure.',
    '',
    '   ```ts',
    "   import { signal } from '@aihu/signals'      // correct",
    "   import { branch, leaf, mount } from '@aihu/arbor'",
    '   ```',
    '',
    '4. **Read signals as function calls in script; use bare names in template',
    '   expressions.** Inside `@state`, signals are getters — always call them:',
    '   `count()`, `items()`. In `@template` expressions the compiler auto-invokes',
    '   getters, so use the bare name: `{count}`, `if={items.length > 0}`. Exception:',
    '   inside inline JS expressions in templates (an event handler arrow), call them:',
    '   `on:click={() => setCount(count() + 1)}`.',
    '',
    '5. **Template directives are prefix-less colon forms; `$` belongs to `@state`',
    '   macros only.** Event handlers are `on:click`, `on:input`, `on:keydown` (dotted',
    '   modifiers allowed: `on:click.prevent`); two-way binding is `bind:value`. Control',
    '   flow is naked attributes: `if={…}`, `elseif={…}`, `else`, `each={item, i of items}`,',
    '   `key={…}`, `empty`. Reactive attribute values are plain braces',
    '   (`disabled={loading}`); quoted strings are static. Generating `$on:click`,',
    '   `$on.click`, `$bind:value`, `$if=`, or `$each=` as template attributes is always',
    '   wrong (compile errors C606/C607).',
    '',
    '   ```html',
    '   @template {',
    '     <!-- Correct -->',
    "     <input bind:value={draft} on:keydown={(e) => e.key === 'Enter' && submit()} />",
    '     <button on:click={submit}>Submit</button>',
    '     <li each={item, i of items} key={item.id}>{item.text}</li>',
    '',
    '     <!-- Wrong — $-prefixed forms are @state macros, not template attributes -->',
    '     <button $on:click={submit}>Submit</button>',
    '     <input $bind:value="draft" />',
    '   }',
    '   ```',
    '',
  ]
  return lines.join('\n')
}

/**
 * CLAUDE.md — Claude Code does not read AGENTS.md natively; per Anthropic's
 * own docs the recommended bridge is a one-line file importing it. Claude-
 * specific guidance can be added below the import without forking the rules.
 */
export function projectClaudeMd(): string {
  return '@AGENTS.md\n'
}

/**
 * .mcp.json — registers the aihu MCP server (project scope, Claude Code).
 * Serves `aihu_validate` (compile-check .aihu source) and `aihu_example`
 * (canonical cookbook lookup) over stdio via `aihu mcp serve`.
 * Cursor reads the same schema from `.cursor/mcp.json` — `cp` it if needed.
 */
export function projectMcpJson(): string {
  return `${JSON.stringify(
    {
      mcpServers: {
        aihu: {
          command: 'npx',
          args: ['aihu', 'mcp', 'serve'],
        },
      },
    },
    null,
    2,
  )}\n`
}

/** .vscode editor wiring — the same pair every template ships (extensions.json
 * recommends the aihu language extension; settings.json associates *.aihu).
 * Kept here so templates-full.ts can use it without importing index.ts back. */
export function vscodeFiles(): Array<readonly [string, string]> {
  return [
    [
      '.vscode/extensions.json',
      `${JSON.stringify({ recommendations: ['fellwork.vscode-aihu'] }, null, 2)}\n`,
    ],
    [
      '.vscode/settings.json',
      `${JSON.stringify(
        { 'files.associations': { '*.aihu': 'aihu' }, 'editor.formatOnSave': false },
        null,
        2,
      )}\n`,
    ],
  ]
}

/** The standard tooling file set, as `[path, content]` scaffold entries. */
export function agentToolingFiles(facts: AgentsMdFacts): Array<readonly [string, string]> {
  return [
    ['AGENTS.md', projectAgentsMd(facts)],
    ['CLAUDE.md', projectClaudeMd()],
    ['.mcp.json', projectMcpJson()],
  ]
}

/** AGENTS.md facts matching the vite-only templates (minimal | docs) exactly:
 * commands mirror `appPackageJson()`'s scripts; the map mirrors the emitted
 * file set. `full` builds its own facts in templates-full.ts. */
export function viteTemplateAgentsFacts(name: string): AgentsMdFacts {
  return {
    name,
    commands: [
      ['bun run dev', 'Vite dev server with hot reload'],
      ['bun run build', 'Static production build to dist/'],
      ['bun run preview', 'Serve the production build locally'],
      ['bun run typecheck', 'aihu-tsc — type-checks inside .aihu files (plain tsc cannot)'],
    ],
    map: [
      ['src/pages/*.aihu', 'Pages — file path is the route; @route names the custom-element tag'],
      ['vite.config.ts', 'viteAihuPlugin (compiler + router) and the agent-readiness pass'],
      [
        'index.html',
        'Document shell and <head> defaults — no <script> tag: viteAihuPlugin injects one at ' +
          'virtual:aihu-entry (createApp() mounting the router into #outlet). Add a real ' +
          'src/main.ts only if you need createApp(options) — it takes over automatically.',
      ],
    ],
  }
}

/**
 * `pnpm-workspace.yaml` for a scaffolded app — settings, not workspaces.
 *
 * Shipped even though a scaffold is a SINGLE package and declares no workspace
 * members, because current pnpm has moved its per-project settings out of
 * package.json and this file is now their only home. The `pnpm` key we used to
 * emit is not merely inert, it is announced as inert on every install:
 *
 *   [WARN] The "pnpm" field in package.json is no longer read by pnpm.
 *          The following keys were ignored: "pnpm.onlyBuiltDependencies".
 *
 * Which is what made the first attempt at this fix look right and measure
 * wrong: the key was emitted exactly as intended, and nothing read it. Run
 * 30365123040 still failed 4 of 4 pnpm cells at `install` with the same
 * ERR_PNPM_IGNORED_BUILDS as before the fix.
 *
 * MOVING THE KEY WAS NOT ENOUGH EITHER — the setting itself was renamed.
 * Putting `onlyBuiltDependencies` in this file failed too, and this time
 * SILENTLY: run 30367767061 on pnpm@11.17.0, same ERR_PNPM_IGNORED_BUILDS,
 * stderr completely empty, in both shapes (a settings-only file for the flat
 * scaffold and a real workspace file with `packages:` for cf-team). pnpm v11
 * replaced `onlyBuiltDependencies` / `neverBuiltDependencies` /
 * `ignoredBuiltDependencies` with a single `allowBuilds` map, and an
 * unrecognised legacy key is simply not read.
 *
 * `allowBuilds` is the pnpm counterpart of the `trustedDependencies` emitted
 * for bun, and it is not optional: pnpm blocks every lifecycle script by
 * default and — unlike bun, which blocks them SILENTLY — exits non-zero, so
 * `pnpm install` fails outright on a fresh scaffold before the user can reach a
 * build. `esbuild` is the entry that carries that load today: it postinstalls
 * its platform binary and is reached transitively through vite 6, and a blocked
 * script leaves the wrong-arch binary in place to resurface later as ENOEXEC.
 * `@aihu/compiler` is listed alongside it as a forward guard only — it ships no
 * install script since #370 replaced its postinstall with per-platform
 * optionalDependencies, so pnpm has nothing to block there today. Kept in step
 * with the bun-side list in `appPackageJson`; see that comment for the
 * measurements.
 *
 * Targets pnpm >=11 deliberately rather than emitting both spellings. The
 * legacy key is not merely redundant on v11 — pnpm auto-appends unlisted
 * build-script packages to this file, so a stale second list is a source of
 * drift, and a scaffold should teach the current shape rather than hedge.
 */
export function pnpmWorkspaceYaml(): string {
  return `# Settings, not workspaces. pnpm reads its per-project settings from this file
# only — the "pnpm" key in package.json is ignored, and pnpm says so on every
# install. This file is why \`pnpm install\` works here.
#
# allowBuilds is the pnpm equivalent of package.json's trustedDependencies
# (bun). esbuild postinstalls an arch-specific native binary, and pnpm blocks
# lifecycle scripts by default AND exits non-zero doing it, so without this the
# very first \`pnpm install\` fails with ERR_PNPM_IGNORED_BUILDS. @aihu/compiler
# ships no install script today (its native binary arrives as per-platform
# optionalDependencies) and is listed as a forward guard. Anything not listed
# here is denied by default.
#
# pnpm v11 renamed this: it was onlyBuiltDependencies (a list) through v10 and
# is now allowBuilds (a map). The old key is silently ignored, not warned about.
allowBuilds:
  '@aihu/compiler': true
  esbuild: true
`
}
