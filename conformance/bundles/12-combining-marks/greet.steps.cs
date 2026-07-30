// C# sibling of greet.steps.ts / .rs (bundle 12-combining-marks).
using Varar;
using Varar.Core;

namespace Varar.Corpus.B12;

public static class GreetSteps
{
    public static void Register(Steps s)
    {
        // One slot: echoing the capture back makes the core compare it against the document,
        // which is what exercises the combining-mark span offsets.
        s.Sensor("I greet {string}", (state, name) => name);
    }

    public static Value State() => Value.Null;
}
