using Varar.Core;
using Xunit;

namespace Varar.Core.Tests;

// Translated from registry.test.ts. The runtime-match assertion is deferred to the
// matcher (T5): the .NET cucumber-expressions package exposes .Regex, not a Match()
// returning arguments, so matching is built in var's own matcher, not here.
public class RegistryTests
{
    private static StepHandler NoOp => (_, _) => null;

    [Fact]
    public void CreateReturnsAnEmptyRegistryWithDefaultParameterTypes()
    {
        var r = Registry.Create();
        Assert.Empty(r.Steps);
        Assert.NotNull(r.ParameterTypes.LookupByTypeName("int"));
        Assert.NotNull(r.ParameterTypes.LookupByTypeName("string"));
        // Varar's own built-in Markdown emphasis type.
        Assert.NotNull(r.ParameterTypes.LookupByTypeName("emph"));
        Assert.Null(r.ParameterTypes.LookupByTypeName("airport"));
    }

    [Fact]
    public void EmphIsABuiltInAndCompilingItSucceeds()
    {
        // {emph} needs no declaration — it is seeded into every registry.
        var ex = Record.Exception(() =>
            Registry.AddStep(Registry.Create(), new StepInput("I mention {emph}", "steps.cs", 1, NoOp)));
        Assert.Null(ex);
        // Built-ins are not recorded as custom parameter types (so they never
        // leak into the conformance registry goldens).
        Assert.Empty(Registry.Create().CustomParameterTypes);
    }

    [Fact]
    public void AddStepReturnsANewRegistryLeavingTheOriginalUnchanged()
    {
        var r0 = Registry.Create();
        var r1 = Registry.AddStep(r0, new StepInput("I have {int} cukes", "steps.cs", 1, NoOp));
        Assert.Empty(r0.Steps);
        Assert.Single(r1.Steps);
        Assert.Equal("I have {int} cukes", r1.Steps[0].Expression);
    }

    [Fact]
    public void DefineParameterTypeMakesACustomTypeAvailableToSubsequentCompilations()
    {
        var r = Registry.Create();
        r = Registry.DefineParameterType(r, new ParameterTypeInput("airport", "[A-Z]{3}"));

        // Compiling {airport} must now succeed (no UndefinedParameterTypeException).
        var ex = Record.Exception(() =>
            Registry.AddStep(r, new StepInput("I fly to {airport}", "steps.cs", 1, NoOp)));
        Assert.Null(ex);
    }

    [Fact]
    public void DefineParameterTypeRecordsTheCustomTypeForProjection()
    {
        var r = Registry.Create();
        r = Registry.DefineParameterType(r, new ParameterTypeInput("airport", "[A-Z]{3}"));
        Assert.Equal(new CustomParameterType("airport", "[A-Z]{3}"), Assert.Single(r.CustomParameterTypes));
    }

    [Fact]
    public void AddStepThrowsOnDuplicateExpressionsListingBothSourcePositions()
    {
        var r = Registry.AddStep(Registry.Create(), new StepInput("I have {int} cukes", "a.cs", 3, NoOp));
        var ex = Assert.Throws<InvalidOperationException>(() =>
            Registry.AddStep(r, new StepInput("I have {int} cukes", "b.cs", 9, NoOp)));
        Assert.Contains("duplicate step definition", ex.Message);
        Assert.Contains("a.cs:3", ex.Message);
        Assert.Contains("b.cs:9", ex.Message);
    }

    [Fact]
    public void AddStepCarriesTheStepKindThroughToTheRegistration()
    {
        var r = Registry.AddStep(
            Registry.Create(),
            new StepInput("I greet {string}", "a.steps.cs", 1, NoOp, StepKind.Sensor));
        Assert.Equal(StepKind.Sensor, r.Steps[0].Kind);
    }

    [Fact]
    public void KindIsOptional()
    {
        var r = Registry.AddStep(Registry.Create(), new StepInput("I greet {string}", "a.steps.cs", 1, NoOp));
        Assert.Null(r.Steps[0].Kind);
    }
}
