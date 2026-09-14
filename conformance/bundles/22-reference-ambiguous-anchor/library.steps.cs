// C# sibling of library.steps.ts / .rs (bundle 22-reference-ambiguous-anchor).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B22;

public static class LibrarySteps
{
    public static void Register(Steps s)
    {
        s.Stimulus(
            "I shelve {int} books",
            (state, n) => Value.Map([new("shelf", Value.Of(ShelfOf(state) + AsLong(n)))]));

        s.Stimulus(
            "I borrow a book",
            state => Value.Map([new("shelf", Value.Of(ShelfOf(state) - 1))]));

        s.Sensor("The shelf holds {int} books", (state, n) => Value.Of(ShelfOf(state)));
    }

    public static Value State() => Value.Map([new("shelf", Value.Of(0))]);

    private static long ShelfOf(Value state) =>
        state is VMap m && m.Entries.TryGetValue("shelf", out var v) && v is VInt i ? i.Int : 0;

    private static long AsLong(Value v) => v is VInt i ? i.Int : 0;
}
