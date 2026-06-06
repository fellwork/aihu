import { createApp } from '@aihu/app/client'

// `createApp` returns a handle; `setLayout` swaps the layout of the CURRENT
// route without navigating (resets on the next navigation). This is the same
// entry point an `@agent` action would call — e.g. `setLayout("compact")`.
const app = createApp()

const on = (id: string, name: string | null): void => {
  document.getElementById(id)?.addEventListener('click', () => {
    void app.setLayout(name)
  })
}

on('to-app', 'app')
on('to-compact', 'compact')
on('to-none', null)
