---
"@aihu/compiler": patch
"@aihu/app": patch
---

Nested `<$outlet>` component registration (F1): the compiler-emitted `createOutletBoundary` now loads the matched route's referenced components alongside its page module — `Promise.all([m.route.module(), ...(globalThis.__aihuRegisterRouteComponents?.(m.route) ?? [])])` — so pages rendered through a layout's nested outlet get the same route-scoped registration as the top-level render path (O1c). `@aihu/app` publishes the registrar as `globalThis.__aihuRegisterRouteComponents` at module load; a standalone `@aihu/router` app without `@aihu/app` leaves it undefined and the outlet simply skips registration, unchanged from before.
