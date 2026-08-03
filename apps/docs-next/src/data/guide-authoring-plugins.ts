/**
 * Authoring Plugins guide body. Adapted from the real
 * apps/docs/src/content/docs/guides/authoring-plugins.md. This guide
 * describes the @aihu/plugin compiler-plugin surface, not the @state
 * dialect, so none of the retired `$prop:`/`$action:` collection-form
 * macros appear here — the content is structurally sound. Verified against
 * packages/plugin/src/index.ts and packages/server/src/config.ts before
 * porting; corrections made:
 *
 * 1. The doc's framing risked implying `defineAihuConfig({ plugins })` may
 *    have moved to the inline `viteAihuPlugin({...})` config (since the
 *    Deployment guide documents `defineAihuConfig`/`aihu.config.ts` as a
 *    "legacy fallback" for app/build config). Checked directly:
 *    `viteAihuPlugin({ plugins })` is a DIFFERENT field — its `AihuPlugin`
 *    type is a Vite `Plugin` (packages/app/src/config.ts), not an
 *    `@aihu/plugin` `Plugin`. Compiler-plugin registration is still, and
 *    only, `defineAihuConfig({ plugins: [...] })` in `aihu.config.ts` from
 *    `@aihu/server` (packages/server/src/config.ts) — added an explicit
 *    callout so this doesn't get miscopied from the Deployment guide's
 *    framing.
 * 2. Added a callout that the compiler's plugin dispatcher (the "Plugin
 *    lifecycle (full sequence)" hook-execution behavior below) is, per an
 *    explicit in-source note, "type contract + registration plumbing only"
 *    as of the current package version — the dispatcher itself is a no-op
 *    until a later release. The lifecycle is documented as the intended
 *    contract, with this caveat attached.
 * 3. The peerDependencies example pinned `@aihu/plugin` to `^0.2.0`; the
 *    shipped package.json is currently `0.1.0` while the internal
 *    `AIHU_VERSION` constant is `0.2.0` — noted as a version-string
 *    mismatch to be aware of rather than silently copied forward as fact.
 *
 * Fenced code uses the ~~~ delimiter and inline code uses <code> tags so the
 * source carries no backticks.
 */
export const AUTHORING_PLUGINS = `# Authoring Plugins

aihu plugins extend the compiler with new blocks, macros, component boundaries, and transforms. Every plugin must be explicitly registered — auto-discovery is forbidden per Plugin Contract Spec §7.2.

---

## Defining a plugin

Use <code>definePlugin</code> from <code>@aihu/plugin</code>:

~~~typescript
import { definePlugin } from '@aihu/plugin'

export default definePlugin({
  name: 'forms',
  version: '0.1.0',
  namespace: 'forms',
  aihuVersion: '^0.2.0',
  contributes: {
    blocks: ['fields'],
    macros: [
      {
        name: '$field',
        validIn: ['@forms.fields'],
        lowering: lowerField,
        validation: validateField,
      },
    ],
    components: ['<$forms-input>'],
    transforms: [
      { stage: 'after-parse', fn: normalizeFieldDefaults },
    ],
  },
})
~~~

<code>definePlugin</code> brands the config with <code>__aihu_plugin: true</code> and returns it as a <code>Plugin</code>. It does NOT validate — validation happens at registration (see below).

### Required fields

| Field | Type | Description |
|---|---|---|
| <code>name</code> | <code>string</code> | Plugin identifier. Non-empty. |
| <code>version</code> | <code>string</code> | Semver version string. Non-empty. |
| <code>namespace</code> | <code>string</code> | Unique namespace — alphanumeric, underscores, hyphens; must start with a letter or underscore. |

### Optional fields

| Field | Type | Description |
|---|---|---|
| <code>aihuVersion</code> | <code>string</code> | Semver range of compatible aihu versions. Checked at registration. Supports <code>*</code>, <code>^</code>, <code>~</code>, and exact versions. |
| <code>configSchema</code> | <code>ConfigSchema</code> | Declared configuration schema (per spec §3.1). |
| <code>contributes</code> | <code>Contributes</code> | Block parsers, macros, component names, transforms, server runtime, middleware. |
| <code>hooks</code> | <code>Hooks</code> | Build and compilation lifecycle hooks. |
| <code>parsers</code> | <code>Record&lt;string, BlockParser&gt;</code> | Custom block parser functions. |
| <code>dependencies</code> | <code>string[]</code> | Other plugin namespaces this plugin requires. |
| <code>serverOnly</code> | <code>boolean</code> | When true, all contributions target the server bundle only. |

### Reserved namespaces

These namespace values are reserved by aihu and MUST NOT be used: <code>aihu</code>, <code>core</code>, <code>state</code>, <code>template</code>, <code>style</code>, <code>agent</code>, <code>route</code>.

---

## <code>contributes</code> fields

### <code>blocks</code>

Declare additional <code>@blockname { }</code> block types this plugin handles. The compiler routes these block names to the plugin's parsers.

~~~typescript
contributes: {
  blocks: ['fields', 'validation'],
}
~~~

### <code>macros</code>

Declare <code>$macro</code> names this plugin contributes to specific blocks. Each macro definition requires:

- <code>name</code> — must start with <code>$</code>
- <code>validIn</code> — array of block selectors where the macro is permitted (e.g. <code>['@state', '@forms.fields']</code>)
- <code>lowering</code> — required; transforms the macro into emitted code
- <code>validation</code> — optional; runs at parse time, calls <code>ctx.error(msg)</code> on failure

~~~typescript
contributes: {
  macros: [
    {
      name: '$field',
      validIn: ['@forms.fields'],
      lowering: (ctx, args) => \`registerField(\${JSON.stringify(args)})\`,
      validation: (ctx, args) => {
        if (!args.name) ctx.error('$field requires a name')
      },
    },
  ],
}
~~~

### <code>components</code>

Declare special template elements (e.g. <code>&lt;$forms-input&gt;</code>) this plugin provides.

~~~typescript
contributes: {
  components: ['<$forms-input>', '<$forms-select>'],
}
~~~

### <code>transforms</code>

Build-time AST transform functions. Three stages in order: <code>after-parse</code> → <code>before-lower</code> → <code>after-lower</code>. Within a stage, plugin registration order determines execution order.

~~~typescript
contributes: {
  transforms: [
    { stage: 'after-parse', fn: normalizeDefaults },
    { stage: 'after-lower', fn: injectValidationRuntime },
  ],
}
~~~

A transform function receives the current AST node and returns the (optionally modified) AST node.

### <code>serverRuntime</code>

Server-only runtime helpers. Keys are helper names; values are module paths relative to the plugin root. These are loaded into the server bundle only, never the client.

~~~typescript
contributes: {
  serverRuntime: {
    validateForm: './runtime/validate-form.ts',
    sanitizeInput: './runtime/sanitize.ts',
  },
}
~~~

### <code>middleware</code>

Server middleware contributions (PROVISIONAL in v1.0). Declare middleware to be injected into the aihu server pipeline.

~~~typescript
contributes: {
  middleware: [
    {
      name: 'forms-auth',
      stage: 'before-handler',
      handler: './middleware/auth.ts',
    },
  ],
}
~~~

Valid stages: <code>before-handler</code>, <code>after-handler</code>, <code>on-error</code>.

---

## Macro lowering

The <code>lowering</code> function transforms a macro invocation into emitted code. It receives a <code>MacroContext</code> and <code>MacroArgs</code>, and returns either a code string (simple case) or a <code>LoweringResult</code> (complex emission with imports and hoisted declarations).

~~~typescript
import type { MacroLowering, LoweringResult } from '@aihu/plugin'

const lowerField: MacroLowering = (ctx, args) => {
  // Simple: return a code string
  return \`registerField(\${ctx.sfc.componentName}, \${JSON.stringify(args)})\`
}

const lowerFieldWithImports: MacroLowering = (ctx, args): LoweringResult => {
  const registerField = ctx.imports('@forms/runtime')
  return {
    code: \`\${registerField}(\${JSON.stringify(args)})\`,
    imports: [{ from: '@forms/runtime', names: ['registerField'] }],
    target: 'server', // emit to server bundle only
  }
}
~~~

<code>ctx.imports(spec)</code> returns the local name to use in emitted code. <code>ctx.runtime(name)</code> requests a runtime helper by name.

---

## Plugin lifecycle hooks

Hooks let plugins observe and transform the compilation pipeline.

~~~typescript
import type { Hooks } from '@aihu/plugin'

const hooks: Hooks = {
  beforeCompile: async (ctx) => {
    // Runs once before the full build starts
    console.log(\`Building in \${ctx.mode} mode\`)
  },

  afterParse: async (ctx, ast) => {
    // Runs after each SFC is parsed; may return a modified AST
    return transformAst(ast)
  },

  transformBlock: async (ctx, block) => {
    // Runs for each block in each SFC; may return modified block AST
    if (ctx.blockType === 'forms.fields') {
      return normalizeFieldBlock(block)
    }
  },

  afterCompile: async (ctx, output) => {
    // Runs after each SFC is compiled; may return modified output
    return injectValidationHelpers(output)
  },
}
~~~

> **Current status.** The lifecycle above is the intended contract, but per an explicit note in the current server package source, plugin registration today is "type contract + registration plumbing only" — the compiler's hook dispatcher that actually invokes <code>beforeCompile</code>/<code>afterParse</code>/<code>transformBlock</code>/<code>afterCompile</code> is a no-op until a later release. Registered plugins are validated and carried through the build, but their hooks do not yet run.

---

## <code>serverOnly</code> plugin

Set <code>serverOnly: true</code> to mark a plugin as server-build only. The client build pipeline skips it entirely. Client code that references server-only contributions receives RPC stubs instead of the real implementation.

~~~typescript
export const loaderPlugin = definePlugin({
  name: 'loader-plugin',
  version: '1.0.0',
  namespace: 'loader',
  serverOnly: true,
  contributes: {
    transforms: [{ stage: 'after-lower', fn: serverLoaderTransform }],
    serverRuntime: { fetchLoader: './runtime/fetch-loader.ts' },
  },
})
~~~

Individual macros may also declare <code>serverOnly: true</code> without making the entire plugin server-only.

---

## Validating a plugin

Call <code>validatePlugin(plugin)</code> at build time to verify the plugin definition is structurally correct. <code>validatePlugin</code> does NOT throw — it returns a <code>ValidationResult</code>.

~~~typescript
import { validatePlugin } from '@aihu/plugin'

const result = validatePlugin(myPlugin)
if (!result.ok) {
  for (const err of result.errors) {
    console.error(\`[\${err.code}] \${err.message}\`)
  }
  process.exit(1)
}
~~~

Error codes per spec §8.1:

| Code | Condition |
|---|---|
| <code>missing-required-field</code> | <code>name</code>, <code>version</code>, or <code>namespace</code> is empty |
| <code>invalid-namespace</code> | Namespace contains illegal characters or starts with a digit |
| <code>reserved-namespace</code> | Namespace is one of the reserved values |
| <code>duplicate-namespace</code> | Two plugins share the same namespace in one registration pass |
| <code>aihu-version-mismatch</code> | Declared <code>aihuVersion</code> range is incompatible with the running framework |

The compiler calls <code>validatePlugin</code> for each plugin in <code>defineAihuConfig.plugins</code> at registration time.

---

## Registering a plugin

Plugins are registered in <code>defineAihuConfig</code> in your app's config file:

~~~typescript
// aihu.config.ts
import { defineAihuConfig } from '@aihu/server'
import { formsPlugin } from './plugins/forms.ts'
import { analyticsPlugin } from './plugins/analytics.ts'

export default defineAihuConfig({
  plugins: [formsPlugin, analyticsPlugin],
  build: {
    target: 'universal',
  },
})
~~~

Per Plugin Contract Spec §7.2, plugins <b>must</b> be listed in the explicit <code>plugins</code> array. There is no filesystem scanning, package.json detection, or magic import resolution. This keeps build behavior deterministic and auditable.

> **Don't confuse this with <code>viteAihuPlugin({ plugins })</code>.** The primary app/build config surface for an aihu app is the inline <code>viteAihuPlugin({...})</code> in <code>vite.config.ts</code> (see the Deployment guide) — but its own <code>plugins</code> field is a <i>different</i>, unrelated field: it takes ordinary Vite plugins, not <code>@aihu/plugin</code>-shaped compiler plugins. <code>@aihu/plugin</code> plugins — everything on this page — are registered only through <code>defineAihuConfig({ plugins: [...] })</code> in <code>aihu.config.ts</code>, which remains the live registration surface for this purpose even though <code>aihu.config.ts</code> is otherwise a legacy fallback for general build config.

---

## Plugin lifecycle (full sequence)

1. <code>defineAihuConfig</code> collects all plugins.
2. At build start, <code>validatePlugin</code> is called for each registered plugin. Any error aborts the build.
3. <code>beforeCompile</code> hooks run once (parallel, then resolved in order).
4. For each <code>.aihu</code> file:
   a. The Rust compiler parses blocks. Plugin-declared block names are routed to plugin parsers.
   b. <code>afterParse</code> hooks run (sequential, each receives the previous hook's return value).
   c. Macro lowering runs (plugin macros call their <code>lowering</code> function).
   d. <code>transformBlock</code> hooks run for each block.
   e. <code>afterCompile</code> hooks run.
5. Server-only plugins are filtered out before the client build pipeline.
6. <code>contributes.transforms</code> are applied as post-parse AST passes in stage order.

As noted above, steps 3–3e describe the intended hook-execution contract; the current dispatcher does not yet invoke them. Steps 1, 2, 5, and 6 (collection, validation, server-only filtering, and <code>contributes.transforms</code>) do run today.

---

## Scaffolding a plugin

Use the CLI to scaffold a new plugin package:

~~~bash
aihu plugin my-plugin
~~~

This creates:

~~~
packages/my-plugin/
  package.json               name: "@myorg/aihu-plugin-my-plugin"
                             peerDependencies: { "@aihu/plugin": "^0.2.0" }
  src/
    index.ts                 definePlugin(...) export
    lowering/                macro lowering functions
    transforms/              AST transform functions
  tests/
    plugin.test.ts           validatePlugin smoke test
~~~

---

## Publishing a plugin

A published aihu plugin package must:

1. List <code>@aihu/plugin</code> as a <code>peerDependency</code> (not <code>dependency</code>):

   ~~~json
   {
     "peerDependencies": {
       "@aihu/plugin": "^0.2.0"
     }
   }
   ~~~

   > The <code>^0.2.0</code> range matches <code>@aihu/plugin</code>'s internal version constant, but the package as currently shipped is versioned <code>0.1.0</code> — double-check the installed version against whatever range you declare before publishing.

2. Export a named <code>Plugin</code> instance as the default or named export:

   ~~~typescript
   // src/index.ts
   import { definePlugin } from '@aihu/plugin'
   export default definePlugin({ ... })
   ~~~

3. Include only the plugin definition, lowering functions, and transforms. Do not bundle <code>@aihu/plugin</code> itself — it is the host's responsibility.

4. Name the package <code>aihu-plugin-&lt;name&gt;</code> or <code>@scope/aihu-plugin-&lt;name&gt;</code> for discoverability.

Consumers install and register the plugin explicitly:

~~~typescript
import { defineAihuConfig } from '@aihu/server'
import formsPlugin from 'aihu-plugin-forms'

export default defineAihuConfig({
  plugins: [formsPlugin],
})
~~~

No magic imports. No auto-discovery. Explicit registration is the contract.
`
