# Builder notes — Phase 3 batch 4

Non-blocking notes from Task 16 + Task 17. Not a blocker — size remains
within budget — but flagged for Team Lead awareness per spec §2.8.

## Telemetry tree-shaking — partial elimination, not total

Per spec §2.8, the production no-op observer was supposed to allow
Rolldown to inline-and-eliminate the call sites. Verification after Task
16 shows the call sites **survive** Rolldown + esbuild minification:

```
$ grep -E "mount-start|effect-create|mount-end" packages/arbor/dist/index.js
		kind: "effect-create",
		kind: "mount-start",
		kind: "mount-end",
```

The minified gz dist is 1.14 kB / 2.05 kB budget. The spec target was
~5 B for the slot + call sites; actual overhead is closer to 100-200 B
(five `_observeMount({kind, path, timestamp:Date.now()})` invocations
plus the `MountTelemetry` interface JSDoc and `_setMountObserver`
exporter). The interface is type-only and erases — the runtime cost is
purely the call sites and the no-op slot.

**Why elimination doesn't happen:** the call passes a fresh object
literal containing `Date.now()`, which is an impure expression. Rolldown
cannot prove the entire call has no side effects (the observer slot is
mutable via `_setMountObserver` — the dev plugin substitution is the
whole point), so it preserves both the object construction and the
function invocation.

**Not blocking now:** arbor headroom is 913 B. The 100-200 B telemetry
overhead is acceptable for v0 per the Builder direction's "< 100 B
overhead OK; if much larger, escalate" gate (this lands closer to the
"larger" side but with comfortable budget).

**Spec-mandated mitigation if a future task tightens the size budget:**
switch to a build-time `__DEV__` constant per spec §2.8. The pattern:

```ts
// In production: __DEV__ is replaced with `false` by the build pipeline,
// so the entire `if (__DEV__)` block dead-code-eliminates.
declare const __DEV__: boolean
if (__DEV__) {
  _observeMount({ kind: 'mount-start', path: pathBase, timestamp: Date.now() })
}
```

Would need a Vite/Rolldown define plugin entry. Defer until headroom
becomes an issue (v1 reconciler in Task 18+ may eat into the budget).

## `_activeMountDisposers` is `export let`

Spec §2.2 declares the slot as `let _activeMountDisposers: Dispose[] | null = null`.
Exporting `let` is unusual — but spec §2.2 says "the slot itself is exposed
for sub-project #7's binding layer to inspect during materialization later."
A live binding (re-exported `let`) is the only way the consumer sees the
current value rather than the initial null. Kept as `export let` per
spec verbatim. Biome flagged nothing here.
