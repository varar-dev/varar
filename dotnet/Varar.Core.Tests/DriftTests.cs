using System;
using System.Collections.Immutable;
using System.Linq;
using Varar.Core;
using Xunit;

namespace Varar.Core.Tests;

// Translated from drift.test.ts (the unit gate for the drift feature).
public class DriftTests
{
    private sealed class MemoryStore : IBaselineStore
    {
        public string? Contents;

        public MemoryStore(string? initial = null) => Contents = initial;

        public string? Read() => Contents;

        public void Write(string contents) => Contents = contents;
    }

    private static Registry Reg(bool withStep = true)
    {
        var r = Registry.Create();
        if (withStep)
        {
            r = Registry.AddStep(r, new StepInput("I withdraw {int}", "steps.cs", 1, (_, _) => null, StepKind.Stimulus));
        }

        return r;
    }

    private static Registry RomanReg(bool withStep = true)
    {
        var r = Registry.Create();
        if (withStep)
        {
            r = Registry.AddStep(r, new StepInput("a decimal and a roman number", "steps.cs", 1, (_, _) => null, StepKind.Sensor));
        }

        return r;
    }

    private static Registry DepositWithdrawReg(bool withDeposit = true)
    {
        var r = Registry.Create();
        if (withDeposit)
        {
            r = Registry.AddStep(r, new StepInput("I deposit {int}", "steps.cs", 1, (_, _) => null, StepKind.Stimulus));
        }

        r = Registry.AddStep(r, new StepInput("I withdraw {int}", "steps.cs", 2, (_, _) => null, StepKind.Stimulus));
        return r;
    }

    private static (string Name, int Line)[] Bare(ImmutableArray<Drift> drifts) =>
        drifts.Select(d => (d.Name, d.Line)).ToArray();

    private static ImmutableArray<Drift> DetectFor(string source, Registry baselineReg, Registry currentReg)
    {
        var doc = Parse.Run("w.md", source);
        var baseline = DriftDetection.DeriveOathBaseline(source, doc, Plan.Run(doc, baselineReg));
        return DriftDetection.DetectDrift(baseline, doc, Plan.Run(doc, currentReg));
    }

    [Fact]
    public void LiveExamplesRecordsOneEntryPerExampleProducingParagraph()
    {
        var doc = Parse.Run("w.md", "I withdraw 40.");
        var examples = DriftDetection.LiveExamples(doc, Plan.Run(doc, Reg()));
        Assert.Equal(new[] { new BaselineExample("I withdraw 40", 1) }, examples);
    }

    [Fact]
    public void ANeverMatchedParagraphIsNotRecorded()
    {
        var doc = Parse.Run("w.md", "Just some prose.");
        Assert.Empty(DriftDetection.LiveExamples(doc, Plan.Run(doc, Reg())));
    }

    [Fact]
    public void DeriveOathBaselineCarriesTheSourceFingerprint()
    {
        const string source = "I withdraw 40.";
        var doc = Parse.Run("w.md", source);
        var baseline = DriftDetection.DeriveOathBaseline(source, doc, Plan.Run(doc, Reg()));
        Assert.Equal(Hash.HashSource(source), baseline.SourceHash);
        Assert.Equal(new[] { new BaselineExample("I withdraw 40", 1) }, baseline.Examples);
    }

    [Fact]
    public void NoBaselineMeansNoDrift()
    {
        var doc = Parse.Run("w.md", "I withdraw 40.");
        Assert.Empty(DriftDetection.DetectDrift(null, doc, Plan.Run(doc, Reg())));
    }

    [Fact]
    public void AnUnchangedOathHasNoDrift() =>
        Assert.Empty(DetectFor("I withdraw 40.", Reg(), Reg()));

    [Fact]
    public void ARenamedStepDefinitionDrifts() =>
        Assert.Equal(new[] { ("I withdraw 40", 1) }, Bare(DetectFor("I withdraw 40.", Reg(true), Reg(false))));

    [Fact]
    public void AnInPlaceTypoDrifts()
    {
        var beforeDoc = Parse.Run("w.md", "I withdraw 40.");
        var baseline = DriftDetection.DeriveOathBaseline("I withdraw 40.", beforeDoc, Plan.Run(beforeDoc, Reg()));
        var afterDoc = Parse.Run("w.md", "I withdrraw 40.");
        var drift = DriftDetection.DetectDrift(baseline, afterDoc, Plan.Run(afterDoc, Reg()));
        Assert.Equal(new[] { ("I withdraw 40", 1) }, Bare(drift));
    }

    [Fact]
    public void ADeletedParagraphIsNotDrift()
    {
        var beforeDoc = Parse.Run("w.md", "I withdraw 40.");
        var baseline = DriftDetection.DeriveOathBaseline("I withdraw 40.", beforeDoc, Plan.Run(beforeDoc, Reg()));
        var afterDoc = Parse.Run("w.md", string.Empty);
        Assert.Empty(DriftDetection.DetectDrift(baseline, afterDoc, Plan.Run(afterDoc, Reg())));
    }

    [Fact]
    public void ANewProseParagraphIsNotDrift()
    {
        var beforeDoc = Parse.Run("w.md", "I withdraw 40.");
        var baseline = DriftDetection.DeriveOathBaseline("I withdraw 40.", beforeDoc, Plan.Run(beforeDoc, Reg()));
        var afterDoc = Parse.Run("w.md", "I withdraw 40.\n\nSome new narration.");
        Assert.Empty(DriftDetection.DetectDrift(baseline, afterDoc, Plan.Run(afterDoc, Reg())));
    }

    [Fact]
    public void MovingAnExampleNeverDrifts()
    {
        var beforeDoc = Parse.Run("w.md", "I withdraw 40.\n\nI withdraw 10.");
        var baseline = DriftDetection.DeriveOathBaseline("I withdraw 40.\n\nI withdraw 10.", beforeDoc, Plan.Run(beforeDoc, Reg()));
        var afterDoc = Parse.Run("w.md", "I withdraw 10.\n\nI withdraw 40.");
        Assert.Empty(DriftDetection.DetectDrift(baseline, afterDoc, Plan.Run(afterDoc, Reg())));
    }

    [Fact]
    public void MovingAndRewordingAStillMatchingExampleDoesNotDrift()
    {
        var beforeDoc = Parse.Run("w.md", "I withdraw 40.\n\nI withdraw 10.");
        var baseline = DriftDetection.DeriveOathBaseline("I withdraw 40.\n\nI withdraw 10.", beforeDoc, Plan.Run(beforeDoc, Reg()));
        var afterDoc = Parse.Run("w.md", "I withdraw 11.\n\nI withdraw 40.");
        Assert.Empty(DriftDetection.DetectDrift(baseline, afterDoc, Plan.Run(afterDoc, Reg())));
    }

    [Fact]
    public void MoveRewordAndProseOnOldLineDoesNotFalsePositive()
    {
        var beforeDoc = Parse.Run("w.md", "I withdraw 40.");
        var baseline = DriftDetection.DeriveOathBaseline("I withdraw 40.", beforeDoc, Plan.Run(beforeDoc, Reg()));
        var afterDoc = Parse.Run("w.md", "Just some notes.\n\nI withdraw 41.");
        Assert.Empty(DriftDetection.DetectDrift(baseline, afterDoc, Plan.Run(afterDoc, Reg())));
    }

    [Fact]
    public void AParagraphRewrittenPastRecognitionIsNotDrift()
    {
        var beforeDoc = Parse.Run("w.md", "I withdraw 40.");
        var baseline = DriftDetection.DeriveOathBaseline("I withdraw 40.", beforeDoc, Plan.Run(beforeDoc, Reg()));
        var afterDoc = Parse.Run("w.md", "The branch closed years ago.");
        Assert.Empty(DriftDetection.DetectDrift(baseline, afterDoc, Plan.Run(afterDoc, Reg())));
    }

    [Fact]
    public void AHeaderBoundTableRecordsItsBindingParagraphOnce()
    {
        const string source = "Each row gives a decimal and a roman number:\n\n| decimal | roman |\n| ------: | :---- |\n| 3 | III |\n| 9 | IX |\n";
        var doc = Parse.Run("r.md", source);
        var examples = DriftDetection.LiveExamples(doc, Plan.Run(doc, RomanReg()));
        Assert.Equal(new[] { new BaselineExample("Each row gives a decimal and a roman number:", 1) }, examples);
    }

    [Fact]
    public void AHeaderBoundBindingParagraphThatStopsMatchingDrifts()
    {
        const string source = "Each row gives a decimal and a roman number:\n\n| decimal | roman |\n| ------: | :---- |\n| 3 | III |\n| 9 | IX |\n";
        var doc = Parse.Run("r.md", source);
        var baseline = DriftDetection.DeriveOathBaseline(source, doc, Plan.Run(doc, RomanReg(true)));
        var drift = DriftDetection.DetectDrift(baseline, doc, Plan.Run(doc, RomanReg(false)));
        Assert.Equal(new[] { ("Each row gives a decimal and a roman number:", 1) }, Bare(drift));
    }

    [Fact]
    public void ADriftCarriesTheDriftedParagraphSpan()
    {
        const string source = "Some prose first.\n\nI withdraw 40.";
        var doc = Parse.Run("w.md", source);
        var baseline = DriftDetection.DeriveOathBaseline(source, doc, Plan.Run(doc, Reg(true)));
        var drift = DriftDetection.DetectDrift(baseline, doc, Plan.Run(doc, Reg(false)))[0];
        Assert.Equal(3, drift.Line);
        Assert.Equal(3, drift.Span.StartLine);
        Assert.Equal("I withdraw 40.", source.Substring(drift.Span.StartOffset, drift.Span.EndOffset - drift.Span.StartOffset));
    }

    [Fact]
    public void DriftDiagnosticsProjectsOntoErrorSeverity()
    {
        var drifts = DetectFor("I withdraw 40.", Reg(true), Reg(false));
        var diags = DriftDetection.DriftDiagnostics(drifts);
        var diag = Assert.Single(diags);
        Assert.Equal(Severity.Error, diag.Severity);
        Assert.Equal(DiagnosticCode.Drift, diag.Code);
        Assert.Contains("I withdraw 40", diag.Message);
        Assert.Equal(1, diag.Span.StartLine);
    }

    [Fact]
    public void ReconcileDriftRecordsABaselineOnFirstRunAndReportsNoDrift()
    {
        const string source = "I withdraw 40.";
        var doc = Parse.Run("w.md", source);
        var store = new MemoryStore();
        var drifts = DriftDetection.ReconcileDrift(store, "w.md", source, doc, Plan.Run(doc, Reg()));
        Assert.Empty(drifts);
        var lockFile = DriftDetection.ParseLockFile(store.Contents ?? string.Empty);
        Assert.Equal(new[] { new BaselineExample("I withdraw 40", 1) }, lockFile!.Oaths["w.md"].Examples);
    }

    [Fact]
    public void ReconcileDriftReportsDriftAndPreservesTheBaseline()
    {
        const string source = "I withdraw 40.";
        var doc = Parse.Run("w.md", source);
        var store = new MemoryStore();
        DriftDetection.ReconcileDrift(store, "w.md", source, doc, Plan.Run(doc, Reg(true)));
        var before = store.Contents;
        var drifts = DriftDetection.ReconcileDrift(store, "w.md", source, doc, Plan.Run(doc, Reg(false)));
        Assert.Equal(new[] { ("I withdraw 40", 1) }, Bare(drifts));
        Assert.Equal(before, store.Contents); // baseline untouched while drift is unacknowledged
    }

    [Fact]
    public void ReconcileDriftInUpdateModeAcceptsDriftAndReRecords()
    {
        const string source = "I withdraw 40.";
        var doc = Parse.Run("w.md", source);
        var store = new MemoryStore();
        DriftDetection.ReconcileDrift(store, "w.md", source, doc, Plan.Run(doc, Reg(true)));
        var drifts = DriftDetection.ReconcileDrift(store, "w.md", source, doc, Plan.Run(doc, Reg(false)), update: true);
        Assert.Empty(drifts);
        Assert.Empty(DriftDetection.ParseLockFile(store.Contents ?? string.Empty)!.Oaths["w.md"].Examples);
    }

    [Fact]
    public void ParseLockFileRoundTripsAValidLock()
    {
        var lockFile = new LockFile(2, ImmutableDictionary<string, OathBaseline>.Empty
            .SetItem("library.md", new OathBaseline("fnv1a:1a2b3c4d", ImmutableArray.Create(new BaselineExample("I check out", 7)))));
        var parsed = DriftDetection.ParseLockFile(DriftDetection.StringifyLockFile(lockFile));
        Assert.NotNull(parsed);
        Assert.Equal(DriftDetection.StringifyLockFile(lockFile), DriftDetection.StringifyLockFile(parsed!));
    }

    [Fact]
    public void StringifyLockFileSortsOathPaths()
    {
        var lockFile = new LockFile(2, ImmutableDictionary<string, OathBaseline>.Empty
            .SetItem("zebra.md", new OathBaseline("fnv1a:00000001", ImmutableArray<BaselineExample>.Empty))
            .SetItem("alpha.md", new OathBaseline("fnv1a:00000002", ImmutableArray<BaselineExample>.Empty)));
        var text = DriftDetection.StringifyLockFile(lockFile);
        Assert.True(text.IndexOf("alpha.md", StringComparison.Ordinal) < text.IndexOf("zebra.md", StringComparison.Ordinal));
        Assert.EndsWith("}\n", text);
    }

    // ---- Merged examples keep per-paragraph drift granularity (ADR 0012) ----

    [Fact]
    public void TwoParagraphsThatMergeIntoOneExampleAreEachRecordedAsALiveBaselineEntry()
    {
        const string source = "I deposit 100.\n\nI withdraw 40.";
        var doc = Parse.Run("w.md", source);
        var plan = Plan.Run(doc, DepositWithdrawReg());

        // One planned example (the two paragraphs merged), but two live entries.
        Assert.Single(plan.Examples);
        Assert.Equal(
            new[] { new BaselineExample("I deposit 100", 1), new BaselineExample("I withdraw 40", 3) },
            DriftDetection.LiveExamples(doc, plan));
    }

    [Fact]
    public void DeletingOneStepDefOfAMergedExampleDriftsOnlyTheNowProseParagraph()
    {
        const string source = "I deposit 100.\n\nI withdraw 40.";
        var doc = Parse.Run("w.md", source);
        var baseline = DriftDetection.DeriveOathBaseline(source, doc, Plan.Run(doc, DepositWithdrawReg(true)));

        // The deposit step is gone: its paragraph becomes prose, splitting the example. The withdraw
        // paragraph is still live; the deposit one drifts.
        var drift = DriftDetection.DetectDrift(baseline, doc, Plan.Run(doc, DepositWithdrawReg(false)));
        Assert.Equal(new[] { ("I deposit 100", 1) }, Bare(drift));
    }

    [Fact]
    public void ParseLockFileRejectsMalformedInput()
    {
        Assert.Null(DriftDetection.ParseLockFile("not json"));
        Assert.Null(DriftDetection.ParseLockFile("{}"));
        Assert.Null(DriftDetection.ParseLockFile("{\"version\":1,\"oaths\":{}}"));
        Assert.Null(DriftDetection.ParseLockFile("{\"version\":2,\"specs\":{}}"));
        Assert.Null(DriftDetection.ParseLockFile("{\"version\":2,\"oaths\":{\"a.md\":{\"examples\":[]}}}"));
    }

    // ---- Pruning baselines for oaths that no longer exist (#70) ----

    // A lock carrying two oaths, one of which the docs globs no longer match — the
    // state a deleted or moved .md leaves behind.
    private static string LockWithStalePath()
    {
        const string source = "I withdraw 40.";
        var doc = Parse.Run("w.md", source);
        var baseline = DriftDetection.DeriveOathBaseline(source, doc, Plan.Run(doc, Reg()));
        return DriftDetection.StringifyLockFile(new LockFile(
            2,
            ImmutableDictionary<string, OathBaseline>.Empty
                .Add("varar/w.md", baseline)
                .Add("w.md", baseline)));
    }

    [Fact]
    public void PruneLockFileKeepsOnlyThePathsItIsGiven()
    {
        var lockFile = DriftDetection.ParseLockFile(LockWithStalePath())!;
        var pruned = DriftDetection.PruneLockFile(lockFile, ["varar/w.md"]);
        Assert.Equal(["varar/w.md"], pruned.Oaths.Keys.OrderBy(k => k, StringComparer.Ordinal));
    }

    [Fact]
    public void PruneReportsStalePathsWithoutUpdateAndDoesNotWrite()
    {
        var store = new MemoryStore(LockWithStalePath());
        var before = store.Contents;

        Assert.Equal(["w.md"], DriftDetection.PruneBaselines(store, ["varar/w.md"]));
        // Reporting is not deleting: nothing is removed behind the author's back.
        Assert.Equal(before, store.Contents);
    }

    [Fact]
    public void PruneDropsStalePathsUnderUpdate()
    {
        var store = new MemoryStore(LockWithStalePath());

        Assert.Equal(["w.md"], DriftDetection.PruneBaselines(store, ["varar/w.md"], update: true));
        var lockFile = DriftDetection.ParseLockFile(store.Contents!)!;
        Assert.Equal(["varar/w.md"], lockFile.Oaths.Keys);
    }

    [Fact]
    public void PruneLeavesALockWithNoStalePathsUntouched()
    {
        var store = new MemoryStore(LockWithStalePath());
        var before = store.Contents;

        Assert.Empty(DriftDetection.PruneBaselines(store, ["varar/w.md", "w.md"], update: true));
        // Byte-identical, not merely equivalent — an unnecessary rewrite would show
        // up as a spurious diff in every consumer's working tree.
        Assert.Equal(before, store.Contents);
    }

    [Fact]
    public void PruneIsANoOpWhenThereIsNoBaselineYet()
    {
        var store = new MemoryStore();
        Assert.Empty(DriftDetection.PruneBaselines(store, ["varar/w.md"], update: true));
        Assert.Null(store.Contents);
    }
}
