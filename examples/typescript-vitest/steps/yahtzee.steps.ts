import { steps } from '@varar/varar'
import { score } from '../src/yahtzee'

const { sensor } = steps()

sensor(
  'Examples of dice, category and score',
  (_state, row: { dice: string; category: string; score: string }) => {
    const dice = row.dice.split(',').map((d) => Number(d.trim()))
    return { score: score(dice, row.category) }
  },
)
