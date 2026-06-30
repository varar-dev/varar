import { defineState } from '@oselvar/var'

const { context } = defineState(() => ({ count: 0 }))

context('I have {int} items', (_state, _count: number) => {})
