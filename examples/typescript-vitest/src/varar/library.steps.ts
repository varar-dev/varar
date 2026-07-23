import { steps } from '@varar/varar'
import {
  addMoney,
  FEE_PER_DAY,
  GBP,
  type Loan,
  lateFee,
  type Money,
  mayBorrow,
} from '../library'

const { stimulus, sensor } = steps(() => ({
  loans: [] as ReadonlyArray<Loan>,
  fee: GBP(0),
  granted: false,
}))
  .param(
    'date',
    /[A-Z][a-z]+ \d{1,2}, \d{4}/,
    (raw) => new Date(raw),
    (d) => d.toLocaleDateString('en-US', { dateStyle: 'long' }),
  )
  .param(
    'money',
    /£(?=.*\d.*)[-+]?\d*(?:\.(?=\d.*))?\d*|\d+p/,
    (raw): Money =>
      raw.endsWith('p') ? GBP(Number.parseFloat(raw) / 100) : GBP(Number.parseFloat(raw.slice(1))),
    (m) => (m.value < 1 ? `${Math.round(m.value * 100)}p` : `£${m.value.toFixed(2)}`),
  )

stimulus('borrowed {emph}, due back on {date}', (state, title, due) => ({
  ...state,
  loans: [...state.loans, { title, due }],
}))

stimulus('returns it on {date}', (state, returnedOn) => ({
  ...state,
  fee: state.loans.reduce((fee, loan) => addMoney(fee, lateFee(loan, returnedOn)), GBP(0)),
}))

sensor('owes a {money} late fee', (state) => state.fee)

sensor('{money} for each day overdue', () => FEE_PER_DAY)

stimulus('asks to borrow {emph} on {date}', (state, _title, on) => ({
  ...state,
  granted: mayBorrow(state.loans, on),
}))

sensor('the library refuses', (state) => {
  if (state.granted) throw new Error('expected the library to refuse')
})

sensor('the library agrees', (state) => {
  if (!state.granted) throw new Error('expected the library to agree')
})
