import { steps } from '@varar/varar'

const { sensor } = steps()

sensor('life, the universe and everything is {int}', () => 42)
