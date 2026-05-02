# Amendment 03 — Plugin Contract Spec: Server-Side Contributions

**Target spec:** `spec-plugin-contract.md`
**Section:** New section §6.5 (between current §6 Component Contributions and §7 Plugin Discovery)
**Type:** New section
**Spec version impact:** 0.1.0-draft → 0.1.1-draft
**Author:** Architect
**Status:** Ready to apply (with one decision point — see below)
**Depends on:** Amendment 02 (Block Structure §11.5) should be applied first

---

## Summary

Plugins need to contribute server-side functionality (server-only runtime helpers, server-emitting macros, and middleware), but the Plugin Contract Spec doesn't currently address this. This amendment adds §6.5 to formalize the server-side contribution surface.

---

## Rationale

The audit identified that the Plugin Contract Spec is silent on server-side contributions, even though:

- The Macro Vocabulary Spec includes `$server` in `@state`
- The agent surface (`@agent` block) is inherently server-side
- Real plugins (auth, data, forms) will need to ship server middleware

Without formal guidance, plugin authors will invent ad-hoc patterns. This amendment establishes the canonical pattern.

---

## Decision point

§6.5.3 documents middleware contributions. Middleware design is the most likely surface to need iteration once real plugins are built.

### Option A (conservative): Mark §6.5.3 as provisional

Add a note that middleware design may evolve in the v1.x series. Plugin authors using middleware should pin to minor scribe versions (`^1.x.0`) for stability.

### Option B (committed): Ship §6.5.3 as stable v1 surface

No provisional marking. Middleware contributions are stable from v1.0 onward, with backwards-compatible changes only.

**The amendment text below uses Option A** (with a provisional note at the top of §6.5.3). If you prefer Option B, remove the provisional note paragraph before applying.

---

## Apply this change

### Location

In `spec-plugin-contract.md`, between the end of §6 (Component Contributions) and the beginning of §7 (Plugin Discovery and Registration), insert the entire §6.5 section below.

### Insertion text

```markdown
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
  const auth = ctx.runtime('@scribe-plugin/auth:authenticate')
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

> **Note (v1.0, provisional):** The middleware contribution interface in this section is provisional in v1.0. It may evolve based on plugin author feedback during the v1.x series. Plugins using middleware contributions SHOULD pin their scribe version requirement to a minor range (`^1.x.0`) to avoid breaking changes during plugin evolution.

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
```

---

## Verification

After applying, verify:

- The new section §6.5 sits between §6 and §7 (renumber subsections if §6 already has subsections — Plugin Contract §6 currently doesn't)
- The cross-reference to "Block Structure Spec §11.5" is correct (verify Amendment 02 has been applied first)
- The `serverRuntime` field is added to the plugin definition format documentation in §1.1 (this is implicit from the spec text but a future spec revision should make it explicit in §1's table of fields)
- The `serverOnly` macro field is documented consistently with other macro fields in §2.2
- Error messages in §6.5.6 are added to the conformance test suite per §11

---

## Cross-spec implications

After this amendment is applied:

- **Plugin Contract Spec §1.2 (Required vs. optional fields):** A future revision should add `serverRuntime` and middleware-related fields to the optional fields table.
- **Plugin Contract Spec §2.2 (Macros):** A future revision should add `serverOnly` as an optional macro field in the macro declaration table.
- **Plugin Contract Spec §8 (Error Cases):** A future revision should consolidate the error cases from §6.5.6 into the main error case tables.

These cross-spec updates are housekeeping and don't block this amendment.

---

## Implementation notes for compiler authors

This amendment introduces three new contribution categories (`serverRuntime`, server-only macros, middleware). The compiler implementation needs:

1. **Bundle-aware module resolution** — track which side (client/server) is being emitted; reject server-only imports in client emission
2. **Macro target field handling** — `target: 'server'` in lowering results triggers split-bundle emission per Block Structure §11.5
3. **Middleware registration and ordering** — topological sort by dependencies, then registration order for ties
4. **Build target propagation** — the build target flows from `scribe.config.ts` through every plugin lowering call

These are non-trivial implementation tasks. The amendment doesn't dictate implementation details, but flags them for awareness.

---

## Sign-off

This amendment is ready to apply once the provisional decision is made and Amendment 02 has been applied first.

**Reviewed by:** TBD
**Approved by:** TBD
**Provisional status chosen:** Option A (provisional) / Option B (stable) — circle one
**Amendment 02 applied first:** Yes / No (must be Yes before applying)
**Applied on:** TBD
