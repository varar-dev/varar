using System;
using System.Collections.Immutable;
using System.IO;
using Varar.Config;
using Varar.Core;
using Varar.Runner;
using Xunit;

namespace Varar.Core.Tests;

public class RunnerTests
{
    private static Registry WithdrawReg(bool withStep = true)
    {
        var r = Registry.Create();
        if (withStep)
        {
            r = Registry.AddStep(r, new StepInput("I withdraw {int}", "steps.cs", 1, (_, _) => null, StepKind.Stimulus));
        }

        return r;
    }

    [Theory]
    [InlineData("**/*.steps.cs", "a/b/c.steps.cs", true)]
    [InlineData("**/*.steps.cs", "x.steps.cs", true)]
    [InlineData("**/*.steps.cs", "x.steps.py", false)]
    [InlineData("oaths/**/*.md", "oaths/a/b.md", true)]
    [InlineData("oaths/**/*.md", "docs/a.md", false)]
    [InlineData("*.md", "a.md", true)]
    [InlineData("*.md", "sub/a.md", false)]
    [InlineData("a?c.md", "abc.md", true)]
    [InlineData("a?c.md", "ac.md", false)]
    public void GlobToRegexMatchesSharedSemantics(string pattern, string path, bool expected) =>
        Assert.Equal(expected, Discovery.GlobToRegex(pattern).IsMatch(path));

    [Fact]
    public void MatchOathHonoursIncludeAndExclude()
    {
        var include = ImmutableArray.Create("oaths/**/*.md");
        var exclude = ImmutableArray.Create("oaths/wip/**");
        Assert.True(Discovery.MatchOath("oaths/a.md", include, exclude));
        Assert.False(Discovery.MatchOath("oaths/wip/a.md", include, exclude));
        Assert.False(Discovery.MatchOath("other/a.md", include, exclude));
    }

    [Fact]
    public void FindOathsWalksAndFiltersSortedByPath()
    {
        var root = Path.Combine(Path.GetTempPath(), "varar-find-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root, "oaths", "sub"));
        Directory.CreateDirectory(Path.Combine(root, "oaths", "wip"));
        try
        {
            File.WriteAllText(Path.Combine(root, "oaths", "b.md"), "x");
            File.WriteAllText(Path.Combine(root, "oaths", "sub", "a.md"), "x");
            File.WriteAllText(Path.Combine(root, "oaths", "wip", "draft.md"), "x");
            File.WriteAllText(Path.Combine(root, "oaths", "notes.txt"), "x");

            var config = VarConfig.Empty with
            {
                Docs = new VarGlobs(ImmutableArray.Create("oaths/**/*.md"), ImmutableArray.Create("oaths/wip/**")),
            };
            var oaths = Discovery.FindOaths(config, root)
                .Select(p => Discovery.RelPosix(p, root))
                .ToArray();
            Assert.Equal(new[] { "oaths/b.md", "oaths/sub/a.md" }, oaths);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void FileBaselineStoreRoundTrips()
    {
        var root = Path.Combine(Path.GetTempPath(), "varar-store-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var store = new FileBaselineStore(root);
            Assert.Null(store.Read());
            store.Write("{\n  \"version\": 2\n}\n");
            Assert.Equal("{\n  \"version\": 2\n}\n", store.Read());
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void PlanOathAndRunExamplePassAMatchingExample()
    {
        var plan = Runner.Runner.PlanOath("w.md", "I withdraw 40.", WithdrawReg());
        var failure = Runner.Runner.RunExample(plan, _ => Value.Null, 0);
        Assert.Null(failure);
    }

    [Fact]
    public void ExampleNamesDeduplicateSharedBaseNames()
    {
        // Two examples under the same innermost heading get a [1] suffix on the second. A `---`
        // delimiter keeps them as two examples (ADR 0012 — adjacent matching paragraphs otherwise
        // merge into one).
        var plan = Runner.Runner.PlanOath("w.md", "# Withdrawals\n\nI withdraw 40.\n\n---\n\nI withdraw 10.", WithdrawReg());
        var names = Runner.Runner.ExampleNames(plan);
        Assert.Equal(new[] { "Withdrawals", "Withdrawals[1]" }, names);
    }

    [Fact]
    public void ReconcileDriftPersistsAndDetectsThroughTheFileStore()
    {
        var root = Path.Combine(Path.GetTempPath(), "varar-drift-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            const string source = "I withdraw 40.";
            var doc = Parse.Run("w.md", source);
            var store = new FileBaselineStore(root);

            // First run records the baseline and reports no drift.
            var first = DriftDetection.ReconcileDrift(store, "w.md", source, doc, Runner.Runner.PlanOath("w.md", source, WithdrawReg(true)));
            Assert.Empty(first);
            Assert.True(File.Exists(Path.Combine(root, "varar.lock.json")));

            // The step is gone — same source drifts, and the baseline is preserved on disk.
            var before = store.Read();
            var drifts = DriftDetection.ReconcileDrift(store, "w.md", source, doc, Runner.Runner.PlanOath("w.md", source, WithdrawReg(false)));
            Assert.Single(drifts);
            Assert.Equal("I withdraw 40", drifts[0].Name);
            Assert.Equal(before, store.Read());
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void RenderFailureSummarisesACellMismatch()
    {
        var span = new Span(0, 2, 3, 1, 3, 3);
        var error = new CellMismatchError(ImmutableArray.Create(
            new CellDiff("score", span, "10", "99", false)));
        var rendered = Runner.Runner.RenderFailure(error, "w.md");
        Assert.Contains("Cell mismatch in w.md", rendered);
        Assert.Contains("column 'score'", rendered);
        Assert.Contains("expected: \"10\"", rendered);
        Assert.Contains("actual: \"99\"", rendered);
    }
}
