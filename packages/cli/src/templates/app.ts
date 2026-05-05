/**
 * Hello World app template file contents.
 * Used by `aihu app` to generate the initial index.aihu page.
 */

export const APP_INDEX_SCRIBE = `@state {
  $prop name: string = 'world'
}

@template {
  <div>Hello {{ name }}</div>
}

@route {
  path: /
  name: home
}
`

export const APP_DEFAULT_LAYOUT_SCRIBE = `@template {
  <slot />
}
`
