import { describe, expect, it } from 'vitest'
import { generateA2aCard } from '../src/a2a-card.ts'

describe('generateA2aCard', () => {
  it('produces all fields when full config is provided', () => {
    const card = generateA2aCard({
      name: 'My App',
      description: 'A great app',
      url: 'https://myapp.example.com',
      version: '1.2.3',
      capabilities: { streaming: true, pushNotifications: true },
      skills: [{ id: 'search', name: 'Search', description: 'Full-text search' }],
    })
    expect(card.name).toBe('My App')
    expect(card.description).toBe('A great app')
    expect(card.url).toBe('https://myapp.example.com')
    expect(card.version).toBe('1.2.3')
    expect(card.capabilities).toEqual({ streaming: true, pushNotifications: true })
    expect(card.skills).toHaveLength(1)
    expect(card.skills![0]).toEqual({
      id: 'search',
      name: 'Search',
      description: 'Full-text search',
    })
  })

  it('omits description when not provided', () => {
    const card = generateA2aCard({ name: 'App', url: 'https://app.example.com' })
    expect('description' in card).toBe(false)
  })

  it('omits version when not provided', () => {
    const card = generateA2aCard({ name: 'App', url: 'https://app.example.com' })
    expect('version' in card).toBe(false)
  })

  it('omits skills when not provided', () => {
    const card = generateA2aCard({ name: 'App', url: 'https://app.example.com' })
    expect('skills' in card).toBe(false)
  })

  it('omits skills when empty array is provided', () => {
    const card = generateA2aCard({ name: 'App', url: 'https://app.example.com', skills: [] })
    expect('skills' in card).toBe(false)
  })

  it('defaults capabilities to streaming: false, pushNotifications: false', () => {
    const card = generateA2aCard({ name: 'App', url: 'https://app.example.com' })
    expect(card.capabilities).toEqual({ streaming: false, pushNotifications: false })
  })

  it('merges partial capabilities with defaults', () => {
    const card = generateA2aCard({
      name: 'App',
      url: 'https://app.example.com',
      capabilities: { streaming: true },
    })
    expect(card.capabilities).toEqual({ streaming: true, pushNotifications: false })
  })
})
