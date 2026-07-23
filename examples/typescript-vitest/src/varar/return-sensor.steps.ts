import { steps } from '@varar/varar'

const { sensor } = steps()

sensor('I should have {int} cukes in my {word} belly', (_state, count, name) => [count, name])
