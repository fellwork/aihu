// @vitest-environment node

import { resetValidationState } from '@aihu/plugin'
import { defineAihuConfig } from '@aihu/server'
import { kindlyNote } from '@aihu-plugin/kindly-note'
import { beforeEach, expect, test } from 'vitest'

beforeEach(() => {
  // Reset duplicate-namespace tracker between tests (plugin validation is stateful).
  resetValidationState()
})

test('kindly-note plugin registers without error', () => {
  const config = defineAihuConfig({ plugins: [kindlyNote()] })
  expect(config.plugins).toHaveLength(1)
  expect(config.plugins?.[0]).toBeDefined()
})

test('kindly-note plugin has correct name and namespace', () => {
  const plugin = kindlyNote()
  expect(plugin.name).toBe('kindly-note')
  expect(plugin.namespace).toBe('kindly-note')
  expect(plugin.__aihu_plugin).toBe(true)
})

test('kindlyNote factory accepts no-arg call', () => {
  expect(() => kindlyNote()).not.toThrow()
})
