import { steps } from '@varar/varar'

const { stimulus } = steps()

stimulus('I greet {string}', () => {})

// Nothing in greeting.md matches this any more — the other half of a rename.
stimulus('I wave at {string}', () => {})
