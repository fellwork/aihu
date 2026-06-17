---
"@aihu/app": patch
---

fix: `viteAihuPlugin({ agentReadiness })` no longer crashes under ESM vite config

`viteAihuPlugin` lazy-loaded `@aihu-plugin/agent-readiness` with a bare
`require(...)`, which throws "require is not defined" when vite loads
`vite.config.ts` as bundled ESM (and `createRequire` fails too, since the
package is ESM-only with no CJS export). Switched to a dynamic `import()`
returned as a `Promise<Plugin>` (Vite awaits plugin promises). The plugin
factory's return type widens from `Plugin[]` to `PluginOption[]`.
