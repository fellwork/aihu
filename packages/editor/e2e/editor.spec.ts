// @aihu/editor real-browser acceptance (spec §10): A1 typing shape, A2
// input-rule undo, A3 coalescing, A5 paste, A7 agent tiers against the live
// view, A9 IME (+ A3-amended astral case), plus the A2-amendment d3 flip and
// selection-survives-re-render from the Phase-0 matrix.

import { expect, type Page, test } from '@playwright/test'

// biome-ignore lint/suspicious/noExplicitAny: harness window surface
const h =
  (page: Page) =>
  (fn: string, ...args: unknown[]) =>
    page.evaluate(([f, a]) => (window as any).__editor[f as string](...(a as unknown[])), [
      fn,
      args,
    ] as const)

async function boot(page: Page, markdown?: string): Promise<ReturnType<typeof h>> {
  await page.goto('/')
  await page.waitForFunction(() => Boolean((window as unknown as { __editor?: unknown }).__editor))
  const call = h(page)
  await call('reset', markdown ?? '')
  return call
}

test.describe('A1 — heading rule, Enter, typing', () => {
  test('type `# Hello` + Enter + `world` produces the exact doc and markdown', async ({ page }) => {
    const call = await boot(page)
    await call('setCaret', 0, 0)
    await page.keyboard.type('# Hello')
    await page.keyboard.press('Enter')
    await page.keyboard.type('world')
    const json = (await call('getJSON')) as {
      children: { type: string; attrs?: { level: number }; content?: { text: string }[] }[]
    }
    expect(json.children).toHaveLength(2)
    expect(json.children[0]?.type).toBe('heading')
    expect(json.children[0]?.attrs?.level).toBe(1)
    expect(json.children[0]?.content?.[0]?.text).toBe('Hello')
    expect(json.children[1]?.type).toBe('paragraph')
    expect(json.children[1]?.content?.[0]?.text).toBe('world')
    expect(await call('getMarkdown')).toBe('# Hello\n\nworld')
  })
})

test.describe('A2 — inline input rule + literal undo', () => {
  test('`**bold**` marks and deletes delimiters; one undo restores the literal text', async ({
    page,
  }) => {
    const call = await boot(page)
    await call('setCaret', 0, 0)
    await page.keyboard.type('**bold**')
    let json = (await call('getJSON')) as {
      children: { content: { text: string; mark: { type: string } | null }[] }[]
    }
    expect(json.children[0]?.content).toEqual([{ text: 'bold', mark: { type: 'strong' } }])
    await page.keyboard.press('ControlOrMeta+z')
    json = (await call('getJSON')) as never
    expect(json.children[0]?.content).toEqual([{ text: '**bold**', mark: null }])
  })
})

test.describe('A3 — typing coalescing', () => {
  test('12 chars, one undo ⇒ empty paragraph; >1s pause ⇒ two undo steps', async ({ page }) => {
    const call = await boot(page)
    await call('setCaret', 0, 0)
    await page.keyboard.type('hello world!')
    await page.keyboard.press('ControlOrMeta+z')
    let json = (await call('getJSON')) as { children: { content: unknown[] }[] }
    expect(json.children[0]?.content).toEqual([])

    await call('reset', '')
    await call('setCaret', 0, 0)
    await page.keyboard.type('ab')
    await page.waitForTimeout(1200)
    await page.keyboard.type('cd')
    await page.keyboard.press('ControlOrMeta+z')
    json = (await call('getJSON')) as never
    expect((json.children[0]?.content as { text: string }[])[0]?.text).toBe('ab')
    await page.keyboard.press('ControlOrMeta+z')
    json = (await call('getJSON')) as never
    expect(json.children[0]?.content).toEqual([])
  })
})

test.describe('A5 — paste sanitization in a live browser', () => {
  test('hostile HTML paste yields only the text; no script ever attaches', async ({ page }) => {
    const call = await boot(page)
    await call('setCaret', 0, 0)
    await page.evaluate(() => {
      const w = window as unknown as { __scripts: number }
      w.__scripts = 0
      new MutationObserver((records) => {
        for (const r of records) {
          for (const n of r.addedNodes) {
            if ((n as Element).tagName === 'SCRIPT') w.__scripts++
          }
        }
      }).observe(document, { subtree: true, childList: true })
    })
    await page.evaluate(() => {
      const dt = new DataTransfer()
      dt.setData(
        'text/html',
        '<script>alert(1)</script><p onclick=x>hi <a href="javascript:alert(1)">l</a></p>',
      )
      const surface = document.getElementById('surface') as HTMLElement
      // Firefox's ClipboardEvent constructor ignores `clipboardData` in the
      // init dict — attach it as an own property instead (works everywhere).
      const ev = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(ev, 'clipboardData', { value: dt })
      surface.dispatchEvent(ev)
    })
    const json = (await call('getJSON')) as {
      children: { content: { text: string; mark: unknown }[] }[]
    }
    expect(json.children[0]?.content).toEqual([{ text: 'hi l', mark: null }])
    expect(await page.evaluate(() => (window as unknown as { __scripts: number }).__scripts)).toBe(
      0,
    )
  })
})

test.describe('A7 — agent tiers against the live editor', () => {
  const node = { id: 'x', type: 'paragraph', content: [{ text: 'from-agent', mark: null }] }

  test('write mutates; read denies; suggest stages until accept; Ctrl-Z reverts (G2)', async ({
    page,
  }) => {
    const call = await boot(page, 'human text')
    await call('setAccess', 'write')
    expect(
      ((await call('agentCall', 'insertBlock', { after: null, node })) as { ok: boolean }).ok,
    ).toBe(true)
    let json = (await call('getJSON')) as { children: unknown[] }
    expect(json.children).toHaveLength(2)
    // the agent edit rendered into the live DOM
    expect(await page.locator('#surface p').first().textContent()).toBe('from-agent')

    await call('reset', 'human text')
    await call('setAccess', 'read')
    const denied = (await call('agentCall', 'insertBlock', { after: null, node })) as {
      ok: boolean
      code: string
    }
    expect(denied).toEqual({ ok: false, code: 'access_denied' })
    json = (await call('getJSON')) as never
    expect(json.children).toHaveLength(1)

    await call('reset', 'human text')
    await call('setAccess', 'suggest')
    const staged = (await call('agentCall', 'insertBlock', { after: null, node })) as {
      ok: boolean
      proposalId: string
    }
    expect(staged.ok).toBe(true)
    json = (await call('getJSON')) as never
    expect(json.children).toHaveLength(1) // unchanged until accept
    await call('acceptProposal', staged.proposalId)
    json = (await call('getJSON')) as never
    expect(json.children).toHaveLength(2)
    // human Ctrl-Z after accept reverts the agent transaction
    await page.locator('#surface').click()
    await page.keyboard.press('ControlOrMeta+z')
    json = (await call('getJSON')) as never
    expect(json.children).toHaveLength(1)
  })
})

test.describe('A9 — IME composition (amended per Phase-0 A1/A3)', () => {
  test('real Chromium IME: zero trs during preedit, exactly one on commit, typing-attributed', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CDP Input.imeSetComposition is chromium-only')
    const call = await boot(page, 'abc')
    await call('setCaret', 0, 3)
    const before = (await call('trCount')) as number
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.imeSetComposition', { text: 'n', selectionStart: 1, selectionEnd: 1 })
    await cdp.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 })
    await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 })
    await cdp.send('Input.imeSetComposition', {
      text: '日本語',
      selectionStart: 3,
      selectionEnd: 3,
    })
    expect((await call('trCount')) as number).toBe(before) // browser owns the DOM
    await cdp.send('Input.insertText', { text: '日本語' })
    await page.waitForTimeout(120) // rAF read-back
    expect((await call('trCount')) as number).toBe(before + 1) // exactly one
    const origins = (await call('trOrigins')) as string[]
    expect(origins[origins.length - 1]).toBe('user.typing') // A1: not dom.readback
    const json = (await call('getJSON')) as { children: { content: { text: string }[] }[] }
    expect(json.children[0]?.content[0]?.text).toBe('abc日本語')
    // caret usable immediately: keep typing
    await page.keyboard.type('!')
    expect(
      ((await call('getJSON')) as never as { children: { content: { text: string }[] }[] })
        .children[0]?.content[0]?.text,
    ).toBe('abc日本語!')
  })

  test('synthetic composition converges on every engine', async ({ page }) => {
    const call = await boot(page, 'ab')
    await call('setCaret', 0, 2)
    const before = (await call('trCount')) as number
    await page.evaluate(() => {
      const surface = document.getElementById('surface') as HTMLElement
      const block = surface.querySelector('[data-block-id]') as HTMLElement
      surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      const text = block.firstChild as Text
      text.nodeValue = 'abに'
      text.nodeValue = 'ab日本'
      text.nodeValue = 'ab日本語'
      surface.dispatchEvent(
        new CompositionEvent('compositionend', { bubbles: true, data: '日本語' }),
      )
    })
    await page.waitForTimeout(120)
    expect((await call('trCount')) as number).toBe(before + 1)
    const json = (await call('getJSON')) as { children: { content: { text: string }[] }[] }
    expect(json.children[0]?.content[0]?.text).toBe('ab日本語')
  })

  test('astral-plane insert (A3): emoji lands at UTF-16 offsets without splitting pairs', async ({
    page,
  }) => {
    const call = await boot(page, 'ab')
    await call('setCaret', 0, 1)
    await page.keyboard.type('😀')
    const json = (await call('getJSON')) as { children: { content: { text: string }[] }[] }
    expect(json.children[0]?.content[0]?.text).toBe('a😀b')
    // backspace removes the WHOLE emoji (two units), not half a pair
    await call('setCaret', 0, 3)
    await page.keyboard.press('Backspace')
    expect(
      ((await call('getJSON')) as never as { children: { content: { text: string }[] }[] })
        .children[0]?.content[0]?.text,
    ).toBe('ab')
  })
})

test.describe('A2 amendment — structure-aware read-back (spike d3 flip)', () => {
  test('spellcheck-style rewrite inside a strong element keeps the mark', async ({ page }) => {
    const call = await boot(page, 't**eh**')
    await page.evaluate(() => {
      const strong = document.querySelector('#surface strong') as HTMLElement
      ;(strong.firstChild as Text).nodeValue = 'he'
    })
    await page.waitForTimeout(60)
    const json = (await call('getJSON')) as {
      children: { content: { text: string; mark: { type: string } | null }[] }[]
    }
    expect(json.children[0]?.content).toEqual([
      { text: 't', mark: null },
      { text: 'he', mark: { type: 'strong' } },
    ])
    const origins = (await call('trOrigins')) as string[]
    expect(origins[origins.length - 1]).toBe('dom.readback')
  })
})

test.describe('selection + commands in a live browser', () => {
  test('mid-word bold toggle survives the block re-render; typing lands correctly', async ({
    page,
  }) => {
    const call = await boot(page, 'hello world')
    await call('setRange', 0, 6, 11)
    await call('exec', { type: 'toggleMark', mark: 'strong' })
    const json = (await call('getJSON')) as {
      children: { content: { text: string; mark: { type: string } | null }[] }[]
    }
    expect(json.children[0]?.content).toEqual([
      { text: 'hello ', mark: null },
      { text: 'world', mark: { type: 'strong' } },
    ])
    // selection survived: the DOM selection still covers 'world'
    expect(await page.evaluate(() => document.getSelection()?.toString())).toBe('world')
  })

  test('Enter mid-block splits; Backspace at start merges back', async ({ page }) => {
    const call = await boot(page, 'aabb')
    await call('setCaret', 0, 2)
    await page.keyboard.press('Enter')
    let json = (await call('getJSON')) as { children: unknown[] }
    expect(json.children).toHaveLength(2)
    await page.keyboard.press('Backspace')
    json = (await call('getJSON')) as never
    expect(json.children).toHaveLength(1)
    const runs = (json.children[0] as { content: { text: string }[] }).content
    expect(runs[0]?.text).toBe('aabb')
  })

  test('list flow: `- ` wraps, Enter continues items, Enter on empty item exits', async ({
    page,
  }) => {
    const call = await boot(page)
    await call('setCaret', 0, 0)
    await page.keyboard.type('- one')
    await page.keyboard.press('Enter')
    await page.keyboard.type('two')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter') // empty item exits the list
    await page.keyboard.type('after')
    const json = (await call('getJSON')) as {
      children: { type: string; children?: { content: { text: string }[] }[] }[]
    }
    expect(json.children.map((b) => b.type)).toEqual(['list', 'paragraph'])
    expect(json.children[0]?.children?.map((i) => i.content[0]?.text)).toEqual(['one', 'two'])
  })
})
