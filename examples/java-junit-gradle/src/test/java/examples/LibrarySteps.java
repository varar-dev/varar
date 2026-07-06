package examples;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public final class LibrarySteps implements StepDefinitions {

    record Ctx(List<Library.Loan> loans, Library.Money fee, boolean granted) implements State {}

    private static final List<String> MONTHS = List.of(
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December");

    /** June 6th → LocalDate 2026-06-06 (the spec's year is 2026). */
    private static LocalDate toDate(String raw) {
        String[] parts = raw.split(" ");
        int day = Integer.parseInt(parts[1].substring(0, parts[1].length() - 2));
        return LocalDate.of(2026, MONTHS.indexOf(parts[0]) + 1, day);
    }

    /** £2.50 and 50p, both as GBP Money. */
    private static Library.Money toMoney(String raw) {
        return raw.endsWith("p")
                ? Library.gbp(Double.parseDouble(raw.substring(0, raw.length() - 1)) / 100)
                : Library.gbp(Double.parseDouble(raw.substring(1)));
    }

    /** The inverse: mismatches render as £2.60 / 50p, not as a Money dump. */
    private static String formatMoney(Library.Money m) {
        return m.value() < 1
                ? Math.round(m.value() * 100) + "p"
                : String.format(Locale.ROOT, "£%.2f", m.value());
    }

    @Override
    public void defineSteps(Registrar registrar) {
        registrar.defineParameterType(
                "date",
                Pattern.compile("(?:January|February|March|April|May|June"
                        + "|July|August|September|October|November|December)"
                        + " \\d{1,2}(?:st|nd|rd|th)"),
                groups -> toDate(groups[0]));
        // £2.50 and 50p, both as GBP Money. The amount is cucumber-expressions'
        // float regexp, minus the scientific notation.
        registrar.defineParameterType(
                "money",
                Pattern.compile("£(?=.*\\d.*)[-+]?\\d*(?:\\.(?=\\d.*))?\\d*|\\d+p"),
                groups -> toMoney(groups[0]),
                LibrarySteps::formatMoney);
        // Emphasis (*Emma*) is stripped before matching, so a title is a
        // Title Case run in the plain prose.
        registrar.defineParameterType("title", Pattern.compile("[A-Z][a-z]+(?: [A-Z][a-z]+)*"), groups -> groups[0]);

        StateBinder<Ctx> s = registrar.defineState(() -> new Ctx(List.of(), Library.gbp(0), false));

        s.stimulus(
                "borrowed {title}, due back on {date}",
                (Ctx ctx, String title, LocalDate due) -> new Ctx(
                        Stream.concat(ctx.loans().stream(), Stream.of(new Library.Loan(title, due)))
                                .toList(),
                        ctx.fee(),
                        ctx.granted()));

        s.stimulus(
                "returns it on {date}",
                (Ctx ctx, LocalDate returnedOn) -> new Ctx(
                        ctx.loans(),
                        ctx.loans().stream()
                                .map(loan -> Library.lateFee(loan, returnedOn))
                                .reduce(Library.gbp(0), Library::addMoney),
                        ctx.granted()));

        s.sensor("owes a {money} late fee", (Ctx ctx, Library.Money expected) -> ctx.fee());

        s.sensor("{money} for each day overdue", (Ctx ctx, Library.Money expected) -> Library.FEE_PER_DAY);

        s.stimulus(
                "asks to borrow {title} on {date}",
                (Ctx ctx, String title, LocalDate on) ->
                        new Ctx(ctx.loans(), ctx.fee(), Library.mayBorrow(ctx.loans(), on)));

        s.sensor("the library refuses", (Ctx ctx) -> {
            if (ctx.granted()) throw new AssertionError("expected the library to refuse");
            return null;
        });

        s.sensor("the library agrees", (Ctx ctx) -> {
            if (!ctx.granted()) throw new AssertionError("expected the library to agree");
            return null;
        });
    }
}
