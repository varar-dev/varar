import { defineState } from '@oselvar/var'

const { sensor } = defineState<Record<string, never>>(() => ({}))
sensor('I greet {string}', () => undefined)
