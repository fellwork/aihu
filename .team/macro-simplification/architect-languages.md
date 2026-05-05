# Architect-B — Comparative survey of programming-language patterns

**Topic:** `topic:macro-simplification` · **Round:** 001-A2 · **Mode:** 2 (research-only)
**Author:** Architect-B (comparative — language patterns)
**Status:** Research report · No syntax proposals for aihu (Architect-design's job, round 004)
**Date:** 2026-05-05

---

## §1 — Frame: the duplication problem in language-design terms

Aihu's macro grammar is a **flat sequence of statements**, where each statement
carries exactly one piece of information about a named entity. To attach a
second piece of information (visibility, docstring, agent-exposure, scope) to
that entity, the source must re-state the entity's name in a *parallel
statement* somewhere else in the file. This is structurally the same problem
solved decades ago in mainstream languages by **declaration-site annotation**
(Lisp `^{...}`, Java/Kotlin/C# attributes, Rust `#[...]`, Python decorators,
TypeScript `@decorator`) or by **tagged-object field declaration** (Python
`dataclasses.field(...)`, Pydantic `Field(...)`, Rust `#[serde(...)]`, Ruby
DSL hash-args). The shared insight across all of them: **the place where you
*name* a thing is also the place where you *describe* it**, and the language
provides a syntactic affordance to attach arbitrary metadata at that single
point. Re-stating the name elsewhere is, in modern language design, a smell.

The 7 patterns surveyed below span both axes of the design space —
*per-declaration attribute syntax* (Rust, Kotlin, TS, Clojure, Ruby) and
*tagged-object field-call syntax* (Python `field()`, Pydantic `Field()`,
serde `#[serde(...)]`'s argument list). Where aihu's `@agent`-block model has
no analog in any of these languages, the comparable language-design move would
be either (a) **a sidecar metadata block keyed by name** — which is what aihu
*already does* and which is universally regretted in the languages that tried
it (Java's `package-info.java`, C#'s pre-attribute XML doc files) — or (b)
**fold the metadata into the declaration site** — which is the move every one
of these 7 languages eventually made.

---

## §2 — Rust derive macros + attributes

**Canonical exemplar:** `serde`, `derive_builder`, `validator`, `clap`.

### a) Single-name-declaration syntax

A struct field in Rust:

```rust
struct User {
    name: String,
}
```

**Token count:** 4 — name, colon, type, comma. The name appears exactly once.

### b) Metadata-attachment syntax

The `#[attribute(...)]` form attaches arbitrary metadata to the *next item*.
The compiler/macro reads `#[...]` as belonging to whatever declaration follows.

```rust
struct User {
    #[serde(rename = "user_name", default, skip_serializing_if = "String::is_empty")]
    name: String,
}
```

The attribute syntax is **purely positional** — the compiler knows the
attribute attaches to `name` because `name` is the next item in the token
stream. No re-statement of `name` inside `#[serde(...)]` is required, and
indeed no syntax for it exists.

### c) Documentation-attachment syntax

Doc comments (`///` or `/** */`) are sugar for `#[doc = "..."]` — the same
attribute mechanism:

```rust
struct User {
    /// The user's display name as shown in the UI.
    #[serde(rename = "user_name")]
    name: String,
}
```

So docstrings, serialization metadata, validation, and visibility all attach
through the same syntactic primitive. This is the **unification** that aihu's
current `$describe` block lacks.

### d) Multi-aspect declaration in one place

Rust's strongest example combines `derive`, multiple `#[serde(...)]` clauses,
multiple `#[validate(...)]` clauses, a doc comment, and a visibility modifier
on a single field:

```rust
#[derive(Serialize, Deserialize, Validate)]
pub struct CreateUser {
    /// The user's email address (must be unique in the system).
    #[serde(rename = "email_addr", alias = "mail")]
    #[validate(email, length(min = 3, max = 254))]
    pub email: String,
}
```

The name `email` appears **once**. Type, visibility, doc, two name-aliases,
and two validation rules all attach without ever restating it. That is the
target shape.

### e) Limits

- All metadata must be parseable at compile time (literal strings, paths,
  integers, expressions in some macros). No runtime values.
- Each procedural-macro that consumes attributes is independent — `#[serde]`
  doesn't talk to `#[validate]`. They share the field but don't share the
  attribute namespace. Conflicts are silent.
- Attributes can only attach to *items* the parser recognizes (struct fields,
  functions, modules, etc.), not arbitrary expressions.

### `color-theme.aihu`-equivalent translation (prose-shape)

In a hypothetical "if aihu adopted Rust-style attributes" world, each
declaration in `@state` would carry its own attribute prelude expressing both
agent-visibility and docstring. The `setHue` declaration would look like a
function declaration **prefixed** by an attribute that says "this is exposed
to the agent surface, with this description." The 4 actions would each have
their own one-line attribute prelude; the 4 state fields would each have
theirs. The `@agent` block would not need to re-state any of the 8 names —
the agent runtime metadata would be *gathered* at compile time by walking
declarations that bear the attribute. Free-text descriptions are just doc-
comment lines (`///` analog) immediately above the declaration. **The
`@agent` block, in this shape, contains only the truly cross-cutting metadata
— `$scope`, `$rate-limit` — which has no per-name target.**

### Verdict: **Y — translates to aihu**

The Rust attribute model is the closest analog to what aihu needs: an
attribute attaches to the next declaration positionally, no name re-statement
ever required, multiple attributes compose cleanly, doc comments unify with
attributes. Aihu's parser is itself written in Rust, and the Rust community's
proc-macro discipline (composable, name-free attributes) is well-trodden.

---

## §3 — TypeScript decorators (Stage 3) + decorator-metadata

**Canonical exemplar:** NestJS, class-validator, TypeORM, type-graphql.

### a) Single-name-declaration syntax

A class property:

```ts
class User {
  name: string;
}
```

**Token count:** 4 — name, colon, type, semicolon.

### b) Metadata-attachment syntax

The `@decorator` form prefixes a class, method, accessor, property, or
parameter, and is invoked at class-definition time:

```ts
class User {
  @IsString()
  @Length(1, 50)
  @ApiProperty({ description: "The user's display name" })
  name: string;
}
```

Stage-3 decorators (TS 5.0+) receive a context object that includes the
decoratee's name automatically — **the decorator never has to be told what
field it's decorating**. Multiple decorators stack cleanly and execute in
documented order (top-to-bottom evaluation, bottom-to-top invocation).

### c) Documentation-attachment syntax

TypeScript has two layers:
1. **JSDoc comments** (`/** ... */`) — universally read by tooling
   (TypeScript itself, IDEs, typedoc) and attached to the next declaration
   positionally, like Rust doc comments.
2. **Decorators that take a `description` argument** — the NestJS
   `@ApiProperty({ description })` and class-validator's `@ValidatorOptions`
   patterns explicitly accept a string. This is structurally identical to
   `$describe` in aihu, except attached at the declaration site.

### d) Multi-aspect declaration in one place

```ts
class CreateUserDto {
  /** The user's email; must be unique in the system. */
  @IsEmail()
  @Length(3, 254)
  @Transform(({ value }) => value.toLowerCase())
  @ApiProperty({ example: "alice@example.com" })
  @Expose({ name: "email_addr" })
  email!: string;
}
```

The name `email` appears once. JSDoc carries description, decorators carry
validation, transformation, schema, and serialization aliasing.

### e) Limits

- **Runtime reflection requirement:** to read decorator metadata at runtime
  (e.g., NestJS's DI), historical Stage 2 required `reflect-metadata` polyfill
  + `emitDecoratorMetadata: true`. Stage 3 has decorator-metadata as a
  proposal but adoption is uneven. **This is the seductive trap for aihu:
  aihu's compiler is Rust, so any TS-runtime-reflection mechanism is
  unavailable to it.** Aihu's compiler would have to read decorators at
  *compile time* (which is fine — aihu already does this for its current
  macros) but the JS-ecosystem patterns that depend on `Reflect.getMetadata`
  cannot be borrowed wholesale.
- Stage-3 decorators don't yet allow decorators on **class fields with
  initializers in all positions** without ceremonies; the surface is still
  evolving.
- Decorator factories add a ceremony layer (`@Decorator()` vs `@decorator`).

### `color-theme.aihu`-equivalent translation (prose-shape)

In a hypothetical "if aihu adopted TS-decorator syntax" world, each `@state`
declaration would be prefixed with one or more decorator-call lines, each
expressing a single aspect — one decorator for "expose to agent," one for
"description," one for "writable." Multiple decorators stack vertically above
each declaration. The compiler reads them at parse time and emits the same
runtime registration call shape. The JSDoc form supplies free-text
description so authors who prefer prose docstrings can avoid an explicit
"description" decorator entirely. **The `@agent` block as it exists today
disappears in this prose-shape — its content has been pushed up to the
declarations themselves.**

### Verdict: **Partial — translates only the syntax, not the runtime**

The decorator *syntax* is a clean fit for aihu's per-declaration metadata
needs. But the TypeScript ecosystem's reliance on runtime reflection
(`Reflect.metadata`, NestJS's DI graph) is a non-translatable pattern —
aihu's runtime targets signal-functions, not classes, and aihu's compiler is
Rust, not tsc. **What translates: the declaration-site `@`-prefix shape.
What doesn't translate: the runtime-reflection layer.**

---

## §4 — Kotlin annotations + sealed interfaces + data classes

**Canonical exemplar:** Kotlinx Serialization (`@Serializable`), Jetpack
Compose (`@Composable`), Android annotations (`@JvmStatic`, `@Deprecated`).

### a) Single-name-declaration syntax

A property in a data class primary constructor:

```kotlin
data class User(val name: String)
```

**Token count:** 4 — `val`, name, colon, type. Visibility (`val`) is
inline; type is inline. The whole property is one expression.

### b) Metadata-attachment syntax

Annotations prefix the declaration, with **use-site targets** to disambiguate
which generated bytecode element receives the annotation:

```kotlin
data class User(
    @field:JsonProperty("user_name")
    @get:JvmName("getUserName")
    val name: String,
)
```

The use-site target syntax (`@field:`, `@get:`, `@param:`, `@property:`) is
unique to Kotlin's compile-target multiplicity (one Kotlin property generates
many JVM artifacts) and is not relevant to aihu, but the **annotations-prefix-
declarations** shape is.

### c) Documentation-attachment syntax

KDoc comments (`/** ... */`) above declarations, syntactically identical to
JSDoc and Rust doc comments. KDoc is read by Dokka and IDEs.

### d) Multi-aspect declaration in one place

```kotlin
data class CreateUser(
    /** The user's email address. */
    @field:JsonProperty("email_addr")
    @field:Email
    @field:Size(min = 3, max = 254)
    val email: String = "",
)
```

Name `email` appears once. Visibility (`val`), type, default, doc,
serialization name, and two validation rules all attach without restating
the name.

### e) Limits

- **`@Composable` requires a compiler plugin.** This is critical: Compose's
  reactivity is *not* an annotation that the runtime introspects — it's a
  compile-time program transformation that rewrites function bodies to
  thread reactive state. The annotation alone does nothing; without the
  Compose compiler plugin loaded, `@Composable` is just a marker. **For
  aihu, this is actually permissive: aihu's compiler can transform the
  source however it likes. But this also means the `@Composable` model is
  less an "annotation pattern" than a "compiler-rewrite pattern" — the
  annotation is just a tag.**
- Kotlin annotations are statically typed (annotations are themselves
  declared as classes). This rigor doesn't translate cleanly to a
  source-overlay language.
- Use-site targets add ceremony that doesn't apply outside the JVM.

### `color-theme.aihu`-equivalent translation (prose-shape)

In a Kotlin-shaped world, each `@state` declaration would be expressed as
a property in a constructor-parameter-list-style block, each line carrying
its own annotations for agent-visibility, description, and scope. Default
values, type, and visibility (which today aihu signals via macro keyword
choice — `$prop` vs `$computed` vs `$action` — all sit inline). Action
declarations (`$action`) are functions which would be members of the
component "class" with their own annotation prelude — `@AgentExposed`,
`@Description("...")`. **The compelling bit: data class's
constructor-parameter-list style means you get a *visual block* of fields
that each carry independent metadata, without any sidecar block.** No
`@agent` block at all.

### Verdict: **Partial — strong precedent, but the use-site-target machinery
doesn't apply.**

The Kotlin model proves the *shape* (annotations + inline visibility +
inline default + inline type + KDoc on a single declaration) works at scale
in a production language. The framework-specific machinery (compose plugin,
JVM use-site targets) is irrelevant to aihu. What's borrowable is the
visual layout of a constructor-parameter-list-style block of annotated
properties.

---

## §5 — Python decorators + dataclasses + Pydantic Field

**Canonical exemplar:** `dataclasses` (stdlib), Pydantic, attrs, FastAPI.

### a) Single-name-declaration syntax

A dataclass field:

```python
@dataclass
class User:
    name: str
```

**Token count:** 3 — name, colon, type. Type annotations are positional after
the colon.

### b) Metadata-attachment syntax — **two distinct mechanisms**

**Mechanism 1: `field(...)` / `Field(...)` as the default-value position.**
The default-value slot is repurposed as a tagged-object call carrying all
field metadata:

```python
from dataclasses import dataclass, field

@dataclass
class User:
    name: str = field(
        default="",
        repr=True,
        compare=False,
        metadata={"description": "The user's display name", "agent_visible": True},
    )
```

The name `name` appears once. The `field()` call is a structured tagged
object — it carries default, repr, compare, and arbitrary metadata under
`metadata=`.

**Mechanism 2: `Annotated[T, Field(...)]` (Pydantic / typing).** When the
default-value slot is needed for an actual default, the metadata is moved
*into the type position* via `Annotated`:

```python
from typing import Annotated
from pydantic import BaseModel, Field

class User(BaseModel):
    name: Annotated[str, Field(
        description="The user's display name",
        alias="user_name",
        examples=["Alice"],
        min_length=1,
        max_length=50,
    )] = "Anonymous"
```

This is the cleanest "tagged object as field metadata" pattern in any
mainstream language. Type, validation, alias, description, and examples all
co-locate; the actual default sits to the right where Python expects.

### c) Documentation-attachment syntax

Three options, often used together:
1. **Module-level / class-level docstrings** — `"""..."""` — read by `help()`,
   Sphinx, IDEs.
2. **`Field(description=...)`** — Pydantic / dataclasses' explicit
   description argument.
3. **`field(metadata={"doc": "..."})`** — generic stdlib mechanism.

Python 3.14 added `field(doc="...")` as a first-class parameter, finally
unifying with the JSDoc/KDoc/RustDoc pattern.

### d) Multi-aspect declaration in one place

The Pydantic Annotated example above is the canonical multi-aspect form: one
declaration carries type, alias, description, examples, two validation
constraints, and a default — all without restating `name`.

### e) Limits

- **`field()` is positional** — it lives in the default-value slot, which
  visually conflates "default" with "metadata about the field." The
  Annotated form (Pydantic) corrects this but at the cost of a heavier type
  expression.
- Decorators on individual fields are not native (only `@property` on
  methods); per-field annotation is via `field()` arguments, not via
  `@decorator` syntax. So Python actually has both styles depending on what
  you're decorating: methods take `@decorator`; fields take `field(...)`.
- Type checkers are still catching up to `Annotated[..., Field(...)]` for
  full inference.

### `color-theme.aihu`-equivalent translation (prose-shape)

In a Pydantic-shaped world, each `@state` line would carry both its type
and a metadata-call positioned via the type annotation: the compiler reads
the metadata-call (the `Field(...)`-equivalent) for agent-visibility,
description, alias, and validation. Defaults sit on the right of `=`. The
docstring lives inside the metadata call as `description="..."`. Action
declarations (functions) get their description either from a `@description`
decorator (Python `@property` analog) or from the function's leading
docstring (`"""..."""`). **No `@agent` block at all.** The agent metadata
is gathered by walking declarations whose metadata-call has the agent flag
set.

### Verdict: **Y — Pydantic's Annotated + Field is the strongest tagged-
object precedent for aihu.**

This pattern is closest to what aihu is missing: a single-declaration form
that carries multi-aspect metadata via a structured argument list, while
keeping type, default, and name in their natural positions. Aihu's
compiler can read this shape mechanically (it's just a function-call AST
node where the function name is `Field` or analogous). **The risk: the
syntax can become heavy. Pydantic's `Annotated[str, Field(...)]` is wordier
than Rust's `#[...]`. AC-2 (cold-read) gets harder as the metadata stack
grows.**

---

## §6 — Ruby DSL idioms (ActiveRecord, Sinatra)

**Canonical exemplar:** ActiveRecord, Sinatra, RSpec, Sequel.

### a) Single-name-declaration syntax

Ruby has no field declarations on classes — instance variables are dynamic.
Schema for an ActiveRecord class is in the database, not in Ruby. So Ruby's
"declaration site" for class metadata is **a chain of class-body method
calls**, each of which acts on a name (a symbol) plus a hash of options.

```ruby
class User < ApplicationRecord
  attr_accessor :name
  validates :name, presence: true, length: { minimum: 1, maximum: 50 }
  has_many :books
  before_save :normalize_name
end
```

### b) Metadata-attachment syntax

The DSL pattern: `verb :name, option_key: value, option_key: value`. The
name is passed once as a symbol; the hash of options carries the metadata.
**Multiple aspects collapse into a single line via the hash.**

```ruby
validates :name, presence: true, length: { minimum: 3, maximum: 50 },
                  format: { with: /\A[a-z]+\z/i, message: "letters only" }
```

This is structurally identical to a tagged-object call where the first arg
is the name and the rest is metadata.

### c) Documentation-attachment syntax

Ruby uses RDoc / YARD comments (`# ...`) above declarations, like JSDoc.
There is no inline-DSL form for descriptions; documentation is comment-based.

### d) Multi-aspect declaration in one place

```ruby
validates :email,
  presence: true,
  format: { with: URI::MailTo::EMAIL_REGEXP },
  length: { maximum: 254 },
  uniqueness: { case_sensitive: false }
```

Name `email` appears exactly once on the line; four orthogonal validation
aspects stack as hash-keys.

### e) Limits

- **Multiple distinct concerns require multiple DSL calls** — `validates`,
  `has_many`, `before_save` are three separate verbs that each take `:name`
  again. So a name like `:name` does get repeated across DSL calls when
  you're describing it from multiple angles. ActiveRecord doesn't unify
  validation + association + callback under one verb. **Ruby DSL solves the
  problem within a single concern, not across concerns.**
- The DSL is dynamic — runtime introspection only; the metadata is invisible
  to static tools.
- Hash-arg syntax has changed across Ruby versions (now `keyword: value` is
  preferred over `:key => value`).

### `color-theme.aihu`-equivalent translation (prose-shape)

In a Rails-shaped world, each `@agent`-block aspect would become its own
top-of-block macro call that takes a *list* of names plus a hash of per-name
options. So instead of 8 `$describe` lines, there'd be one `describe`-style
call whose argument is a hash from name to description string. Instead of 4
bare `$action <name>` lines, there'd be one `expose-actions` call with the
list. **This collapses the duplication via list-and-hash-argument shape**
— it's the "object/array form" the user named in the original complaint —
but it does *not* fold metadata into the declaration site. Names still get
typed in two places: at declaration (in `@state`) and in the agent-block
hash. So this shape **partially** addresses the complaint: collapses
boilerplate, doesn't eliminate it.

### Verdict: **Partial — addresses keyword-repetition via hash args; does not
eliminate cross-block name repetition.**

Ruby DSL collapses `verb a; verb b; verb c` into `verb [a, b, c]` and
`verb :a, opt: x; verb :a, opt: y` into `verb :a, opt1: x, opt2: y` — both
of which the user explicitly cited as desirable. But it does *not* do
declaration-site annotation in the Rust/TS sense, and so doesn't fully
solve cross-block re-mention.

---

## §7 — Elm and Roc record syntax + opaque types

**Canonical exemplar:** Elm record-type-aliases, Roc tagged unions and
opaque types.

### a) Single-name-declaration syntax

Elm record type alias:

```elm
type alias User =
    { name : String
    , age : Int
    }
```

Roc record type:

```roc
User : { first_name : Str, last_name : Str }
```

In both: a field is declared as `name : Type`. **Token count:** 3 (name,
colon, type). No visibility modifier (everything is public; opacity is at
the module/type level via opaque types, not per-field).

### b) Metadata-attachment syntax

**There is no per-field metadata system in either language.** Elm has no
attribute syntax, no decorators, no annotation primitive. Type-level
constraints are expressed *only* through the type itself (e.g., custom
types, phantom types, opaque types). Cross-cutting metadata (validation,
serialization, schema) is conventionally handled by writing decoder /
encoder functions paired with the type — the metadata lives in the
*function*, not the *type*.

Roc adds opaque types (`User := Str`) which give a kind of one-bit
metadata — "this is opaque" — but no general mechanism.

### c) Documentation-attachment syntax

Elm: `{-| ... -}` doc comments above value declarations, processed by the
Elm package documentation site. There is no doc form for individual record
fields — the convention is to document the type alias as a whole and
describe the fields in the prose of that comment.

Roc: `## ...` doc comments, similar coverage.

### d) Multi-aspect declaration in one place

**Elm and Roc do not support this pattern.** Their explicit philosophy is
"the type *is* the metadata." Anything you want to know about a field beyond
its type, you must encode in the type. This pushes the same name to multiple
places (e.g., write `EmailAddress` opaque type with its own constructor and
validator function — three separate value declarations, all referring to
"email" by name).

### e) Limits

- **No annotation system whatsoever.** This is a *deliberate* design choice
  — both languages believe annotations encourage cross-cutting concerns and
  prefer to express everything through types and pure functions. **For
  aihu's `$describe` problem (free-text descriptions for human/agent
  consumption), the Elm/Roc approach is actively hostile** — they would
  expect descriptions to live in module-level prose docstrings, *separate*
  from the value declarations.
- No runtime reflection, no compile-time meta-programming. The compiler is
  intentionally simple.

### `color-theme.aihu`-equivalent translation (prose-shape)

In an Elm/Roc-shaped world, the answer is: **don't try to attach metadata
at all.** Document the component module as a whole at the top with a prose
comment that describes each entity by name. Use a custom type for any field
that needs runtime-checked constraints (e.g., `Hue` opaque type wrapping
`Int` with a constructor that enforces 0–360). The agent surface metadata
would be expressed as a *separate value declaration* that names the
exposed entities — **which is structurally identical to what aihu is doing
today, and what the user is complaining about**. So the Elm/Roc model is
actually a *negative example* for aihu — it shows what aihu's grammar
*currently is*, and why that grammar is regretted in dynamic / framework-
heavy contexts.

### Verdict: **N — does not translate.**

Elm and Roc deliberately reject the declaration-site annotation pattern in
favor of "types are the only metadata." This works for pure FP languages
where every cross-cutting concern can be re-expressed as a type or a
function. It does not work for a UI framework with framework-imposed
metadata categories (agent-exposure, scope, rate-limit) that don't reduce
to types. **This is the pattern to *not* adopt.**

---

## §8 — Smalltalk-style message passing + Lisp/Clojure metadata maps

**Canonical exemplar:** Clojure `^{...}`, Smalltalk `pragma:`, Common Lisp
`(declare ...)`, GNU Emacs Lisp `:doc`.

### a) Single-name-declaration syntax

Clojure top-level value:

```clojure
(def name "Alice")
```

Function:

```clojure
(defn greet [user] (str "Hello, " user))
```

Names are introduced via `def`, `defn`, `let`, `defmacro`. Each form
produces a *var* (top-level) or local binding.

### b) Metadata-attachment syntax

Clojure's `^{...}` reader macro attaches a metadata *map* to the next form.
The map can carry any keys the reader understands or that user code chooses
to read:

```clojure
^{:doc "Greets a user." :added "1.0" :private false :tag String}
(defn greet [user] (str "Hello, " user))
```

There's also shorthand: `^:private` desugars to `^{:private true}`,
`^String` desugars to `^{:tag String}`.

Critically, `defn` itself **lifts certain hot-path metadata into ergonomic
positions**:

```clojure
(defn greet
  "Greets a user."          ; docstring sugar — equivalent to ^{:doc "..."}
  {:added "1.0"}            ; arbitrary attribute map
  [user]
  (str "Hello, " user))
```

So Clojure has a *layered* approach: the syntactic primitive is `^{...}`,
but the common cases (docstring, attribute map) get nicer syntax inside
the `def`/`defn` form itself.

### c) Documentation-attachment syntax

The docstring is a string literal positioned right after the name. The reader
extracts it into the var's `:doc` metadata. This is the **most ergonomic
declaration-site docstring in any language surveyed** — it costs zero
ceremony.

### d) Multi-aspect declaration in one place

```clojure
(defn ^:private greet
  "Greets a user. Exposed via the public API for testing."
  {:added "1.0"
   :doc-extra "see https://example.com/docs"
   :validation #(string? %)
   :agent-visible true}
  [user]
  (str "Hello, " user))
```

Name `greet` appears once. Visibility (`^:private`), docstring, version,
extended docs, validation, and agent-visibility all attach to that name
without re-stating it.

### e) Limits

- **Lisp's homoiconicity is what makes this work** — code is data, so the
  reader can attach arbitrary maps to any form. **Aihu's `.aihu` source is
  *not* homoiconic** — it has a fixed grammar with named blocks and named
  macros. The general `^{...}` form attaching to *any* expression is
  unavailable. What translates is the *idea* (an attribute map), not the
  general mechanism.
- Reading metadata at runtime requires the var-system or explicit `meta`
  calls — fine for Clojure (everything is a var), would be redundant in
  aihu (the compiler can extract metadata at compile time).
- The metadata map is untyped — typos in keys are silent failures.

### `color-theme.aihu`-equivalent translation (prose-shape)

In a Clojure-shaped world, each `@state` declaration would gain an optional
attribute-map slot — a position right after the name where the author can
write a map literal of metadata keys. The agent-exposure flag, the
description, the scope, all live in that map. Docstrings get the *string-
right-after-the-name* shorthand that Clojure's `defn` uses. The compiler
collects every declaration-site map across the file at parse time and
emits the agent registration calls. **`@agent` block again disappears.**

### Verdict: **Y — strongest declaration-site idiom in the survey for
flexibility, but the homoiconic part doesn't transfer.**

What aihu can borrow:
1. The **inline docstring as a string literal in a fixed position** (the
   `defn` "first string after name = doc" rule). This is the ergonomic
   killer feature.
2. The **attribute-map slot** for arbitrary key/value metadata.
3. The **shorthand for boolean flags** (`^:private` → `^{:private true}`).

What aihu cannot borrow:
1. The general `^{...}` reader macro that attaches to *any* form. Aihu's
   grammar is fixed; metadata can only attach to grammar-recognized
   declarations.

---

## §9 — Multi-aspect declaration test (Director-required stress test)

The brief asks: *show one declaration in each pattern that carries
**type + default + docstring + visibility + validation** in a single block,
without restating the name*. This is a structural stress-test for
"declaration-site metadata association."

| Pattern | Token count for `email: string, default "", description, public, length 1..254, format email` | Restates name? | Docstring inline? |
|---|---:|---|---|
| Rust `#[serde]+#[validate]` | ~10 (per `pub email: String` + 4 attribute lines) | **No** | **Yes** (`///` line above) |
| TypeScript decorators | ~8 (5 decorator lines + `email!: string`) | **No** | **Yes** (`/** */` block above) |
| Kotlin data class + annotations | ~7 (4 annotations + `val email: String = ""`) | **No** | **Yes** (KDoc above) |
| Python Pydantic Annotated+Field | ~6 (`email: Annotated[str, Field(default="", description="...", min_length=1, max_length=254)]`) | **No** | **Yes** (`description=` arg) |
| Ruby ActiveRecord DSL | ~5 (`validates :email, presence: true, length: {maximum: 254}, format: {with: ...}`) — but no docstring inline | **Yes** (across separate verbs: `validates`, `attr_accessor`) | **No** (RDoc comment only) |
| Elm/Roc records | N/A — no per-field metadata mechanism | — | — |
| Clojure `^{...}` + `defn` | ~6 (`(def ^:public email "..." {:default "" :validate ...} "")`) — flexible | **No** | **Yes** (string literal after name) |

**Pattern winners on multi-aspect:** Python/Pydantic (lowest token count) and
Clojure (most flexible). **Pattern with explicit doc-inline win:** Clojure
(string-after-name shorthand). **Pattern with strongest static guarantees:**
Rust (compile-checked attribute names per macro). **Pattern that *fails* the
test:** Elm/Roc (philosophically refuses to participate).

---

## §10 — Cross-pattern comparison table (8 rows × 5 columns)

| Pattern | (a) Decl. syntax | (b) Metadata attach | (c) Docstring | (d) Multi-aspect single-decl | (e) Limits |
|---|---|---|---|---|---|
| **aihu today (baseline)** | `$prop name: T = d` | Sidecar `@agent` block keyed by name | `$describe name "..."` in `@agent` | **No** — name re-typed per aspect | Each aspect requires its own block keyword + name re-type |
| **Rust attributes** | `name: T` | `#[attr(...)]` prefix | `///` doc comment | **Yes** | Compile-time only; macros isolated |
| **TS Stage-3 decorators** | `name: T` | `@decorator` prefix | JSDoc `/** */` | **Yes** | Runtime reflection optional, ecosystem-divided |
| **Kotlin annotations** | `val name: T = d` | `@Annotation` prefix, use-site targets | KDoc `/** */` | **Yes** | Use-site machinery JVM-specific |
| **Python `field()`/Pydantic `Field()`** | `name: T = field(...)` or `name: Annotated[T, Field(...)]` | Tagged-object call in default-slot or Annotated | `description=` arg or `"""..."""` | **Yes** | `field()` overloads default-slot semantics |
| **Ruby DSL** | `attr_accessor :name` | Hash-arg per DSL call: `validates :name, opt: v` | RDoc comment | **Partial** — collapsed within a single verb only | Re-types name across distinct verbs; runtime-only |
| **Elm/Roc records** | `name : T` | **None** — types only | Module-level prose only | **No** | Refuses metadata as a category |
| **Clojure `^{...}` + `defn`** | `(def name v)` or `(defn f ...)` | `^{:k v}` reader macro on next form | First string literal after name (sugar) | **Yes** (most flexible) | Untyped metadata map; needs homoiconic reader |

---

## §11 — Top 3 idioms most likely to translate to a `.aihu` SFC

### Top 1: Rust-style attribute-on-declaration (`#[...]` form)

**Shape (prose):** Attach a bracketed attribute prefix to the line immediately
above each `@state` declaration. The attribute names a single aspect — agent
exposure, write-permission, description-as-string, alias — and the compiler
gathers all declarations bearing relevant attributes into the runtime
registration call. The name appears exactly once, at the declaration line.
A free-text description can either ride in an attribute argument or in a
preceding doc-comment line analogous to Rust's `///`.

**Why it fits aihu's parser + runtime:** Aihu's parser is itself written in
Rust — the proc-macro discipline is native to the team. The attribute-prefix
form parses with minimal grammar churn (one new token-recognition pass for
"attribute-prefix-of-next-declaration"). The runtime contract is unaffected:
the compiler still emits exactly the same `defineExpose` /
`registerAgentMetadata` calls, just driven by attribute-walk instead of
agent-block-walk. **AC-6 (no public-API change) is automatic.**

**AC-2 (cold-read) risk:** Moderate. A reader who has never seen the
attribute syntax can still guess "this prefix is metadata about the next
line" because it's visually offset and reads as English (`@expose`,
`@describe(...)`). The risk grows if attributes are nested or if the same
attribute can take arguments in multiple shapes — keep the attribute
vocabulary small (3–5 attributes) and AC-2 holds.

### Top 2: Clojure-style first-string-after-name as docstring (the killer
ergonomic detail)

**Shape (prose):** When an `@state` declaration is followed by a string
literal in a specific positional slot, that string is parsed as the
declaration's description. No `$describe` line ever needed — the docstring
*is* the description. This single rule eliminates **all 8 `$describe` lines
in `color-theme.aihu`** if combined with declaration-site agent-exposure
attributes.

**Why it fits aihu's parser + runtime:** This is the lightest-weight
intervention possible. The parser already lex-recognizes string literals;
all that changes is one positional rule per macro: "if the position
*right after the name (or signature)* contains a string literal, capture
it as the doc field." This is the move Python's `def` and Clojure's `defn`
both made decades ago and never regretted. The runtime sees a populated
description field on the registered metadata object, identical to what
`$describe` produces today.

**AC-2 (cold-read) risk:** Very low. A naive reader sees `$action setHue(h:
number) "Set hue directly (0-360)" { ... }` and reads it as "an action
called setHue, takes a number h, described as 'Set hue directly', does
this body." The English-language flow is preserved.

### Top 3: Pydantic-style `Annotated[T, Field(...)]` tagged-object metadata

**Shape (prose):** When a declaration's metadata exceeds 1–2 attributes,
combine them into a single tagged-object call attached to the declaration
— the equivalent of Pydantic's `Annotated[str, Field(description=...,
alias=..., min_length=...)]`. The single tagged-object call avoids the
"stack of 5 attribute lines" antipattern that TypeScript decorators
sometimes degrade into. Multiple aspects collapse into one structured
expression.

**Why it fits aihu's parser + runtime:** Aihu already parses
function-call-argument shape (it parses `$reactive(name)` and similar). A
metadata-call (`$meta(...)` or whatever Architect-design picks) reuses
that AST node. The runtime pattern is unchanged — the compiler walks the
metadata-call's keyword arguments and emits registration. Pydantic has
proven this pattern handles the *deepest* metadata stacks (Pydantic
schemas are some of the densest field-metadata in mainstream code) without
exhausting cold-read intelligibility.

**AC-2 (cold-read) risk:** Higher than the previous two. The tagged-object
form is heavier. Mitigation: reserve it for declarations with 3+ aspects;
let simple declarations use the lightweight forms (Top 1 and Top 2). The
aihu vocabulary should *not* require the tagged-object form for the common
case. If `setHue` only needs a description and an agent-expose flag, it
should not have to write a full metadata-call.

---

## §12 — Top 3 idioms that DO NOT translate

### Bottom 1: TypeScript runtime decorator metadata (`Reflect.metadata`)

**Why it fails:** TypeScript's most-cited decorator-driven frameworks
(NestJS, TypeORM, type-graphql) lean on **runtime reflection** —
`Reflect.getMetadata("design:type", target, key)` reads decorator metadata
at runtime, often during DI graph construction. **Aihu's compiler is Rust
and emits signal-functions; there is no class-based runtime, no metadata
table parallel to `Reflect`, no DI graph.** The decorator *syntax* is
borrowable; the runtime-reflection contract is not. Any pattern that
implicitly assumes the runtime can introspect "what decorators did this
field carry?" cannot be adopted without inventing a new runtime layer —
which is out of scope (AC-6).

### Bottom 2: Kotlin `@Composable` compiler-plugin reactivity

**Why it fails:** `@Composable` is *not* an annotation that influences a
runtime decision — it's a marker that triggers a **whole-program
compile-time rewrite** of the function body to thread reactive state. The
plugin rewrites every `@Composable` call site, every state read, every
recomposition scope. **Aihu is a source-syntax redesign round; bringing
in a Compose-scale compile-time rewrite would explode AC-5 (codemod ≤300
LOC) and AC-6 (no runtime change).** The annotation looks small, but the
machinery behind it isn't. *Any aihu pattern that proposes "and the
compiler rewrites the function" beyond the existing macro lowering should
be flagged as out-of-round.*

### Bottom 3: Elm/Roc "types are the only metadata"

**Why it fails:** This is the pattern aihu *already has*, structurally —
the agent surface is described in a parallel block where each name is
re-stated, exactly as Elm/Roc would express it via parallel type
declarations and decoder functions. **The user's complaint is precisely
that this approach creates duplication.** Adopting Elm/Roc's philosophy
("everything is a type or a function; metadata is forbidden") would mean
*ratifying the current pattern as correct*, which contradicts the round's
existence.

---

## §13 — Aside on GraphQL directives

The brief permits a one-line aside on GraphQL schema directives. They are
syntactically the closest analog to "declaration-site annotation" in any
data-modeling language: `field: String @deprecated(reason: "...")`,
`@auth(requires: ADMIN)`, etc. They share the **prefix-attribute** shape
of Rust attributes and the **call-with-keyword-args** shape of
Pydantic/Ruby. They are out of unit-of-analysis (schema language, not
program language), but if aihu eventually publishes a schema-introspection
output for agents, the GraphQL directive pattern is a working precedent
for that surface.

---

## §14 — Director-mandated AC awareness (research-side, not a proposal)

The brief notes my analysis must inform AC-1..AC-6. Without proposing
syntax, I can summarize what the survey suggests about each AC:

- **AC-1 (DRY)**: Every Y-verdict pattern (Rust, Python/Pydantic, Clojure,
  Kotlin partial) achieves AC-1 trivially — name appears once.
  Ruby DSL achieves it within a single verb but not across verbs.
  Elm/Roc and aihu-today both fail.
- **AC-2 (cold-read)**: Clojure docstring-after-name and Rust `///` doc
  comments are the most cold-readable. Multi-decorator stacks (TS,
  Kotlin) are slightly less. Pydantic `Annotated[...]` is the densest.
- **AC-3 (≤5 lines for `@agent`)**: Patterns that fold metadata into
  declarations make `@agent` either disappear (Rust, Clojure paths)
  or shrink to only truly cross-cutting metadata like `$scope` /
  `$rate-limit` (Pydantic path). All Y-patterns easily clear 5 lines.
- **AC-4 (≤39 macro names)**: Folding metadata into declaration-site
  attributes can *reduce* macro count (eliminate `$describe`, fold
  `$expose` into a flag), or hold it stable. The Pydantic
  tagged-object approach adds *one* new macro name (`$meta`-equivalent)
  but eliminates 3+ others.
- **AC-5 (codemod ≤300 LOC)**: Rust attribute and Clojure docstring
  shapes are mechanically codemodable — they map current `$describe`
  rows + `$expose` lists to attribute prefixes / inline strings via
  pure AST walk. Pydantic tagged-object is mechanically codemodable
  but produces longer lines that need a re-flow pass.
- **AC-6 (no public-API change)**: Every Y-pattern preserves the runtime
  lowering — the compiler still emits `defineExpose` /
  `registerAgentMetadata`. The source syntax changes; the runtime
  contract doesn't. Only the Compose-style "compiler rewrites the
  body" pattern violates AC-6, which is why §12 puts it in the bottom-3.

---

## Sources

Primary references consulted (all primary docs; WebSearch fallback used once
for Elm record syntax due to a non-content page):

- Serde attributes — https://serde.rs/attributes.html
- derive_builder — https://docs.rs/derive_builder/latest/derive_builder/
- validator crate — https://docs.rs/validator/latest/validator/
- TypeScript decorators handbook — https://www.typescriptlang.org/docs/handbook/decorators.html
- NestJS controllers — https://docs.nestjs.com/controllers
- Kotlin annotations — https://kotlinlang.org/docs/annotations.html
- Kotlin data classes — https://kotlinlang.org/docs/data-classes.html
- Jetpack Compose mental model — https://developer.android.com/jetpack/compose/mental-model
- Python dataclasses — https://docs.python.org/3/library/dataclasses.html
- Pydantic Field — https://pydantic.dev/docs/validation/latest/concepts/fields/
- Ruby on Rails ActiveRecord — https://guides.rubyonrails.org/active_record_basics.html
- Elm type aliases — https://guide.elm-lang.org/types/type_aliases.html
- Roc tutorial — https://www.roc-lang.org/tutorial
- Clojure metadata — https://clojure.org/reference/metadata

---

## STATUS REPORT

**STATUS: DONE**

Pattern count covered: **7 of 7** (Rust attributes, TS decorators, Kotlin
annotations, Python/Pydantic Field, Ruby DSL, Elm/Roc records, Clojure
metadata).

Verdicts: **3 Y** (Rust, Python/Pydantic, Clojure) + **3 Partial** (TS
decorators — syntax yes / runtime no; Kotlin — shape yes / use-site machinery
no; Ruby DSL — within-verb yes / across-verb no) + **1 N** (Elm/Roc).

WebFetch vs WebSearch: 14 WebFetch calls succeeded against primary docs; 1
WebSearch fallback (Elm records — primary docs/syntax page returned non-
content). Pydantic page redirected once and was re-fetched at the new URL.

TL;DR (5–8 bullets):
- **Patterns that collapse the duplication best:** Rust `#[attr(...)]` +
  doc comment, Clojure docstring-after-name + `^{...}` map, Python Pydantic
  `Annotated[T, Field(...)]`. All three put metadata at the declaration
  site with the name typed exactly once.
- **Recurring idiom across languages:** *first string literal positioned
  right after a name is the docstring* (Python `def`, Clojure `defn`,
  Rust `///`-as-sugar-for-`#[doc]`, Kotlin KDoc, JSDoc). Most ergonomic
  description-attachment in any language.
- **Top-3 translates** (§11): Rust attribute prefix, Clojure
  string-after-name docstring, Pydantic tagged-object metadata call.
- **Bottom-3 doesn't translate** (§12): TS runtime `Reflect.metadata`
  (no class runtime in aihu), Kotlin `@Composable` compiler-plugin rewrite
  (out of round scope), Elm/Roc "types are the only metadata"
  (philosophically the pattern aihu currently *has* and is regretting).
- **Multi-aspect test winners:** Python/Pydantic for compactness; Clojure
  for flexibility; Rust for static guarantees.
- **Pattern that fails outright:** Elm/Roc — explicitly refuses
  declaration-site annotation. This is the negative example, useful as a
  control.
- **Adequate coverage:** All 7 patterns surveyed against all 5 sub-questions
  + multi-aspect test + color-theme prose-shape translation. No pattern
  was inadequately surveyed.
- **Reminder for Architect-design (round 004):** §11 lists shapes only —
  no aihu syntax was proposed. Per-AC awareness in §14 is research-side
  only. Final syntax is round-004's call.
