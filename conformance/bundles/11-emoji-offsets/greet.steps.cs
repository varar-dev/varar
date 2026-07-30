// C# sibling of greet.steps.ts / .rs (bundle 11-emoji-offsets).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B11;

public static class GreetSteps
{
    public static void Register(Steps s)
    {
        // The list item is followed by a table, appended as a trailing arg, so this sensor has two
        // slots: {string} and the table. Both are echoed back so the core compares them — the
        // table's data rows only, since the header row is labels and is never compared.
        s.Sensor("I greet {string}", (state, name, table) =>
        {
            var rows = ((VList)table).Items.Skip(1).ToList();
            return Value.List([name, Value.List(rows)]);
        });
    }

    public static Value State() => Value.Null;
}
