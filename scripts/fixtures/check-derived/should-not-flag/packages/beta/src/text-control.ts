/**
 * Fixture: the shape of `packages/primitives/src/input/text-control.ts:22` and
 * `checkbox/index.ts:213`. "kept in sync" / "mirrors the root's state" here is
 * about DOM/attribute reflection and a CSS styling hook — not the agent
 * surface. Must not be a finding.
 */

export class TextControl extends HTMLElement {
  /** The `value` property, kept in sync with the `value` attribute. */
  get value(): string {
    return this.getAttribute('value') ?? ''
  }

  set value(v: string) {
    // mirrors the root's state onto the host for styling
    this.setAttribute('value', v)
    this.toggleAttribute('data-filled', v.length > 0)
  }
}

/**
 * Fixture: a `skills` array that is DERIVED, not hand-authored — the
 * derivation target, and the must-not-flag counterpart to D2. The elements
 * come from a call, so there are no literal ids to match.
 */
export function buildCard(registry: { list(): Array<{ id: string; name: string }> }): unknown {
  return {
    name: 'derived-app',
    skills: registry.list().map((entry) => ({ id: entry.id, name: entry.name })),
  }
}

/**
 * Fixture: an interface whose NAME collides across packages but whose members
 * are disjoint. D1 must not flag a coincidental name collision.
 */
export interface AgentSkill {
  readonly renderRoot: ShadowRoot
  readonly hostElement: HTMLElement
  readonly styleSheet: CSSStyleSheet
}
