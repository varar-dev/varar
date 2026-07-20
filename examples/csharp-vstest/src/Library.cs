namespace Varar.Example;

/// <summary>An amount of money in a single currency — mirrors the TypeScript sample's <c>Money</c>.</summary>
public sealed record Money(string Currency, decimal Value);

/// <summary>A borrowed book and the day it is due back.</summary>
public sealed record Loan(string Title, DateOnly Due);

// The code under test for library.md. Pure domain logic over DateOnly and Money:
// parsing and formatting of dates and money belong to the step definitions, not here.
public static class Library
{
    public static readonly Money FeePerDay = Gbp(0.50m);

    public static Money Gbp(decimal value) => new("GBP", value);

    public static Money AddMoney(Money a, Money b) =>
        a.Currency == b.Currency
            ? a with { Value = a.Value + b.Value }
            : throw new InvalidOperationException($"cannot add {b.Currency} to {a.Currency}");

    public static Money LateFee(Loan loan, DateOnly returnedOn) =>
        Gbp(Math.Max(0, returnedOn.DayNumber - loan.Due.DayNumber) * FeePerDay.Value);

    public static bool MayBorrow(IEnumerable<Loan> loans, DateOnly on) =>
        loans.All(loan => loan.Due >= on);
}
