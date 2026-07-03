import { defineState } from '@oselvar/var'

const { stimulus } = defineState(() => ({}))

// Both expressions match "I have 5 cukes" → ambiguous-match diagnostic.
stimulus('I have {int} cukes', () => {})
stimulus('I have 5 cukes', () => {})
