using Varar.Core;
using Xunit;

namespace Varar.Core.Tests;

// Translated from step-role.ts intent.
public class StepRoleTests
{
    [Fact]
    public void AStepWithNothingAfterItIsASensor()
    {
        Assert.Equal(StepKind.Sensor, StepRole.InferStepRole([StepKind.Stimulus], []));
    }

    [Fact]
    public void AStepFollowedByOthersIsAStimulus()
    {
        Assert.Equal(StepKind.Stimulus, StepRole.InferStepRole([], [StepKind.Sensor]));
    }

    [Fact]
    public void WireTokensMatchTheReference()
    {
        Assert.Equal("stimulus", StepKind.Stimulus.ToWire());
        Assert.Equal("sensor", StepKind.Sensor.ToWire());
    }
}
