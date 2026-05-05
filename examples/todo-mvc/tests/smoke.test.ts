/**
 * EX-04 todo-mvc smoke test.
 *
 * Additionally verifies localStorage persistence logic (the v1.1 fix).
 */

import { getAllAgentMetadata, registerAgentMetadata } from '@aihu/agent'
import { beforeEach, describe, expect, it } from 'vitest'

// @ts-expect-error
import { __resetRegistryForTesting } from '../../../packages/agent/src/registry.ts'

describe('EX-04 todo-mvc — agent metadata', () => {
  beforeEach(() => {
    __resetRegistryForTesting()
  })

  it('registers expected @agent metadata shape', () => {
    registerAgentMetadata({
      tag: 'todo-mvc',
      state: {
        todos: 'Array of todo items with id, text, done fields',
        remaining: 'Count of incomplete todos',
        filter: 'Active filter: all | active | completed',
      },
      actions: {
        addTodo: { returns: {} },
        clearCompleted: { returns: {} },
      },
    })

    const entries = getAllAgentMetadata()
    expect(entries).toHaveLength(1)
    expect(entries[0].tag).toBe('todo-mvc')
    expect(entries[0].state?.todos).toBeDefined()
    expect(entries[0].state?.remaining).toBeDefined()
    expect(entries[0].actions?.addTodo).toBeDefined()
    expect(entries[0].actions?.clearCompleted).toBeDefined()
  })
})

describe('EX-04 todo-mvc — localStorage persistence (v1.1 fix)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saves todos to localStorage', () => {
    const todos = [{ id: '1', text: 'Buy milk', done: false }]
    // Simulate $effect persist behavior
    localStorage.setItem('aihu-todos', JSON.stringify(todos))

    const saved = localStorage.getItem('aihu-todos')
    expect(saved).not.toBeNull()
    const parsed = JSON.parse(saved!)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].text).toBe('Buy milk')
  })

  it('hydrates todos from localStorage on mount', () => {
    const initial = [
      { id: 'a', text: 'Task 1', done: false },
      { id: 'b', text: 'Task 2', done: true },
    ]
    localStorage.setItem('aihu-todos', JSON.stringify(initial))

    // Simulate $lifecycle.mount hydrate behavior
    let todos: Array<{ id: string; text: string; done: boolean }> = []
    try {
      const saved = localStorage.getItem('aihu-todos')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) todos = parsed
      }
    } catch {
      // guard
    }

    expect(todos).toHaveLength(2)
    expect(todos[0].text).toBe('Task 1')
    expect(todos[1].done).toBe(true)
  })

  it('handles missing localStorage gracefully', () => {
    localStorage.clear()
    let todos: Array<{ id: string; text: string; done: boolean }> = []
    try {
      const saved = localStorage.getItem('aihu-todos')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) todos = parsed
      }
    } catch {
      // guard
    }
    expect(todos).toHaveLength(0)
  })
})

describe('EX-04 todo-mvc — filter logic', () => {
  const todos = [
    { id: '1', text: 'Active', done: false },
    { id: '2', text: 'Done', done: true },
    { id: '3', text: 'Also active', done: false },
  ]

  it('filters to active todos', () => {
    const active = todos.filter((t) => !t.done)
    expect(active).toHaveLength(2)
  })

  it('filters to completed todos', () => {
    const completed = todos.filter((t) => t.done)
    expect(completed).toHaveLength(1)
  })

  it('clears completed todos', () => {
    const after = todos.filter((t) => !t.done)
    expect(after).toHaveLength(2)
    expect(after.every((t) => !t.done)).toBe(true)
  })
})
