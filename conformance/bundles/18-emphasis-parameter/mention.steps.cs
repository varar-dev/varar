// C# sibling of mention.steps.ts (bundle 18-emphasis-parameter). {emph} is a
// built-in parameter type (Markdown emphasis); matching is what conformance pins.
using Varar;
using Varar.Core;

namespace Varar.Corpus.B18;

public static class MentionSteps
{
    public static void Register(Steps s)
    {
        s.Stimulus("I mention {emph}", (state, text) => null);
    }

    public static Value State() => Value.Null;
}
