import { defineState } from '@oselvar/var-vitest'

const { action, sensor } = defineState(() => ({ greeting: '', result: 0 }))

action('I greet {string}', (ctx, name: string) => {
  ctx.greeting = `Hello, ${name}!`
})

sensor('the greeting should be {string}', (ctx, _expected: string) => [ctx.greeting])

action('expression `{int}+{int}`', (ctx, op1: number, op2: number) => {
  ctx.result = op1 + op2
})

sensor('evaluate to `{int}`', (ctx, _count: number) => [ctx.result])
