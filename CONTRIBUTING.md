# Contributing to aihu

> Aihu — agentic discovery and interaction, for human purpose.

## Quickstart

1. Fork + clone
2. `bun install`
3. Make changes; commit with conventional-commit format (`feat(scope): subject`)
4. If your PR changes a published `@aihu/*` package, add a changeset: `bun changeset`
5. Open PR

## Standards

- **Conventional commits** enforced by `commitlint` via Husky `commit-msg` hook
- **Biome** for formatting (`bun run check`)
- **Vitest** for tests (`bun run test`)
- **Spec-first** — changes to runtime behavior need a corresponding spec entry under `docs/superpowers/specs/`
- **Dep-free** — `@aihu/*` packages have zero non-`@aihu/*` runtime deps

## Release process

See [docs/RELEASING.md](./docs/RELEASING.md).

## License

MIT
