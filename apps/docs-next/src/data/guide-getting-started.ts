/**
 * Getting-started guide body. Adapted from the real
 * `apps/docs/src/content/docs/getting-started.md`, rewritten in the CURRENT
 * prefix-less SFC syntax so the rendered code is accurate. Fenced code uses the
 * `~~~` delimiter and inline code uses `<code>` tags (both valid markdown) so
 * the source carries no backticks — that keeps it a plain template literal and
 * avoids escaped-backtick corruption. Next phase: read the unified
 * `docs/collapse-to-apps-docs` content tree at build instead.
 */
export const GETTING_STARTED = `# Getting Started

Aihu is a web meta-framework whose components are **single-file components**
(SFCs) — <code>.aihu</code> files with a small set of macro blocks. The same
component is a custom element for humans *and* a discoverable, governed surface
for AI agents. This guide builds one from scratch.

## Hello, world

After scaffolding a project, open <code>src/pages/index.aihu</code>. The
smallest useful component declares reactive state and a template that reads it:

~~~aihu
@state {
  let name = prop({ default: 'world' })
}

@template {
  <p>Hello, {name}!</p>
}

@route {
  path: "/",
  name: "home"
}
~~~

Three blocks, three jobs: <code>@state</code> owns reactivity,
<code>@template</code> owns structure, <code>@route</code> registers the page.
Everything else composes from here.

## The @state block

<code>@state</code> is where reactive values live. It is ordinary TypeScript —
you can import, declare helpers, and call the reactive intrinsics.

**Props** are the component's public, host-settable surface. Declare one with
<code>prop()</code>; it is reactive, reflects to an attribute, and can be
exposed to agents.

~~~aihu
@state {
  let count = prop({
    default: 0,
    describe: 'The current tally',
    expose: 'read write',
  })
}
~~~

**Local state** that is not part of the public surface uses <code>state()</code>:

~~~aihu
@state {
  let open = state(false)
}
~~~

> Reach for <code>state()</code> for private working values, and
> <code>prop()</code> when the value is part of the component's public,
> host-settable, agent-visible contract.

**Derived values** are lazy and memoized — declare them with <code>derived()</code>:

~~~aihu
@state {
  let count = prop({ default: 0 })
  const doubled = derived(() => count * 2)
}
~~~

**Actions** are named, agent-invocable operations. The wrapped form adds
<code>describe</code> / <code>expose</code> metadata so an MCP agent can
discover and call them:

~~~aihu
@state {
  let count = prop({ default: 0 })

  const increment = action(() => { count++ })
  const reset = action(
    { describe: 'Reset the tally to zero', expose: 'read write' },
    () => { count = 0 },
  )
}
~~~

## The @template block

<code>@template</code> describes the DOM with aihu's template grammar:

- <code>{expr}</code> interpolates a reactive expression.
- <code>href={expr}</code> binds an attribute reactively.
- <code>on:click={handler}</code> attaches an event listener.
- <code>if</code> / <code>elseif</code> / <code>else</code> and <code>show</code> handle conditionals.
- <code>each</code> / <code>key</code> render keyed lists.

~~~aihu
@template {
  <section class="counter">
    <output class="count">{count}</output>
    <div class="controls">
      <button on:click={decrement}>−</button>
      <button on:click={reset}>Reset</button>
      <button on:click={increment}>+</button>
    </div>
  </section>
}
~~~

## The @route block

<code>@route</code> registers a component as a page. During build the Rust
compiler emits a <code>.route.json</code> sidecar; the router assembles them
into a fully static manifest — no filesystem scanning at runtime.

~~~aihu
@route {
  path: "/",
  name: "home",
  layout: "docs",
  head: {
    title: "Home — my app",
    description: "Rendered to static HTML, hydrated on load."
  }
}
~~~

With <code>output: 'static'</code> every route without a loader is prerendered
to a content-ful <code>index.html</code> carrying its own head, then hydrated
into the live app on load — crawlers and agents read real content, humans get
the SPA.

## A complete example

Put together, the canonical counter is about forty lines, has an agent surface
(all three actions are agent-callable), and pulls in nothing beyond the reactive
intrinsics:

~~~aihu
@state {
  let count = prop({ default: 0, describe: 'The tally', expose: 'read write' })

  const increment = action(() => { count++ })
  const decrement = action(() => { count-- })
  const reset = action(() => { count = 0 })
}

@template {
  <section class="counter">
    <h2>Count: {count}</h2>
    <div class="controls">
      <button on:click={decrement}>−</button>
      <button on:click={reset}>Reset</button>
      <button on:click={increment}>+</button>
    </div>
  </section>
}
~~~

## Next steps

- **Reactivity** — the <code>signal</code>, <code>computed</code>, and <code>effect</code> primitives behind <code>prop</code> and <code>derived</code>.
- **Authoring Components** — the full reference for <code>@state</code>, <code>@template</code>, <code>@style</code>, and <code>@agent</code>.
- **Agent Discovery** — how state and actions become an MCP-discoverable surface.
`
