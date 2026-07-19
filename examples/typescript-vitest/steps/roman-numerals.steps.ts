import { steps } from '@varar/varar'
import { toRoman } from '../src/roman-numerals'

const { sensor } = steps()

sensor('a decimal and a roman number', (_state, row: { decimal: string; roman: string }) => {
  return { decimal: row.decimal, roman: toRoman(Number(row.decimal)) }
})
