import { defineParameterType, step } from '@oselvar/bdd-vitest'
import { expect } from 'vitest'

defineParameterType({
  name: 'airport',
  regexp: /[A-Z]{3}/,
  transformer: (code) => code,
})

// Module-local state. We can't call defineContext() here because the
// `01-hello` steps file already owns the per-example context for this run.
let from = ''
let to = ''

step('I fly from {airport} to {airport}', (_ctx, a: string, b: string) => {
  from = a
  to = b
})

step('the route should be from {airport} to {airport}', (_ctx, a: string, b: string) => {
  expect(from).toBe(a)
  expect(to).toBe(b)
})
