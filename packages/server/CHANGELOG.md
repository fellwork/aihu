# @aihu/server

## 0.1.2

### Patch Changes

- [#172](https://github.com/fellwork/aihu/pull/172) [`ac63d4b`](https://github.com/fellwork/aihu/commit/ac63d4b9a2a5296de8a20b80049e2c5bbc493880) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix critical packaging bug: @aihu/server@0.1.1 shipped with optionalDependencies pinning native subpackages at 0.1.1, but those versions were never published (only 0.1.0 exists). This made @aihu/server unusable on every platform.

  Republishes all 6 server packages in lockstep at 0.1.2:

  - @aihu/server: 0.1.2 with native pinned at 0.1.2 (coherent)
  - @aihu/server-{darwin-arm64,darwin-x64,linux-x64-gnu,win32-x64-msvc}: 0.1.2 (first publish at this version)
  - @aihu/agent-readiness: 0.1.2 with @aihu/server@0.1.2 pin (was pinning broken 0.1.0)

  Reported by a downstream consumer. Bug surface includes the original workspace:\* leak in @aihu/server@0.1.0 (immutable; will be deprecated separately) and the broken transitive chain through @aihu/agent-readiness@0.1.1.
