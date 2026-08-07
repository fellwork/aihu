import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import {
  COMPILE_MAX_BUFFER,
  COMPILE_TIMEOUT_FLOOR_MS,
  compileSpawnBounds,
  compileTimeoutMs,
  describeSpawnFailure,
} from '../js/spawn-bounds.ts'

// Regression for the silent-hang class of bug (2026-08-07): two
// `aihu-compile --stdin` children were found still alive after 2 days 13 hours,
// and the sibling css-engine case was reproduced under load and sampled —
// child parked in read() waiting for an EOF on stdin, parent parked in
// node::SyncProcessRunner -> uv_run -> uv__io_poll -> kevent with NO deadline
// (no timer armed), still holding that pipe's write end. `timeout` arms the uv
// timer that gives kevent a deadline, which is what makes the loop wake at all.

const tmp = mkdtempSync(join(tmpdir(), 'aihu-compile-bounds-'))
const hangBin = join(tmp, 'fake-aihu-compile')
writeFileSync(hangBin, '#!/bin/sh\n# Never reads stdin, never exits.\nexec sleep 600\n')
chmodSync(hangBin, 0o755)

afterAll(() => rmSync(tmp, { recursive: true, force: true }))
afterEach(() => {
  delete process.env.AIHU_COMPILE_TIMEOUT_MS
})

describe('@aihu/compiler — spawn bounds', () => {
  it('kills a child that never exits, instead of hanging forever', () => {
    // Shrink the bound via the documented override rather than passing a literal
    // `timeout` after the spread: a literal would make this test pass even if
    // compileSpawnBounds() supplied no timeout at all, which is precisely the
    // worthless-bounds-test shape this is guarding against.
    process.env.AIHU_COMPILE_TIMEOUT_MS = '1200'
    const startedAt = Date.now()
    let code: string | undefined
    try {
      // Without the bounds fragment this call never returns.
      execFileSync(hangBin, ['--stdin', '--tag', 'Probe'], {
        input: 'x'.repeat(64),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        ...compileSpawnBounds(64),
      })
    } catch (err) {
      code = (err as { code?: string }).code
    }
    expect(code).toBe('ETIMEDOUT')
    expect(Date.now() - startedAt).toBeLessThan(10_000)
  })

  it('renders a timeout failure naming the binary, args, payload size and elapsed time', () => {
    const err = describeSpawnFailure(
      { code: 'ETIMEDOUT' },
      hangBin,
      ['--stdin', '--tag', 'Probe'],
      27_738,
      120_004,
    )
    expect(err).not.toBeNull()
    const message = (err as Error).message
    expect(message).toContain('TIMED OUT')
    expect(message).toContain(hangBin)
    expect(message).toContain('--stdin --tag Probe')
    expect(message).toContain('stdin:    27738 bytes')
    expect(message).toContain('elapsed:  120004 ms')
    // And what to do next.
    expect(message).toContain('AIHU_COMPILE_TIMEOUT_MS')
    expect(message).toContain('cargo build --release -p aihu-compiler')
  })

  it('renders a maxBuffer failure', () => {
    const err = describeSpawnFailure({ code: 'ENOBUFS' }, hangBin, [], 10, 5)
    expect((err as Error).message).toContain(String(COMPILE_MAX_BUFFER))
  })

  it('leaves an ordinary non-zero exit alone (callers keep forwarding stderr)', () => {
    expect(describeSpawnFailure({ status: 1 }, hangBin, [], 10, 5)).toBeNull()
  })

  describe('the bound is payload-scaled, not a flat number', () => {
    it('uses the measured floor for every payload this repo actually produces', () => {
      // The largest apps/docs SFC is 27.7 KB of AST JSON.
      expect(compileTimeoutMs(27_738)).toBe(COMPILE_TIMEOUT_FLOOR_MS)
      expect(compileTimeoutMs(0)).toBe(COMPILE_TIMEOUT_FLOOR_MS)
    })

    it('scales above the floor once the payload is large enough to warrant it', () => {
      // 2 ms/KB overtakes a 120 s floor at ~60 MB of stdin.
      expect(compileTimeoutMs(200 * 1024 * 1024)).toBeGreaterThan(COMPILE_TIMEOUT_FLOOR_MS)
      expect(compileTimeoutMs(200 * 1024 * 1024)).toBe(200 * 1024 * 2)
    })

    it('lets an override replace the floor while keeping the per-byte allowance', () => {
      process.env.AIHU_COMPILE_TIMEOUT_MS = '5000'
      expect(compileTimeoutMs(1024)).toBe(5000)
      // A huge payload still gets its scaled allowance despite the low override.
      expect(compileTimeoutMs(200 * 1024 * 1024)).toBe(200 * 1024 * 2)
    })

    it('ignores a junk override rather than becoming unbounded', () => {
      process.env.AIHU_COMPILE_TIMEOUT_MS = 'not-a-number'
      expect(compileTimeoutMs(1024)).toBe(COMPILE_TIMEOUT_FLOOR_MS)
      process.env.AIHU_COMPILE_TIMEOUT_MS = '0'
      expect(compileTimeoutMs(1024)).toBe(COMPILE_TIMEOUT_FLOOR_MS)
    })
  })
})
