// @aihu:shadow-default none
// @aihu:extract read=scope:members call=anonymous
import { branch, leaf, slot, when } from '@aihu/arbor'
import type { Signal } from '@aihu/signals'
import { signal } from '@aihu/signals'
import { defineComponent, defineElement } from '@aihu/runtime'

const createIfBoundary = (cond, grow) => when(cond, grow);

defineElement('governed-lexicon', defineComponent({
  props: {
    route: {}
  },
  setup: (ctx) => {
  const route = ctx.props.route

  return branch('article', undefined, [
    branch('h1', { class: 'gx-headword' }, [leaf([() => (route() as any).data.$gx.entitled ? route.data.headword : (route.data.preview?.headword ?? 'locked'), () => {}] as unknown as Signal<string>)]),
    branch('p', { class: 'gx-slug' }, [leaf([() => (route() as any).params.slug, () => {}] as unknown as Signal<string>)]),
    branch('', undefined, [createIfBoundary([() => (route().data.$gx.entitled)], () => { return branch('', undefined, [branch('section', { class: 'gx-senses' }, [leaf([() => (route() as any).data.senses.join(', '), () => {}] as unknown as Signal<string>)])]) }), createIfBoundary([() => (!(route().data.$gx.entitled))], () => { return branch('', undefined, [branch('p', { class: 'gx-locked' }, [leaf([() => (route() as any).data.$gx.reason, () => {}] as unknown as Signal<string>)])]) })])
  ])
  },
}))
