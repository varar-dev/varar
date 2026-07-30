// C# sibling of airports.steps.ts / .rs (bundle 13-custom-parameter-type).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B13;

public static class AirportsSteps
{
    public static void Register(Steps s)
    {
        // Custom {airport} parameter type: IATA code, lowercased by parse. The sensor asserts the
        // lowercasing, so an identity parse would fail.
        s.Param("airport", "[A-Z]{3}", g => Value.Of(g[0]!.ToLowerInvariant()));

        s.Stimulus("I fly to {airport}", (state, dest) => Value.Map([new("dest", dest)]));

        // The trailing "." is matched literally, so {word} captures just the code.
        s.Sensor("The destination code is {word}.", (state, expected) => Value.Of(DestOf(state)));
    }

    public static Value State() => Value.Null;

    private static string DestOf(Value state) =>
        state is VMap m && m.Entries.TryGetValue("dest", out var v) && v is VString s ? s.Str : string.Empty;
}
