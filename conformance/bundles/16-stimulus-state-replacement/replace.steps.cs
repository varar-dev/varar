// C# sibling of replace.steps.ts / replace.steps.rs (bundle 16-stimulus-state-replacement).
//
// The second stimulus returns a map carrying only "b". Under the full-replacement
// contract "a" is therefore gone, and the sensor reads it back as 0.
using Varar;
using Varar.Core;

namespace Varar.Corpus.B16;

public static class ReplaceSteps
{
    public static void Register(Steps s)
    {
        s.Stimulus("I set a to 1 and b to 2", state =>
            Value.Map([new("a", Value.Of(1)), new("b", Value.Of(2))]));

        s.Stimulus("I set only b to 3", state => Value.Map([new("b", Value.Of(3))]));

        s.Sensor("Then a is {int} and b is {int}", (state, a, b) =>
            Value.List([Value.Of(FieldOf(state, "a")), Value.Of(FieldOf(state, "b"))]));
    }

    public static Value State() => Value.Map([new("a", Value.Of(0)), new("b", Value.Of(0))]);

    private static long FieldOf(Value state, string name) =>
        state is VMap m && m.Entries.TryGetValue(name, out var v) && v is VInt i ? i.Int : 0;
}
