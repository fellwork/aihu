export function HomePage() {
  return {
    kind: 'branch' as const,
    tag: 'main',
    attrs: {},
    children: [
      { kind: 'branch' as const, tag: 'h1', attrs: {}, children: [{ kind: 'leaf' as const, text: 'Scribe' }] },
      { kind: 'branch' as const, tag: 'p', attrs: {}, children: [{ kind: 'leaf' as const, text: 'A meta-framework for Web Components with runtime-first reactivity.' }] },
      { kind: 'branch' as const, tag: 'nav', attrs: {}, children: [
        { kind: 'branch' as const, tag: 'a', attrs: { href: '/about' }, children: [{ kind: 'leaf' as const, text: 'About' }] }
      ]},
    ],
  }
}
