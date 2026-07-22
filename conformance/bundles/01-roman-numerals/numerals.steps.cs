// C# sibling of numerals.steps.ts / .rs (bundle 01-roman-numerals).
// Full-replacement state: the {result} map is the whole state.
using Varar;
using Varar.Core;

namespace Varar.Corpus.B01;

public static class NumeralsSteps
{
    public static void Register(Steps s)
    {
        s.Stimulus("I convert {int} to roman numerals", (state, n) =>
        {
            var roman = Roman(n.AsInt());
            return roman is null ? Value.Map([]) : Value.Map([new("result", Value.Of(roman))]);
        });

        // The trailing "." is matched literally, so {word} captures just the numeral and this
        // sensor returns the observed value for the core to compare.
        s.Sensor("The result is {word}.", (state, expected) => Value.Of(ResultOf(state)));
    }

    public static Value State() => Value.Map([]);

    private static string? Roman(long n) => n switch
    {
        1 => "I",
        4 => "IV",
        9 => "IX",
        40 => "XL",
        _ => null,
    };

    private static string ResultOf(Value state) =>
        state is VMap m && m.Entries.TryGetValue("result", out var v) && v is VString s ? s.Str : string.Empty;
}
