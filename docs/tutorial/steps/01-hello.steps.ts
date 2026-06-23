import { defineContext } from '@oselvar/var-vitest'
import { expect } from 'vitest'

const { step } = defineContext(() => ({ greeting: '', result: 0 }))

step('I greet {string}', (ctx, name: string) => {
  ctx.greeting = `Hello, ${name}!`
})

step('the greeting should be {string}', (ctx, expected: string) => {
  expect(ctx.greeting).toBe(expected)
})

step('expression `{int}+{int}`', (ctx, op1: number, op2: number) => {
  ctx.result = op1 + op2
})

step('evaluate to `{int}`', (ctx, count: number) => {
  expect(ctx.result).toBe(count)
})
