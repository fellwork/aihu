// Phase-0 spike scenarios — architecture.md §10 "Phase 0" evidence.
// (a) plain typing  (b) mid-word bold toggle  (c) composition → one transaction
// (d) uncontrolled DOM mutation → reconciler converges  (e) backspace across a
// mark boundary  (+ split/merge and selection-survives-re-render checks).

import { expect, type Page, test } from '@playwright/test'

type Runs = Array<{ text: string; mark: 'strong' | null }>

async function boot(page: Page, paragraphs: Runs[]) {
  await page.goto('/')
  await page.waitForFunction(() => Boolean((window as any).__spike))
  await page.evaluate((p) => (window as any).__spike.reset(p), paragraphs)
}

const getText = (page: Page) => page.evaluate(() => (window as any).__spike.getText())
const getDomText = (page: Page) => page.evaluate(() => (window as any).__spike.getDomText())
const getDoc = (page: Page) => page.evaluate(() => (window as any).__spike.getDoc())
const trCount = (page: Page) => page.evaluate(() => (window as any).__spike.trCount())
const trOrigins = (page: Page) => page.evaluate(() => (window as any).__spike.trOrigins())
const setCaret = (page: Page, block: number, offset: number) =>
  page.evaluate(([b, o]) => (window as any).__spike.setCaret(b, o), [block, offset] as const)
const setRange = (page: Page, block: number, from: number, to: number) =>
  page.evaluate(([b, f, t]) => (window as any).__spike.setRange(b, f, t), [
    block,
    from,
    to,
  ] as const)

test.describe('(a) plain typing', () => {
  test('typed ASCII lands in the model via beforeinput, no readback needed', async ({ page }) => {
    await boot(page, [[]])
    await setCaret(page, 0, 0)
    await page.keyboard.type('hello world')
    expect(await getText(page)).toEqual(['hello world'])
    expect(await getDomText(page)).toEqual(['hello world'])
    const origins = await trOrigins(page)
    expect(origins.length).toBe('hello world'.length)
    expect(origins.every((o: string) => o === 'user.typing')).toBe(true)
    // The event layer caught everything — the tripwire never had to fire.
    expect(origins).not.toContain('dom.readback')
  })

  test('Enter splits the block; typing continues in the new one', async ({ page }) => {
    await boot(page, [[{ text: 'hello world', mark: null }]])
    await setCaret(page, 0, 5)
    await page.keyboard.press('Enter')
    expect(await getText(page)).toEqual(['hello', ' world'])
    await page.keyboard.type('X')
    expect(await getText(page)).toEqual(['hello', 'X world'])
    expect(await getDomText(page)).toEqual(['hello', 'X world'])
  })

  test('Backspace at block start merges blocks', async ({ page }) => {
    await boot(page, [[{ text: 'aaa', mark: null }], [{ text: 'bbb', mark: null }]])
    await setCaret(page, 1, 0)
    await page.keyboard.press('Backspace')
    expect(await getText(page)).toEqual(['aaabbb'])
    expect(await getDomText(page)).toEqual(['aaabbb'])
    // Caret sits at the merge seam: typing proves it.
    await page.keyboard.type('|')
    expect(await getText(page)).toEqual(['aaa|bbb'])
  })
})

test.describe('(b) mid-word bold toggle', () => {
  test('range bold, selection survives re-render, typing inherits the mark', async ({ page }) => {
    await boot(page, [[{ text: 'hello world', mark: null }]])
    await setRange(page, 0, 6, 11)
    await page.evaluate(() => (window as any).__spike.toggleBold())
    const doc = await getDoc(page)
    expect(doc[0].runs).toEqual([
      { text: 'hello ', mark: null },
      { text: 'world', mark: 'strong' },
    ])
    // DOM structure matches (one <strong> element).
    expect(await page.locator('#editor strong').count()).toBe(1)
    expect(await page.locator('#editor strong').innerText()).toBe('world')
    // Selection survived the active block's re-render (§3.3 requirement).
    expect(await page.evaluate(() => document.getSelection()?.toString())).toBe('world')

    // Typing inside the bold run inherits the mark.
    await setCaret(page, 0, 8)
    await page.keyboard.type('X')
    const doc2 = await getDoc(page)
    expect(doc2[0].runs).toEqual([
      { text: 'hello ', mark: null },
      { text: 'woXrld', mark: 'strong' },
    ])
    expect(await getDomText(page)).toEqual(['hello woXrld'])

    // Toggling the same range again clears it (all-strong → null).
    await setRange(page, 0, 6, 12)
    await page.evaluate(() => (window as any).__spike.toggleBold())
    const doc3 = await getDoc(page)
    expect(doc3[0].runs).toEqual([{ text: 'hello woXrld', mark: null }])
  })
})

test.describe('(c) composition', () => {
  test('real IME via CDP: no transactions during composition, one on commit', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CDP Input.imeSetComposition is chromium-only')
    await boot(page, [[{ text: 'abc', mark: null }]])
    await setCaret(page, 0, 3)
    const before = await trCount(page)

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.imeSetComposition', { text: 'n', selectionStart: 1, selectionEnd: 1 })
    await cdp.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 })
    await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 })
    await cdp.send('Input.imeSetComposition', {
      text: 'にほんご',
      selectionStart: 4,
      selectionEnd: 4,
    })
    // Mid-composition: browser owns the DOM, model must not have moved.
    expect(await trCount(page)).toBe(before)
    expect(await getText(page)).toEqual(['abc'])

    await cdp.send('Input.insertText', { text: '日本語' }) // commit → compositionend
    await expect.poll(() => getText(page)).toEqual(['abc日本語'])
    expect(await getDomText(page)).toEqual(['abc日本語'])
    // Exactly ONE transaction for the entire composition.
    expect(await trCount(page)).toBe(before + 1)
    expect((await trOrigins(page)).at(-1)).toBe('user.typing')
    // Caret ended after the committed text: typing proves it.
    await page.keyboard.type('!')
    expect(await getText(page)).toEqual(['abc日本語!'])
  })

  test('synthetic composition sequence: browser-owned DOM, single compositionend diff', async ({
    page,
  }) => {
    await boot(page, [[{ text: 'abc', mark: null }]])
    await setCaret(page, 0, 3)
    const before = await trCount(page)

    // Simulate what an IME + browser do: composition events around direct DOM
    // mutation of the text node (which also exercises MutationObserver
    // suppression while composing).
    await page.evaluate(() => {
      const root = document.getElementById('editor')!
      const textNode = root.querySelector('[data-block-id]')!.firstChild as Text
      root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      const stages = ['に', 'にほ', 'にほんご']
      for (const s of stages) {
        root.dispatchEvent(
          new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertCompositionText',
            data: s,
            isComposing: true,
          }),
        )
        textNode.nodeValue = `abc${s}`
      }
    })
    // Model untouched while composing.
    expect(await trCount(page)).toBe(before)
    expect(await getText(page)).toEqual(['abc'])

    await page.evaluate(() => {
      const root = document.getElementById('editor')!
      const textNode = root.querySelector('[data-block-id]')!.firstChild as Text
      textNode.nodeValue = 'abc日本語' // final commit replaces the preedit
      root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '日本語' }))
    })
    await expect.poll(() => getText(page)).toEqual(['abc日本語'])
    expect(await getDomText(page)).toEqual(['abc日本語'])
    expect(await trCount(page)).toBe(before + 1)
  })
})

test.describe('(d) uncontrolled DOM mutation → read-back reconciliation', () => {
  test('spellcheck-style word replacement converges the model', async ({ page }) => {
    await boot(page, [[{ text: 'teh quick fox', mark: null }]])
    const before = await trCount(page)
    await page.evaluate(() => {
      const textNode = document.querySelector('#editor [data-block-id]')!.firstChild as Text
      textNode.nodeValue = 'the quick fox' // what a spellcheck replace does
    })
    await expect.poll(() => getText(page)).toEqual(['the quick fox'])
    expect(await getDomText(page)).toEqual(['the quick fox'])
    expect(await trCount(page)).toBe(before + 1)
    expect(await trOrigins(page)).toContain('dom.readback')
  })

  test('extension-style element injection is folded in as text', async ({ page }) => {
    await boot(page, [[{ text: 'hello', mark: null }]])
    await page.evaluate(() => {
      const blockEl = document.querySelector('#editor [data-block-id]')!
      const span = document.createElement('span')
      span.className = 'fake-extension-widget'
      span.textContent = '!!'
      blockEl.appendChild(span) // what a grammar/extension overlay does
    })
    await expect.poll(() => getText(page)).toEqual(['hello!!'])
    // After reconciliation the DOM is re-rendered from the model — the foreign
    // element is gone, its text is owned by us now.
    expect(await page.locator('#editor .fake-extension-widget').count()).toBe(0)
    expect(await getDomText(page)).toEqual(['hello!!'])
    expect(await trOrigins(page)).toContain('dom.readback')
  })
})

test.describe('(d2) read-back mark fidelity — KNOWN LIMITATION, pinned', () => {
  test('replacement spanning a mark boundary converges on text but LOSES the mark', async ({
    page,
  }) => {
    // Model: 't' plain + 'eh' strong. A spellcheck-style rewrite to 'the'
    // (text-only read-back) must converge the text; the strong mark on the
    // rewritten span is unavoidably lost because textContent carries no mark
    // structure. This is the documented cost of §4.2's text-level diff.
    await boot(page, [
      [
        { text: 't', mark: null },
        { text: 'eh', mark: 'strong' },
      ],
    ])
    await page.evaluate(() => {
      const blockEl = document.querySelector('#editor [data-block-id]')!
      blockEl.textContent = 'the' // wipes child structure like some correctors do
    })
    await expect.poll(() => getText(page)).toEqual(['the'])
    expect(await getDomText(page)).toEqual(['the'])
    const doc = await getDoc(page)
    // Text converged (the win). Mark on 'eh' is gone (the documented loss):
    expect(doc[0].runs).toEqual([{ text: 'the', mark: null }])
  })
})

test.describe('(e) backspace across a mark boundary', () => {
  test('deleting through strong|plain seam keeps runs normalized', async ({ page }) => {
    await boot(page, [
      [
        { text: 'ab', mark: null },
        { text: 'cd', mark: 'strong' },
      ],
    ])
    await setCaret(page, 0, 3) // between c and d
    await page.keyboard.press('Backspace') // deletes 'c' (strong side)
    let doc = await getDoc(page)
    expect(doc[0].runs).toEqual([
      { text: 'ab', mark: null },
      { text: 'd', mark: 'strong' },
    ])
    await page.keyboard.press('Backspace') // deletes 'b' — crosses the boundary
    doc = await getDoc(page)
    expect(doc[0].runs).toEqual([
      { text: 'a', mark: null },
      { text: 'd', mark: 'strong' },
    ])
    expect(await getDomText(page)).toEqual(['ad'])
    expect(await page.locator('#editor strong').innerText()).toBe('d')
    // Caret is between 'a' and 'd': typing proves it, and inherits the LEFT
    // (plain) mark per markAt().
    await page.keyboard.type('z')
    doc = await getDoc(page)
    expect(doc[0].runs).toEqual([
      { text: 'az', mark: null },
      { text: 'd', mark: 'strong' },
    ])
  })
})
