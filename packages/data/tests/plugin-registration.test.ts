// @vitest-environment node

import { data } from '@aihu/data'
import { resetValidationState } from '@aihu/plugin'
import { defineAihuConfig } from '@aihu/server'
import { beforeEach, expect, test } from 'vitest'

beforeEach(() => {
  // Reset duplicate-namespace tracker between tests (plugin validation is stateful).
  resetValidationState()
})

test('data plugin registers without error', () => {
  const config = defineAihuConfig({ plugins: [data()] })
  expect(config.plugins).toHaveLength(1)
  expect(config.plugins?.[0]).toBeDefined()
})

test('data plugin has correct name and namespace', () => {
  const plugin = data()
  expect(plugin.name).toBe('data')
  expect(plugin.namespace).toBe('data')
  expect(plugin.__aihu_plugin).toBe(true)
})

test('data factory accepts no-arg call', () => {
  expect(() => data()).not.toThrow()
})
