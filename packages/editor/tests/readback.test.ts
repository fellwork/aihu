// Read-back reconciliation (spec §4.3, amended per Phase-0 A2): the
// structure-aware reconciler preserves marks (the spike-d3 flip), foreign
// DOM folds to text, and the flat diff stays available for composition.

import { describe, expect, it } from 'vitest'
import { diffToSteps, reconcileSteps, runsFromDom } from '../src/readback.ts'
import { doc, para, run, tid } from './helpers.ts'

function el(build: (root: HTMLElement) => void): HTMLElement {
  const root = document.createElement('p')
  build(root)
  return root
}

describe('runsFromDom (structure-aware, A2)', () => {
  it('reads our own rendered shape back into runs', () => {
    const p = el((root) => {
      root.appendChild(document.createTextNode('a '))
      const strong = document.createElement('strong')
      strong.textContent = 'b'
      root.appendChild(strong)
      const a = document.createElement('a')
      a.setAttribute('href', '/x')
      a.textContent = 'c'
      root.appendChild(a)
    })
    expect(runsFromDom(p)).toEqual([
      { text: 'a ', mark: null },
      { text: 'b', mark: { type: 'strong' } },
      { text: 'c', mark: { type: 'link', attrs: { href: '/x' } } },
    ])
  })

  it('folds foreign elements (extension spans) into the surrounding mark', () => {
    const p = el((root) => {
      const em = document.createElement('em')
      em.appendChild(document.createTextNode('a'))
      const span = document.createElement('span')
      span.setAttribute('class', 'spellcheck-widget')
      span.textContent = 'b'
      em.appendChild(span)
      root.appendChild(em)
    })
    expect(runsFromDom(p)).toEqual([{ text: 'ab', mark: { type: 'em' } }])
  })

  it('drops unsafe hrefs during read-back (a mutated href cannot enter the model)', () => {
    const p = el((root) => {
      const a = document.createElement('a')
      a.setAttribute('href', 'javascript:alert(1)')
      a.textContent = 'x'
      root.appendChild(a)
    })
    expect(runsFromDom(p)).toEqual([{ text: 'x', mark: null }])
  })
})

describe('reconcileSteps — the d3 flip (A2 acceptance)', () => {
  it('a spellcheck rewrite spanning a mark element PRESERVES the mark', () => {
    // model: 't' + strong 'eh'  — browser rewrote the DOM to 't'+strong('he')
    const p = tid()
    const d = doc(para(p, run('t'), run('eh', { type: 'strong' })))
    const domEl = el((root) => {
      root.setAttribute('data-block-id', p)
      root.appendChild(document.createTextNode('t'))
      const strong = document.createElement('strong')
      strong.textContent = 'he'
      root.appendChild(strong)
    })
    const steps = reconcileSteps(d, p, domEl)
    expect(steps).toEqual([
      {
        t: 'setRuns',
        id: p,
        runs: [
          { text: 't', mark: null },
          { text: 'he', mark: { type: 'strong' } },
        ],
      },
    ])
  })

  it('returns no steps when DOM ≡ model (the tripwire stays silent)', () => {
    const p = tid()
    const d = doc(para(p, run('same')))
    const domEl = el((root) => root.appendChild(document.createTextNode('same')))
    expect(reconcileSteps(d, p, domEl)).toEqual([])
  })
})

describe('diffToSteps (flat path for composition commits)', () => {
  it('produces a minimal insertText for an insertion', () => {
    const p = tid()
    const d = doc(para(p, run('ab')))
    expect(diffToSteps(d, p, 'aXb')).toEqual([
      { t: 'insertText', at: { block: p, offset: 1 }, text: 'X', mark: null },
    ])
  })

  it('produces delete+insert for a replacement and inherits the left-edge mark', () => {
    const p = tid()
    const d = doc(para(p, run('abc', { type: 'strong' })))
    const steps = diffToSteps(d, p, 'axc')
    expect(steps).toEqual([
      { t: 'deleteRange', from: { block: p, offset: 1 }, to: { block: p, offset: 2 } },
      { t: 'insertText', at: { block: p, offset: 1 }, text: 'x', mark: { type: 'strong' } },
    ])
  })

  it('empty diff for identical text', () => {
    const p = tid()
    expect(diffToSteps(doc(para(p, run('x'))), p, 'x')).toEqual([])
  })
})
