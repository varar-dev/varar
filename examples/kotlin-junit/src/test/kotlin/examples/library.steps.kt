@file:JvmName("LibrarySteps")

package examples

import dev.varar.kotlin.sensor
import dev.varar.kotlin.steps
import dev.varar.kotlin.stimulus
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

data class LibraryCtx(
    val loans: List<Loan> = emptyList(),
    val fee: Money = gbp(0.0),
    val granted: Boolean = false,
)

private val DATE_FORMAT = DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.ENGLISH)

private fun toMoney(raw: String): Money =
    if (raw.endsWith("p")) gbp(raw.dropLast(1).toDouble() / 100) else gbp(raw.drop(1).toDouble())

private fun formatMoney(m: Money): String =
    if (m.value < 1) "${(m.value * 100).roundToInt()}p" else "£%.2f".format(Locale.ROOT, m.value)

val librarySteps =
    steps(::LibraryCtx) {
        param(
            "date",
            Regex("""[A-Z][a-z]+ \d{1,2}, \d{4}"""),
            format = { DATE_FORMAT.format(it) },
        ) { groups ->
            LocalDate.parse(groups[0], DATE_FORMAT)
        }
        param(
            "money",
            Regex("""£(?=.*\d.*)[-+]?\d*(?:\.(?=\d.*))?\d*|\d+p"""),
            format = ::formatMoney,
        ) { groups ->
            toMoney(groups[0])
        }
        param(
            "title",
            Regex("""\*[^*]+\*"""),
            format = { "*$it*" },
        ) { groups ->
            groups[0].removeSurrounding("*")
        }

        stimulus("borrowed {title}, due back on {date}") { title: String, due: LocalDate ->
            copy(loans = loans + Loan(title, due))
        }
        stimulus("returns it on {date}") { returnedOn: LocalDate ->
            copy(
                fee = loans.fold(gbp(0.0)) { acc, loan -> addMoney(acc, lateFee(loan, returnedOn)) }
            )
        }
        sensor("owes a {money} late fee") { _: Money -> fee }
        sensor("{money} for each day overdue") { _: Money -> FEE_PER_DAY }
        stimulus("asks to borrow {title} on {date}") { _: String, on: LocalDate ->
            copy(granted = mayBorrow(loans, on))
        }
        sensor("the library refuses") {
            if (granted) throw AssertionError("expected the library to refuse")
            null
        }
        sensor("the library agrees") {
            if (!granted) throw AssertionError("expected the library to agree")
            null
        }
    }
