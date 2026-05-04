import { renderToString } from '@scribe/server'
import { describe, expect, it } from 'vitest'

describe('@scribe/server SSR structural compliance', () => {
  // Test 1: DOCTYPE present when opts.head provided
  it('output includes <!DOCTYPE html> when opts.head provided', async () => {
    const result = await renderToString(
      { toHtml: () => '<p>content</p>' },
      { head: { title: 'Test' } },
    )
    expect(result).toMatch(/^<!DOCTYPE html>/)
  })

  // Test 2: <html> tag present when opts.head provided
  it('<html> tag present when opts.head provided', async () => {
    const result = await renderToString({ toHtml: () => '<p>content</p>' }, { head: {} })
    expect(result).toContain('<html>')
  })

  // Test 3: <head> contains <title> when opts.head.title set
  it('<head> contains <title> when opts.head.title set', async () => {
    const result = await renderToString({ toHtml: () => '' }, { head: { title: 'My Title' } })
    expect(result).toContain('<title>My Title</title>')
    // Must be inside <head> before <body>
    const headEnd = result.indexOf('</head>')
    const titleIdx = result.indexOf('<title>')
    expect(titleIdx).toBeGreaterThan(-1)
    expect(titleIdx).toBeLessThan(headEnd)
  })

  // Test 4: <meta> tags from opts.head.meta appear in <head>
  it('<meta> tags from opts.head.meta appear in <head>', async () => {
    const result = await renderToString(
      { toHtml: () => '' },
      {
        head: {
          meta: [
            { name: 'description', content: 'A test page' },
            { name: 'viewport', content: 'width=device-width, initial-scale=1' },
          ],
        },
      },
    )
    const headSection = result.slice(result.indexOf('<head>'), result.indexOf('</head>'))
    expect(headSection).toContain('name="description"')
    expect(headSection).toContain('content="A test page"')
    expect(headSection).toContain('name="viewport"')
  })

  // Test 5: <link> tags from opts.head.links appear in <head>
  it('<link> tags from opts.head.links appear in <head>', async () => {
    const result = await renderToString(
      { toHtml: () => '' },
      {
        head: {
          links: [
            { rel: 'stylesheet', href: '/style.css' },
            { rel: 'canonical', href: 'https://example.com/' },
          ],
        },
      },
    )
    const headSection = result.slice(result.indexOf('<head>'), result.indexOf('</head>'))
    expect(headSection).toContain('rel="stylesheet"')
    expect(headSection).toContain('href="/style.css"')
    expect(headSection).toContain('rel="canonical"')
  })

  // Test 6: No "undefined" or "[object Object]" in output
  it('no "undefined" or "[object Object]" in output', async () => {
    const result = await renderToString(
      () => ({
        kind: 'branch' as const,
        tag: 'div',
        attrs: { class: 'container' },
        children: [
          {
            kind: 'branch' as const,
            tag: 'p',
            attrs: {},
            children: [{ kind: 'leaf' as const, text: 'Hello' }],
          },
        ],
      }),
      { head: { title: 'Check' } },
    )
    expect(result).not.toContain('undefined')
    expect(result).not.toContain('[object Object]')
  })

  // Test 7: boolean attr disabled: true → attribute present without value
  it('branch with boolean attr disabled: true → disabled attribute emitted without value', async () => {
    const result = await renderToString(() => ({
      kind: 'branch' as const,
      tag: 'button',
      attrs: { disabled: true },
      children: [{ kind: 'leaf' as const, text: 'Click' }],
    }))
    // Should contain " disabled" (the attribute name only, no ="...")
    expect(result).toContain('<button disabled>')
    expect(result).not.toContain('disabled="')
  })

  // Test 8: boolean attr disabled: false → attribute omitted
  it('branch with boolean attr disabled: false → attr omitted from output', async () => {
    const result = await renderToString(() => ({
      kind: 'branch' as const,
      tag: 'button',
      attrs: { disabled: false },
      children: [{ kind: 'leaf' as const, text: 'Click' }],
    }))
    expect(result).not.toContain('disabled')
  })

  // Test 9: Nested branches render at correct depth
  it('nested branches render at correct depth', async () => {
    const result = await renderToString(() => ({
      kind: 'branch' as const,
      tag: 'nav',
      attrs: {},
      children: [
        {
          kind: 'branch' as const,
          tag: 'ul',
          attrs: {},
          children: [
            {
              kind: 'branch' as const,
              tag: 'li',
              attrs: {},
              children: [{ kind: 'leaf' as const, text: 'Item' }],
            },
          ],
        },
      ],
    }))
    expect(result).toBe('<nav><ul><li>Item</li></ul></nav>')
  })

  // Test 10: data-scribe-path present when hydratable: true
  it('data-scribe-path attributes present when opts.hydratable: true', async () => {
    const result = await renderToString(
      () => ({
        kind: 'branch' as const,
        tag: 'div',
        attrs: {},
        children: [
          {
            kind: 'branch' as const,
            tag: 'span',
            attrs: {},
            children: [{ kind: 'leaf' as const, text: 'hi' }],
          },
        ],
      }),
      { hydratable: true },
    )
    expect(result).toContain('data-scribe-path="0"')
    expect(result).toContain('data-scribe-path="0.0"')
  })

  // Test 11: Serializer result injected as <script type="application/json" id="__scribe_state__">
  it('serializer result injected as <script type="application/json" id="__scribe_state__"> when serializer returns data', async () => {
    const result = await renderToString(
      { toHtml: () => '<p>App</p>' },
      {
        head: {},
        serializer: () => ({ counter: 7, user: 'bob' }),
      },
    )
    expect(result).toContain('<script type="application/json" id="__scribe_state__">')
    expect(result).toContain('"counter":7')
    expect(result).toContain('"user":"bob"')
  })

  // Test 12: Serializer throw → no script tag, no error thrown
  it('serializer throw → no script tag emitted, no error thrown', async () => {
    let threw = false
    let result = ''
    try {
      result = await renderToString(
        { toHtml: () => '<p>App</p>' },
        {
          head: {},
          serializer: (): Record<string, unknown> => {
            throw new Error('v0 stub — not implemented')
          },
        },
      )
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
    expect(result).not.toContain('__scribe_state__')
    expect(result).toContain('<p>App</p>')
  })
})
