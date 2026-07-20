import { expect, test } from 'vitest'
import { ReturnShapeError } from '../src/cell-diff.ts'
import { type ExecutePorts, executePlan } from '../src/execute.ts'
import { parse } from '../src/parse.ts'
import { plan } from '../src/plan.ts'
import { addStep, createRegistry } from '../src/registry.ts'

// Runs one example. `createContext` seeds the initial state; step handlers may
// capture what they receive via closures. Returns a getter for the caught error.
function run(
  source: string,
  register: (r: ReturnType<typeof createRegistry>) => ReturnType<typeof createRegistry>,
  createContext: (stepFile: string) => unknown,
) {
  const registry = register(createRegistry())
  const doc = parse('x.md', source)
  const p = plan(doc, registry)
  let caught: unknown
  const ports: ExecutePorts = {
    reporter: { diagnostic: () => {} },
    createContext,
    sink: {
      example: (_name, fn) => {
        void (fn() as Promise<void>).catch((e) => {
          caught = e
        })
      },
    },
  }
  executePlan(p, ports)
  return () => caught
}

const FILE = 's.steps.ts'

test('a context/action object return merges into state and threads forward', async () => {
  let seen: unknown
  const getErr = run(
    '# X\n\nI greet\nobserve\n',
    (r) => {
      r = addStep(r, {
        expression: 'I greet',
        expressionSourceFile: FILE,
        expressionSourceLine: 1,
        kind: 'stimulus',
        handler: () => ({ greeting: 'hi', count: 1 }),
      })
      return addStep(r, {
        expression: 'observe',
        expressionSourceFile: FILE,
        expressionSourceLine: 2,
        kind: 'sensor',
        handler: (state) => {
          seen = state
        },
      })
    },
    () => ({}),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeUndefined()
  expect(seen).toEqual({ greeting: 'hi', count: 1 })
})

test('a stimulus return fully replaces state — keys it omits are dropped, not merged', async () => {
  let seen: unknown
  const getErr = run(
    '# X\n\nstep one\nstep two\nobserve\n',
    (r) => {
      r = addStep(r, {
        expression: 'step one',
        expressionSourceFile: FILE,
        expressionSourceLine: 1,
        kind: 'stimulus',
        handler: () => ({ a: 1, b: 2 }),
      })
      r = addStep(r, {
        expression: 'step two',
        expressionSourceFile: FILE,
        expressionSourceLine: 2,
        kind: 'stimulus',
        handler: () => ({ b: 3 }),
      })
      return addStep(r, {
        expression: 'observe',
        expressionSourceFile: FILE,
        expressionSourceLine: 3,
        kind: 'sensor',
        handler: (state) => {
          seen = state
        },
      })
    },
    () => ({}),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeUndefined()
  // Under the full-replacement model `{ b: 3 }` IS the next state: `a` is gone.
  expect(seen).toEqual({ b: 3 })
})

test('a stimulus returning nothing leaves state unchanged', async () => {
  let seen: unknown
  const getErr = run(
    '# X\n\nstep one\nstep two\nobserve\n',
    (r) => {
      r = addStep(r, {
        expression: 'step one',
        expressionSourceFile: FILE,
        expressionSourceLine: 1,
        kind: 'stimulus',
        handler: () => ({ a: 1, b: 2 }),
      })
      r = addStep(r, {
        expression: 'step two',
        expressionSourceFile: FILE,
        expressionSourceLine: 2,
        kind: 'stimulus',
        handler: () => undefined,
      })
      return addStep(r, {
        expression: 'observe',
        expressionSourceFile: FILE,
        expressionSourceLine: 3,
        kind: 'sensor',
        handler: (state) => {
          seen = state
        },
      })
    },
    () => ({}),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeUndefined()
  expect(seen).toEqual({ a: 1, b: 2 })
})

test('a stimulus returning a non-object is a ReturnShapeError', async () => {
  const getErr = run(
    '# X\n\nstep one\n',
    (r) =>
      addStep(r, {
        expression: 'step one',
        expressionSourceFile: FILE,
        expressionSourceLine: 1,
        kind: 'stimulus',
        handler: () => 42 as unknown as Record<string, unknown>,
      }),
    () => ({}),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeInstanceOf(ReturnShapeError)
  expect((getErr() as Error).message).toContain('complete next state')
})

test('an undefined (void) return from a context/action is a no-op', async () => {
  let seen: unknown
  const getErr = run(
    '# X\n\nnoop\nobserve\n',
    (r) => {
      r = addStep(r, {
        expression: 'noop',
        expressionSourceFile: FILE,
        expressionSourceLine: 1,
        kind: 'stimulus',
        handler: () => undefined,
      })
      return addStep(r, {
        expression: 'observe',
        expressionSourceFile: FILE,
        expressionSourceLine: 2,
        kind: 'sensor',
        handler: (state) => {
          seen = state
        },
      })
    },
    () => ({ a: 1 }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeUndefined()
  expect(seen).toEqual({ a: 1 })
})

test('mutating the frozen state throws at runtime', async () => {
  const getErr = run(
    '# X\n\nmutate\n',
    (r) =>
      addStep(r, {
        expression: 'mutate',
        expressionSourceFile: FILE,
        expressionSourceLine: 1,
        kind: 'stimulus',
        handler: (state) => {
          ;(state as { a: number }).a = 2
        },
      }),
    () => ({ a: 1 }),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeInstanceOf(TypeError)
})

test('mutating the post-merge (re-frozen) state throws at runtime', async () => {
  // After a first action merges and re-freezes state, a second action that
  // attempts to mutate the frozen merged state must still throw.
  const getErr = run(
    '# X\n\nstep one\nmutate merged\n',
    (r) => {
      r = addStep(r, {
        expression: 'step one',
        expressionSourceFile: FILE,
        expressionSourceLine: 1,
        kind: 'stimulus',
        handler: () => ({ a: 1 }),
      })
      return addStep(r, {
        expression: 'mutate merged',
        expressionSourceFile: FILE,
        expressionSourceLine: 2,
        kind: 'stimulus',
        handler: (state) => {
          ;(state as { a: number }).a = 99
        },
      })
    },
    () => ({}),
  )
  await new Promise((res) => setTimeout(res, 0))
  expect(getErr()).toBeInstanceOf(TypeError)
})
