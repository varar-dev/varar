// C# sibling of greet.steps.ts / .rs (bundle 12-combining-marks).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B12;

public static class GreetSteps
{
    public static void Register(Steps s)
    {
        s.Sensor("I greet {string}", (state, name) => null);
    }

    public static Value State() => Value.Null;
}
