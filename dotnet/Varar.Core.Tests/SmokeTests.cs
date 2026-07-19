using Varar.Core;
using Xunit;

namespace Varar.Core.Tests;

public class SmokeTests
{
    [Fact]
    public void CoreAssembly_IsWired()
    {
        Assert.Equal("varar-core", Build.Marker);
    }
}
