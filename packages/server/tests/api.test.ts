import { describe, expect, it } from 'vitest'
import {
  badRequest,
  defineApiRoute,
  json,
  methodNotAllowed,
  notFound,
  serverError,
} from '../src/api.ts'

describe('@aihu/server api', () => {
  it('json({ ok: true }) returns status 200 with application/json', async () => {
    const res = json({ ok: true })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })

  it('json({ ok: true }, 201) returns status 201', async () => {
    const res = json({ ok: true }, 201)
    expect(res.status).toBe(201)
  })

  it('notFound() returns status 404', () => {
    const res = notFound()
    expect(res.status).toBe(404)
  })

  it('methodNotAllowed returns status 405 with Allow header', () => {
    const res = methodNotAllowed(['GET', 'POST'])
    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('GET, POST')
  })

  it('badRequest with message returns status 400 with message body', async () => {
    const res = badRequest('missing field')
    expect(res.status).toBe(400)
    expect(await res.text()).toContain('missing field')
  })

  it('badRequest without message returns status 400 with default body', async () => {
    const res = badRequest()
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Bad Request')
  })

  it('serverError() returns status 500 with error body', async () => {
    const res = serverError()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('serverError() in test (non-dev) environment returns generic error message', async () => {
    // In tests, __DEV__ is undefined (falsy), so production path is used
    const res = serverError(new Error('secret database password'))
    const body = await res.json()
    // Should be the generic message, not exposing the actual error
    expect(body.error).toBe('internal server error')
  })

  it('defineApiRoute returns a Route with the correct pattern', () => {
    const route = defineApiRoute('GET', '/items', async () => new Response('ok'))
    expect(route.pattern).toBe('/items')
  })

  it('defineApiRoute handler returns 405 for wrong method', async () => {
    const route = defineApiRoute('POST', '/items', async () => new Response('created'))
    const req = new Request('https://example.com/items', { method: 'GET' })
    const res = await route.handler(req, {
      params: {},
      url: new URL('https://example.com/items'),
    })
    expect(res.status).toBe(405)
  })

  it('defineApiRoute handler calls through for correct method', async () => {
    const route = defineApiRoute('GET', '/items', async () => new Response('items list'))
    const req = new Request('https://example.com/items', { method: 'GET' })
    const res = await route.handler(req, {
      params: {},
      url: new URL('https://example.com/items'),
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('items list')
  })
})
