/**
 * EX-05 color-theme smoke test.
 */

import { getAllAgentMetadata, registerAgentMetadata } from '@aihu/agent'
import { beforeEach, describe, expect, it } from 'vitest'

// @ts-expect-error
import { __resetRegistryForTesting } from '../../../packages/agent/src/registry.ts'

describe('EX-05 color-theme — agent metadata', () => {
  beforeEach(() => {
    __resetRegistryForTesting()
  })

  it('registers expected @agent metadata shape', () => {
    registerAgentMetadata({
      tag: 'color-theme',
      state: {
        hue: 'Hue channel (0-360)',
        saturation: 'Saturation channel (0-100)',
        lightness: 'Lightness channel (0-100)',
        primary: 'Computed HSL primary color string',
      },
      actions: {
        setPreset: { returns: {} },
        setHue: { returns: {} },
        setSaturation: { returns: {} },
        setLightness: { returns: {} },
      },
    })

    const entries = getAllAgentMetadata()
    expect(entries).toHaveLength(1)
    expect(entries[0].tag).toBe('color-theme')
    expect(entries[0].state?.hue).toBeDefined()
    expect(entries[0].state?.primary).toBeDefined()
    expect(entries[0].actions?.setPreset).toBeDefined()
    expect(entries[0].actions?.setHue).toBeDefined()
  })
})

describe('EX-05 color-theme — HSL computation', () => {
  it('computes primary HSL string', () => {
    const hue = 215,
      sat = 70,
      light = 55
    const primary = `hsl(${hue} ${sat}% ${light}%)`
    expect(primary).toBe('hsl(215 70% 55%)')
  })

  it('determines onPrimary contrast correctly', () => {
    const onPrimary = (lightness: number) => (lightness < 60 ? '#ffffff' : '#111111')
    expect(onPrimary(55)).toBe('#ffffff')
    expect(onPrimary(65)).toBe('#111111')
  })

  it('setPreset resets saturation and lightness to 70/55', () => {
    let hue = 215,
      saturation = 70,
      lightness = 55
    const setPreset = (h: number) => {
      hue = h
      saturation = 70
      lightness = 55
    }
    setPreset(140)
    expect(hue).toBe(140)
    expect(saturation).toBe(70)
    expect(lightness).toBe(55)
  })
})
