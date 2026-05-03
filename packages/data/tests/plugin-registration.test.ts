// @vitest-environment node
import { test, expect, beforeEach } from 'vitest'
import { resetValidationState } from '@scribe/plugin'
import { defineScribeConfig } from '@scribe/server'
import { data } from '@scribe/data'

beforeEach(() => {
  // Reset duplicate-namespace tracker between tests (plugin validation is stateful).
  resetValidationState()
})

test('data plugin registers without error', () => {
  const config = defineScribeConfig({ plugins: [data()] })
  expect(config.plugins).toHaveLength(1)
  expect(config.plugins![0]).toBeDefined()
})

test('data plugin has correct name and namespace', () => {
  const plugin = data()
  expect(plugin.name).toBe('data')
  expect(plugin.namespace).toBe('data')
  expect(plugin.__scribe_plugin).toBe(true)
})

test('data factory accepts no-arg call', () => {
  expect(() => data()).not.toThrow()
})
