---
'@aihu/magna': patch
---

Close the prototype-pollution hole in `setBuildFlag()`.

`setBuildFlag(outputDir, key, value)` splits `key` on `.` and walks the segments
into `build-flags.json`, creating objects along the way. `key` is a parameter of
an exported function on a published package. Every caller in this repo passes
the literal `'magna.untyped'`, but the contract takes an arbitrary string — and
`setBuildFlag(dir, '__proto__.polluted', v)` walked `cursor.__proto__` straight
onto `Object.prototype` and assigned there. Verified: `({}).polluted` came back
`'PWNED'` process-wide, for the rest of the build, for every object in it
(CodeQL `js/prototype-pollution-utility`).

The guard is now an inline `===` check on each segment as the walk reaches it,
rather than an up-front `segments.some(set.has(...))` — same rejection, but it
sits directly on the control flow that performs the assignment.

Fixes a second, quieter bug in the same walk. `typeof cursor[seg]` reads
INHERITED properties, so if anything else in the process had already polluted
`Object.prototype.magna`, the old code found a truthy object there, declined to
create an own `magna` key, and merged the flag onto the shared prototype object
instead — `build-flags.json` was written as `{}` and the untyped flag silently
never arrived. The descent now uses `Object.hasOwn`, so it stays on own
properties.

Also drops a duplicated path recomputation at the end of the function; the
already-computed `filePath` is the same value.
