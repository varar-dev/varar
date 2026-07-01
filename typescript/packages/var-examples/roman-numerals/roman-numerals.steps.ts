import { defineState } from '@oselvar/var'

const { sensor } = defineState(() => ({}))

sensor('a decimal and a roman number', (_state, row: { decimal: string; roman: string }) => {
  return { decimal: row.decimal, roman: toRoman(Number(row.decimal)) }
})

export function toRoman(num: number): string {
  const letters = [
    'M', 'CM', 'D', 'CD',
    'C', 'XC', 'L', 'XL',
    'X', 'IX', 'V', 'IV',
    'I'
  ];
  const lookupValues = [
    1000, 900, 500, 400,
     100,  90,  50,  40,
      10,   9,   5,   4,
       1
  ];
  let result = '';
  for(let index = 0; num; index++) {
    while(num >= lookupValues[index]!) {
      num -= lookupValues[index]!;
      result += letters[index];      
    }
  }
  return result;
}