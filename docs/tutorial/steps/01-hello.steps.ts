import { defineState } from '@oselvar/var-vitest'

const { action, sensor } = defineState(() => ({ greeting: '', result: 0 }))

action('I greet {string}', (ctx, name) => {
  ctx.greeting = `Hello, ${name}!`
})

sensor('the greeting should be {string}', (ctx, _expected) => [ctx.greeting])

action('expression `{int}+{int}`', (ctx, op1, op2) => {
  ctx.result = op1 + op2
})

sensor('evaluate to `{int}`', (ctx, _count) => [ctx.result])
