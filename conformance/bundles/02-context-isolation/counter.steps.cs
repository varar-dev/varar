// C# sibling of counter.steps.ts / .rs (bundle 02-context-isolation).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B02;

public static class CounterSteps
{
    public static void Register(Steps s)
    {
        s.Stimulus("I increment", state => Value.Map([new("count", Value.Of(CountOf(state) + 1))]));

        // One slot ({int}): return the observed count and let the core compare it against the
        // number in the document.
        s.Sensor("The count is {int}", (state, n) => Value.Of(CountOf(state)));
    }

    public static Value State() => Value.Map([new("count", Value.Of(0))]);

    private static long CountOf(Value state) =>
        state is VMap m && m.Entries.TryGetValue("count", out var v) && v is VInt i ? i.Int : 0;
}
