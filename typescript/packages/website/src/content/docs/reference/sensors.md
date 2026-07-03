---
title: Sensors
description: The sensor return-value contract — slots, bare values, positional arrays, and every error a sensor can raise.
---

A sensor is a read-only observation. It reads state, returns what the software
actually produced, and Vár compares that against what the Markdown claims. A
sensor never changes state, and you never write an assertion — the document is
the assertion.

```ts
const { sensor } = defineState(() => ({ total: 0 }))

sensor('the total is {int}', (state) => state.total)
```

This page is the reference for what a sensor may return and how each return
value is compared. The rules are identical in every port (TypeScript, Python,
Java).

## Slots

A sensor's **slots** are the values Vár will compare, in order:

1. each parameter captured by the expression (`{int}`, `{word}`, `{string}`,
   custom types), left to right;
2. the trailing data table or doc string, if the step has one (always last, at
   most one).

The return value maps onto the slots by count:

| Slots | Return                                        | Example                          |
| ----- | --------------------------------------------- | -------------------------------- |
| 0     | nothing (`undefined` / `None` / `null`)       | `() => { assertSomething() }`    |
| 1     | the slot's value, bare                        | `(state) => state.total`         |
| 2+    | an array/list, one element per slot, in order | `(state) => [state.n, state.s]`  |

### Zero slots — nothing to compare

A sensor with no parameters, no table and no doc string has nothing to compare
a return value against. Throw to fail, return nothing to pass:

```ts
sensor('the alarm fired', (state) => {
  if (!state.alarm) throw new Error('no alarm')
})
```

Returning any other value is a `ReturnShapeError`. This is deliberate: a
returned value here would silently assert nothing, and the author almost
certainly believed it was being checked.

### One slot — return the value bare

```ts
sensor('the total is {int}', (state) => state.total)
```

The return **is** the slot's value. It is never interpreted as a positional
array — so wrapping it (`return [state.total]`) fails the comparison, because
`[42]` is not `42`.

This also resolves what would otherwise be an ambiguity with custom parameter
types whose transformer produces an array:

```ts
const { sensor } = defineState(() => ({ dice: [5, 6] }), {
  numbers: { regexp: /\d+(?:, \d+)*/, transformer: (raw) => raw.split(', ').map(Number) },
})

// "The dice show 5, 6" — {numbers} transforms to [5, 6]
sensor('The dice show {numbers}', (state) => state.dice) // deep-equal [5, 6] vs [5, 6] ✓
```

Because a single-slot return is always the bare value, `[5, 6]` here is
unambiguously *the value*, deep-compared against the transformed parameter —
never mistaken for a two-slot positional array.

### Two or more slots — return a positional array

```ts
sensor('I should have {int} cukes in my {word} belly', (state) => [
  state.count,
  state.bellyName,
])
```

The array must have exactly one element per slot; a different length or a
non-array return is a `ReturnShapeError`. Each element is compared against its
slot. When the step also has a trailing table or doc string, it occupies the
last element:

```ts
sensor('Greet {word}:', (state, name, _body: string) => [name, `Hello, ${name}!\n`])
```

## What each slot kind compares

- **Inline parameter** — deep equality against the transformed captured value
  (so `{int}` compares numbers, a custom type compares whatever its transformer
  produced). A mismatch is a `CellMismatchError` anchored to the parameter's
  span in the Markdown.
- **Whole table** — the returned table (array of row-arrays or row-objects) is
  compared cell by cell as exact strings → `CellMismatchError` anchored to the
  failing cell. See [Check tables and doc strings](/how-to/tables-and-doc-strings/).
- **Doc string** — exact string equality, including the trailing newline →
  `DocStringMismatchError` anchored to the block's body.

## Header-bound table rows

A sensor bound to a sentence that names a table's columns runs once per row and
returns a **row object** keyed by the header — not slots:

```ts
sensor('a decimal and a roman number', (_state, row: { decimal: string; roman: string }) => {
  return { decimal: row.decimal, roman: toRoman(Number(row.decimal)) }
})
```

Each returned column is compared cell by cell against that row. This is the one
sensor shape that bypasses the slot contract.

## Returning nothing

Returning `undefined` (TypeScript), `None` (Python) or `null` (Java) always
means "no assertion" — the step passes unless it throws. Use this when the
sensor asserts by throwing (plain `throw`, or your test framework's own
assertions), which is always allowed regardless of slot count.

## Errors

| Error                    | Raised when                                                                     |
| ------------------------ | ------------------------------------------------------------------------------- |
| `CellMismatchError`      | a parameter or table cell differs; carries one span-anchored diff per cell      |
| `DocStringMismatchError` | the returned text differs from the doc string                                   |
| `ReturnShapeError`       | the return doesn't fit the slots: a value from a zero-slot sensor, a non-array or wrong-length array for 2+ slots, or a malformed table |

Because every diff is anchored to a source span, editors highlight exactly the
failing characters in the Markdown and show the actual value in place.

## Why an array at all?

A sensor with several slots has several independent claims to check, and Vár
needs to know which returned value belongs to which claim. Positional mapping —
same order as the sentence — does that without naming ceremony. When there is
only one claim, the position is unambiguous, so the wrapper would be pure
noise; that's why one slot takes the bare value.
