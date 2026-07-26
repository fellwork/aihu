---
'create-aihu': patch
---

Fix `pnpm create aihu` and `yarn create aihu` failing on every template.

`bin.mjs` resolved the delegate with `createRequire(import.meta.url).resolve('@aihu/cli')`
— a CJS resolution against a package whose exports map declares only `types`
and `import`. With no `require` condition, Node's CJS resolver cannot satisfy
it:

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined in
  .../create-aihu@0.1.6/node_modules/@aihu/cli/package.json
```

Every pnpm and yarn scaffold hit this, including `--template minimal`. npm and
bun happened to mask it through hoisting rather than avoid it.

Switched to `import.meta.resolve()`, which honours the `import` condition. The
file was already ESM and already used `import.meta.url`, so the native resolver
was available the whole time.

Verified minimally against a synthetic ESM-only exports map:
`require.resolve()` exits 1 with ERR_PACKAGE_PATH_NOT_EXPORTED;
`import.meta.resolve()` exits 0 and runs the delegate.
