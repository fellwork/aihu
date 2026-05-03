import { leaf } from '../../../packages/arbor/src/index.ts'

export function AboutPage() {
  return {
    kind: 'branch' as const,
    tag: 'main',
    attrs: {},
    children: [
      { kind: 'branch' as const, tag: 'h1', attrs: {}, children: [leaf('About Scribe')] },
      { kind: 'branch' as const, tag: 'p', attrs: {}, children: [leaf('Scribe is a JavaScript/TypeScript meta-framework for building Web Components.')] },
      { kind: 'branch' as const, tag: 'nav', attrs: {}, children: [
        { kind: 'branch' as const, tag: 'a', attrs: { href: '/' }, children: [leaf('Home')] }
      ]},
    ],
  }
}
