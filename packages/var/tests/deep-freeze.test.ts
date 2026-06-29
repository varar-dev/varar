import { expect, test } from 'vitest'
import { deepFreeze } from '../src/deep-freeze.js'

test('deepFreeze freezes nested objects and arrays', () => {
  const o = deepFreeze({ a: { b: 1 }, list: [{ c: 2 }] })
  expect(Object.isFrozen(o)).toBe(true)
  expect(Object.isFrozen(o.a)).toBe(true)
  expect(Object.isFrozen(o.list)).toBe(true)
  expect(Object.isFrozen(o.list[0])).toBe(true)
})

test('deepFreeze returns primitives and null unchanged', () => {
  expect(deepFreeze(5)).toBe(5)
  expect(deepFreeze('x')).toBe('x')
  expect(deepFreeze(null)).toBe(null)
})

test('deepFreeze returns the same reference (idempotent on frozen input)', () => {
  const f = Object.freeze({ a: 1 })
  expect(deepFreeze(f)).toBe(f)
})
