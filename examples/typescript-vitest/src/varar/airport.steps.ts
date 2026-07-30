import { steps } from '@varar/varar'

const { stimulus, sensor } = steps(() => ({ from: '', to: '' })).param(
  'airport',
  /[A-Z]{3}/,
  (code) => code,
)

stimulus('I fly from {airport} to {airport}', (_state, from, to) => ({ from, to }))

sensor('the route should be from {airport} to {airport}', (state, _from, _to) => [
  state.from,
  state.to,
])
