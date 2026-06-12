import { defineContext, defineParameterType } from '@oselvar/bdd-vitest'
import { expect } from 'vitest'

defineParameterType({
  name: 'airport',
  regexp: /[A-Z]{3}/,
  transformer: (code: string) => code,
})

const { step } = defineContext(() => ({ from: '', to: '' }))

step('I fly from {airport} to {airport}', (ctx, from: string, to: string) => {
  ctx.from = from
  ctx.to = to
})

step('the route should be from {airport} to {airport}', (ctx, from: string, to: string) => {
  expect(ctx.from).toBe(from)
  expect(ctx.to).toBe(to)
})
