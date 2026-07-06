export type Money = {
  readonly currency: string
  readonly value: number
}

export const GBP = (value: number): Money => ({ currency: 'GBP', value })

export const FEE_PER_DAY = GBP(0.5)

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error(`cannot add ${b.currency} to ${a.currency}`)
  return { currency: a.currency, value: a.value + b.value }
}

// `due` and the dates passed below are ISO dates like 2026-06-01 — immutable
// and comparable as plain strings.
export type Loan = {
  readonly title: string
  readonly due: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function lateFee(loan: Loan, returnedOn: string): Money {
  const daysLate = Math.max(0, (Date.parse(returnedOn) - Date.parse(loan.due)) / MS_PER_DAY)
  return GBP(daysLate * FEE_PER_DAY.value)
}

export function mayBorrow(loans: ReadonlyArray<Loan>, on: string): boolean {
  return loans.every((loan) => loan.due >= on)
}
