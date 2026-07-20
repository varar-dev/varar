import { steps } from '@varar/varar'

// The example carries an `error` fence, so it asserts a failure. This stimulus
// throws nothing, so the fence inverts into an UnexpectedPassError — the kind
// no bundle exercised before this one.
const { stimulus } = steps()

stimulus('I do nothing at all', () => {})
