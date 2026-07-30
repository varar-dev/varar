using System.Collections.Immutable;
using Microsoft.VisualStudio.TestPlatform.ObjectModel;
using VsTestResult = Microsoft.VisualStudio.TestPlatform.ObjectModel.TestResult;
using Varar;
using Varar.Config;
using Varar.Core;
using Varar.Runner;
using Xunit;

namespace Varar.TestAdapter.Tests;

/// <summary>
/// The VSTest adapter's drift gate (ADR 0002): discovery reconciles every oath against
/// <c>varar.lock.json</c>, a paragraph the baseline recorded as an example that no longer matches
/// any step becomes a failing test, and <c>VARAR_UPDATE=1</c> accepts it instead.
///
/// <para>These tests drive <see cref="VararAdapter"/> through its injected-workspace seam, so they
/// need no built assembly. The end-to-end counterpart — a real <c>dotnet test</c> against
/// <c>examples/csharp-vstest</c> — is the shared adapter smoke contract
/// (<c>conformance/adapter/</c>), which every port's adapter answers to.</para>
///
/// <para>One class on purpose: <c>VARAR_UPDATE</c> is process-global, and xUnit runs the tests
/// within a class sequentially.</para>
/// </summary>
public class DriftGateTests
{
    // A prose paragraph — a candidate the plan never turns into an example. Recording it in the
    // baseline is what a renamed/deleted step definition looks like after the fact, and is the same
    // probe conformance/adapter/smoke.sh injects.
    private const string Prose = "You're really not going to like it.";

    private const string Oath = $"{Prose}\n\nI increment.\n\nThe count is 1.\n";

    private const string OathPath = "varar/w.md";

    [Fact]
    public void DiscoveryRecordsTheBaselineAndReportsNoDrift()
    {
        using var w = new TempWorkspace();

        var cases = w.Discover();

        Assert.Single(cases);
        Assert.Null(DriftMessage(cases[0]));
        Assert.True(File.Exists(w.LockPath), "discovery must record varar.lock.json");
        Assert.Contains(OathPath, w.ReadLock());
    }

    [Fact]
    public void DiscoveryEmitsAFailingTestPerDriftedParagraph()
    {
        using var w = new TempWorkspace();
        w.Discover();
        w.BaselineAlsoClaims(Prose);

        var cases = w.Discover();

        var drift = Assert.Single(cases, c => DriftMessage(c) is not null);
        Assert.Equal("drift: You're really not going to like it", drift.DisplayName);
        Assert.Equal(1, drift.LineNumber);
        Assert.Contains("no longer matches any step (drift)", DriftMessage(drift));
        // The baseline is preserved, not silently overwritten, while the drift stands.
        Assert.Contains(Prose.TrimEnd('.'), w.ReadLock());
    }

    [Fact]
    public void RunFailsADriftedTestCaseWithTheDriftMessage()
    {
        using var w = new TempWorkspace();
        w.Discover();
        w.BaselineAlsoClaims(Prose);
        var drift = w.Discover().Single(c => DriftMessage(c) is not null);

        var reporter = new RecordingReporter();
        VararAdapter.Run([drift], _ => w.Workspace, reporter, null);

        var result = Assert.Single(reporter.Results);
        Assert.Equal(TestOutcome.Failed, result.Outcome);
        Assert.Contains("no longer matches any step (drift)", result.ErrorMessage);
    }

    [Fact]
    public void VararUpdateAcceptsDriftAndReRecordsTheBaseline()
    {
        using var w = new TempWorkspace();
        w.Discover();
        w.BaselineAlsoClaims(Prose);

        Environment.SetEnvironmentVariable("VARAR_UPDATE", "1");
        try
        {
            var cases = w.Discover();

            Assert.DoesNotContain(cases, c => DriftMessage(c) is not null);
            Assert.DoesNotContain(Prose.TrimEnd('.'), w.ReadLock());
        }
        finally
        {
            Environment.SetEnvironmentVariable("VARAR_UPDATE", null);
        }
    }

    [Fact]
    public void ExamplesAreStillDiscoveredAlongsideDrift()
    {
        using var w = new TempWorkspace();
        w.Discover();
        w.BaselineAlsoClaims(Prose);

        var cases = w.Discover();

        // The drift leaf is additive: the real example is still collected and runnable.
        Assert.Equal(2, cases.Count);
        var example = Assert.Single(cases, c => DriftMessage(c) is null);
        var reporter = new RecordingReporter();
        VararAdapter.Run([example], _ => w.Workspace, reporter, null);
        Assert.Equal(TestOutcome.Passed, Assert.Single(reporter.Results).Outcome);
    }

    private static string? DriftMessage(TestCase testCase) =>
        testCase.GetPropertyValue(
            TestProperty.Find("Varar.DriftMessage") ?? throw new InvalidOperationException("property not registered"))
            as string;

    // A throwaway project on disk: varar.config.json + one oath, with the registry built in-process
    // (no assembly to load, which is exactly what the injected workspace seam buys).
    private sealed class TempWorkspace : IDisposable
    {
        private readonly string _root =
            Path.Combine(Path.GetTempPath(), "varar-adapter-" + Guid.NewGuid().ToString("N"));

        public TempWorkspace()
        {
            Directory.CreateDirectory(Path.Combine(_root, "varar"));
            File.WriteAllText(
                Path.Combine(_root, "varar.config.json"),
                """{ "docs": { "include": ["varar/**/*.md"], "exclude": [] } }""");
            File.WriteAllText(Path.Combine(_root, OathPath), Oath);
            Workspace = new VararAdapter.Workspace(_root, ConfigFile.Load(_root), BuildRegistry());
        }

        public VararAdapter.Workspace Workspace { get; }

        public string LockPath => Path.Combine(_root, "varar.lock.json");

        public IReadOnlyList<TestCase> Discover() =>
            [.. VararAdapter.Discover("csharp-vstest.dll", _ => Workspace, null)];

        public string ReadLock() => File.ReadAllText(LockPath);

        /// <summary>
        /// Rewrites the baseline so it also claims <paramref name="paragraph"/> was an example —
        /// the state a renamed or deleted step definition leaves behind.
        /// </summary>
        public void BaselineAlsoClaims(string paragraph)
        {
            var lockFile = DriftDetection.ParseLockFile(ReadLock())
                ?? throw new InvalidOperationException("baseline not recorded");
            var oath = lockFile.Oaths[OathPath];
            var claimed = oath with
            {
                Examples = oath.Examples.Insert(0, new BaselineExample(paragraph.TrimEnd('.'), 1)),
            };
            File.WriteAllText(
                LockPath,
                DriftDetection.StringifyLockFile(new LockFile(2, lockFile.Oaths.SetItem(OathPath, claimed))));
        }

        public void Dispose() => Directory.Delete(_root, recursive: true);

        // Built the way the adapter builds it in production — by folding every
        // `static void Register(Steps)` in an assembly — rather than through Varar's internals.
        private static Registry BuildRegistry() =>
            Runner.Runner.LoadSteps(typeof(CounterSteps).Assembly);
    }

    // A fixture written the way a real *.steps.cs file is: a static void Register(Steps) that
    // folds its definitions into the injected builder.
    internal static class CounterSteps
    {
        public static void Register(Steps s)
        {
            s.State(() => Value.Map([new("count", Value.Of(0))]));
            s.Stimulus("I increment", state => Value.Map([new("count", Value.Of(state["count"].AsInt() + 1))]));
            s.Sensor("The count is {int}", (state, n) => state["count"]);
        }
    }

    private sealed class RecordingReporter : ITestReporter
    {
        private readonly List<VsTestResult> _results = [];

        public ImmutableArray<VsTestResult> Results => [.. _results];

        public void RecordStart(TestCase testCase)
        {
        }

        public void RecordResult(VsTestResult result) => _results.Add(result);

        public void RecordEnd(TestCase testCase, TestOutcome outcome)
        {
        }
    }
}
