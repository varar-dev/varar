# Custom parameter `format` and mismatch display resolution

Date: 2026-07-06
Status: design, docs written first (reference/custom-parameters), implementation pending

## Why

A sensor's return is deep-compared against the *transformed* inline parameter
(the `£2.55` in the document becomes `Money { currency: 'GBP', value: 2.55 }`
before comparison). The verdict is right, but the failure display collapses
the actual value with `String()` / `str()` / `String.valueOf()`:

```
CellMismatchError: arg 1: expected £2.55 but was [object Object]
```

The `expected` side of a cell diff is already document notation (the source
text at the parameter's span). The `actual` side has no way back into that
notation: parameter types only know `document → value` (`parse`), not
`value → document`.

## The portable pattern

**The comparison stays in value space; the display string resolves through a
spec-defined chain; each adapter projects raw values onto its test framework's
native diff affordance.**

Portability facts that shape this design:

- Conformance goldens never serialize free-text error messages — only the
  structured `cells[].{expected,actual}` strings survive into `trace.json`
  (`toFailureArtifact` discards messages by design). So only the **cell
  rendering** must be byte-identical across ports; message *wording* is
  port-idiomatic.
- A universal "render any object" rule cannot be pinned across ports: native
  number/object formatting diverges (`String(2.0)` is `"2"` in JS, `"2.0"` in
  Python and Java), and TS/Python/Java/Kotlin have no shared repr. The only
  rendering that can be byte-identical everywhere is one the author writes:
  the parameter type's `format`, defined per port in the same steps file the
  bundle already mirrors per language.

## Resolved decisions

- **Parameter types gain an optional `format: (value) → string`** — the
  inverse of `parse` (né `transformer` — renamed to make parse/format the idiom pair), declared wherever the type is declared
  (`defineState` paramTypes in TS, `define_state` dict in Python,
  `Registrar.defineParameterType` overload in Java, `parameterType(format =)`
  in Kotlin). Presentation only: it never influences the verdict.
- **Display resolution chain** for a mismatched inline parameter's `actual`
  (and `expected` fallback when no source text exists), identical in every
  port:
  1. the parameter type's `format`, if defined (errors in `format` fall
     through to the next rule);
  2. a string value as-is;
  3. any other primitive via the port's plain stringification;
  4. otherwise a best-effort port-native rendering (`JSON.stringify`,
     `repr()`, `toString()`), explicitly **outside conformance** — a bundle
     that pins an object-valued actual must give the parameter type a
     `format`.
  The same chain (minus rule 1 — no parameter type is in play) replaces bare
  stringification in the row-check and whole-table comparisons so no path
  ever prints `[object Object]`.
- **`CellDiff` carries raw values** alongside the display strings:
  `expectedValue` / `actualValue` (TS `unknown`, Python `Any`, Java
  `Object`), plus a `formatted` flag — true when the parameter type's
  `format` rendered the actual display. Core-internal + adapter-facing;
  **not** serialized into run-results or conformance artifacts.
- **Adapters prefer the formatted display pair; raw values are the fallback
  for unformatted object mismatches.** Presentation only, never
  conformance-pinned:
  - vitest: a `formatted` cell sets the document-notation strings as
    `expected`/`actual` on the thrown error (`£2.55` vs `£2.50` — the diff
    the author asked for by writing a `format`); an unformatted single
    object mismatch sets the raw values instead → structural
    `- Expected / + Received` diff rather than two JSON strings;
  - JUnit: may later wrap in `org.opentest4j.AssertionFailedError(message,
    expected, actual)` (needs an explicit opentest4j dep in var-junit);
  - pytest/unittest: no expected/actual protocol for raised exceptions — the
    core message rendered via the chain IS the diff, which is why the chain
    must be good on its own.
- **The registry conformance artifact is unchanged** — custom types still
  project as `{name, regexp}`; `format` (a function) is never serialized,
  like `parse`.
- **A new conformance bundle** (custom parameter type with `format`, sensor
  returns a mismatching value) pins the formatted `cells[].actual` — e.g.
  `"£2.60"` — byte-for-byte across ports.

## What each port changes

Same three seams everywhere:

1. **Registry**: accept and retain `format` per parameter type
   (cucumber-expressions' `ParameterType` can't hold it — keep a parallel
   name → format map).
2. **Matcher → plan**: each hit records, per captured argument, the parameter
   type's format (aligned with `args`/`paramSpans`), so the executor can
   resolve displays without reaching back into the registry.
3. **compareParams + cell/table comparators**: apply the resolution chain for
   display strings; populate `expectedValue`/`actualValue`.

Plus per-port adapter projection (vitest today; JUnit/pytest render the
message).

## What is intentionally absent

- No `format` on built-in parameter types — their values are primitives and
  rule 3 of the chain already renders them canonically.
- No attempt to spec a cross-port object/number rendering (see portability
  facts above); rule 4 is deliberately unpinned.
- No use of `format` for matching or snippet generation — it is display-only.
