using System.Globalization;
using Varar;
using Varar.Core;
using static Varar.Example.Library;
using static Varar.Example.StepHelpers;

namespace Varar.Example;

public static class LibrarySteps
{
    // The prose format the spec is written in, e.g. "January 5, 2024".
    private const string DateFormat = "MMMM d, yyyy";

    // How a DateOnly is carried inside the dynamic state Value.
    private const string IsoFormat = "yyyy-MM-dd";

    private static Value DateValue(DateOnly d) => Value.Of(d.ToString(IsoFormat, CultureInfo.InvariantCulture));

    private static DateOnly ValueDate(Value v) =>
        DateOnly.ParseExact(AsStr(v), IsoFormat, CultureInfo.InvariantCulture);

    private static Value MoneyValue(Money m) =>
        VMap(("currency", Value.Of(m.Currency)), ("value", Value.Of((double)m.Value)));

    private static Money ValueMoney(Value v)
    {
        var m = SMap(v);
        return new Money(AsStr(m["currency"]), (decimal)((VFloat)m["value"]).Float);
    }

    private static Loan ValueLoan(Value v)
    {
        var m = SMap(v);
        return new Loan(AsStr(m["title"]), ValueDate(m["due"]));
    }

    private static IReadOnlyList<Value> LoansOf(Value state) =>
        SMap(state).TryGetValue("loans", out var l) && l is VList vl ? vl.Items : (IReadOnlyList<Value>)[];

    public static void Register(Steps s)
    {
        s.State(() => VMap(("loans", Value.List([])), ("fee", MoneyValue(Gbp(0m))), ("granted", Value.Of(false))));

        s.Param(
            "date",
            @"[A-Z][a-z]+ \d{1,2}, \d{4}",
            g => DateValue(DateOnly.ParseExact(g[0]!, DateFormat, CultureInfo.InvariantCulture)),
            v => ValueDate(v).ToString(DateFormat, CultureInfo.InvariantCulture));

        s.Param(
            "money",
            @"£\d+(?:\.\d+)?|\d+p",
            g => MoneyValue(ParseMoney(g[0]!)),
            v => FormatMoney(ValueMoney(v)));

        s.Stimulus("borrowed {emph}, due back on {date}", (state, title, due) =>
        {
            var loans = LoansOf(state).ToList();
            loans.Add(VMap(("title", title), ("due", due)));
            return new VMap(SMap(state).SetItem("loans", Value.List(loans)));
        });

        s.Stimulus("returns it on {date}", (state, returnedOn) =>
        {
            var returned = ValueDate(returnedOn);
            var fee = LoansOf(state)
                .Aggregate(Gbp(0m), (total, loan) => AddMoney(total, LateFee(ValueLoan(loan), returned)));
            return new VMap(SMap(state).SetItem("fee", MoneyValue(fee)));
        });

        s.Sensor("owes a {money} late fee", (state, _) => state["fee"]);

        s.Sensor("{money} for each day overdue", (state, _) => MoneyValue(FeePerDay));

        s.Stimulus("asks to borrow {emph} on {date}", (state, title, on) =>
        {
            var onDate = ValueDate(on);
            var loans = LoansOf(state).Select(ValueLoan);
            return new VMap(SMap(state).SetItem("granted", Value.Of(MayBorrow(loans, onDate))));
        });

        s.Sensor("the library refuses", state =>
        {
            if (state["granted"] is VBool { Bool: true })
            {
                throw new HandlerException("expected the library to refuse");
            }

            return null;
        });

        s.Sensor("the library agrees", state =>
        {
            if (state["granted"] is not VBool { Bool: true })
            {
                throw new HandlerException("expected the library to agree");
            }

            return null;
        });
    }

    // Money notation is spec prose, so it is parsed and rendered here — the SUT only
    // ever sees Money values. Under £1 renders as "50p", otherwise as "£2.55".
    private static Money ParseMoney(string raw) =>
        raw.EndsWith('p')
            ? Gbp(decimal.Parse(raw[..^1], CultureInfo.InvariantCulture) / 100m)
            : Gbp(decimal.Parse(raw[1..], CultureInfo.InvariantCulture));

    private static string FormatMoney(Money m) =>
        m.Value < 1m
            ? $"{(long)Math.Round(m.Value * 100m)}p"
            : $"£{m.Value.ToString("F2", CultureInfo.InvariantCulture)}";
}
