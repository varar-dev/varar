import { defineState } from '@oselvar/var'

const { stimulus } = defineState(() => ({ count: 0 }))

stimulus('I have {int} items', (_state, _count: number) => {})
