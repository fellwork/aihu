---
'@aihu/cli': patch
---

`create-aihu --options-json` was accepted and silently ignored.

The flag was listed in `create.ts`'s `VALUE_FLAGS` — so its value was correctly
skipped when parsing the project name — and then read by nobody: the
`package`-kind scaffold call passed no `userOverrides`. So

```
create-aihu app --template cf-team --options-json '{"auth":"supabase"}'
```

scaffolded better-auth and exited 0. It was also absent from `create.ts`'s own
`usageText()`.

`bin.ts` had threaded the same flag, with real validation, the whole time, and
`create-aihu` is the ONLY entry point npm users can reach (`npx @aihu/cli app`
cannot work — npx infers the bin from the package name; see create.ts's own
docblock). Nothing in the code, comments or tests suggested the omission was
deliberate. So the flag is threaded through rather than dropped, reusing
`bin.ts`'s parser — now extracted to `options-json.ts` so there is one
implementation instead of two — and documented in `--help`.

Overrides drive everything downstream of `mergeOptions`, so this also fixes
conditional file selection and the F-3b conditional peer deps: with
`{"auth":"supabase"}` the scaffold now emits `src/auth/supabase.ts` alone and
adds `@supabase/supabase-js` rather than `better-auth`.
