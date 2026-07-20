import { steps } from '@varar/varar'

const { stimulus, sensor } = steps(() => ({ greeting: '', result: 0 }))

stimulus('I greet {string}', (state, name) => ({ ...state, greeting: `Hello, ${name}!` }))

sensor('the greeting should be {string}', (state, _expected) => state.greeting)

stimulus('expression `{int}+{int}`', (state, op1, op2) => ({ ...state, result: op1 + op2 }))

sensor('evaluate to `{int}`', (state, _count) => state.result)
