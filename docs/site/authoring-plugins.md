# Authoring Plugins

aihu plugins extend the compiler with new blocks, macros, component boundaries, and transforms. Every plugin must be explicitly registered — auto-discovery is forbidden per Plugin Contract Spec §7.2.

---

## Defining a plugin

Use `definePlugin` from `@aihu/plugin`:

```typescript
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
```

`definePlugin` brands the config with `__aihu_plugin: true` and returns it as a `Plugin`. It does NOT validate — validation happens at registration (see below).

### Required fields

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Plugin identifier. Non-empty. |
| `version` | `string` | Semver version string. Non-empty. |
| `namespace` | `string` | Unique namespace — alphanumeric, underscores, hyphens; must start with a letter or underscore. |

### Optional fields

| Field | Type | Description |
|---|---|---|
| `aihuVersion` | `string` | Semver range of compatible aihu versions. Checked at registration. Supports `*`, `^`, `~`, and exact versions. |
| `configSchema` | `ConfigSchema` | Declared configuration schema (per spec §3.1). |
| `contributes` | `Contributes` | Block parsers, macros, component names, transforms, server runtime, middleware. |
| `hooks` | `Hooks` | Build and compilation lifecycle hooks. |
| `parsers` | `Record<string, BlockParser>` | Custom block parser functions. |
| `dependencies` | `string[]` | Other plugin namespaces this plugin requires. |
| `serverOnly` | `boolean` | When true, all contributions target the server bundle only. |

### Reserved namespaces

These namespace values are reserved by aihu and MUST NOT be used: `aihu`, `core`, `state`, `template`, `style`, `agent`, `route`.

---

## `contributes` fields

### `blocks`

Declare additional `@blockname { }` block types this plugin handles. The compiler routes these block names to the plugin's parsers.

```typescript
contributes: {
  blocks: ['fields', 'validation'],
}
```

### `macros`

Declare `$macro` names this plugin contributes to specific blocks. Each macro definition requires:

- `name` — must start with `$`
- `validIn` — array of block selectors where the macro is permitted (e.g. `['@state', '@forms.fields']`)
- `lowering` — required; transforms the macro into emitted code
- `validation` — optional; runs at parse time, calls `ctx.error(msg)` on failure

```typescript
contributes: {
  macros: [
    {
      name: '$field',
      validIn: ['@forms.fields'],
      lowering: (ctx, args) => `registerField(${JSON.stringify(args)})`,
      validation: (ctx, args) => {
        if (!args.name) ctx.error('$field requires a name')
      },
    },
  ],
}
```

### `components`

Declare special template elements (e.g. `<$forms-input>`) this plugin provides.

```typescript
contributes: {
  components: ['<$forms-input>', '<$forms-select>'],
}
```

### `transforms`

Build-time AST transform functions. Three stages in order: `after-parse` → `before-lower` → `after-lower`. Within a stage, plugin registration order determines execution order.

```typescript
contributes: {
  transforms: [
    { stage: 'after-parse', fn: normalizeDefaults },
    { stage: 'after-lower', fn: injectValidationRuntime },
  ],
}
```

A transform function receives the current AST node and returns the (optionally modified) AST node.

### `serverRuntime`

Server-only runtime helpers. Keys are helper names; values are module paths relative to the plugin root. These are loaded into the server bundle only, never the client.

```typescript
contributes: {
  serverRuntime: {
    validateForm: './runtime/validate-form.ts',
    sanitizeInput: './runtime/sanitize.ts',
  },
}
```

### `middleware`

Server middleware contributions (PROVISIONAL in v1.0). Declare middleware to be injected into the aihu server pipeline.

```typescript
contributes: {
  middleware: [
    {
      name: 'forms-auth',
      stage: 'before-handler',
      handler: './middleware/auth.ts',
    },
  ],
}
```

Valid stages: `before-handler`, `after-handler`, `on-error`.

---

## Macro lowering

The `lowering` function transforms a macro invocation into emitted code. It receives a `MacroContext` and `MacroArgs`, and returns either a code string (simple case) or a `LoweringResult` (complex emission with imports and hoisted declarations).

```typescript
import type { MacroLowering, LoweringResult } from '@aihu/plugin'

const lowerField: MacroLowering = (ctx, args) => {
  // Simple: return a code string
  return `registerField(${ctx.sfc.componentName}, ${JSON.stringify(args)})`
}

const lowerFieldWithImports: MacroLowering = (ctx, args): LoweringResult => {
  const registerField = ctx.imports('@forms/runtime')
  return {
    code: `${registerField}(${JSON.stringify(args)})`,
    imports: [{ from: '@forms/runtime', names: ['registerField'] }],
    target: 'server', // emit to server bundle only
  }
}
```

`ctx.imports(spec)` returns the local name to use in emitted code. `ctx.runtime(name)` requests a runtime helper by name.

---

## Plugin lifecycle hooks

Hooks let plugins observe and transform the compilation pipeline.

```typescript
import type { Hooks } from '@aihu/plugin'

const hooks: Hooks = {
  beforeCompile: async (ctx) => {
    // Runs once before the full build starts
    console.log(`Building in ${ctx.mode} mode`)
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
```

---

## `serverOnly` plugin

Set `serverOnly: true` to mark a plugin as server-build only. The client build pipeline skips it entirely. Client code that references server-only contributions receives RPC stubs instead of the real implementation.

```typescript
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
```

Individual macros may also declare `serverOnly: true` without making the entire plugin server-only.

---

## Validating a plugin

Call `validatePlugin(plugin)` at build time to verify the plugin definition is structurally correct. `validatePlugin` does NOT throw — it returns a `ValidationResult`.

```typescript
import { validatePlugin } from '@aihu/plugin'

const result = validatePlugin(myPlugin)
if (!result.ok) {
  for (const err of result.errors) {
    console.error(`[${err.code}] ${err.message}`)
  }
  process.exit(1)
}
```

Error codes per spec §8.1:

| Code | Condition |
|---|---|
| `missing-required-field` | `name`, `version`, or `namespace` is empty |
| `invalid-namespace` | Namespace contains illegal characters or starts with a digit |
| `reserved-namespace` | Namespace is one of the reserved values |
| `duplicate-namespace` | Two plugins share the same namespace in one registration pass |
| `aihu-version-mismatch` | Declared `aihuVersion` range is incompatible with the running framework |

The compiler calls `validatePlugin` for each plugin in `defineAihuConfig.plugins` at registration time.

---

## Registering a plugin

Plugins are registered in `defineAihuConfig` in your app's config file:

```typescript
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
```

Per Plugin Contract Spec §7.2, plugins **must** be listed in the explicit `plugins` array. There is no filesystem scanning, package.json detection, or magic import resolution. This keeps build behavior deterministic and auditable.

---

## Plugin lifecycle (full sequence)

1. `defineAihuConfig` collects all plugins.
2. At build start, `validatePlugin` is called for each registered plugin. Any error aborts the build.
3. `beforeCompile` hooks run once (parallel, then resolved in order).
4. For each `.aihu` file:
   a. The Rust compiler parses blocks. Plugin-declared block names are routed to plugin parsers.
   b. `afterParse` hooks run (sequential, each receives the previous hook's return value).
   c. Macro lowering runs (plugin macros call their `lowering` function).
   d. `transformBlock` hooks run for each block.
   e. `afterCompile` hooks run.
5. Server-only plugins are filtered out before the client build pipeline.
6. `contributes.transforms` are applied as post-parse AST passes in stage order.

---

## Scaffolding a plugin

Use the CLI to scaffold a new plugin package:

```bash
aihu plugin my-plugin
```

This creates:

```
packages/my-plugin/
  package.json               name: "@myorg/aihu-plugin-my-plugin"
                             peerDependencies: { "@aihu/plugin": "^0.2.0" }
  src/
    index.ts                 definePlugin(...) export
    lowering/                macro lowering functions
    transforms/              AST transform functions
  tests/
    plugin.test.ts           validatePlugin smoke test
```

---

## Publishing a plugin

A published aihu plugin package must:

1. List `@aihu/plugin` as a `peerDependency` (not `dependency`):

   ```json
   {
     "peerDependencies": {
       "@aihu/plugin": "^0.2.0"
     }
   }
   ```

2. Export a named `Plugin` instance as the default or named export:

   ```typescript
   // src/index.ts
   import { definePlugin } from '@aihu/plugin'
   export default definePlugin({ ... })
   ```

3. Include only the plugin definition, lowering functions, and transforms. Do not bundle `@aihu/plugin` itself — it is the host's responsibility.

4. Name the package `aihu-plugin-<name>` or `@scope/aihu-plugin-<name>` for discoverability.

Consumers install and register the plugin explicitly:

```typescript
import { defineAihuConfig } from '@aihu/server'
import formsPlugin from 'aihu-plugin-forms'

export default defineAihuConfig({
  plugins: [formsPlugin],
})
```

No magic imports. No auto-discovery. Explicit registration is the contract.
