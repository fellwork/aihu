import { defineConfig } from '@aihu/app'
import { cloudflare } from '@aihu/adapter-cloudflare'

export default defineConfig({
  adapter: cloudflare({ name: 'cf-adapter-demo', mode: 'workers' }),
})
