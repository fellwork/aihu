// @aihu:extract read=agents call=anonymous
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

const createOnceBoundary = (b) => b();
const createMemoBoundary = (deps, b) => b();

defineElement('05-once-memo', defineComponent((_ctx) => {
  return branch('div', undefined, [
          createOnceBoundary(() => { return branch('header', undefined, [
      branch('h1', undefined, [leaf('Static Header')])
    ]) }),
          createMemoBoundary([count, name], () => { return branch('section', undefined, [
      branch('p', undefined, [leaf('memoized')])
    ]) })
  ])
}))
