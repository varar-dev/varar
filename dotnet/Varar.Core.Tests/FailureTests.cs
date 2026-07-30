using System;
using System.Collections.Immutable;
using System.Linq;
using Varar.Core;
using Xunit;

namespace Varar.Core.Tests;

/// <summary>
/// Port of <c>failure.test.ts</c> + <c>failure-step-span.test.ts</c>. The step-span case is the
/// point of the anchor: a sensor that throws shares its line with a stimulus that passed, so a
/// renderer underlining the line would blame the stimulus too.
/// </summary>
public class FailureTests
{
    private const string Source = "# L\n\nHe asks on June 10, and the library agrees.\n";
    private const string StepText = "the library agrees";

    private static Exception RunFailingExample()
    {
        var r = Registry.Create();
        r = Registry.AddStep(r, new StepInput("asks on June 10", "steps.cs", 1, (_, _) => null, StepKind.Stimulus));
        r = Registry.AddStep(r, new StepInput(
            StepText,
            "steps.cs",
            2,
            (_, _) => throw new InvalidOperationException("expected the library to refuse"),
            StepKind.Sensor));
        var plan = Plan.Run(Parse.Run("l.md", Source), r);
        var failure = Execute.RunExample(plan, plan.Examples[0], _ => Value.Null, []);
        Assert.NotNull(failure);
        return failure!;
    }

    [Fact]
    public void AThrownStepRecordsTheAnchorOfTheStepThatThrew()
    {
        var f = Failures.ToFailure(RunFailingExample(), "l.md", 3);
        Assert.NotNull(f.Anchor);
        Assert.Equal(StepText, Source[f.Anchor!.From..f.Anchor.To]);
        Assert.Equal("expected the library to refuse", f.Message);
    }

    [Fact]
    public void AnExceptionThatNeverPassedThroughAStepHasNoAnchor()
    {
        var f = Failures.ToFailure(new InvalidOperationException("outside"), "l.md", 7);
        Assert.Null(f.Anchor);
        Assert.Null(f.Cells);
        Assert.Equal(7, f.Line);
    }

    [Fact]
    public void OnlyTheFailingCellsAreExtracted()
    {
        const string source = "a | 5 |";
        var cells = ImmutableArray.Create(
            new CellDiff("n", Span.FromOffsets(source, 4, 5), "5", "4", false),
            new CellDiff("ok", Span.FromOffsets(source, 0, 1), "a", "a", true));
        var f = Failures.ToFailure(new CellMismatchError(cells), "oath.md", 3);
        Assert.NotNull(f.Cells);
        Assert.Equal(new CellFailure(4, 5, "4"), Assert.Single(f.Cells!.Value));
    }
}
