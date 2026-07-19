// C# sibling of division.steps.ts / .rs (bundle 03-expected-failure).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B03;

public static class DivisionSteps
{
    public static void Register(Steps s)
    {
        s.Stimulus("I divide {int} by {int}", (state, a, b) =>
        {
            var divisor = b is VInt i ? i.Int : 0;
            if (divisor == 0)
            {
                throw new HandlerException("division by zero");
            }

            return state;
        });
    }

    public static Value State() => Value.Null;
}
