// <$warp target="portal-root"> → createWarpBoundary(targetExpr, childFn)
// NOTE(v0.5-stub): createWarpBoundary requires arbor.mount to accept an arbitrary
// host node. If arbor.mount only accepts a custom-element host, this boundary
// is a stub pending an arbor mount API extension.
import { branch, leaf, slot } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement(
  '05-warp',
  defineComponent((_ctx) => {
    return createWarpBoundary('portal-root', () => {
      return branch('p', undefined, [leaf('Teleported content')])
    })
    // NOTE(v0.5-stub): createWarpBoundary requires arbor.mount to accept an arbitrary
    // host node. If arbor.mount only accepts a custom-element host, this boundary
    // is a stub pending an arbor mount API extension.
  }),
)
