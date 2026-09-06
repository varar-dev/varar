import { steps } from '@varar/varar'

const { stimulus } = steps()

stimulus('I divide 1 by 0', () => {
  throw new Error('division by zero')
})
