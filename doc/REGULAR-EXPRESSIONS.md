# Regular expressions as a step notation — analysis

Status: analysis, no decision yet. Written to scope the work before an ADR.

## The problem

Every Varar port compiles step expressions with the official
`cucumber-expressions` library for its language. That is a deliberate rule —
the porting skill says *"Cucumber-expressions is a library dependency, not a
hand-port"* — and it has served the seven ports well. It is also a hard ceiling
on which languages can have a port at all:

| Port | Library | State |
|---|---|---|
| TypeScript, Python, Java/Kotlin, Ruby, .NET | official, 20.x line | fine |
| Go | official `cucumber-expressions-go` | stale at v6.2.0; `{emph}` seeded by hand (ADR 0010) |
| Rust | community `cucumber-expressions` 0.5, AST only | regex generation hand-written; `{float}` etc. omitted (ADR 0006) |
| Dart, PHP, Swift, Elixir, Zig, … | none | **no port possible under the current rule** |

Two of seven ports already had to bend the rule, and both did the same thing:
they wrapped whatever library they had in an owned module (`go/core/expression.go`,
`rust/core/src/expression.rs`) that exposes a small contract — *compile → an
unanchored regexp source + a way to decode a whole-text match into typed
arguments with group spans*. The other five ports inline the library into
`registry.*` and `matcher.*` directly. So the facade the task asks for half
exists already; it is just not declared (there is no `expression` capability in
`conformance/parity.json`) and not the mandatory floor.

The goal is therefore twofold:

1. **Make plain regular expressions a first-class step notation** in the spec,
   with its own conformance bundles, so that a port needs only its host regex
   engine to be complete.
2. **Keep Cucumber Expressions** exactly as they are in every port that has the
   library, so existing users lose nothing and a new port has seven reference
   implementations of both notations to look at.

## Inventory: what Varar actually takes from the library

The dependency surface is smaller than "we use cucumber-expressions" suggests.
Listed by consumer, most fundamental first.

### Core (`typescript/packages/core/src`, mirrored in every port)

| Module | What it uses | Why |
|---|---|---|
| `registry.ts` | `CucumberExpression`, `ParameterType`, `ParameterTypeRegistry` | compile each step; hold custom types; seed `{emph}` |
| `matcher.ts` | `compiled.regexp` (anchors stripped, then a substring scan), `compiled.match(m[0])` → `Argument[]` with the `Group` tree | `args`, `paramSpans` (outer group), `paramInnerSpans` (first nested group), `formats` (via `arg.parameterType.name`) |
| `expression-segments.ts` | `compiled.ast` | split an expression into literal / param / opaque segments — feeds rename and completion |
| `conformance.ts` | `compiled.ast` | `parameterTypeNames` for the `registry.json` and `plan.json` goldens |

Note what the matcher does **not** do: it never calls the library's `match` on
the sentence. It strips `^…$` from the generated regexp, scans the sentence for
every occurrence (a sentence can hold several steps — bundle 01's
`The result is {word}.`), and only then hands each matched substring back to the
library to decode the arguments. Every port reproduces this
(`stripAnchors` in Java, `_make_unanchored_pattern` in Python, …). In other
words, Varar already treats a compiled expression as **a regexp plus a decoder
for one match** — which is precisely the shape of a regexp step definition.

### Authoring / LSP (`typescript/packages/{language,lsp,vscode}`)

| Consumer | What it uses | Feature |
|---|---|---|
| `language/src/snippet.ts` | `CucumberExpressionGenerator` | "Generate step definition" from selected prose; also **rename from the `.md` side**, which derives the new expression by running the generator on the edited sentence |
| `lsp/src/handlers.ts` completions | `expressionSegments` | snippet placeholders (`${1:0}`) and `filterText` (the literal words) |
| `lsp/src/handlers.ts` rename (F2) | `diffExpressions`, `renderExpression` | cascade: rewrite every matched `.md` site from the new expression with captured values spliced back |
| `lsp/src/handlers.ts` `buildHandlerSync` | `registry.parameterTypes.parameterTypes` (library type) | pick the host type text for each handler param |
| `language/src/index-workspace.ts` | `defineParameterType` / `addStep` with an empty handler | build the static registry from tree-sitter output |
| `language/src/tree-sitter-dialects/*` | — | `STEP_DEFINITION_QUERY` captures **only a `(string)` first argument**; `PARAMETER_TYPE_QUERY` already captures a regexp literal per language and each dialect has `resolveRegexp` |
| `varar/src/internal.ts` | — (own port of the `{name}` grammar) | type-level `ParameterNames<E>` infers handler arg types from a string-literal expression |
| semantic tokens, hover, go-to-definition | matches only | unaffected — they consume spans, not expressions |

### Corpora and release tooling

- `conformance/bundles/*/golden/registry.json` pins `{ expression, parameterTypeNames: string[] }` per step.
- `plan.json` pins per-step `matchedExpression` and `args[].parameterType: string | null` — the `null` already exists in the type.
- `conformance/run-results/expected.json` (the `.varar/<oath>.json` wire format, ADR 0014) does **not** carry expressions. Regexp support does not touch it.
- `conformance/parity.json` has no expression capability at all.
- `.claude/skills/adding-a-language-port/SKILL.md` step 2 and the seams table mandate the official library.
- `doc/ARCHITECTURE.md` calls the matcher "the cucumber-expression matcher".
- Website: `tutorials/first-oath.mdx`, `reference/custom-parameters.mdx` (built-in types section), `explanation/varar-for-cucumber-users.md` ("What survives": Cucumber Expressions).

## What a regexp step definition should mean

This is the part that needs deciding before any code, because the corpus pins
it for every port. The recommendation is deliberately the **smallest contract a
host regex engine can satisfy**, so a Dart or PHP port is a page of code, not a
reverse-engineering exercise.

1. **Groups are the arguments.** Every top-level capturing group of the regexp
   is one argument, in order. The value is the captured text, as a string, with
   no transformation. `(?:…)` groups are invisible.
2. **Spans.** `paramSpans[i]` is the group's span. `paramInnerSpans[i]` is the
   first capturing group nested inside it if there is one, otherwise the group
   itself — the rule custom parameter types already follow, so editors highlight
   `(“([^”]*)”)` as the inner text.
3. **Substring scan, anchors stripped.** A regexp step is found anywhere in a
   sentence exactly like a Cucumber Expression is today; a leading `^` and
   trailing `$` are removed before scanning (the library-generated regexps
   already have them removed; a user-written regexp gets the same treatment so
   both notations behave identically in a multi-step sentence).
4. **Ambiguity and precedence are unchanged.** Regexp hits and Cucumber hits
   compete in the same `findHits`/`resolveHits`; two hits of the same start and
   length are an `ambiguous-match` regardless of notation.
5. **No parameter-type lookup.** A group whose source happens to equal a custom
   parameter type's regexp is *not* run through that type's `parse`. (Cucumber's
   own `RegularExpression` does this, keyed on regexp-source equality. It is
   convenient for Cucumber-JVM users, but it makes the contract depend on
   regexp *text* equality, which every engine normalises differently, and it is
   the single most confusing corner of Cucumber's matching. It can be added
   later as an opt-in without breaking anything.)
6. **Portable dialect.** Corpus regexps stay within the intersection of the
   engines the ports use (RE2 in Go: no lookaround, no backreferences; `regex`
   in Rust: no lookaround; named-group syntax differs). This constraint already
   exists for custom parameter types (ADR 0006 records it) and should be
   written down once, as a reference page, rather than rediscovered per port.
7. **Identity.** `addStep`'s duplicate check compares expression text today;
   the key becomes `(kind, source)` so `/I have (\d+) cukes/` and
   `'I have {int} cukes'` are two steps (which then collide as ambiguous, which
   is correct).

Open questions on the contract are listed at the end.

### Why not build the regexp path on the library's `RegularExpression` class

Cucumber Expressions ships an `Expression` interface with two implementations
(`CucumberExpression`, `RegularExpression`) and an `ExpressionFactory` that
picks by argument type. It is tempting to use it where available. Recommendation:
**don't**, even in ports that have the library, for three reasons.

- The regexp path must be the *floor* every port can reach, so its reference
  implementation should be the thing a library-less port copies. If TypeScript's
  regexp path is twenty lines over `RegExp` plus the group-span rule above, a
  Dart port copies twenty lines. If it is the library's class, the Dart port has
  to reproduce whatever that class does — including the type lookup in point 5.
- The official ports already disagree on details: the .NET build compiles a
  parameter's inner groups as non-capturing and captures `{string}` with its
  quotes (`dotnet/Varar.Core/ParameterTypes.cs` works around both); Go is on v6.
  Pinning the corpus to "what `RegularExpression` does" would pin those
  divergences too.
- `RegularExpression` has no `ast`, so `expressionSegments` — rename, completion
  placeholders, `filterText` — needs its own regexp tokenizer anyway.

So the facade has two implementations behind one contract: the Cucumber one
wraps the library (as today, unchanged behaviour), the regexp one is owned code.

## Design sketch: the facade

One new module per port, `expression.*`, declared in `parity.json`. Go and Rust
already have it under that name; TypeScript, Python, Java, Ruby and .NET extract
it from `registry`/`matcher`. Its contract, in the TypeScript reference:

```ts
export type StepPattern =
  | { readonly kind: 'cucumber'; readonly source: string }
  | { readonly kind: 'regexp'; readonly source: string }   // bare source, no delimiters or flags

export type Argument = {
  readonly value: unknown
  readonly parameterTypeName: string | null   // null for a regexp group
  readonly span: ParamSpan                    // outer group, relative to the matched text
  readonly innerSpan: ParamSpan               // first nested group, else `span`
}

export type CompiledPattern = {
  readonly pattern: StepPattern
  readonly scanRegexpSource: string           // unanchored; the matcher's substring scan
  readonly slots: ReadonlyArray<string | null> // parameter-type name per argument (today's parameterTypeNames)
  matchWhole(text: string): ReadonlyArray<Argument> | undefined
  segments(): ReadonlyArray<ExpressionSegment>  // literal / param / opaque
}

export function compilePattern(pattern: StepPattern, types: ParameterTypes): CompiledPattern
```

`StepRegistration.compiled` becomes a `CompiledPattern`; `matcher.ts` loses its
`Group` import and reads `Argument` instead; `conformance.ts` reads `slots`;
`expression-segments.ts` becomes the Cucumber implementation of `segments()`
plus a regexp tokenizer. The library import survives in exactly one file,
`cucumber-expression.ts`, and a port that lacks the library simply has no such
file — its `compilePattern` rejects `kind: 'cucumber'` with a clear error.

The regexp tokenizer for `segments()` only needs to be good enough for the LSP:
top-level capturing groups become `param` segments (name `null`), runs of
literal characters with simple escapes (`\.`, `\ `) become `literal`, and
anything else at the top level (alternation, quantifiers, non-capturing groups,
classes) becomes `opaque`. That is the same three-way split the Cucumber AST
already yields, so the rename differ and the completion builder work unchanged.

### `parity.json`

Two capabilities instead of one, because the point is that they differ in
obligation:

- `expression-regexp` — required in every port. Files: `expression.*`.
- `expression-cucumber` — required in every port that *has* an official
  library, with a `why` listing the ones that don't. This turns "we couldn't
  get cucumber-expressions for language X" from an invisible omission into a
  declared, greppable decision, which is what the manifest is for.

## Consequences, by area

### 1. Core, all seven ports

- Extract the facade (no behaviour change; goldens unchanged). Five ports need
  this; Go and Rust need only the rename of concepts to match.
- Add the regexp implementation. Per port this is: strip anchors, compile with
  the host engine, on a whole match walk the top-level groups, compute spans in
  the port's offset convention (UTF-16 — the same conversion the port already
  does for library group offsets: Python's `to_utf16_offset`, Go's
  `utf16Index`, Rust's byte→UTF-16 helpers).
- `addStep` gains the `(kind, source)` duplicate key.
- Group-count validation: a regexp step with zero groups and a returning sensor
  is the zero-slot case; nothing new.

### 2. Conformance corpus (the real cost centre)

New bundles, each needing an `example.md`, four goldens, and **one steps fixture
per port language** (ts, py, java, kt, rb, rs, cs, go — eight files):

- `20-regexp-step` — a stimulus and a sensor as regexps, one group each; a
  sentence holding two steps, one of each notation.
- `21-regexp-groups` — nested group (inner span), a non-capturing group, a
  quoted-string group, a step with zero groups.
- `22-regexp-ambiguity` — a regexp and a Cucumber Expression that match the same
  span → `ambiguous-match`.
- `23-regexp-anchors` — `^…$` authored, stripped, still found mid-sentence.

Golden shape change: `registry.json` steps gain `"kind": "cucumber" | "regexp"`
and `parameterTypeNames` entries become `string | null`. Because goldens are
compared by content, every existing bundle's `registry.json` needs the new
field (a mechanical regeneration from the TypeScript reference) and every port's
conformance projection must emit it. `plan.json` needs nothing new —
`args[].parameterType` is already nullable and `matchedExpression` carries the
source.

Landing order that keeps `main` green under the commit-lint rule: the corpus and
the TypeScript reference land together as `feat(ts/core)`; each port follows as
`feat(<port>/core)`; a `(spec)` commit is only right once every port ships in
the same change, so use `Ports-deferred:` footers or per-port scopes.

### 3. Author-facing API per port

How a step says "this is a regexp" must be (a) natural in the host language and
(b) recognisable by a tree-sitter query. Where a language has a native compiled
regexp type, use it — Cucumber's own ports do the same, so users know the idiom:

| Port | Proposal | tree-sitter node the LSP will look for |
|---|---|---|
| TypeScript | `stimulus(/I have (\d+) cukes/, …)` — `RegExp` overload | `(regex)` — the same node `PARAMETER_TYPE_QUERY` already captures |
| Python | `stimulus(re.compile(r"…"), …)` | the `re.compile(...)` call the param query already resolves |
| Java | `stimulus(Pattern.compile("…"), …)` | `Pattern.compile((string_literal))` — already in the Java param query |
| Kotlin | `stimulus(Regex("…"), …)` | as the Kotlin param query |
| Ruby | `stimulus(/…/) { … }` | `(regex)` |
| Rust | `stimulus(Regex::new("…"), …)` or a `regexp("…")` marker | as the Rust param query |
| C# | `Stimulus(new Regex("…"), …)` | as the C# param query |
| Go | `Stimulus(regexp.MustCompile(`…`), …)` | raw string node |

Every dialect already implements `resolveRegexp` for the parameter-type query,
so the per-language work is: add the regexp alternative to
`STEP_DEFINITION_QUERY`'s `@expression` capture, route it through
`resolveRegexp` instead of `decodeString`, and put `kind` on `StepDef`.
Decoding matters: `"\\d"` in a Java string must arrive as `\d`, a Python raw
string must not be unescaped, a Go backtick string is verbatim — exactly what
`resolveRegexp` already handles per dialect. cucumber/language-service does this
for twelve languages and is the model.

TypeScript typing: `ParameterNames<E>` infers handler argument types from a
string literal. A `RegExp` literal has no literal type, so the `RegExp` overload
types the handler as `(state, ...args: string[])`. That is honest — every group
is a string — but loses arity checking. An alternative worth prototyping later:
a string-typed marker `regexp('I have (\\d+) cukes')` whose template-literal
type counts unescaped `(` not followed by `?`, giving `[string, string]` arity
at the type level. Not needed for v1.

### 4. LSP and VS Code, feature by feature

| Feature | Impact | Plan |
|---|---|---|
| Semantic tokens, hover, go-to-definition, references | none | consume spans from the index; the facade supplies them |
| Completion in `.md` | small | `buildSnippet`/`expressionLiteralText` run on `segments()`; regexp groups get a `${n:value}` placeholder; `filterText` unescapes simple escapes; opaque runs are dropped from `filterText` |
| Rename (F2) from the **steps** side | small | `diffExpressions` on regexp segments; `renderExpression` works when every non-param segment is literal; refuse (existing error path) when the regexp has opaque segments |
| Rename from the **`.md`** side | real gap | today derives the new expression with the Cucumber generator; for a regexp step, generate a regexp instead (numbers → `(\d+)`, quoted → `"([^"]*)"`) or refuse in v1 with the existing "not supported yet" message |
| Generate step definition | policy | keep Cucumber output in ports that have the library; the `SnippetEmitter` gains a `patternStyle` so a regexp-only port's emitter renders `Pattern.compile("…")`-style output; a tiny regexp generator replaces `CucumberExpressionGenerator` there |
| `buildHandlerSync` | small | reads the library's `parameterTypes` for host type text; regexp params are always the host string type |
| Diagnostics | maybe one new | "invalid regexp" at index time is swallowed today (`catch {}` in `index-workspace.ts`); a diagnostic on the step-def range would be the first user-visible signal |
| Website playground | none beyond core | the browser runs the same core; `RegExp` is native |

### 5. Docs and guidance

- `reference/stimuli.mdx` / `reference/sensors.mdx`: a "Regular expressions"
  section with the seven-point contract above; a portable-dialect note.
- `reference/custom-parameters.mdx`: regexp steps bypass parameter types.
- `explanation/varar-for-cucumber-users.md`: both notations survive.
- `.claude/skills/adding-a-language-port/SKILL.md`: rule 2 becomes "regexp is
  the mandatory floor; Cucumber Expressions are required only where an official
  library exists, and are then a library dependency, not a hand-port".
- `doc/ARCHITECTURE.md`: "the cucumber-expression matcher" → "the step matcher
  (Cucumber Expressions or regular expressions)".
- An ADR recording the decision and the contract.

### 6. Proof that the floor is enough

The claim "a port needs only a regex engine" should be tested before a Dart or
PHP port is started. Cheapest proof: make the `cucumber-expressions` crate an
optional Cargo feature in `rust/core` and run the regexp bundles with it off.
Rust is the port that already deviates most, so it is also the one most likely
to expose a hidden dependency.

## Suggested sequencing

1. **Facade extraction** (refactor, no golden changes): TypeScript first, then
   Python/Java/Ruby/.NET; `parity.json` gains `expression-regexp` /
   `expression-cucumber`; `make parity` green.
2. **Contract + corpus + TypeScript reference**: decide the open questions
   below, write the ADR, add bundles 20–23 with TypeScript fixtures and
   generated goldens, regenerate `registry.json` everywhere for the `kind`
   field, add the `RegExp` overload to `@varar/varar`.
3. **Ports**, one commit each, in the order that de-risks most: Rust (feature
   flag proof), Go, then the library ports.
4. **LSP**: tree-sitter capture per dialect, regexp `segments()`, completion and
   rename behaviour, the invalid-regexp diagnostic.
5. **Docs, skill, ARCHITECTURE**; release.

## Open questions to settle first

1. **Group values**: plain strings (recommended), or Cucumber's lookup of a
   custom parameter type by regexp-source equality?
2. **Anchors**: strip `^`/`$` so both notations scan identically (recommended),
   or honour them as written?
3. **Inner spans**: first nested group (recommended, matches custom parameter
   types), or always the whole group?
4. **Registry golden shape**: `kind` field plus nullable `parameterTypeNames`
   (recommended), or a separate `groups` count for regexp steps?
5. **Rename from `.md` for regexp steps**: generate a regexp, or refuse in v1?
6. **Snippet default**: Cucumber Expressions wherever the library exists,
   regexps only in library-less ports (recommended), or a per-project setting?
