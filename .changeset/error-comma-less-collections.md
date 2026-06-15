---
"@aihu/compiler": patch
---

Error (C447) on comma-less collection entries instead of silently dropping
them. `@state` collection blocks (`$action`/`$prop`/`$event`/`$computed`/…) are
comma-separated, JS-object syntax. A missing comma between wrapped entries —
e.g.

```
$action: {
  increment: { handler: () => { count++ } }
  decrement: { handler: () => { count-- } }   // ← no comma
}
```

previously collapsed the entries into one chunk and kept only the **first**,
silently discarding `decrement` and everything after. That produced wrong
runtime codegen (the template references `decrement` → `ReferenceError` at
mount) and broken type-check sidecars, with **no diagnostic**. The parser now
detects the glued-on entry (any non-whitespace after a wrapped value's closing
brace) and emits a clear `C447` naming the dropped entry and the missing comma.
The canonical comma-separated form (including trailing commas) is unaffected,
and bare arrow values with legitimate top-level return-type colons
(`(t: number): string => …`) are not false-flagged.
