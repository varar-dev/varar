package examples;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

public final class Library {

    /** An amount in a single currency; the value is in the currency's major unit (pounds). */
    public record Money(String currency, double value) {}

    public static Money gbp(double value) {
        return new Money("GBP", value);
    }

    public static final Money FEE_PER_DAY = gbp(0.5);

    public record Loan(String title, LocalDate due) {}

    private Library() {}

    public static Money addMoney(Money a, Money b) {
        if (!a.currency().equals(b.currency())) {
            throw new IllegalArgumentException("cannot add " + b.currency() + " to " + a.currency());
        }
        return new Money(a.currency(), a.value() + b.value());
    }

    /** Fee for returning a loan: 50p per day past the due date. */
    public static Money lateFee(Loan loan, LocalDate returnedOn) {
        long daysLate = Math.max(0, ChronoUnit.DAYS.between(loan.due(), returnedOn));
        return gbp(daysLate * FEE_PER_DAY.value());
    }

    /** A member may borrow as long as none of their loans is overdue. */
    public static boolean mayBorrow(List<Loan> loans, LocalDate on) {
        return loans.stream().noneMatch(loan -> loan.due().isBefore(on));
    }
}
