import { defineState } from '@oselvar/var'

const { stimulus, sensor } = defineState(() => ({ greeting: '' }))

stimulus('I greet {string}', (_ctx, name: string) => ({ greeting: `Hello, ${name}!` }))

sensor('the greeting is {string}', (state, _expected: string) => state.greeting)
