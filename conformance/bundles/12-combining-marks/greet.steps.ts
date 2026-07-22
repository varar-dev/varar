import { steps } from '@varar/varar'

const { sensor } = steps<Record<string, never>>(() => ({}))

// One slot: echoing the capture back makes the core compare it against the
// document, which is what exercises the combining-mark span offsets.
sensor('I greet {string}', (_state, name: string) => name)
