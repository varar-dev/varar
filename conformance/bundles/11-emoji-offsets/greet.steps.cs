// C# sibling of greet.steps.ts / .rs (bundle 11-emoji-offsets).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B11;

public static class GreetSteps
{
    public static void Register(Steps s)
    {
        // The list item is followed by a table, appended as a trailing arg, so this sensor's slots
        // are {string} + the table (returns nothing → passes).
        s.Sensor("I greet {string}", (state, name, table) => null);
    }

    public static Value State() => Value.Null;
}
