// Tiny test server for the e2e harness. `bun e2e/serve.ts [port]`.
// Bundles harness.ts (which imports ../src) fresh per request.

const port = Number(process.argv[2] ?? 4188)
const dir = new URL('.', import.meta.url).pathname

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/harness.js') {
      const build = await Bun.build({ entrypoints: [`${dir}harness.ts`], target: 'browser' })
      if (!build.success) {
        console.error(build.logs)
        return new Response(`console.error(${JSON.stringify(String(build.logs))})`, {
          headers: { 'content-type': 'text/javascript' },
        })
      }
      const first = build.outputs[0]
      if (!first)
        return new Response('// no output', { headers: { 'content-type': 'text/javascript' } })
      return new Response(await first.text(), {
        headers: { 'content-type': 'text/javascript' },
      })
    }
    return new Response(await Bun.file(`${dir}index.html`).text(), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  },
})

console.log(`editor e2e harness on http://localhost:${port}`)
