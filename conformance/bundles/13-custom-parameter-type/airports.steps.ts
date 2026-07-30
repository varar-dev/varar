import { steps } from '@varar/varar'

// Custom {airport} parameter type: IATA code, lowercased by the parse function.
// The lowercasing is asserted by the sensor (the .md says "lhr"), so an
// identity parse fails this bundle — proving parse functions execute.
const { stimulus, sensor } = steps<{ dest?: string }>(() => ({})).param(
  'airport',
  /[A-Z]{3}/,
  (code) => code.toLowerCase(),
)

stimulus('I fly to {airport}', (_state, dest: string) => ({ dest }))

// The trailing "." is matched literally, so {word} captures just the code.
sensor('The destination code is {word}.', (state) => state.dest)
