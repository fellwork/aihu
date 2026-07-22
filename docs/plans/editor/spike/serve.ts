// Tiny dev/test server for the spike harness. `bun serve.ts [port]`.
// Bundles src/main.ts on demand (fresh per request — it's a spike).

const port = Number(process.argv[2] ?? 4173)
const dir = new URL('.', import.meta.url).pathname

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/main.js') {
      const build = await Bun.build({ entrypoints: [`${dir}src/main.ts`], target: 'browser' })
      if (!build.success) {
        console.error(build.logs)
        return new Response(`console.error(${JSON.stringify(String(build.logs))})`, {
          headers: { 'content-type': 'text/javascript' },
        })
      }
      return new Response(await build.outputs[0].text(), {
        headers: { 'content-type': 'text/javascript' },
      })
    }
    return new Response(await Bun.file(`${dir}index.html`).text(), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  },
})

console.log(`spike harness on http://localhost:${port}`)
