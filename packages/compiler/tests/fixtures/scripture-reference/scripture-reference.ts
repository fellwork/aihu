import { branch, leaf } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'
import type { Signal } from '@aihu/signals'
import { computed, signal } from '@aihu/signals'

defineElement(
  'scripture-reference',
  defineComponent({
    attrs: ['book', 'chapter', 'verse'] as const,
    setup(ctx) {
      const [book] = ctx.attrs.book
      const chapter = computed(() => Number(ctx.attrs.chapter[0]()))
      const verse = computed(() => Number(ctx.attrs.verse[0]()))

      const [text, setText] = signal('')

      function look_up() {
        setText(`${book()} ${chapter()}:${verse()} (text would be fetched here)`)
        return { book: book(), chapter: chapter(), verse: verse(), text: text() }
      }
      return branch('div', { class: 'scripture-reference' }, [
        branch('span', undefined, [leaf([text, setText] as unknown as Signal<string>)]),
      ])
    },
  }),
)
