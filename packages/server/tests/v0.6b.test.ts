/**
 * v0.6b tests for @aihu/server:
 *   - v0.6.5: BuildTarget type + build.target in defineAihuConfig
 */
import { describe, expect, it } from 'vitest'
import type { BuildConfig, BuildTarget } from '../src/index.ts'
import { defineAihuConfig } from '../src/index.ts'

// ---------------------------------------------------------------------------
// v0.6.5 — BuildTarget type + AihuConfig.build
// ---------------------------------------------------------------------------

describe('AihuConfig — v0.6.5 build.target', () => {
  it('build.target accepts "client"', () => {
    const target: BuildTarget = 'client'
    const cfg = defineAihuConfig({ build: { target } })
    expect(cfg.build?.target).toBe('client')
  })

  it('build.target accepts "server"', () => {
    const target: BuildTarget = 'server'
    const cfg = defineAihuConfig({ build: { target } })
    expect(cfg.build?.target).toBe('server')
  })

  it('build.target accepts "universal"', () => {
    const target: BuildTarget = 'universal'
    const cfg = defineAihuConfig({ build: { target } })
    expect(cfg.build?.target).toBe('universal')
  })

  it('build field is optional — existing configs remain valid', () => {
    const cfg = defineAihuConfig({ server: { cors: { origin: '*' } } })
    expect(cfg.build).toBeUndefined()
  })

  it('BuildConfig target is optional — empty build config is valid', () => {
    const buildCfg: BuildConfig = {}
    const cfg = defineAihuConfig({ build: buildCfg })
    expect(cfg.build?.target).toBeUndefined()
  })

  it('build.target round-trips through defineAihuConfig', () => {
    const cfg = defineAihuConfig({
      server: { basePath: '/api' },
      build: { target: 'universal' },
    })
    expect(cfg.server?.basePath).toBe('/api')
    expect(cfg.build?.target).toBe('universal')
  })
})
