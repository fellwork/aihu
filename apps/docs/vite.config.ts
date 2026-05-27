import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'
import { defineConfig } from 'vite'
import { aihuCompilerPlugin } from '../../packages/compiler/js/index.ts'

const __dir = fileURLToPath(new URL('.', import.meta.url))
const contentDocsDir = resolve(__dir, 'src/content/docs')

/**
 * Inline Vite plugin: transforms *.md files under src/content/docs/**
 * into ES modules exporting { html, title, slug }.
 */
const mdLoaderPlugin = {
  name: 'aihu-md-loader',
  transform(code: string, id: string) {
    if (!id.endsWith('.md') || !id.startsWith(contentDocsDir)) return null
    const slug = relative(contentDocsDir, id).replace(/\.md$/, '').replace(/\\/g, '/')
    const titleMatch = code.match(/^#\s+(.+)$/m)
    const title = titleMatch ? titleMatch[1].trim() : slug
    const html = marked.parse(code, { gfm: true, breaks: false }) as string
    const escaped = JSON.stringify(html)
    const titleEscaped = JSON.stringify(title)
    const slugEscaped = JSON.stringify(slug)
    return {
      code: `export const html = ${escaped};\nexport const title = ${titleEscaped};\nexport const slug = ${slugEscaped};\n`,
      map: null,
    }
  },
}

export default defineConfig({
  plugins: [mdLoaderPlugin, aihuCompilerPlugin() as import('vite').Plugin],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
