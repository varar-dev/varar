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

export type Loan = {
  readonly title: string
  readonly due: Date
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function lateFee(loan: Loan, returnedOn: Date): Money {
  const daysLate = Math.max(0, (returnedOn.getTime() - loan.due.getTime()) / MS_PER_DAY)
  return GBP(daysLate * FEE_PER_DAY.value)
}

export function mayBorrow(loans: ReadonlyArray<Loan>, on: Date): boolean {
  return loans.every((loan) => loan.due.getTime() >= on.getTime())
}
