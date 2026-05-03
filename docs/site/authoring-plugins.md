# Authoring Plugins

scribe plugins extend the compiler with new blocks, macros, component boundaries, and transforms. Every plugin must be explicitly registered — auto-discovery is forbidden per Plugin Contract Spec §7.2.

## Defining a plugin

Use `definePlugin` from `@scribe/plugin`:

```typescript
import { definePlugin } from '@scribe/plugin'

export const myPlugin = definePlugin({
  name: 'my-plugin',
  version: '1.0.0',
  namespace: 'my',
  contributes: {
    blocks: ['my-block'],
    macros: ['$my-macro'],
    components: ['<$my-element>'],
    transforms: [myTransform],
  },
})
```

### `contributes` fields

- **`blocks`** — additional `@blockname { }` block types this plugin handles. The compiler routes these to the plugin's parser.
- **`macros`** — `$macro` names this plugin contributes to `@state` blocks.
- **`components`** — special template elements (e.g. `<$my-element>`) this plugin provides.
- **`transforms`** — build-time AST transform functions applied after parsing.

### `serverOnly`

Set `Plugin.serverOnly: true` to mark a plugin as server-build only. The client build pipeline will skip it entirely:

```typescript
export const loaderPlugin = definePlugin({
  name: 'loader-plugin',
  version: '1.0.0',
  namespace: 'loader',
  serverOnly: true,
  contributes: { transforms: [serverLoaderTransform] },
})
```

## Validating a plugin

Call `validatePlugin(plugin)` at build time to verify the plugin definition is structurally correct:

```typescript
import { validatePlugin } from '@scribe/plugin'

validatePlugin(myPlugin) // throws if invalid
```

`validatePlugin` checks:

- `name` and `version` are non-empty strings.
- `namespace` contains only alphanumeric characters and hyphens.
- All `contributes` arrays contain valid identifiers.
- No duplicate block or macro names within the namespace.

## Registering a plugin

Plugins are registered in `defineScribeConfig` in your app's config file:

```typescript
import { defineScribeConfig } from '@scribe/server'
import { myPlugin } from './plugins/my-plugin.ts'

export default defineScribeConfig({
  plugins: [myPlugin],
  build: {
    target: 'universal',
  },
})
```

Per Plugin Contract Spec §7.2, plugins **must** be listed in the explicit `plugins` array. There is no filesystem scanning, package.json detection, or magic import resolution. This keeps build behavior deterministic and auditable.

## Plugin lifecycle

1. `defineScribeConfig` collects all plugins.
2. At build start, `validatePlugin` is called for each registered plugin.
3. The Rust compiler receives the plugin manifest and routes block/macro names to the appropriate handlers.
4. `contributes.transforms` are applied as post-parse AST passes.
5. Server-only plugins are filtered out before the client build pipeline.
