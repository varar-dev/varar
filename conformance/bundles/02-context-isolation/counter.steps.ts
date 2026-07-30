import { steps } from '@varar/varar'

const { stimulus, sensor } = steps<{ count: number }>(() => ({ count: 0 }))

stimulus('I increment', (state) => ({ count: state.count + 1 }))

// One slot ({int}): return the observed count and the core compares it against
// the number in the document.
sensor('The count is {int}', (state) => state.count)
