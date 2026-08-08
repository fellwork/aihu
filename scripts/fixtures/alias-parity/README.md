# alias-parity fixtures

Red/green negative-fixture trees for `scripts/check-alias-parity.ts`, registered
in `NEGATIVE_FIXTURES` in `scripts/check-gate-wiring.ts` and reached via
`ALIAS_PARITY_ROOT`.

The two trees are byte-identical except for ONE thing: in `should-flag`, the
fixture `vitest.config.ts` aliases `@fx/beta` to `packages/beta/dist/index.d.ts`
while `packages/alpha/tsconfig.json` maps it to `packages/beta/src/index.ts` —
the src-vs-dist split this gate exists to catch. In `should-not-flag` both point
at `src`. Same keys, same ordering, same files, same everything else, so a red
run is the detector firing on the property under test rather than on a malformed
tree.

The trees are deliberately self-contained (`@fx/*`, not `@aihu/*`) and fully
two-sided: the real `ONE_SIDED` allowlist names real repo packages, so it is not
applied in fixture mode (see the `ALIAS_PARITY_ROOT` branch in `main()`); the
allowlist logic is covered by the script's in-process `selfTest()`, which runs
on every invocation including these.

`scripts/check-alias-parity.ts` skips `scripts/fixtures/**` when scanning the
real repo, so these tsconfigs never leak into the live run.
