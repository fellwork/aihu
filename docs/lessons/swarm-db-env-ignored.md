# A "TEST" WITH NO ISOLATION WROTE TO THE LIVE LEDGER

**Topic:** swarm tooling (bus, ledger)
**Session:** named 2026-07-27 (retro C-FEL-RETRO-0727, incident 2)
**Category:** test-isolation, measurement-integrity
**Severity:** high — a test mutated production state and flipped a real contract's
status; the false `verified` then had to be found and undone.

## The trigger

A `setstatus` run intended as a **test** wrote a **false `verified`** status into
the **live** contract ledger, flipping a real contract that no reconcile pass had
checked. The test believed it was hitting a scratch database. It was hitting prod.

## The mechanism, at code level

`~/.swarm/bus.py:30`:

```python
DB = os.path.expanduser("~/.swarm/bus.db")
```

The path is **hardcoded**. `bus.py` never reads a `SWARM_DB` (or any) environment
override — `grep SWARM_DB ~/.swarm/bus.py` finds only the docstring at `:12`
mentioning the file, never an `os.environ`/`os.getenv` read. So there is no way to
point a test at a throwaway database: every invocation, test or not, opens the one
production file at `:38` (`sqlite3.connect(DB, …)`).

This is a member of `checked-thing-is-not-the-changed-thing.md` — the database you
wrote to is not the database you thought you were writing to — but with teeth,
because the "wrong subject" here is the live ledger and the write is destructive.

## The promotion rung: structural, in the Rust core

The fix is **not** "remember to be careful with `setstatus`" (prose) and **not** a
warning banner (prose). It is that the successor honors the override:

`packages/swarm/src/main.rs:433`:

```rust
if let Ok(p) = env::var("SWARM_DB") { /* use p */ }
```

documented at `main.rs:5` — *"(`~/.swarm/bus.db`, overridable via `SWARM_DB`)"*.
Shipped as part of the Rust bus core in **#642** (`932371ab`, *"feat(swarm): Rust
bus core — typed payloads, full command surface, Linear/GitHub sync"*). A test can
now export `SWARM_DB=/tmp/scratch.db` and be **structurally** unable to touch prod.

> **A test path that shares one hardcoded resource with production is not a test —
> it is production with a different intent.** Isolation is a property of the code,
> not of the operator's care. The env-var override is the structural rung; the
> honored `SWARM_DB` is the gate the prose could not be.

## Recipe

- **Every stateful tool must accept an env override for its store**, and tests must
  set it. If the path is a module constant, that is the smell.
- **Grep a tool for `os.environ`/`env::var` before trusting that `FOO_DB=… tool`
  isolates anything.** Absence means the variable is ignored, not honored.

## Related

- `promotion-rungs.md` — incident 2 in the retro audit table
- `checked-thing-is-not-the-changed-thing.md` — wrote to the wrong subject
- `#642` (`932371ab`) — the Rust core that honors `SWARM_DB`
