import { defineAihuConfig } from '@aihu/server'
import { demo } from '@aihu/plugin-demo'

export default defineAihuConfig({
  plugins: [demo()],
})
