using Varar;
using Varar.Core;

namespace Varar.Example;

public static class DeepThoughtSteps
{
    public static void Register(Steps s)
    {
        s.Sensor("life, the universe and everything is {int}", (state, answer) => Value.Of(42));
    }
}
