// C# sibling of quiet.steps.ts (bundle 17-unexpected-pass).
//
// The example carries an `error` fence, so it asserts a failure. This stimulus
// throws nothing, so the fence inverts into an UnexpectedPassError — the kind no
// bundle exercised before this one.
using Varar;
using Varar.Core;

namespace Varar.Corpus.B17;

public static class QuietSteps
{
    public static void Register(Steps s)
    {
        s.Stimulus("I do nothing at all", state => state);
    }

    public static Value State() => Value.Null;
}
