export function AboutPage() {
  return {
    kind: 'branch' as const,
    tag: 'main',
    attrs: {},
    children: [
      { kind: 'branch' as const, tag: 'h1', attrs: {}, children: [{ kind: 'leaf' as const, text: 'About Scribe' }] },
      { kind: 'branch' as const, tag: 'p', attrs: {}, children: [{ kind: 'leaf' as const, text: 'Scribe is a JavaScript/TypeScript meta-framework for building Web Components.' }] },
      { kind: 'branch' as const, tag: 'nav', attrs: {}, children: [
        { kind: 'branch' as const, tag: 'a', attrs: { href: '/' }, children: [{ kind: 'leaf' as const, text: 'Home' }] }
      ]},
    ],
  }
}
