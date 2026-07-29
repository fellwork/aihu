import { beta } from '@fixture/beta'

// GUARDS #689 (stripNonCode). The next two lines are TEXT ABOUT CODE, not code.
// alpha does NOT import @fixture/gamma and its moon.yml has no `- gamma` edge,
// so if the scanner ever reads a comment as an import this tree goes RED:
//   import { gamma } from '@fixture/gamma'
const embedded = `import { gamma } from '@fixture/gamma'`

export const alpha = `alpha:${beta}:${embedded.length}`
