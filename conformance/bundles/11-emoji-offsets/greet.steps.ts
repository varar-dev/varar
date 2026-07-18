import { steps } from '@varar/varar'

const { sensor } = steps<Record<string, never>>(() => ({}))
sensor('I greet {string}', () => undefined)
