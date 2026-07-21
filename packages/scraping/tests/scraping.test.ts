import { describe, expect, it, vi } from 'vitest'
import { createBotDetectionMiddleware, createRateLimiter } from '../src/index.ts'

// ─── Rate-limiter tests ───────────────────────────────────────────────────────

describe('createRateLimiter', () => {
  it('allows first N requests up to the limit', () => {
    const limiter = createRateLimiter({ now: () => 0 })
    expect(limiter.checkRateLimit('3/min', 'user:tag')).toBe(true)
    expect(limiter.checkRateLimit('3/min', 'user:tag')).toBe(true)
    expect(limiter.checkRateLimit('3/min', 'user:tag')).toBe(true)
  })

  it('blocks the (N+1)th request within the same window', () => {
    const limiter = createRateLimiter({ now: () => 0 })
    limiter.checkRateLimit('3/min', 'user:tag')
    limiter.checkRateLimit('3/min', 'user:tag')
    limiter.checkRateLimit('3/min', 'user:tag')
    expect(limiter.checkRateLimit('3/min', 'user:tag')).toBe(false)
  })

  it('resets window after windowMs elapses', () => {
    let t = 0
    const limiter = createRateLimiter({ now: () => t })

    // Exhaust the quota at t=0
    limiter.checkRateLimit('3/min', 'user:tag')
    limiter.checkRateLimit('3/min', 'user:tag')
    limiter.checkRateLimit('3/min', 'user:tag')
    expect(limiter.checkRateLimit('3/min', 'user:tag')).toBe(false)

    // Advance past the 60 000 ms window
    t = 60_001
    expect(limiter.checkRateLimit('3/min', 'user:tag')).toBe(true)
  })

  it('isolates different keys from each other', () => {
    const limiter = createRateLimiter({ now: () => 0 })
    // Exhaust key A
    limiter.checkRateLimit('1/min', 'key-a')
    expect(limiter.checkRateLimit('1/min', 'key-a')).toBe(false)
    // key B should still be fresh
    expect(limiter.checkRateLimit('1/min', 'key-b')).toBe(true)
  })

  it('parses "100/min" → limit 100, window 60 000 ms', () => {
    let t = 0
    const limiter = createRateLimiter({ now: () => t })
    for (let i = 0; i < 100; i++) limiter.checkRateLimit('100/min', 'u')
    // 101st call within window → blocked
    expect(limiter.checkRateLimit('100/min', 'u')).toBe(false)
    // Advance exactly 60 000 ms — window has NOT expired (>=, not >)
    t = 60_000
    expect(limiter.checkRateLimit('100/min', 'u')).toBe(true)
  })

  it('parses "10/sec" → limit 10, window 1 000 ms', () => {
    let t = 0
    const limiter = createRateLimiter({ now: () => t })
    for (let i = 0; i < 10; i++) limiter.checkRateLimit('10/sec', 'u')
    expect(limiter.checkRateLimit('10/sec', 'u')).toBe(false)
    t = 1_001
    expect(limiter.checkRateLimit('10/sec', 'u')).toBe(true)
  })

  it('parses "500/hour" → limit 500, window 3 600 000 ms', () => {
    let t = 0
    const limiter = createRateLimiter({ now: () => t })
    for (let i = 0; i < 500; i++) limiter.checkRateLimit('500/hour', 'u')
    expect(limiter.checkRateLimit('500/hour', 'u')).toBe(false)
    t = 3_600_001
    expect(limiter.checkRateLimit('500/hour', 'u')).toBe(true)
  })

  // ── Fail-closed at capacity ─────────────────────────────────────────────
  // A governed control must DENY what it cannot account for. The map-cap
  // branch used to allow new keys ("safety valve") — the wrong direction.

  it('at map capacity, a NEW (untracked) key is DENIED — fail-closed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const limiter = createRateLimiter({ maxKeys: 1, now: () => 0 })
      expect(limiter.checkRateLimit('3/min', 'key-a')).toBe(true) // occupies the only slot
      expect(limiter.checkRateLimit('3/min', 'key-b')).toBe(false) // cap → denied, not allowed
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('already-tracked keys keep normal under-limit accounting at capacity (regression)', () => {
    const limiter = createRateLimiter({ maxKeys: 1, now: () => 0 })
    expect(limiter.checkRateLimit('2/min', 'key-a')).toBe(true)
    expect(limiter.checkRateLimit('2/min', 'key-a')).toBe(true)
    // Third call denied by QUOTA (normal behavior), not by the cap.
    expect(limiter.checkRateLimit('2/min', 'key-a')).toBe(false)
  })

  it('an internal error (invalid rateSpec) denies instead of throwing — fail-closed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const limiter = createRateLimiter({ now: () => 0 })
      expect(limiter.checkRateLimit('not-a-spec', 'k')).toBe(false)
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('O(1) invariant: 1 000 sequential calls to exhausted key complete in < 10 ms', () => {
    const limiter = createRateLimiter({ now: () => 0 })
    // Exhaust quota
    limiter.checkRateLimit('1/min', 'perf-key')
    limiter.checkRateLimit('1/min', 'perf-key')

    const start = performance.now()
    for (let i = 0; i < 1_000; i++) {
      limiter.checkRateLimit('1/min', 'perf-key')
    }
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(10)
  })
})

// ─── Bot-detection tests ──────────────────────────────────────────────────────

function makeRequest(ua: string | null): Request {
  const headers = new Headers()
  if (ua !== null) headers.set('user-agent', ua)
  return new Request('https://example.com/', { headers })
}

const ALLOW_RESPONSE = new Response('OK', { status: 200 })
const next = (): Response => ALLOW_RESPONSE

describe('createBotDetectionMiddleware', () => {
  it('blocks a Googlebot User-Agent with 403', async () => {
    const mw = createBotDetectionMiddleware()
    const res = await mw(
      makeRequest('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'),
      next,
    )
    expect(res.status).toBe(403)
  })

  it('allows a legitimate Chrome browser UA', async () => {
    const mw = createBotDetectionMiddleware()
    const res = await mw(
      makeRequest(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      ),
      next,
    )
    expect(res.status).toBe(200)
  })

  it('blocks a missing User-Agent by default (allowNoUserAgent: false)', async () => {
    const mw = createBotDetectionMiddleware()
    const res = await mw(makeRequest(null), next)
    expect(res.status).toBe(403)
  })

  it('allows a missing User-Agent when allowNoUserAgent: true', async () => {
    const mw = createBotDetectionMiddleware({ allowNoUserAgent: true })
    const res = await mw(makeRequest(null), next)
    expect(res.status).toBe(200)
  })

  it('blocks curl UA via default blocklist', async () => {
    const mw = createBotDetectionMiddleware()
    const res = await mw(makeRequest('curl/8.5.0'), next)
    expect(res.status).toBe(403)
  })

  it('blocks python-requests UA via default blocklist', async () => {
    const mw = createBotDetectionMiddleware()
    const res = await mw(makeRequest('python-requests/2.31.0'), next)
    expect(res.status).toBe(403)
  })

  it('blocks a custom UA pattern supplied via blockList option', async () => {
    const mw = createBotDetectionMiddleware({ blockList: ['badagent'] })
    const res = await mw(makeRequest('BadAgent/1.0'), next)
    expect(res.status).toBe(403)
  })

  it('performs case-insensitive UA matching (CRAWL uppercase)', async () => {
    const mw = createBotDetectionMiddleware()
    const res = await mw(makeRequest('MyCRAWLer/2.0'), next)
    expect(res.status).toBe(403)
  })
})
