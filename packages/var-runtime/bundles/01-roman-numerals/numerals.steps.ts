import { defineContext } from '@oselvar/var-runtime'

const { step } = defineContext<{ result?: string }>(() => ({}))

const ROMAN: Record<number, string> = { 1: 'I', 4: 'IV', 9: 'IX', 40: 'XL' }

step('I convert {int} to roman numerals', (ctx, n: number) => {
  ctx.result = ROMAN[n]
})

step('The result is {word}', (ctx, expected: string) => {
  // Strip sentence-ending punctuation captured by {word} when it appears last in a sentence.
  const cleaned = expected.replace(/[.!?]$/, '')
  if (ctx.result !== cleaned) throw new Error(`expected ${cleaned} but got ${ctx.result}`)
})
