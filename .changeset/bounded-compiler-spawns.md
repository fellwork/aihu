---
'@aihu/css-engine': patch
'@aihu/compiler': patch
---

Bound every `aihu-compile` / `aihu-css-compile` subprocess so a build can no
longer hang forever with no output.

An `apps/docs` vite build sat 10 minutes at 0.0% CPU with a wedged
`aihu-css-compile --ast-json` child, and two `aihu-compile --stdin` children
were found still alive after 2 days 13 hours. Reproduced under load and sampled
both sides:

- child — parked in `read()`, inside `io::stdin().read_to_string()`, waiting for
  an EOF on stdin that never arrives.
- parent — parked in `node::SyncProcessRunner::TryInitializeAndRunLoop` →
  `uv_run` → `uv__io_poll` → `kevent`, still holding that pipe's write end.
  `lsof -U` confirmed the parent was the only holder, so this is not an
  fd-inheritance leak.

The stall is on the parent side: `spawnSync`'s private uv loop never delivers
the writable event that would finish `input` and close the write end. With no
timer armed `uv__io_poll` calls `kevent` with **no deadline**, which is why
these processes wait for days rather than minutes. Passing `timeout` arms a uv
timer in that same loop, giving `kevent` a deadline, so the loop always wakes
and reaps the child. It is not a pipe-buffer capacity problem — 20 MB of stdin
against 200 KB each of stdout and stderr round-trips cleanly on both node and
bun.

Every spawn now carries a timeout, an explicit `maxBuffer` (node's inherited
1 MiB default was its own latent `ENOBUFS` failure), and `killSignal: 'SIGKILL'`
so nothing survives. The bound is a measured floor of 120 s — about 24,000x the
measured 4-5 ms per-call cost, wide enough that a loaded CI runner cannot trip
it — plus 2 ms per KB of stdin, so it scales for payloads far larger than
anything this repo produces. Override with `AIHU_COMPILE_TIMEOUT_MS` /
`AIHU_CSS_COMPILE_TIMEOUT_MS`; an override replaces the floor but keeps the
per-byte allowance.

When it fires the error names the binary, the args, the stdin size and the
elapsed time, and says what to do next — the original hang produced no output at
all, which is what let it cost ten minutes and two zombies survive two days.
