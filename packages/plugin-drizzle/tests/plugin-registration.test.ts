// @vitest-environment node

import { resetValidationState, validatePlugin } from '@aihu/plugin'
import { defineAihuConfig } from '@aihu/server'
import { drizzle } from '@aihu-plugin/drizzle'
import { beforeEach, expect, test } from 'vitest'

beforeEach(() => {
  // Reset duplicate-namespace tracker between tests (plugin validation is stateful).
  resetValidationState()
})

test('drizzle plugin registers without error', () => {
  const config = defineAihuConfig({ plugins: [drizzle()] })
  expect(config.plugins).toHaveLength(1)
  expect(config.plugins?.[0]).toBeDefined()
})

test('drizzle plugin has correct name, namespace, and server-only flag', () => {
  const plugin = drizzle()
  expect(plugin.name).toBe('drizzle')
  expect(plugin.namespace).toBe('drizzle')
  expect(plugin.serverOnly).toBe(true)
  expect(plugin.__aihu_plugin).toBe(true)
})

test('drizzle plugin passes Plugin Contract validation', () => {
  const result = validatePlugin(drizzle())
  expect(result.ok).toBe(true)
})

test('drizzle factory accepts no-arg call', () => {
  expect(() => drizzle()).not.toThrow()
})

test('contributes is a no-op (no macros wired until v0.4)', () => {
  const plugin = drizzle()
  expect(plugin.contributes).toEqual({})
})
