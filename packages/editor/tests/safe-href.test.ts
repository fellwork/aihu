// safeHref — one implementation of web's link-safety contract (spec §6, T2).

import { describe, expect, it } from 'vitest'
import { safeHref } from '../src/safe-href.ts'

describe('safeHref', () => {
  it('allows same-origin paths, http(s), and mailto', () => {
    expect(safeHref('/journal/1')).toBe('/journal/1')
    expect(safeHref('https://x.dev/a')).toBe('https://x.dev/a')
    expect(safeHref('http://x.dev')).toBe('http://x.dev')
    expect(safeHref('HTTPS://X.DEV')).toBe('HTTPS://X.DEV')
    expect(safeHref('mailto:a@b.dev')).toBe('mailto:a@b.dev')
    expect(safeHref('  /trimmed  ')).toBe('/trimmed')
  })

  it('drops javascript:, data:, vbscript:, protocol-relative, and everything else', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('JavaScript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,<script>x</script>')).toBeNull()
    expect(safeHref('vbscript:msgbox')).toBeNull()
    expect(safeHref('//evil.example.com/x')).toBeNull()
    expect(safeHref('ftp://x')).toBeNull()
    expect(safeHref('')).toBeNull()
  })
})
