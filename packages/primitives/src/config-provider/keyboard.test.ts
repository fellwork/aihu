/**
 * config-provider behavior tests (jsdom): reactive propagation of
 * colorScheme/density/dir + host attribute reflection + nested nearest-wins.
 */
import { effect } from '@aihu/signals'
import { beforeEach, describe, expect, it } from 'vitest'
import { injectContext } from '../dom-context.ts'
import { type AihuConfigProvider, configContext, defineConfigProvider } from './index.ts'

defineConfigProvider()

describe('<aihu-config-provider>', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('updating colorScheme re-runs every injecting descendant effect', () => {
    const provider = document.createElement('aihu-config-provider') as AihuConfigProvider
    const child = document.createElement('span')
    provider.appendChild(child)
    document.body.appendChild(provider)

    const ctx = injectContext(child, configContext)
    const seen: string[] = []
    const dispose = effect(() => {
      seen.push(ctx.colorScheme())
    })
    expect(seen).toEqual(['system'])

    provider.setColorScheme('dark')
    expect(seen).toEqual(['system', 'dark'])
    dispose()
  })

  it('density/dir reflect to host attributes', () => {
    const provider = document.createElement('aihu-config-provider') as AihuConfigProvider
    provider.setAttribute('density', 'compact')
    provider.setAttribute('dir', 'rtl')
    document.body.appendChild(provider)
    expect(provider.getAttribute('data-density')).toBe('compact')
    expect(provider.getAttribute('dir')).toBe('rtl')
  })

  it('color-scheme reflects onto data-color-scheme', () => {
    const provider = document.createElement('aihu-config-provider') as AihuConfigProvider
    provider.setAttribute('color-scheme', 'dark')
    document.body.appendChild(provider)
    expect(provider.getAttribute('data-color-scheme')).toBe('dark')
  })

  it('nested config-providers resolve nearest-wins', () => {
    const outer = document.createElement('aihu-config-provider') as AihuConfigProvider
    const inner = document.createElement('aihu-config-provider') as AihuConfigProvider
    const child = document.createElement('span')
    inner.appendChild(child)
    outer.appendChild(inner)
    document.body.appendChild(outer)

    outer.setColorScheme('light')
    inner.setColorScheme('dark')

    const ctx = injectContext(child, configContext)
    expect(ctx.colorScheme()).toBe('dark')
  })
})
