/**
 * spawn-bounds.ts — the bounds every `aihu-compile` subprocess must carry.
 *
 * WHY THIS EXISTS (2026-08-07): two `aihu-compile --stdin` processes were found
 * still alive after 2 days 13 hours, and an `apps/docs` vite build sat 10
 * minutes at 0.0% CPU with a wedged `aihu-css-compile` child. The css-engine
 * side was reproduced under load and both sides sampled:
 *
 *   child  : read (libsystem_kernel) — parked in io::stdin().read_to_string(),
 *            waiting for an EOF on stdin that never arrives.
 *   parent : node::SyncProcessRunner::TryInitializeAndRunLoop -> uv_run ->
 *            uv__io_poll -> kevent — parked in spawnSync's own private uv loop,
 *            still holding that pipe's WRITE end open (`lsof -U` confirmed the
 *            parent was the only holder, so this is not an fd-inheritance leak).
 *
 * The stall is on the parent side: spawnSync's loop never delivers the writable
 * event that would finish `input` and close the write end. Crucially, with no
 * timer armed `uv__io_poll` calls kevent with NO DEADLINE — which is exactly why
 * these processes wait for days rather than minutes. Passing `timeout` arms a uv
 * timer in that same loop, giving kevent a deadline, so the loop always wakes
 * and reaps the child. Verified in a stress harness: the run that hung
 * indefinitely without `timeout` was rescued with ETIMEDOUT once it was set.
 *
 * This is intermittent and load-dependent. It is NOT a pipe-buffer capacity
 * problem — 20 MB of stdin against 200 KB each of stdout+stderr round-trips
 * cleanly on both node and bun.
 *
 * See the matching note in `packages/css-engine/src/index.ts`.
 */

/**
 * Wall-clock ceiling for one `aihu-compile` invocation — a measured floor plus
 * a payload-scaled term, NOT a round number.
 *
 * The floor. Measured on this machine: the largest SFC in `apps/docs`
 * (16 KB source -> 27.7 KB of AST JSON) round-trips through the binary in 4-5
 * ms, and 24 concurrent processes x 60 compiles each never exceeded 5 ms per
 * call. 120 s is ~24,000x the measured per-call cost. That is deliberately
 * absurd headroom: it has to absorb a loaded CI runner, a cold first exec
 * paying macOS code-signature validation, and a machine thrashing swap, because
 * a timeout that trips a legitimately slow build turns a rare hang into routine
 * CI flake — strictly worse than the bug. 120 s is also short enough that a
 * human watching a build notices, which is the entire point: today's hang
 * produced no output for 10 minutes, and two children survived 2.5 days.
 *
 * The scaled term. A flat bound is the wrong shape if some future payload is
 * enormous, so the ceiling also grows at 2 ms per KB of stdin — about 370x
 * slower than the measured 5.4 MB/s throughput. Below ~60 MB of stdin the
 * floor dominates (nothing in this repo comes within three orders of magnitude
 * of that), so in practice the bound IS 120 s today; the scaling only takes
 * over in the regime where a fixed bound could genuinely be too tight.
 */
export const COMPILE_TIMEOUT_FLOOR_MS = 120_000

/** See COMPILE_TIMEOUT_FLOOR_MS — ~370x slower than measured throughput. */
export const COMPILE_TIMEOUT_MS_PER_KB = 2

export const COMPILE_MAX_BUFFER = 64 * 1024 * 1024

export function compileTimeoutMs(inputBytes = 0): number {
  const scaled = Math.ceil(inputBytes / 1024) * COMPILE_TIMEOUT_MS_PER_KB
  const raw = process.env.AIHU_COMPILE_TIMEOUT_MS
  if (raw !== undefined && raw !== '') {
    const n = Number(raw)
    // An explicit override replaces the FLOOR, not the scaling: someone raising
    // the bound for a huge payload should not accidentally lose the per-byte
    // allowance, and someone lowering it for a test should still get a bound.
    if (Number.isFinite(n) && n > 0) return Math.max(n, scaled)
  }
  return Math.max(COMPILE_TIMEOUT_FLOOR_MS, scaled)
}

/**
 * The bounds fragment to spread into every `execFileSync`/`spawnSync` call that
 * runs `aihu-compile`.
 *
 * `killSignal: 'SIGKILL'` because the whole point is that nothing survives: a
 * child already wedged in read() is exactly the process that was found alive
 * 2.5 days later, and a polite SIGTERM is not a guarantee.
 */
export function compileSpawnBounds(inputBytes = 0): {
  timeout: number
  maxBuffer: number
  killSignal: 'SIGKILL'
} {
  return {
    timeout: compileTimeoutMs(inputBytes),
    maxBuffer: COMPILE_MAX_BUFFER,
    killSignal: 'SIGKILL',
  }
}

/**
 * Rewrite a spawn failure into something a human can act on. Node's own
 * ETIMEDOUT/ENOBUFS errors name neither the binary nor the payload, so an
 * unannotated one reads as `spawnSync ... ETIMEDOUT` and tells the reader
 * nothing about which compile died or what to do next.
 *
 * Returns `null` when the error is an ordinary non-zero exit (a real compile
 * error), so callers keep their existing stderr-forwarding behavior.
 */
export function describeSpawnFailure(
  err: unknown,
  bin: string,
  args: string[],
  inputBytes: number,
  elapsedMs: number,
): Error | null {
  const e = err as { code?: string }
  const where =
    `  binary:   ${bin}\n` +
    `  args:     ${args.length > 0 ? args.join(' ') : '(none)'}\n` +
    `  stdin:    ${inputBytes} bytes\n` +
    `  elapsed:  ${elapsedMs} ms`

  if (e.code === 'ETIMEDOUT') {
    const ms = compileTimeoutMs(inputBytes)
    return new Error(
      `[@aihu/compiler] aihu-compile TIMED OUT after ${ms} ms and the child was killed.\n\n` +
        `${where}\n\n` +
        `  This is the known spawn stall, not a slow compile: the compiler normally\n` +
        `  finishes in single-digit milliseconds. The child parks in read() waiting for\n` +
        `  an EOF on stdin that the parent's spawnSync loop never delivers, so without\n` +
        `  this timeout the build would hang at 0% CPU indefinitely (two such children\n` +
        `  were once found still running after 2.5 days).\n\n` +
        `  What to do next:\n` +
        `    - Re-run the build. The stall is intermittent and load-dependent; a retry\n` +
        `      normally succeeds.\n` +
        `    - If it reproduces every time, check the binary directly:  ${bin} --help\n` +
        `      and rebuild it:  cargo build --release -p aihu-compiler\n` +
        `    - If a payload genuinely needs longer than ${ms} ms, raise the bound with\n` +
        `      AIHU_COMPILE_TIMEOUT_MS=<milliseconds>. Do not remove it.`,
    )
  }

  if (e.code === 'ENOBUFS') {
    return new Error(
      `[@aihu/compiler] aihu-compile produced more than the ${COMPILE_MAX_BUFFER} byte\n` +
        `  stdout/stderr limit and the child was killed.\n\n` +
        `${where}\n\n` +
        `  An emit this large almost certainly means the input is wrong rather than a\n` +
        `  real component. Check what is being passed in before raising the cap.`,
    )
  }

  return null
}
