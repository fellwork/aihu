# launchd HAS NO LOGIN SHELL — a PATH gap crash-looped the supervisor

**Topic:** swarm tooling (supervisor, launchd)
**Session:** named 2026-07-27 (retro C-FEL-RETRO-0727, incident 3)
**Category:** ops, resilience
**Severity:** medium — ~20 wake crashes and a redelivery loop; **no work was lost**,
which is the other half of the lesson.

## The trigger

The swarm supervisor, launched by launchd, could not find the `claude` binary. Each
wake crashed immediately; launchd relaunched it at once; the result was ~20 crashes
in quick succession and a message-redelivery loop.

## The mechanism

A launchd agent does **not** inherit your interactive shell's `PATH`. It gets a
minimal default (`/usr/bin:/bin:/usr/sbin:/sbin`) unless the plist declares one. The
`claude` binary lives at `~/.local/bin/claude` (a symlink →
`~/.local/share/claude/versions/2.1.220`), and `~/.local/bin` was **not** in the
plist's PATH. So `claude` was on disk, on the interactive PATH, and invisible to the
process launchd actually spawned — a launch-context mismatch, not a missing install.

## The fix — structural, in the plist

`~/Library/LaunchAgents/com.fellwork.swarm.supervisor.plist`:

- `:9-10` — `EnvironmentVariables > PATH` now **leads** with
  `/Users/smcguirt/.local/bin` (then `.proto/shims`, homebrew, `/usr/bin`, `.bun/bin`).
  The binary is found because the launch context now names its directory.
- `:28-29` — `ThrottleInterval` `30`. launchd's default minimum respawn interval is
  10s; a fast-crashing agent still hammers. 30s bounds the blast radius of any future
  crash-on-start so a bad wake degrades instead of storming.

This is the launchd sibling of the general rule in
`fresh-worktree-binaries.md` / `css-engine-ci-binary-build.md`: **a binary's
resolvability is a property of the environment that invokes it, not of whether it
exists.** The interactive shell finding it proves nothing about the daemon.

## What WORKED — record wins as loudly as failures

Through all ~20 crashes, **nothing was lost.** The bus delivers at-least-once: a
message is not consumed until the recipient **acks** it, so every wake that crashed
before acking simply had its messages **redelivered** on the next wake. The crash
loop was noisy, not lossy. (This is why messages in this session arrive tagged
*"delivery attempt N"* — that is the mechanism doing its job.)

> **A redelivery loop is the visible symptom of a durable-delivery design working
> under a broken consumer.** The fix is the consumer (PATH) and the rate-limit
> (`ThrottleInterval`); the delivery guarantee is what bought time to apply it
> without dropping work. Do not "fix" the redelivery by dropping unacked messages.

## Recipe

- **A launchd/systemd unit must declare its own PATH** (or use absolute paths in
  `ProgramArguments`). Never assume the login shell's environment.
- **Set a respawn throttle** on anything launchd keeps alive, so a crash-on-start is
  a slow degrade, not a storm.
- **Verify from the daemon's context, not your terminal.** `which claude` in your
  shell is not evidence the agent can find it.

## Related

- `promotion-rungs.md` — incident 3 in the retro audit table
- `fresh-worktree-binaries.md`, `css-engine-ci-binary-build.md` — binary resolvability is environmental
