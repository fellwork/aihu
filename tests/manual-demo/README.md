# Manual Demo / Lighthouse Fixture

This directory is **not a user-facing example**. It's a manual QA fixture
used internally for Lighthouse / compliance testing of the aihu SSR
runtime. It exercises the @aihu/server + @aihu/router + @aihu/data
integration end-to-end.

## What this is for

- Manual smoke testing during release cycles
- Lighthouse / compliance audits (`bun run test:quality`)
- Reproducing SSR-specific bugs in a controlled small app

## What this is NOT

- An onboarding example (see `docs/site/getting-started.md` instead)
- A reference for plugin authoring (see `docs/site/authoring-plugins.md`)
- A scaffolder template (see `npx aihu app` from `@aihu/cli`)

## Running

```bash
cd tests/manual-demo
bun install
bun server.ts
```

Then run Lighthouse against the local URL (http://localhost:3456/).

## Out of scope

If you're looking for canonical aihu v1 examples or DX walkthroughs,
read `docs/site/` instead. This fixture exists for internal QA only.
