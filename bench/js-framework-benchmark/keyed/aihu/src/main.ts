/**
 * aihu — js-framework-benchmark keyed implementation.
 *
 * Hand-rolled against the runtime primitives (`@aihu/signals` + `@aihu/arbor`).
 * No SFC, no compiler — this is the floor of what the framework costs at runtime.
 *
 * Operations (per krausest spec):
 *   run        — replace data with 1,000 fresh rows
 *   runlots    — replace data with 10,000 fresh rows
 *   add        — append 1,000 rows
 *   update     — write a new label to every 10th row's signal
 *   clear      — empty the list
 *   swaprows   — swap rows at index 1 and 998
 *   select     — set the row's class signal to "danger" (clears prior selection)
 *   remove     — filter the row out of the list signal
 */

import { branch, each, leaf, mount } from '@aihu/arbor'
import { type Signal, signal } from '@aihu/signals'

interface Row {
  readonly id: number
  readonly label: Signal<string>
  readonly classSig: Signal<string>
}

const ADJECTIVES = [
  'pretty',
  'large',
  'big',
  'small',
  'tall',
  'short',
  'long',
  'handsome',
  'plain',
  'quaint',
  'clean',
  'elegant',
  'easy',
  'angry',
  'crazy',
  'helpful',
  'mushy',
  'odd',
  'unsightly',
  'adorable',
  'important',
  'inexpensive',
  'cheap',
  'expensive',
  'fancy',
]
const COLOURS = [
  'red',
  'yellow',
  'blue',
  'green',
  'pink',
  'brown',
  'purple',
  'brown',
  'white',
  'black',
  'orange',
]
const NOUNS = [
  'table',
  'chair',
  'house',
  'bbq',
  'desk',
  'car',
  'pony',
  'cookie',
  'sandwich',
  'burger',
  'pizza',
  'mouse',
  'keyboard',
]

let nextId = 1

function rand(max: number): number {
  return Math.round(Math.random() * 1000) % max
}

function newLabel(): string {
  return `${ADJECTIVES[rand(ADJECTIVES.length)]} ${COLOURS[rand(COLOURS.length)]} ${NOUNS[rand(NOUNS.length)]}`
}

function buildRows(count: number): Row[] {
  const out: Row[] = new Array(count)
  for (let i = 0; i < count; i++) {
    out[i] = {
      id: nextId++,
      label: signal(newLabel()),
      classSig: signal(''),
    }
  }
  return out
}

const data = signal<Row[]>([])
let selected: Row | null = null

function select(row: Row): void {
  if (selected === row) return
  if (selected) selected.classSig[1]('')
  row.classSig[1]('danger')
  selected = row
}

function remove(id: number): void {
  data[1](data[0]().filter((r) => r.id !== id))
}

function rowNode(r: Row) {
  return branch('tr', { class: r.classSig }, [
    branch('td', { class: 'col-md-1' }, [leaf(String(r.id))]),
    branch('td', { class: 'col-md-4' }, [
      branch('a', { class: 'lbl', onclick: () => select(r) }, [leaf(r.label)]),
    ]),
    branch('td', { class: 'col-md-1' }, [
      branch('a', { class: 'remove', onclick: () => remove(r.id) }, [
        leaf.element('span', { class: 'glyphicon glyphicon-remove', 'aria-hidden': 'true' }),
      ]),
    ]),
    branch('td', { class: 'col-md-6' }),
  ])
}

const tbody = document.getElementById('tbody')
if (!tbody) throw new Error('aihu-keyed: #tbody missing from index.html')

mount(
  each(data, (r) => r.id, rowNode),
  tbody,
)

function on(id: string, handler: () => void): void {
  const el = document.getElementById(id)
  if (!el) throw new Error(`aihu-keyed: #${id} missing from index.html`)
  el.addEventListener('click', handler)
}

on('run', () => {
  selected = null
  data[1](buildRows(1_000))
})

on('runlots', () => {
  selected = null
  data[1](buildRows(10_000))
})

on('add', () => {
  data[1]([...data[0](), ...buildRows(1_000)])
})

on('update', () => {
  const arr = data[0]()
  for (let i = 0; i < arr.length; i += 10) {
    const r = arr[i]
    if (r) r.label[1](r.label[0]() + ' !!!')
  }
})

on('clear', () => {
  selected = null
  data[1]([])
})

on('swaprows', () => {
  const arr = data[0]()
  if (arr.length <= 998) return
  const next = arr.slice()
  const tmp = next[1] as Row
  next[1] = next[998] as Row
  next[998] = tmp
  data[1](next)
})
