import { describe, expect, it } from 'vitest'
import { renderToString } from '../src/ssr.ts'

describe('@aihu/server ssr', () => {
  it('{ toHtml() } component renders its HTML directly', async () => {
    const component = { toHtml: () => '<p>Hello World</p>' }
    const result = await renderToString(component)
    expect(result).toBe('<p>Hello World</p>')
  })

  // Leaf fixtures mirror the real arbor shape (packages/arbor/src/leaf.ts):
  // a text leaf is { kind:'leaf', leafKind:'text', value } — content in `value`,
  // NOT `text`. The earlier fixtures used a `text` field arbor never emits, so
  // they passed while real leaves rendered empty (FEL-224).

  it('factory returning text leaf renders its value', async () => {
    const component = () => ({ kind: 'leaf', leafKind: 'text', value: 'Hello' })
    const result = await renderToString(component)
    expect(result).toBe('Hello')
  })

  it('factory returning branch renders wrapping tag with children', async () => {
    const component = () => ({
      kind: 'branch',
      tag: 'div',
      children: [{ kind: 'leaf', leafKind: 'text', value: 'X' }],
    })
    const result = await renderToString(component)
    expect(result).toBe('<div>X</div>')
  })

  it('text leaf HTML-escapes its value', async () => {
    const component = () => ({ kind: 'leaf', leafKind: 'text', value: '<b>&"q"' })
    const result = await renderToString(component)
    expect(result).toBe('&lt;b&gt;&amp;"q"')
  })

  it('text leaf with a Signal tuple value renders the current value', async () => {
    // A reactive leaf carries a [read, write] tuple (Array.isArray discriminant).
    const value: [() => string, (v: string) => void] = [() => 'live', () => {}]
    const component = () => ({ kind: 'leaf', leafKind: 'text', value })
    const result = await renderToString(component)
    expect(result).toBe('live')
  })

  it('element leaf renders a void tag with attrs', async () => {
    const component = () => ({
      kind: 'leaf',
      leafKind: 'element',
      tag: 'br',
      attrs: { class: 'x' },
    })
    const result = await renderToString(component)
    expect(result).toBe('<br class="x">')
  })

  it('with opts.head.title → output starts with <!DOCTYPE html> and contains <title>', async () => {
    const component = { toHtml: () => '<p>Content</p>' }
    const result = await renderToString(component, {
      head: { title: 'My Page' },
    })
    expect(result).toMatch(/^<!DOCTYPE html>/)
    expect(result).toContain('<title>My Page</title>')
    expect(result).toContain('<p>Content</p>')
  })

  it('with opts.serializer that returns data → injects __aihu_state__ script', async () => {
    const component = { toHtml: () => '<p>App</p>' }
    const serializer = () => ({ count: 42, user: 'alice' })
    const result = await renderToString(component, { head: {}, serializer })
    expect(result).toContain('<script type="application/json" id="__aihu_state__">')
    expect(result).toContain('"count":42')
    expect(result).toContain('"user":"alice"')
  })

  it('with opts.serializer that throws → no script injected, no error thrown', async () => {
    const component = { toHtml: () => '<p>App</p>' }
    const serializer = (): Record<string, unknown> => {
      throw new Error('not implemented')
    }
    const result = await renderToString(component, { head: {}, serializer })
    expect(result).not.toContain('__aihu_state__')
    expect(result).toContain('<p>App</p>')
  })

  it('branch with attrs renders attributes on element', async () => {
    const component = () => ({
      kind: 'branch',
      tag: 'a',
      attrs: { href: '/home', class: 'nav-link' },
      children: [{ kind: 'leaf', leafKind: 'text', value: 'Home' }],
    })
    const result = await renderToString(component)
    expect(result).toContain('href="/home"')
    expect(result).toContain('class="nav-link"')
    expect(result).toContain('>Home</a>')
  })

  it('opts.hydratable adds data-aihu-path attribute', async () => {
    const component = () => ({
      kind: 'branch',
      tag: 'div',
      children: [],
    })
    const result = await renderToString(component, { hydratable: true })
    expect(result).toContain('data-aihu-path=')
  })

  it('head with meta tags renders meta elements', async () => {
    const component = { toHtml: () => '' }
    const result = await renderToString(component, {
      head: {
        title: 'Test',
        meta: [{ name: 'description', content: 'A test page' }],
      },
    })
    expect(result).toContain('<meta')
    expect(result).toContain('description')
  })
})
