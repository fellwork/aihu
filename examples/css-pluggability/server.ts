/**
 * server.ts — minimal Bun.serve to view the built example.
 *
 * Run after `bun run build.ts` so dist/main.js and dist/tailwind.css exist.
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = __dirname

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

Bun.serve({
  port: 3457,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname === '/' ? '/index.html' : url.pathname
    const file = Bun.file(resolve(root, path.replace(/^\//, '')))
    if (!(await file.exists())) return new Response('not found', { status: 404 })
    const ext = path.slice(path.lastIndexOf('.'))
    return new Response(file, {
      headers: { 'Content-Type': types[ext] ?? 'application/octet-stream' },
    })
  },
})

console.log('Example running at http://localhost:3457/')
