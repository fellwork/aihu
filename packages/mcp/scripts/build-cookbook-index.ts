/**
 * Build-time script: scans cookbook/*.aihu, parses @cookbook frontmatter,
 * and writes packages/mcp/src/cookbook-index.json.
 *
 * Usage: bun scripts/build-cookbook-index.ts
 * (called automatically by `bun run build` in packages/mcp)
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Resolve paths
const repoRoot = resolve(__dirname, '../../../')
const cookbookDir = join(repoRoot, 'cookbook')
const outputPath = join(__dirname, '../src/cookbook-index.json')

interface CookbookEntry {
  filename: string
  description: string
  tags: string[]
  source: string
}

/**
 * Parse the <!-- @cookbook ... --> frontmatter block from a .aihu file.
 * Returns null if no valid frontmatter block is found.
 */
function parseFrontmatter(source: string): { description: string; tags: string[] } | null {
  const match = /<!--\s*@cookbook\s*([\s\S]*?)-->/.exec(source)
  if (!match || !match[1]) return null

  const block = match[1]
  let description = ''
  const tags: string[] = []

  for (const line of block.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('description:')) {
      description = trimmed.slice('description:'.length).trim()
    } else if (trimmed.startsWith('tags:')) {
      const tagStr = trimmed.slice('tags:'.length).trim()
      tags.push(
        ...tagStr
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      )
    }
  }

  if (!description) return null
  return { description, tags }
}

// Scan cookbook directory
const entries: CookbookEntry[] = []

let files: string[]
try {
  files = readdirSync(cookbookDir).filter((f) => f.endsWith('.aihu'))
} catch {
  console.error(`[build-cookbook-index] Could not read cookbook dir: ${cookbookDir}`)
  process.exit(1)
}

for (const filename of files.sort()) {
  const filePath = join(cookbookDir, filename)
  const source = readFileSync(filePath, 'utf-8')
  const meta = parseFrontmatter(source)

  if (!meta) {
    console.warn(`[build-cookbook-index] Skipping ${filename}: no @cookbook frontmatter`)
    continue
  }

  entries.push({
    filename,
    description: meta.description,
    tags: meta.tags,
    source,
  })
}

writeFileSync(outputPath, JSON.stringify(entries, null, 2) + '\n', 'utf-8')
console.log(
  `[build-cookbook-index] Wrote ${entries.length} entries to ${basename(outputPath)}`,
)
