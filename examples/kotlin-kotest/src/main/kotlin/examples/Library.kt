package examples

import java.time.LocalDate
import java.time.temporal.ChronoUnit

data class Money(val currency: String, val value: Double)

fun gbp(value: Double): Money = Money("GBP", value)

val FEE_PER_DAY = gbp(0.5)

data class Loan(val title: String, val due: LocalDate)

fun addMoney(a: Money, b: Money): Money {
    require(a.currency == b.currency) { "cannot add ${b.currency} to ${a.currency}" }
    return Money(a.currency, a.value + b.value)
}

fun lateFee(loan: Loan, returnedOn: LocalDate): Money {
    val daysLate = maxOf(0, ChronoUnit.DAYS.between(loan.due, returnedOn))
    return gbp(daysLate * FEE_PER_DAY.value)
}

fun mayBorrow(loans: List<Loan>, on: LocalDate): Boolean = loans.none { it.due.isBefore(on) }
