#!/usr/bin/env bun
/**
 * Survivor probe (first-render DOM adoption) — measurement harness, not a CI
 * gate. Answers: how much of the server-rendered DOM does the client KEEP on
 * first load, instead of throwing away and rebuilding?
 *
 * Method: delay EVERY script chunk (not just the entry — modulepreloaded
 * chunks let hydration finish before DOMContentLoaded, which would tag DOM
 * that was already hydrated and trivially report 100% survival), tag every
 * element under #outlet with `data-pre` once parsing ends, release the
 * scripts, then count how many elements still carry the tag.
 *
 * Usage:
 *   (PORT=8788 DIST_DIR=apps/docs/dist bun scripts/serve-dist.ts &)
 *   bun scripts/probe-adoption.ts [url]     # default http://localhost:8788/guides/getting-started
 *
 * NOTE: verify the server you probe is serving YOUR build (e.g. curl the page
 * and grep for a string only your build emits) — a stale server on the same
 * port produces plausible-looking numbers for someone else's dist.
 */
import { chromium } from '@playwright/test'

const url = process.argv[2] ?? 'http://localhost:8788/guides/getting-started'

const browser = await chromium.launch()
const page = await browser.newPage()

const consoleErrors: string[] = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push(String(err)))

await page.route('**/*.js', async (route) => {
  await new Promise((r) => setTimeout(r, 1500))
  await route.continue()
})

await page.goto(url, { waitUntil: 'commit' })
await page.waitForSelector('#outlet *', { state: 'attached' })
await page.waitForFunction(() => document.readyState !== 'loading')

const pre = await page.evaluate(() => {
  const els = document.querySelectorAll('#outlet *')
  for (const el of els) el.setAttribute('data-pre', '')
  return els.length
})

await page.waitForLoadState('networkidle')
// Give onMount/rAF-commit work a beat to settle.
await page.waitForTimeout(800)

const after = await page.evaluate(() => {
  const outlet = document.getElementById('outlet')
  if (!outlet) return null
  // Duplication canary: texts of headings/links that appear more than they
  // should are the classic silent hydration-duplication symptom.
  const texts = new Map<string, number>()
  for (const a of outlet.querySelectorAll('a, h1, h2, h3')) {
    const t = (a.textContent ?? '').trim()
    if (t) texts.set(t, (texts.get(t) ?? 0) + 1)
  }
  return {
    total: outlet.querySelectorAll('*').length,
    survivors: outlet.querySelectorAll('[data-pre]').length,
    duplicatedTexts: [...texts.entries()].filter(([, n]) => n > 1).slice(0, 8),
  }
})

console.log(
  JSON.stringify(
    { url, prerendered: pre, ...after, consoleErrors: consoleErrors.slice(0, 10) },
    null,
    2,
  ),
)

await browser.close()
