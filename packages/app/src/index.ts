export { defineConfig, ScribeConfigError } from './config.ts'
export type {
  ScribeConfig,
  ScribePlugin,
  DirConfig,
  RuntimeConfig,
  AppHeadConfig,
  HeadConfig,
  VitePassthrough,
  AgentReadinessConfig,
  OutputMode,
} from './config.ts'
export type { ScribeAdapter, AdapterContext, CreateHandlerSourceOptions } from './adapter.ts'
export { viteScribePlugin } from './vite-plugin.ts'
