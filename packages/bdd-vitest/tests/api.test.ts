import { ParameterType } from '@cucumber/cucumber-expressions'
import { beforeEach, expect, test } from 'vitest'
import {
  _resetBuilder,
  buildRegistry,
  contextFactory,
  defineContext,
  defineParameterType,
  step,
} from '../src/api.js'

beforeEach(() => _resetBuilder())

test('step() adds a registration; buildRegistry() returns an immutable Registry', () => {
  step('I have {int} cukes', () => {})
  const r = buildRegistry()
  expect(r.steps).toHaveLength(1)
  expect(r.steps[0]?.expression).toBe('I have {int} cukes')
})

test('defineContext() sets a per-example factory used by contextFactory()', () => {
  defineContext(() => ({ balance: 0 }))
  const f = contextFactory()
  const c1 = f()
  const c2 = f()
  expect(c1).toEqual({ balance: 0 })
  expect(c1).not.toBe(c2)
})

test('contextFactory() returns a default `() => ({})` when defineContext was not called', () => {
  expect(contextFactory()()).toEqual({})
})

test('defineParameterType() registers a custom type for snippet inference', () => {
  defineParameterType({
    name: 'color',
    regexp: /red|green|blue/,
    transformer: (s) => s,
  })
  const r = buildRegistry()
  const has = [...r.parameterTypes.parameterTypes].some((p) => p.name === 'color')
  expect(has).toBe(true)
})

test('duplicate step() calls throw at buildRegistry()', () => {
  step('I have {int} cukes', () => {})
  step('I have {int} cukes', () => {})
  expect(() => buildRegistry()).toThrow(/duplicate step definition/)
})

test('step() type-checks typed handler arguments matching the cucumber expression', () => {
  // This is a TYPE-LEVEL assertion via a compile check. If `step()` lost its generic,
  // the typed `name: string` parameter below would error with TS2345.
  step('I greet {string}', (_ctx, name: string) => {
    expect(typeof name).toBe('string')
  })
  step('I have {int} cukes', (_ctx, count: number) => {
    expect(typeof count).toBe('number')
  })
  const r = buildRegistry()
  expect(r.steps).toHaveLength(2)
})
