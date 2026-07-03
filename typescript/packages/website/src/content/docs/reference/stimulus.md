---
title: Stimulus
description: The stimulus step kind — how state is arranged, evolved, and threaded through an example.
---

A stimulus drives the software: it arranges the state an example starts from
and acts on it. It is one of Vár's two step kinds — the other is the
[sensor](/reference/sensors/), the read-only observation. The names are a
hardware analogy: you put a stimulus into the system, and you read its response
with sensors.

```ts
const { stimulus, sensor } = defineState(() => ({ total: 0 }))

stimulus('I add {int}', (state, n) => ({ total: state.total + n }))
sensor('the total is {int}', (state) => state.total)
```

## Given, When, Then are narration

The concepts arrange–act–assert (given–when–then, context–action–outcome) are
still how you *write* a good example: name the state the software rests in, the
one thing you do to it, and the outcome you expect. But in Vár the concepts and
the mechanism are decoupled:

| Concept (in your prose)   | Mechanism  |
| ------------------------- | ---------- |
| arrange / context / given | `stimulus` |
| act / action / when       | `stimulus` |
| assert / outcome / then   | `sensor`   |

Arranging state and acting on it are the same mechanism — both evolve state —
so they share one step kind. Vár never matches keywords: a step is a stimulus
or a sensor by what it does, not by how the sentence begins. Write `Given`,
`When`, `Then` in your Markdown if it reads well; they are narration for the
human, never load-bearing.

## Evolving state

A stimulus receives the current state as its first argument (deeply readonly)
followed by the values the expression captured. It evolves state by
**returning a partial state object**, which Vár shallow-merges onto the current
state and re-freezes:

```ts
const { stimulus } = defineState(() => ({ greeting: '', count: 0 }))

stimulus('I greet {string}', (state, name) => ({ greeting: `Hello, ${name}!` }))
stimulus('I add {int}', (state, n) => ({ count: state.count + n }))
```

- **Returning nothing** leaves state unchanged — right for a stimulus whose
  side effects live entirely in the system under test.
- **Returning anything that isn't an object** (or nothing) is a
  `ReturnShapeError`. A stimulus never returns values for comparison — that's
  the sensor's job.
- **Mutating `state` is impossible**: it is deep-frozen at runtime and deeply
  `readonly` at the type level. Evolution happens only by returning.
- The merge is **shallow**: a returned key replaces the previous top-level
  value wholesale; nested objects are not deep-merged.

In the Java and Kotlin ports, where state is an immutable record/data class,
a stimulus returns the complete new state value instead of a partial — full
replacement, same principle: new value out, never mutation.

## State is per step file, per example

`defineState` declares the state its step file's examples start from. Every
example gets a fresh state from the factory, so examples never leak into each
other; steps defined in different step files never see each other's state.

## Tables and doc strings

A trailing data table or fenced code block arrives as the last handler
argument, after the captured parameters — a table as `string[][]` (header row
first), a doc string as its exact text:

```ts
stimulus('these books exist:', (state, rows: ReadonlyArray<ReadonlyArray<string>>) => ({
  books: rows.slice(1).map(([title, author]) => ({ title, author })),
}))
```

A stimulus *consumes* these as input. To *check* a table or doc string against
what the software produced, use a sensor — see
[Check tables and doc strings](/how-to/tables-and-doc-strings/).

## Async

A stimulus handler may be async (`async` function in TypeScript, `async def`
in Python, `suspend` in Kotlin); the runtime awaits it before the next step
runs.

## Errors

| Error              | Raised when                                                        |
| ------------------ | ------------------------------------------------------------------ |
| `ReturnShapeError` | the handler returns something that isn't a partial state object or nothing |

Any exception the handler itself throws fails the example, anchored to the
step's line in the Markdown.
