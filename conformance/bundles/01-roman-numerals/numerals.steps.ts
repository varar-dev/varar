import { steps } from '@varar/varar'

const { stimulus, sensor } = steps<{ result?: string }>(() => ({}))

const ROMAN: Record<number, string> = { 1: 'I', 4: 'IV', 9: 'IX', 40: 'XL' }

stimulus('I convert {int} to roman numerals', (_state, n: number) => ({ result: ROMAN[n] }))

// The trailing "." is matched literally, so {word} captures just the numeral
// and the sensor can return the observed value for the core to compare.
sensor('The result is {word}.', (state) => state.result)
