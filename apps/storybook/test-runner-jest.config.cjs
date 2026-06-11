const path = require('node:path')
const { getJestConfig } = require('@storybook/test-runner')

// Storybook test-runner Jest config (Plan 6).
//
// Jest's `roots` default to the monorepo rootDir, so its obsolete-snapshot scan
// walks the entire tree and discovers the hundreds of Rust `insta` snapshot
// fixtures under the packages' and crates' tests/snapshots directories. With
// zero Jest snapshots of our own, that surfaces as "N snapshot files obsolete"
// and a non-zero exit — failing CI even when every story passes.
//
// Scope `roots` to the two co-located story trees. They contain every
// `*.stories.ts` the runner matches but NO snapshot files, so test discovery is
// unchanged while the obsolete-snapshot scan sees nothing to flag.
const REPO = path.resolve(__dirname, '..', '..')

module.exports = {
  ...getJestConfig(),
  roots: [path.join(REPO, 'packages', 'primitives', 'src'), path.join(REPO, 'packages', 'ui', 'registry')],
}
