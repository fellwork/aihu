---
"@aihu/app": patch
---

Republish so peerDependencies pin `@aihu/router@0.1.2` (clean) instead of the
stale `0.1.1` that the previous build emitted. Root cause: `bun pm pack`
resolves `workspace:*` peer-dep ranges from `bun.lock`, not from the local
workspace `package.json`. The Release-PR flow updates package versions but
not the lockfile, so pack saw stale resolutions. Fixed in
`scripts/publish-all.sh` by refreshing the lock before packing.
