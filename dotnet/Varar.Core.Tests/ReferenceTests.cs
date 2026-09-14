using System.Linq;
using Varar.Core;
using Xunit;

namespace Varar.Core.Tests;

// Reuse is a link (ADR 0016): mirrors the reference.test.ts additions.
public class ReferenceTests
{
    private const string Shared = """
        # Shared

        ## Fees are enabled

        Fees are enabled.

        """;

    private static Registry Reg()
    {
        var r = Registry.Create();
        r = Registry.AddStep(r, new StepInput("Fees are enabled", "steps.cs", 1, (_, _) => null, StepKind.Stimulus));
        r = Registry.AddStep(r, new StepInput("Maya borrows {string}", "steps.cs", 2, (_, _) => null, StepKind.Stimulus));
        return r;
    }

    // Plan fees.md against a workspace holding it and shared.md.
    private static ExecutionPlan PlanWith(string main)
    {
        var mainDoc = Parse.Run("fees.md", main);
        var sharedDoc = Parse.Run("shared.md", Shared);
        var workspace = Reference_.BuildWorkspace([mainDoc, sharedDoc]);
        return Plan.Run(mainDoc, Reg(), workspace);
    }

    [Fact]
    public void AnExampleAReferenceOpensIsPlacedAtTheReferenceBlockUnderTheReferringDocumentsHeadings()
    {
        // The spliced steps keep their spans in shared.md; the EXAMPLE lives in fees.md.
        const string main = "# Late fees\n\n[Fees are enabled](./shared.md#fees-are-enabled)\n\nMaya borrows \"Emma\".\n";
        var plan = PlanWith(main);
        Assert.Empty(plan.Diagnostics);
        var ex = Assert.Single(plan.Examples);
        Assert.Equal(new[] { "Late fees" }, ex.ScopeStack);
        Assert.Equal(3, ex.Span.StartLine);
        Assert.Equal(1, ex.Span.StartCol);
        Assert.Equal(5, ex.Span.EndLine);
        Assert.Equal(
            "[Fees are enabled](./shared.md#fees-are-enabled)\n\nMaya borrows \"Emma\".",
            main[ex.Span.StartOffset..ex.Span.EndOffset]);
    }

    [Fact]
    public void AnExampleThatIsNothingButAReferenceSpansTheReferenceBlockAndKeepsTheHostHeadings()
    {
        const string main = "# Late fees\n\n## Invariants\n\n[Fees are enabled](./shared.md#fees-are-enabled)\n";
        var plan = PlanWith(main);
        Assert.Empty(plan.Diagnostics);
        var ex = Assert.Single(plan.Examples);
        Assert.Equal(new[] { "Fees are enabled" }, ex.Steps.Select(s => s.Text).ToArray());
        Assert.Equal(new[] { "Late fees", "Invariants" }, ex.ScopeStack);
        Assert.Equal("shared.md", ex.Steps[0].DocPath);
        Assert.Equal(
            "[Fees are enabled](./shared.md#fees-are-enabled)",
            main[ex.Span.StartOffset..ex.Span.EndOffset]);
    }

    [Fact]
    public void AReferenceMidExampleExtendsTheExampleToTheReferenceBlockNotIntoTheOtherFile()
    {
        const string main = "# Late fees\n\nMaya borrows \"Emma\".\n\n[Fees are enabled](./shared.md#fees-are-enabled)\n";
        var plan = PlanWith(main);
        Assert.Empty(plan.Diagnostics);
        var ex = Assert.Single(plan.Examples);
        Assert.Equal(new[] { "Maya borrows \"Emma\"", "Fees are enabled" }, ex.Steps.Select(s => s.Text).ToArray());
        Assert.Equal(
            "Maya borrows \"Emma\".\n\n[Fees are enabled](./shared.md#fees-are-enabled)",
            main[ex.Span.StartOffset..ex.Span.EndOffset]);
    }

    [Fact]
    public void ALinkThatClimbsAboveTheWorkspaceRootKeepsItsLeadingDotDot()
    {
        // The oath-path convention keeps `../` for an oath outside the root; the resolver must too,
        // or `../../shared/b.md` from `varar/a.md` would land on `shared/b.md`.
        var doc = Parse.Run("varar/a.md", "[Up](../../shared/b.md#setup)\n");
        Assert.Equal("../shared/b.md", Reference_.References(doc)[0].Path);
        var deeper = Parse.Run("../outside/a.md", "[Up](../b.md)\n");
        Assert.Equal("../b.md", Reference_.References(deeper)[0].Path);
    }
}
