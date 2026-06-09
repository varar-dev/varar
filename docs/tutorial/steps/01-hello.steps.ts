import { defineContext, step } from '@oselvar/bdd-vitest'

defineContext(() => ({ greeting: '' }))

step('I greet {string}', (ctx, name: string) => {
  const c = ctx as { greeting: string }
  c.greeting = `Hello, ${name}!`
})

step('the greeting is {string}', (ctx, expected: string) => {
  const c = ctx as { greeting: string }
  if (c.greeting !== expected) {
    throw new Error(`Expected ${expected}, got ${c.greeting}`)
  }
})
