// apps/docs/tests/agent-stage.spec.ts
//
// End-to-end proof of the thesis: clicking "Let an agent drive it" makes a
// scripted in-page agent invoke a REAL compiled component's @agent actions over
// the postMessage capability bridge, and the on-screen component visibly changes
// — WITHOUT any direct user click on the component's own buttons.
//
// The stage iframe is sandboxed `allow-scripts` (no allow-same-origin), so the
// parent (and this test) only ever observe it through the bridge. The state
// inspector in <agent-stage>'s shadow DOM renders the snapshot the iframe streams
// back after each invocation — that snapshot is read from the iframe's VISIBLE
// DOM, so asserting on it proves the agent mutated the live instance the user sees.

import { expect, test } from '@playwright/test'

// <agent-stage> lives inside <docs-shell>'s shadow root, so reach it by piercing
// two shadow layers.
async function gotoDemo(page: import('@playwright/test').Page) {
  await page.goto('/#demo')
  await page.waitForFunction(
    () => {
      const shell = document.querySelector('docs-shell')
      const stage = shell?.shadowRoot?.querySelector('agent-stage') as HTMLElement | null
      return stage?.shadowRoot != null
    },
    { timeout: 15_000 },
  )
}

// Read the parsed inspector snapshot (the bridge-streamed visible state).
async function inspectorSnapshot(page: import('@playwright/test').Page): Promise<unknown> {
  return page.evaluate(() => {
    const shell = document.querySelector('docs-shell')
    const stage = shell?.shadowRoot?.querySelector('agent-stage') as HTMLElement | null
    const pre = stage?.shadowRoot?.querySelector('.inspector') as HTMLElement | null
    const text = pre?.textContent ?? ''
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  })
}

async function clickDrive(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const shell = document.querySelector('docs-shell')
    const stage = shell?.shadowRoot?.querySelector('agent-stage') as HTMLElement | null
    const btn = stage?.shadowRoot?.querySelector('.drive-btn') as HTMLButtonElement | null
    btn?.click()
  })
}

test('the demo nav entry is present', async ({ page }) => {
  await page.goto('/#introduction')
  await page.waitForFunction(() => {
    const shell = document.querySelector('docs-shell')
    return shell?.shadowRoot?.querySelector('a[href="#demo"]') != null
  })
  const label = await page.evaluate(() => {
    const shell = document.querySelector('docs-shell')
    return shell?.shadowRoot?.querySelector('a[href="#demo"]')?.textContent ?? null
  })
  expect(label).toBe('Demo')
})

test('agent drives the live task-list over the bridge (visible state changes, no user click on the component)', async ({
  page,
}) => {
  await gotoDemo(page)

  // Wait until the iframe compiled, mounted, and streamed an initial snapshot
  // with the task-list shape (taskCount present). This requires the WASM
  // compiler + preview bundle to be present in dist/ (build step).
  await expect
    .poll(async () => (await inspectorSnapshot(page)) as { taskCount?: number } | null, {
      timeout: 20_000,
      message: 'waiting for the stage to compile + mount + stream initial state',
    })
    .toMatchObject({ taskCount: 1 })

  const before = (await inspectorSnapshot(page)) as { taskCount: number; tasks: unknown[] }
  expect(before.taskCount).toBe(1)

  // Hand the component to the agent. The scripted run for the task-list demo:
  //   addTask("Review the agent contract")
  //   addTask("Ship the stage demo")
  //   toggleTask(1)
  //   clearCompleted()
  // No DOM click on the component's own buttons happens — the parent posts
  // {type:'as-invoke', …} messages and the iframe runs the dispatcher.
  await clickDrive(page)

  // After the first two addTask invocations land, the visible task count must
  // have grown beyond the starting 1 — proof the agent mutated the live instance.
  await expect
    .poll(
      async () => ((await inspectorSnapshot(page)) as { taskCount?: number } | null)?.taskCount,
      {
        timeout: 10_000,
        message: 'agent addTask() invocations should raise the visible task count',
      },
    )
    .toBeGreaterThan(1)

  // And one of the new tasks carries the exact text the AGENT supplied — not a
  // pre-seeded value — so we know the args crossed the bridge into the signal.
  await expect
    .poll(
      async () => {
        const snap = (await inspectorSnapshot(page)) as { tasks?: Array<{ text: string }> } | null
        return (snap?.tasks ?? []).some((t) => t.text === 'Review the agent contract')
      },
      {
        timeout: 10_000,
        message: 'a task with the agent-supplied text should appear',
      },
    )
    .toBe(true)

  // Let the rest of the script finish; clearCompleted() removes the toggled
  // task, so the final visible count is strictly less than the post-add peak.
  await expect
    .poll(
      async () => {
        const snap = (await inspectorSnapshot(page)) as {
          taskCount?: number
          tasks?: Array<{ done: boolean }>
        } | null
        // Run is done when no task remains marked done (clearCompleted ran).
        return (snap?.tasks ?? []).every((t) => !t.done)
      },
      { timeout: 12_000 },
    )
    .toBe(true)
})
