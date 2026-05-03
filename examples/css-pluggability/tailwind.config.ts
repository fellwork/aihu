import type { Config } from 'tailwindcss'

/**
 * Tailwind CLI configuration.
 *
 * `content` includes the .scribe sources so Tailwind's utility extractor
 * can scan them for class names. The default JIT regex tokenizes class
 * attribute values regardless of file extension — `.scribe` is treated as
 * a generic source file.
 *
 * The `index.html` is also scanned so utility classes used directly in
 * the host page (the bg-slate-100, max-w-2xl wrappers) are emitted.
 */
const config: Config = {
  content: ['./src/components/*.scribe', './index.html'],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default config
