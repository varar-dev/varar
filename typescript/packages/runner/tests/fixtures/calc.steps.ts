import { steps } from '@varar/varar'

const { stimulus } = steps(() => ({ count: 0 }))

stimulus('I have {int} items', (_state, _count: number) => {})
