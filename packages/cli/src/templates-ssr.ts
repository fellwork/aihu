/**
 * `--template ssr` generators — a Cloudflare Worker that server-renders.
 *
 * ## What this is, and why it is its own template
 *
 * `minimal`, `docs`, `full` and `agent` all produce a CLIENT build: `vite
 * build` writes `dist/` and the browser does the rendering. `output: 'ssr'`
 * produces a second artifact — `dist-server/_worker.js`, a real Cloudflare
 * Worker whose `fetch` renders the matched route to HTML before the browser
 * has run a line of JavaScript.
 *
 * Until this template existed, `output: 'ssr'` was reachable from NO scaffold.
 * The only consumer-shaped tree that exercised it was a POST-SCAFFOLD PATCH
 * inside `packages/cli/tests/scaffold-matrix-e2e.ts`: scaffold `minimal`, then
 * rewrite its `vite.config.ts`. That was a deliberate stopgap (its own docblock
 * says so, and predicted this file: "the day a real `ssr` template lands, this
 * becomes `{ id: 'ssr', kind: 'create' }` and the patch goes away"). A harness
 * patch is not a product surface — it could not be typed, could not be
 * reviewed as a scaffold, and no user could ask for it.
 *
 * ## The three options `output: 'ssr'` actually requires
 *
 * All three are emitted below, and none is optional:
 *
 *   1. `output: 'ssr'` — switches the build from one client environment to a
 *      client + SSR pair.
 *   2. `css: { shadowMode: 'light' }` — REQUIRED. Without it leaf components
 *      export no `__aihu_shadow__`, every child renders empty, and the build
 *      refuses rather than letting that ship silently.
 *   3. `adapter: cloudflare(...)` — what makes the SSR bundle a *Worker*
 *      (`export default { fetch }` + the ASSETS fallthrough) rather than a bare
 *      node SSR bundle.
 *
 * ## No `preview` script, and no `wrangler` dependency
 *
 * `vite preview` serves the CLIENT outDir as static files. Under `output:
 * 'ssr'` the thing that has to answer is the Worker, so a green `vite preview`
 * would be a 200 on a page the Worker never rendered — the wrong artifact,
 * reported as success. It is omitted rather than emitted-and-caveated.
 *
 * `wrangler` is likewise NOT a devDependency. `wrangler dev` / `wrangler
 * deploy` are the real answers and `npx wrangler` runs them without adding
 * ~100MB and a second native-binary delivery mechanism to every scaffold. The
 * adapter WRITES `wrangler.toml` at build time (it never overwrites one), so
 * `npx wrangler deploy` works with no configuration step.
 *
 * Per the repo's dep-free thesis: pure string generators, no runtime file reads.
 */

import { aihuDep } from './dep-versions.js'

/**
 * package.json for the `ssr` template.
 *
 * Deliberately built as its own object rather than by spreading
 * `appPackageJson()`: the differences are not additive. The scripts differ
 * (no `preview`, see the module docblock), the dependency set gains
 * `@aihu/adapter-cloudflare`, and `@aihu-plugin/agent-readiness` moves nowhere
 * — a "base + overrides" shape would hide which of those are real and which
 * are inherited.
 */
export function ssrPackageJson(name: string, pm = 'bun', withCssEngine = false): string {
  const bunVersion =
    (globalThis as { Bun?: { version: string } }).Bun?.version ?? process.versions.bun
  const packageManager = pm === 'bun' && bunVersion ? `bun@${bunVersion}` : undefined

  return JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite',
        // Emits BOTH artifacts: `dist/` (client) and `dist-server/_worker.js`
        // (the Worker), plus a `wrangler.toml` if none exists yet.
        build: 'vite build',
        typecheck: 'aihu-tsc',
      },
      dependencies: {
        // The adapter. Everything else in this list is the same transitive peer
        // closure `minimal` installs — see `appPackageJson`'s comments in
        // index.ts for why each entry is named explicitly rather than left to a
        // package manager's auto-peer behaviour (yarn 1 has none).
        '@aihu/adapter-cloudflare': aihuDep('@aihu/adapter-cloudflare'),
        '@aihu/agent': aihuDep('@aihu/agent'),
        '@aihu/app': aihuDep('@aihu/app'),
        '@aihu/arbor': aihuDep('@aihu/arbor'),
        '@aihu/context': aihuDep('@aihu/context'),
        // Only for `--css engine`, exactly as in `appPackageJson`: the OOTB
        // utility-class page needs the optional compiler peer to resolve, and
        // `output: 'ssr'` already forces the `shadowMode: 'light'` this pack
        // folds into the global cascade under.
        ...(withCssEngine ? { '@aihu/css-engine': aihuDep('@aihu/css-engine') } : {}),
        '@aihu/router': aihuDep('@aihu/router'),
        '@aihu/runtime': aihuDep('@aihu/runtime'),
        '@aihu/server': aihuDep('@aihu/server'),
        '@aihu/signals': aihuDep('@aihu/signals'),
        '@aihu/store': aihuDep('@aihu/store'),
      },
      devDependencies: {
        '@aihu-plugin/agent-readiness': aihuDep('@aihu-plugin/agent-readiness'),
        '@aihu/cli': aihuDep('@aihu/cli'),
        '@aihu/compiler': aihuDep('@aihu/compiler'),
        '@aihu/tsc': aihuDep('@aihu/tsc'),
        typescript: '^5.0.0',
        vite: aihuDep('vite'),
      },
      // Same list and same reasoning as `appPackageJson` — see that comment.
      trustedDependencies: ['@aihu/compiler', 'esbuild'],
      ...(packageManager ? { packageManager } : {}),
    },
    null,
    2,
  )
}

/**
 * vite.config.ts for the `ssr` template.
 *
 * `rootTag` is passed in rather than derived here so this module does not have
 * to import `toSafe` from `./index.js` — index.ts imports THIS file, and a
 * cycle between the two would be a real hazard in the bundled CLI, not a
 * cosmetic one.
 */
export function ssrViteConfig(appName: string, rootTag: string): string {
  const tag = rootTag
  return `import { cloudflare } from '@aihu/adapter-cloudflare'
import { viteAihuPlugin } from '@aihu/app'
import { defineConfig } from 'vite'

export default defineConfig({
  // Vite/esbuild pre-bundles dependencies for dev. \`@aihu/app\`'s client entry
  // imports the \`virtual:aihu-routes\` / \`virtual:aihu-layouts\` modules that the
  // router plugin resolves at request time — esbuild's pre-bundle pass can't see
  // them, so it MUST be excluded or \`vite dev\` fails to start.
  optimizeDeps: { exclude: ['@aihu/app'] },
  plugins: [
    viteAihuPlugin({
      // ── Server-side rendering ─────────────────────────────────────────
      // \`vite build\` now emits TWO things: dist/ (the client bundle and its
      // index.html) and dist-server/_worker.js (a Cloudflare Worker whose
      // fetch() renders the matched route to a complete HTML document, with
      // the hashed client script tag spliced in so it hydrates).
      output: 'ssr',

      // REQUIRED by output:'ssr', not a style preference. Under shadow DOM a
      // leaf component exports no __aihu_shadow__, so every CHILD component
      // renders empty server-side. The build refuses rather than shipping a
      // page whose nested components are blank.
      css: { shadowMode: 'light' },

      // What turns the SSR bundle into a Worker: \`export default { fetch }\`,
      // plus the ASSETS fallthrough that serves dist/ from Cloudflare's edge
      // for anything the SSR handler 404s. Also writes wrangler.toml on the
      // first build (never overwrites an existing one), so the next step is
      // literally \`npx wrangler deploy\`.
      adapter: cloudflare({ name: '${appName}' }),

      dir: { pages: 'src/pages' },

      app: {
        head: {
          title: '${appName}',
        },
      },

      // ── Agent + SEO surface ───────────────────────────────────────────
      // Emits /llms.txt, /llms-full.txt, /robots.txt and JSON-LD.
      //
      // Honesty rule, as in every other template: <${tag}>'s
      // \`$action\` entries are DECLARED here, not served as callable tools —
      // this scaffold registers no MCP endpoint, so no \`endpoint\` and no A2A
      // card are published. Unlike the static templates, the Worker this build
      // produces is a real server, so wiring \`@aihu/agent-server\` into it and
      // setting \`endpoint\` to the deployed URL is a change of configuration
      // rather than a change of architecture.
      agentReadiness: {
        name: '${appName}',
        summary:
          'A server-rendered aihu app on Cloudflare Workers. Component actions are ' +
          'declared in source; no live tool endpoint is served here yet.',
        version: '0.1.0',
        // Replace with your deployed origin. Drives JSON-LD, robots'
        // Sitemap: line, and absolute URLs in the generated documents.
        siteUrl: 'https://example.com',
      },
    }),
  ],
})
`
}

/** README.md for the `ssr` template — the deploy story, which is not obvious. */
export function ssrReadme(name: string): string {
  return `# ${name}

A server-rendered aihu app that deploys as a **Cloudflare Worker**.

## Commands

| Command | What it does |
| --- | --- |
| \`bun run dev\` | Vite dev server with hot reload |
| \`bun run build\` | Client bundle → \`dist/\`, Worker → \`dist-server/_worker.js\` |
| \`bun run typecheck\` | \`aihu-tsc\` — type-checks inside \`.aihu\` files (plain \`tsc\` cannot) |
| \`npx wrangler dev\` | Run the built Worker locally |
| \`npx wrangler deploy\` | Ship it |

There is deliberately no \`preview\` script. \`vite preview\` serves \`dist/\` as
static files, which is the CLIENT build — it would answer 200 on a page the
Worker never rendered. Use \`wrangler dev\`, which runs the real artifact.

## What the build produces

\`\`\`
dist/                    client bundle + index.html  (served by the ASSETS binding)
dist-server/_worker.js   the Worker                  (renders routes to HTML)
wrangler.toml            written on the first build, never overwritten
\`\`\`

A request is answered in this order: your SSR routes first, then \`dist/\` from
Cloudflare's edge, then \`/index.html\` as the SPA shell.

## SSR-specific configuration

\`vite.config.ts\` carries three options that belong together —
\`output: 'ssr'\`, \`css: { shadowMode: 'light' }\` and \`adapter: cloudflare(...)\`.
The middle one is not a style choice: shadow-DOM leaves render empty
server-side, so the build refuses without it. Each is commented in place.

## Adding a page

Every \`.aihu\` file under \`src/pages\` is a route, and its \`@route { name }\`
block is the custom-element tag it registers under. That tag must contain a
hyphen or the route never mounts.
`
}

/** AGENTS.md facts for the `ssr` template — commands mirror `ssrPackageJson`. */
export function ssrAgentsFacts(name: string): {
  name: string
  commands: ReadonlyArray<readonly [string, string]>
  map: ReadonlyArray<readonly [string, string]>
} {
  return {
    name,
    commands: [
      ['bun run dev', 'Vite dev server with hot reload'],
      ['bun run build', 'Client bundle to dist/ AND the Worker to dist-server/_worker.js'],
      ['bun run typecheck', 'aihu-tsc — type-checks inside .aihu files (plain tsc cannot)'],
      ['npx wrangler dev', 'Run the built Worker locally (there is no `preview` script)'],
      ['npx wrangler deploy', 'Deploy the Worker to Cloudflare'],
    ],
    map: [
      ['src/pages/*.aihu', 'Pages — file path is the route; @route names the custom-element tag'],
      [
        'vite.config.ts',
        "viteAihuPlugin with output:'ssr' + css.shadowMode:'light' + the Cloudflare adapter. " +
          'All three are required together; shadowMode is not a style choice.',
      ],
      [
        'index.html',
        'Document shell the Worker splices the rendered page into, at #outlet. No <script> ' +
          'tag: the build injects the hashed client entry so the SSR response hydrates.',
      ],
      ['dist-server/_worker.js', 'BUILD OUTPUT — the deployed Worker. Never edit; never commit.'],
      ['wrangler.toml', 'Written by the adapter on the first build. Yours to edit after that.'],
    ],
  }
}
