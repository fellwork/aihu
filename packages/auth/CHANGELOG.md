# @aihu/auth

## 0.1.2

### Patch Changes

- [#241](https://github.com/fellwork/aihu/pull/241) [`ca3431c`](https://github.com/fellwork/aihu/commit/ca3431cd53fe6af284272f1c33ec845014a7baca) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Add @aihu/magna greenfield package skeleton: dep-free GraphQL fetch, resource composition over @aihu-plugin/data, JWT relay via getToken config, and a beforeCompile SDL pipeline with graceful skip when magna-gqlmin is absent.

  Add @aihu/auth size-limit row (pre-existing gap fix — v0.1.1 shipped browser code without a budget row).

## 0.1.1

### Patch Changes

- [#176](https://github.com/fellwork/aihu/pull/176) [`eacba9c`](https://github.com/fellwork/aihu/commit/eacba9c66145c1f208e108cea642e75b2d788185) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Republish without the workspace:\* leak in published dependencies. Same Bug 1
  class fixed for @aihu/cli@0.3.2, @aihu/server@0.1.2, and @aihu/agent-readiness@0.1.2
  earlier this session.

  - @aihu/agent-service@0.1.2 ships workspace:\* for @aihu/agent (broken)
  - @aihu/auth@0.1.0 ships workspace:\* for agent-service and signals (broken)

  Changesets cascade: bumping agent-service triggers patch bumps on @aihu/agent-a2a
  and @aihu/agent-acp (which depend on agent-service via workspace:\*), so their
  tarballs republish with the clean pin to the new agent-service version.

  The publish path (scripts/publish-all.sh + bun pm pack) now correctly rewrites
  workspace:\* at pack time. Previous broken versions will be deprecated on npm
  post-republish.

- Updated dependencies [[`eacba9c`](https://github.com/fellwork/aihu/commit/eacba9c66145c1f208e108cea642e75b2d788185)]:
  - @aihu/agent-service@0.1.3
