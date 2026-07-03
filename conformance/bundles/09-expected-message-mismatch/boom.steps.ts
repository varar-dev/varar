import { defineState } from '@oselvar/var'

const { stimulus } = defineState(() => ({}))

// Throws a message that does NOT contain the expected substring "expected
// message", so the expected-failure is NOT satisfied → the example fails.
stimulus('I always boom', () => {
  throw new Error('actual different error')
})
