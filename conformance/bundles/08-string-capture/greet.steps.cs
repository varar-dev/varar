// C# sibling of greet.steps.ts / .rs (bundle 08-string-capture).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B08;

public static class GreetSteps
{
    public static void Register(Steps s)
    {
        s.Stimulus("I greet {string}", (state, name) => null);
    }

    public static Value State() => Value.Null;
}
