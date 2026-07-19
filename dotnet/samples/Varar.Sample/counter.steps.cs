using Varar;
using Varar.Core;

namespace Varar.Sample;

// A sample step file: a static Register(Registry) is the injected-Registrar entry point the
// adapter discovers by reflection; DefineState threads the initial state into the registry.
public static class CounterSteps
{
    public static Registry Register(Registry r)
    {
        var s = Steps.From(r);
        s.DefineState(() => Value.Map([new("count", Value.Of(0))]));
        s.Stimulus("I increment", state => Value.Map([new("count", Value.Of(state["count"].AsInt() + 1))]));
        s.Sensor("The count is {int}", (state, n) =>
        {
            var count = state["count"].AsInt();
            var expected = n.AsInt();
            if (count != expected)
            {
                throw new HandlerException($"expected {expected} but got {count}");
            }

            return null;
        });
        return s.ToRegistry();
    }
}
