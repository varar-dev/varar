// C# sibling of cukes.steps.ts / .rs (bundle 05-ambiguous-match).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B05;

public static class CukesSteps
{
    public static void Register(Steps s)
    {
        // Both expressions match "I have 5 cukes" → ambiguous-match diagnostic.
        s.Stimulus("I have {int} cukes", (state, n) => null);
        s.Stimulus("I have 5 cukes", state => null);
    }

    public static Value State() => Value.Null;
}
