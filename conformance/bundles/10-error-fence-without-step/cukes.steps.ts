import { steps } from '@varar/varar'

const { stimulus } = steps(() => ({}))

// The prose matches no step, so the `error` fence (which marks the example
// expected-to-fail) has nothing to run → error-fence-without-step diagnostic,
// and the example is dropped.
stimulus('I have {int} cukes', () => {})
