import { steps } from '@varar/varar'

const { stimulus } = steps(() => ({}))

// Both expressions match "I have 5 cukes" → ambiguous-match diagnostic.
stimulus('I have {int} cukes', () => {})
stimulus('I have 5 cukes', () => {})
