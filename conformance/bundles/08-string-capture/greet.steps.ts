import { defineState } from '@oselvar/var'

const { stimulus } = defineState(() => ({}))

stimulus('I greet {string}', () => {})
