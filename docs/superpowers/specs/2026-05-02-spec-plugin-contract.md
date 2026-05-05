# Plugin Contract — `@aihu/compiler`

**Status:** Ratified 2026-05-02 (v1 reconciliation session)
**Spec version:** 0.1.1-draft (Amendment 03 applied inline; Option A provisional middleware locked)
**Phase:** N+M (assigned at scoping pass)
**Author:** Architect
**Depends on:** `@aihu/compiler` (parser infrastructure), `@aihu/runtime` (lifecycle hooks)
**Consumes:** Block Structure Spec, Macro Vocabulary Spec, Template Attribute Syntax Spec
**Related specs:** Project Config Spec, Compiler Error Reference

> **Ratification note:** Migrated from `docs/spec-plugin-contract.md` to `docs/superpowers/specs/` on 2026-05-02. Amendment 03 (server-side contributions, §6.5) was already applied inline before migration with **Option A (provisional middleware §6.5.3)** per user adjudication. Original amendment doc preserved at `docs/superpowers/specs/applied-amendments/2026-05-02-AMD-03-applied.md`.

---

## 0. Posture

This spec defines how plugins extend the aihu compiler and runtime. Plugins are first-class citizens of the framework; the data layer, agent surface, forms helpers, and other features are themselves plugins. Core aihu ships a minimal compiler and runtime; everything beyond markup, state, style, and agent is a plugin contribution.

The plugin contract is the single point at which aihu's closed core meets an open extension surface. Plugins MUST conform to this contract; the compiler MUST enforce it. Plugins that violate the contract are rejected at registration time, not at runtime.

This spec is binding for both:
- **Plugin authors** — defines what plugins can contribute and how
- **Compiler implementers** — defines the API plugins use to integrate

---

## 1. Plugin Anatomy

A aihu plugin is an npm package that exports a default plugin definition. The plugin definition declares:

1. **Identity** — name, version, namespace
2. **Capabilities** — what the plugin contributes (blocks, macros, components, transforms)
3. **Configuration schema** — what the plugin accepts in `aihu.config.ts`
4. **Lifecycle hooks** — when the plugin runs during compilation

### 1.1 Plugin definition format

A plugin's entry point exports a default object created by `definePlugin`:

```typescript
import { definePlugin } from '@aihu/plugin'

export default definePlugin({
  name: 'forms',
  version: '0.1.0',
  namespace: 'forms',
  
  configSchema: {
    validators: { type: 'object', default: {} },
    autoSubmit: { type: 'boolean', default: false },
  },
  
  contributes: {
    blocks: ['fields'],
    macros: ['$field', '$validate', '$submit'],
    components: ['Input', 'Select', 'Textarea'],
  },
  
  hooks: {
    beforeCompile: async (ctx) => { /* ... */ },
    afterParse: async (ctx, ast) => { /* ... */ },
    transformBlock: async (ctx, block) => { /* ... */ },
    afterCompile: async (ctx, output) => { /* ... */ },
  },
})
```

### 1.2 Required vs. optional fields

| Field | Required | Purpose |
|---|---|---|
| `name` | Yes | Unique plugin identifier |
| `version` | Yes | Semver string |
| `namespace` | Yes | Prefix for blocks and macros |
| `configSchema` | No | Validation schema for config options |
| `contributes` | No | Declarations of contributed surface |
| `hooks` | No | Compilation lifecycle integration |

A plugin with no `contributes` and no `hooks` is valid but does nothing. Useful as a base for plugins composed of others.

### 1.3 Namespace constraints

The plugin's `namespace` MUST:

- Be a valid identifier (alphanumeric, underscores, hyphens)
- Not collide with reserved names (`aihu`, `core`, `state`, `template`, `style`, `agent`, `route`)
- Be unique across the project's installed plugins

```
✓ namespace: 'forms'
✓ namespace: 'data'
✓ namespace: 'auth-helpers'
✗ namespace: 'state'              // reserved
✗ namespace: 'core'               // reserved
✗ namespace: '@scope/forms'       // not a valid identifier
```

The namespace is the prefix for all the plugin's contributions: a plugin with `namespace: 'forms'` contributes blocks like `@forms.fields`, macros like `@forms.$field`, and so on.

---

## 2. Contribution Categories

Plugins contribute through four declared mechanisms:

### 2.1 Blocks

A plugin MAY contribute additional `@`-blocks valid in `.aihu` files. Plugin blocks are namespaced (per Block Structure Spec §6).

```typescript
contributes: {
  blocks: ['fields', 'validations'],
}
```

This permits `@forms.fields { ... }` and `@forms.validations { ... }` blocks in SFCs.

For each contributed block, the plugin MUST also provide a parser via the `parsers` map:

```typescript
parsers: {
  fields: parseFormFields,    // function: (body: string, ctx) => AST
  validations: parseValidations,
}
```

The parser receives the block body (text between `{` and `}`) and a parser context. It returns an AST node specific to the block's purpose.

### 2.2 Macros

A plugin MAY contribute namespaced macros valid in specific blocks.

```typescript
contributes: {
  macros: [
    { name: '$field', validIn: ['@forms.fields'] },
    { name: '$validate', validIn: ['@state'] },
    { name: '$submit', validIn: ['@template'] },
  ],
}
```

Each macro declaration specifies:

| Field | Required | Purpose |
|---|---|---|
| `name` | Yes | Macro name with `$` prefix |
| `validIn` | Yes | Blocks where the macro is valid |
| `lowering` | Yes | Function generating output code |
| `validation` | No | Build-time validation function |

Macros MUST follow the value-form rules from the Template Attribute Syntax Spec. A plugin macro that takes a value MUST declare its type from the type matrix in §3.3 of that spec.

### 2.3 Components

A plugin MAY contribute pre-built components (in `.aihu` format or compiled equivalent).

```typescript
contributes: {
  components: ['Input', 'Select', 'Textarea', 'FormError'],
}
```

These components become available to all SFCs in the project without explicit imports. Component names MUST be unique across the plugin ecosystem; the compiler emits an error on collision.

Plugin-contributed components are referenced bare in `@template` blocks, like project components:

```
@template {
  <Input name="email" $validate="email" />
}
```

### 2.4 Transforms

A plugin MAY register transforms that run on parsed ASTs before lowering.

```typescript
contributes: {
  transforms: [
    { stage: 'after-parse', fn: addAriaAttributes },
    { stage: 'before-lower', fn: optimizeStaticElements },
  ],
}
```

Transform stages (in order):

| Stage | Runs after | Purpose |
|---|---|---|
| `after-parse` | All blocks parsed | Mutate parsed AST |
| `before-lower` | Resolution complete | Final AST optimization |
| `after-lower` | Code generated | Post-process output strings |

Transforms receive the AST (or output) and return a modified version. The compiler runs all registered transforms in stage order; within a stage, plugin registration order determines execution order.

---

## 3. Configuration

Plugins MAY accept configuration from `aihu.config.ts`:

```typescript
// aihu.config.ts
import forms from '@aihu-plugin/forms'
import data from '@aihu-plugin/data'

export default defineConfig({
  plugins: [
    forms({
      validators: {
        email: /^[^@]+@[^@]+$/,
        phone: /^\+?[\d\s-]+$/,
      },
      autoSubmit: false,
    }),
    
    data({
      source: './schema.graphql',
      cache: 'memory',
    }),
  ],
})
```

### 3.1 Config schema

A plugin's `configSchema` declares the shape of its configuration. The compiler validates the config at startup; invalid config rejects the plugin with a clear error.

```typescript
configSchema: {
  validators: { 
    type: 'object', 
    default: {},
    description: 'Named validator functions or regex patterns',
  },
  autoSubmit: { 
    type: 'boolean', 
    default: false,
    description: 'Submit form on input change',
  },
}
```

Schema field types: `string`, `number`, `boolean`, `object`, `array`, `function`. Nested schemas are supported.

### 3.2 Config access from hooks and parsers

Plugin hooks and parsers receive a context object that includes resolved configuration:

```typescript
hooks: {
  afterParse: async (ctx, ast) => {
    const validators = ctx.config.validators  // resolved from aihu.config.ts
    // ... use validators in the transform
  },
}
```

The compiler resolves config once per build; hooks see the same resolved values throughout.

### 3.3 Config defaults

Defaults declared in `configSchema` apply when the user doesn't specify the field. The compiler merges user config over defaults; the merged object is what hooks see.

---

## 4. Lifecycle Hooks

Plugins integrate with compilation through hooks. Each hook runs at a specific stage:

| Hook | Runs | Receives | Returns |
|---|---|---|---|
| `beforeCompile` | Once per build, before any SFC parsed | Build context | void |
| `afterParse` | Per SFC, after all blocks parsed | SFC AST | Modified AST or void |
| `transformBlock` | Per block in each SFC | Block AST | Modified block AST or void |
| `afterCompile` | Per SFC, after lowering | Output artifacts | Modified output or void |

### 4.1 Hook signatures

```typescript
type BeforeCompileHook = (ctx: BuildContext) => Promise<void> | void

type AfterParseHook = (ctx: SfcContext, ast: SfcAst) => Promise<SfcAst | void> | SfcAst | void

type TransformBlockHook = (ctx: BlockContext, block: BlockAst) => Promise<BlockAst | void> | BlockAst | void

type AfterCompileHook = (ctx: SfcContext, output: CompiledOutput) => Promise<CompiledOutput | void> | CompiledOutput | void
```

### 4.2 Context objects

Hooks receive context objects that vary by hook:

| Context type | Properties |
|---|---|
| `BuildContext` | `config`, `mode` ('dev' \| 'build'), `outputDir`, `projectRoot` |
| `SfcContext` | `BuildContext` + `sfcPath`, `componentName`, `symbolTable` |
| `BlockContext` | `SfcContext` + `blockType`, `blockName` |

### 4.3 Hook execution order

Within a stage, hooks run in plugin registration order. A plugin registered earlier in `aihu.config.ts` runs first.

```typescript
plugins: [
  pluginA(),    // its hooks run first
  pluginB(),    // its hooks run second
]
```

This determinism is contractual; reordering plugins MUST produce identical compilation output.

### 4.4 Hook error handling

Hooks that throw cause the build to fail with a clear error citing the plugin and the hook stage:

```
error: plugin 'forms' threw in afterParse hook
   src/pages/users.aihu (compiling)
   plugin: @aihu-plugin/forms@0.1.0
   stage: afterParse
   
   Error: missing required validator 'email'
       at addValidators (forms-plugin/src/transforms.ts:42:11)
```

Hooks SHOULD throw with descriptive errors. The compiler does not catch hook errors; build failure is the correct outcome of a misconfigured or buggy plugin.

---

## 5. Macro Lowering

Plugin macros lower to runtime code via the `lowering` function in their declaration:

```typescript
{
  name: '$field',
  validIn: ['@forms.fields'],
  lowering: (ctx, args) => {
    return `createFormField('${args.name}', ${JSON.stringify(args.options)})`
  },
}
```

### 5.1 Lowering function signature

```typescript
type MacroLowering = (
  ctx: MacroContext,
  args: MacroArgs
) => string | LoweringResult
```

### 5.2 Lowering context

The `MacroContext` provides:

| Property | Type | Purpose |
|---|---|---|
| `pluginConfig` | `T` (plugin config type) | Resolved plugin config |
| `sfc` | `SfcContext` | The SFC being compiled |
| `block` | `BlockContext` | The block containing the macro |
| `imports` | `(spec: string) => string` | Request an import; returns the local name |
| `runtime` | `(name: string) => string` | Request a runtime helper; returns the local name |

Plugins use `imports` and `runtime` to request modules and runtime helpers without hardcoding paths:

```typescript
lowering: (ctx, args) => {
  const createField = ctx.runtime('@aihu-plugin/forms:createFormField')
  return `${createField}('${args.name}', ${JSON.stringify(args.options)})`
}
```

### 5.3 LoweringResult for complex emissions

For macros that emit multiple statements or require import additions, return a `LoweringResult`:

```typescript
type LoweringResult = {
  code: string
  imports?: ImportSpec[]
  hoist?: string[]
  target?: 'client' | 'server'    // explicit emission target (per Block Structure §11.5)
}
```

```typescript
lowering: (ctx, args) => ({
  code: `field_${args.name} = createField(...)`,
  imports: [{ from: '@aihu-plugin/forms', names: ['createField'] }],
  hoist: [`const fieldRegistry = new Map()`],
})
```

`hoist` adds module-level declarations; `imports` adds imports at the top of the generated module. `target`, when present, directs the lowered output to either the client or server bundle (per Block Structure Spec §11.5 split-bundle compilation).

### 5.4 Macro validation

Optionally, a macro declares a `validation` function that runs at parse time:

```typescript
{
  name: '$field',
  validIn: ['@forms.fields'],
  validation: (ctx, args) => {
    if (!args.name) {
      ctx.error('$field requires a name argument')
    }
    if (args.type && !VALID_FIELD_TYPES.includes(args.type)) {
      ctx.error(`Unknown field type: ${args.type}`)
    }
  },
  lowering: ...,
}
```

Validation errors are reported at the SFC source location, not at the plugin source. This makes plugin error messages helpful to SFC authors.

---

## 6. Component Contributions

Plugin-contributed components MUST be valid `.aihu` SFC files (or compiled-equivalent modules). They are loaded into the project's component registry at plugin initialization.

### 6.1 Component file location

Plugins ship components in their `components/` directory:

```
@aihu-plugin/forms/
  ├── package.json
  ├── plugin.ts          ← plugin definition
  └── components/
      ├── Input.aihu
      ├── Select.aihu
      ├── Textarea.aihu
      └── FormError.aihu
```

The plugin's `contributes.components` array lists the names. The compiler resolves them from the `components/` directory.

### 6.2 Component name conflicts

If two plugins contribute components with the same name, the compiler emits a registration error:

```
error: component name conflict
   plugin '@aihu-plugin/forms' contributes <Input>
   plugin '@aihu-plugin/ui' also contributes <Input>
   
   help: One of these plugins must rename its component, or you can disambiguate 
         in aihu.config.ts using the 'componentAliases' option:
         
         componentAliases: {
           '@aihu-plugin/forms/Input': 'FormsInput',
         }
```

The `componentAliases` config option in `aihu.config.ts` provides explicit disambiguation when conflicts can't be resolved by plugin authors. The full schema for `componentAliases` is documented in the Project Config Spec (deferred — not yet drafted).

### 6.3 Component override

A project MAY override a plugin's component by placing a same-named file in `src/components/`:

```
src/components/Input.aihu       ← project's version (wins)
plugin Input.aihu                ← plugin's version (shadowed)
```

Project-local components take precedence over plugin contributions. This is the escape hatch for projects that need to customize a plugin's components without forking.

---

## 6.5 Server-Side Contributions

Plugins MAY contribute server-side functionality through three mechanisms: server-only runtime helpers, server-emitting macros, and middleware. Server-side contributions integrate with the split-bundle compilation model defined in the Block Structure Spec §11.5.

### 6.5.1 Server-only runtime helpers

A plugin MAY ship runtime helpers that are usable only on the server. These are declared in the plugin's `serverRuntime` field:

```typescript
contributes: {
  serverRuntime: {
    'authenticate': './server/authenticate.ts',
    'requireScope': './server/require-scope.ts',
  },
}
```

Server-only helpers are loaded into the server bundle but never the client bundle. Client code that imports a server-only helper MUST cause a compile error.

```typescript
// In a plugin's lowering function:
lowering: (ctx, args) => {
  const auth = ctx.runtime('@aihu-plugin/auth:authenticate')
  // ctx.runtime knows which side it's emitting for; raises an error if 
  // a server-only helper is requested in a client context
  return `${auth}(req)`
}
```

### 6.5.2 Plugin-contributed server-emitting declarations

A plugin MAY contribute macros that emit server-only functions (analogous to `$server` in `@state`). These macros declare themselves as `serverOnly: true`:

```typescript
{
  name: '$endpoint',
  validIn: ['@auth.routes'],
  serverOnly: true,
  lowering: (ctx, args) => ({
    code: '...',
    target: 'server',     // explicitly emit to server bundle only
  }),
}
```

The compiler treats `serverOnly: true` macros like `$server`: their lowered output goes to the server artifact (per Block Structure Spec §11.5), and client code accessing them gets RPC stubs.

### 6.5.3 Middleware contributions

> **Note (v1.0, provisional):** The middleware contribution interface in this section is provisional in v1.0. It may evolve based on plugin author feedback during the v1.x series. Plugins using middleware contributions SHOULD pin their aihu version requirement to a minor range (`^1.x.0`) to avoid breaking changes during plugin evolution.

A plugin MAY contribute server middleware that runs on requests:

```typescript
contributes: {
  middleware: [
    {
      name: 'auth-check',
      stage: 'before-handler',
      handler: './server/middleware/auth-check.ts',
    },
  ],
}
```

| Middleware stage | Runs |
|---|---|
| `before-handler` | Before the route handler |
| `after-handler` | After the route handler, before response sent |
| `on-error` | When the route handler throws |

Middleware execution order within a stage is determined by plugin registration order, with declared dependencies (per §10) taking precedence in the topological sort.

### 6.5.4 Server-side build coordination

When a plugin contributes server-side code:

- The compiler MUST emit a server bundle entry for the plugin
- The server bundle MUST include only the plugin's server-side code, not client-side code
- Plugin server-side code MAY import other plugins' server-side code, provided those plugins are declared dependencies (per §10)
- Plugin server-side code MUST NOT import the plugin's own client-side code
- The compiler enforces these constraints at build time with clear errors

### 6.5.5 Server-side configuration access

Server middleware and server-only macros receive configuration through the same mechanism as other plugin code. The `BuildContext` and lowering contexts include resolved config; runtime middleware receives config via injection at server startup.

```typescript
// Middleware handler
export default function authCheck(req, res, config) {
  // config is the plugin's resolved configuration
  if (config.requireScope && !req.user) {
    throw new UnauthorizedError()
  }
}
```

### 6.5.6 Error cases

| Error | Trigger | Message template |
|---|---|---|
| Server-only helper requested from client | Lowering function calls `ctx.runtime` with server-only helper in client emission context | "server-only helper '@plugin:helper' cannot be used in client code; consider using '$server' macro to invoke from client" |
| Client code imports server middleware | Client bundle has reference to middleware module | "client code cannot import server middleware '{name}'" |
| Middleware stage unknown | Middleware declares unsupported stage | "unknown middleware stage '{stage}'. Valid: before-handler, after-handler, on-error" |
| Server-only macro in non-server context | `serverOnly: true` macro used in client-only build target | "macro '@plugin.$macro' is server-only but build target is client-only" |

### 6.5.7 Build target awareness

Build target semantics (`client` / `server` / `universal`) are defined in the Block Structure Spec §11.5. Plugin server-side contributions follow the same target-awareness rules:

- Server-only output is emitted only when the build target includes server output
- Server middleware never affects client-target builds
- Client-only contributions are unaffected by server-target builds
- Builds targeting only one side MUST elide unused contributions with a warning, not a silent skip

---

## 7. Plugin Discovery and Registration

### 7.1 Registration in `aihu.config.ts`

Plugins are registered by importing and calling them in the config's `plugins` array:

```typescript
import forms from '@aihu-plugin/forms'
import data from '@aihu-plugin/data'
import agent from '@aihu-plugin/agent'

export default defineConfig({
  plugins: [
    forms({ /* config */ }),
    data({ /* config */ }),
    agent({ /* config */ }),
  ],
})
```

A plugin function returns a configured plugin instance. The compiler reads `plugins` at startup, validates each, and registers contributions.

### 7.2 Auto-discovery is forbidden

Aihu does NOT auto-discover plugins from `package.json` or `node_modules`. Every plugin MUST be explicitly imported and registered.

This is a deliberate strictness: implicit dependencies create unauditable behavior. A `.aihu` file's behavior depends only on plugins explicitly registered in the config; reading the config tells you what's active.

### 7.3 Plugin compatibility checking

The compiler checks plugin version compatibility against aihu's version at registration time:

```typescript
definePlugin({
  name: 'forms',
  version: '0.1.0',
  scribeVersion: '^1.0.0',    // compatible aihu versions
  // ...
})
```

The compiler emits an error if the plugin's `scribeVersion` doesn't match the running aihu version. Prevents plugins from running against incompatible compiler interfaces.

---

## 8. Error Cases

### 8.1 Plugin registration errors

| Error | Trigger | Message template |
|---|---|---|
| Invalid namespace | `namespace: '@scope/foo'` | "plugin namespace must be a valid identifier; got '@scope/foo'" |
| Reserved namespace | `namespace: 'core'` | "plugin namespace 'core' is reserved by aihu" |
| Duplicate namespace | Two plugins with same namespace | "duplicate plugin namespace 'forms'. Plugins must have unique namespaces" |
| Missing required field | `definePlugin({})` | "plugin definition missing required fields: name, version, namespace" |
| Invalid scribeVersion | Mismatched semver | "plugin '@aihu-plugin/forms@0.1.0' requires aihu ^2.0.0; running ^1.0.0" |

### 8.2 Plugin contribution errors

| Error | Trigger | Message template |
|---|---|---|
| Bare block name | `blocks: ['field']` (no namespace) | "plugin blocks must use namespaced form. Did you mean '@forms.field'?" |
| Macro outside namespace | `macros: [{ name: '$field' }]` (no plugin namespace) | "plugin macros must use namespaced form. Use '@forms.$field' or rename" |
| Component name collision | Two plugins, same component name | "component '<Input>' contributed by both 'forms' and 'ui'. See componentAliases in aihu.config.ts" |
| Macro validIn references unknown block | `validIn: ['@unknown']` | "macro '$field' valid in '@unknown' but no such block is registered" |

### 8.3 Plugin runtime errors

| Error | Trigger | Message template |
|---|---|---|
| Hook throws | Hook function throws | "plugin 'forms' threw in afterParse hook: {error message}" |
| Lowering returns invalid code | Lowering returns non-string | "plugin macro '$field' lowering returned invalid result; expected string or LoweringResult" |
| Validation reports error | Validation function called `ctx.error(...)` | "{validation message} at {sfc location}" |

---

## 9. Examples

### 9.1 Minimal plugin

A plugin that contributes one macro:

```typescript
import { definePlugin } from '@aihu/plugin'

export default definePlugin({
  name: 'analytics',
  version: '0.1.0',
  namespace: 'analytics',
  
  contributes: {
    macros: [
      {
        name: '$track',
        validIn: ['@template'],
        lowering: (ctx, args) => {
          const track = ctx.runtime('@aihu-plugin/analytics:track')
          return `${track}('${args.event}', ${JSON.stringify(args.props || {})})`
        },
      },
    ],
  },
})
```

Used in an SFC:

```
@template {
  <button $on:click="save" $analytics.track="save_clicked">Save</button>
}
```

The plugin macro `$analytics.track` adds analytics tracking to the click handler.

### 9.2 Forms plugin

A larger plugin with blocks, macros, and components:

```typescript
import { definePlugin } from '@aihu/plugin'
import { parseFormFields } from './parsers'

export default function formsPlugin(config = {}) {
  return definePlugin({
    name: 'forms',
    version: '0.1.0',
    namespace: 'forms',
    
    configSchema: {
      validators: { type: 'object', default: {} },
    },
    
    contributes: {
      blocks: ['fields'],
      
      macros: [
        { name: '$field', validIn: ['@forms.fields'], lowering: lowerField },
        { name: '$validate', validIn: ['@state'], lowering: lowerValidate },
      ],
      
      components: ['Input', 'Select', 'Textarea', 'FormError'],
    },
    
    parsers: {
      fields: parseFormFields,
    },
    
    hooks: {
      afterParse: addFieldValidationToTemplate,
    },
  })
}
```

Used in an SFC:

```
@state {
  $prop schema: FormSchema
  email: string = ''
  password: string = ''
}

@forms.fields {
  $field email type="email" required
  $field password type="password" required minLength=8
}

@template {
  <form $action="submit">
    <Input name="email" $bind:value="email" />
    <FormError for="email" />
    <Input name="password" type="password" $bind:value="password" />
    <FormError for="password" />
    <button type="submit">Sign up</button>
  </form>
}
```

### 9.3 Data plugin

A plugin that contributes the `Resource<T>` type and `data.*` global:

```typescript
import { definePlugin } from '@aihu/plugin'

export default function dataPlugin(config) {
  return definePlugin({
    name: 'data',
    version: '0.1.0',
    namespace: 'data',
    
    configSchema: {
      source: { type: 'string', default: './schema.graphql' },
      cache: { type: 'string', default: 'memory' },
    },
    
    contributes: {
      // No blocks, macros, or components — pure type/runtime contribution
    },
    
    hooks: {
      beforeCompile: async (ctx) => {
        // Generate types from GraphQL schema
        const schema = await loadSchema(ctx.config.source)
        await emitTypeDefinitions(schema, ctx.outputDir)
      },
      
      afterParse: async (ctx, ast) => {
        // Wire $resource macros to data layer
        wireResources(ast, ctx.config)
      },
    },
  })
}
```

Used in an SFC:

```
@state {
  $resource user = data.user.query({ id: route.params.id })
}
```

The `data.user.query` global is provided by the plugin's runtime injection.

---

## 10. Plugin Composition

Plugins MAY depend on other plugins. The compiler resolves the dependency graph at registration:

### 10.1 Declared dependencies

```typescript
definePlugin({
  name: 'auth',
  version: '0.1.0',
  namespace: 'auth',
  
  dependencies: ['data'],   // requires the 'data' plugin
  
  // ... rest of definition
})
```

If a plugin's dependency is not registered, the compiler emits a clear error:

```
error: plugin '@aihu-plugin/auth' depends on '@aihu-plugin/data', but data is not registered
   help: Add data() to the plugins array in aihu.config.ts
```

### 10.2 Hook ordering with dependencies

Plugins with declared dependencies have their hooks run AFTER their dependencies' hooks. The compiler topologically sorts plugins by dependency at registration; hooks within a stage run in topological order, breaking ties by registration order.

### 10.3 Cross-plugin macro use

A plugin MAY emit lowerings that call into another plugin's runtime helpers, provided the dependency is declared:

```typescript
// In auth plugin (depends on data)
lowering: (ctx, args) => {
  const dataQuery = ctx.runtime('@aihu-plugin/data:query')   // OK: data is a dependency
  return `${dataQuery}('users', { token: getCurrentToken() })`
}
```

Cross-plugin runtime calls without declared dependencies are rejected at compile time.

---

## 11. Verification

Compiler implementations MUST pass conformance tests covering:

- Plugin registration validation (per §1, §7)
- Contribution validation (blocks, macros, components, transforms)
- Configuration schema validation
- Hook execution order
- Lowering function contract
- Cross-plugin dependency resolution
- Server-side contribution rules (per §6.5)
- All error cases (per §8)

Conformance suite lives in `bench/compiler-conformance/plugins/`. Every error message in §8 has a fixture asserting the exact wording.

---

## 12. Open Questions

### 12.1 Should plugins be able to extend `@state`?

Currently, plugin contributions to `@state` are limited to providing types and runtime helpers. Plugins cannot add new declaration forms (e.g. `$auth.user` as a `@state` declaration).

**Proposed resolution:** Defer to v2. The current design covers most use cases through namespaced macros valid in `@state`. Direct declaration extension is more invasive.

### 12.2 Should plugin hot-reload be supported?

In dev mode, modifying a plugin's source could trigger re-compilation of all SFCs that use that plugin. Currently, plugin changes require restarting the dev server.

**Proposed resolution:** Defer. Hot-reload for plugins is complex (transitive cache invalidation, type regeneration). Address when usage pressure demands it.

### 12.3 Should plugins be able to register custom CLI commands?

A plugin might want to add `aihu forms generate` or similar commands. Currently no facility for this.

**Proposed resolution:** Defer to v2. The pattern can be modeled on Vite's CLI extension API.

### 12.4 Should plugin output be cacheable across builds?

Plugin lowering can be expensive (e.g. parsing GraphQL schemas). Currently, every build re-runs all hooks.

**Proposed resolution:** Add a `cacheKey` field to plugin contributions in v1.1. Plugins declare what their output depends on; compiler caches when keys match.

---

## 13. Sign-off

Spec is binding once approved. Changes require an amendment with version bump.

**Spec version:** 0.1.0-draft
**Stable from:** TBD
**Reviewed by:** TBD
**Approved by:** TBD
