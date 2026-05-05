// JSDOM smoke test for fellwork-passage v0.2.

import fs from 'node:fs'
import { JSDOM } from 'jsdom'

const lines = []
const log = (...a) => {
  lines.push(a.join(' '))
  console.log(a.join(' '))
}

const dom = new JSDOM(
  `<!doctype html><html><body><fellwork-passage book="Gen" chapter="1" verse-start="1" verse-end="2"></fellwork-passage></body></html>`,
  { runScripts: 'outside-only', url: 'https://example.com/', pretendToBeVisual: true },
)
const { window } = dom
globalThis.window = window
globalThis.document = window.document
globalThis.HTMLElement = window.HTMLElement
globalThis.customElements = window.customElements
globalThis.Element = window.Element
globalThis.Node = window.Node
globalThis.MutationObserver = window.MutationObserver
globalThis.getComputedStyle = window.getComputedStyle
globalThis.fetch = (...args) => fetch(...args)

try {
  const code = fs.readFileSync(
    'C:/git/fellwork/aihu/.worktrees/pitch-passage-component/examples/fellwork-passage/dist/fellwork-passage.js',
    'utf8',
  )
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  const mod = await import(dataUrl)
  log('agents-registered:', mod.getAllAgentMetadata().length)
  const meta = mod.getAllAgentMetadata()[0]
  log('state.currentPointedText:', !!meta.state.currentPointedText)
  log('state.currentEnglishText:', !!meta.state.currentEnglishText)
  log('state.currentHebrewTokens:', !!meta.state.currentHebrewTokens)
  log(
    'action.inspectToken.returns.pairedEnglish:',
    !!meta.actions.inspectToken.returns.pairedEnglish,
  )

  await new Promise((r) => setTimeout(r, 6000))

  const el = document.querySelector('fellwork-passage')
  const root = el.shadowRoot
  const verseLis = root.querySelectorAll('ol[data-region="verses"] > li')
  log('rendered-verse-li-count:', verseLis.length)

  verseLis.forEach((li) => {
    const ref = li.querySelector('[data-region="ref"]')?.textContent
    const heb = li.querySelector('[data-region="hebrew"]')
    const fallback = li.querySelector('[data-region="hebrew-fallback"]')
    const en = li.querySelector('[data-region="english"]')
    const buttons = heb?.querySelectorAll('button[data-token]') ?? []
    const fbBtns = fallback?.querySelectorAll('button[data-token]') ?? []
    log(`  ${ref}: hebrew-buttons=${buttons.length} fallback-buttons=${fbBtns.length}`)
    log(`    hebrew-text-sample="${(heb?.textContent ?? '').slice(0, 60)}"`)
    log(`    english-data-verse="${en?.getAttribute('data-verse-english')}"`)
    log(`    english-text="${(en?.textContent ?? '').slice(0, 80)}"`)
    const text = heb?.textContent ?? ''
    const hasNiqqud = /[֑-ׇ]/.test(text)
    log(`    has-niqqud=${hasNiqqud}`)
  })

  const firstBtn = root.querySelector('button[data-token]')
  if (firstBtn) {
    log('first-token:', firstBtn.getAttribute('data-token'))
    firstBtn.click()
    await new Promise((r) => setTimeout(r, 50))
    const paired = root.querySelectorAll('.is-paired-active')
    log('after-first-tap-paired-count:', paired.length)
    paired.forEach((p) => log('  paired-on:', p.getAttribute('data-verse-english')))

    const result = el.inspectToken(firstBtn.getAttribute('data-token'))
    log('inspectToken-result-keys:', Object.keys(result).join(','))
    log('inspectToken-pairedEnglish:', (result.pairedEnglish ?? '').slice(0, 80))

    const v2Btn = Array.from(root.querySelectorAll('button[data-token]')).find((b) =>
      b.getAttribute('data-token').startsWith('Gen 1:2:'),
    )
    if (v2Btn) {
      v2Btn.click()
      await new Promise((r) => setTimeout(r, 50))
      const paired2 = root.querySelectorAll('.is-paired-active')
      log('after-v2-tap-paired-count:', paired2.length)
      paired2.forEach((p) => log('  paired-on:', p.getAttribute('data-verse-english')))
    } else {
      log('NO-v2-button-found')
    }
  } else {
    log('NO-button-found')
  }
} catch (e) {
  log('ERROR:', e.stack || e.message)
}

fs.writeFileSync('C:/git/fellwork/aihu/fwp-smoke-out.txt', lines.join('\n') + '\n')
process.exit(0)
