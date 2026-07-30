using System.Collections.Immutable;
using System.Reflection;
using Microsoft.VisualStudio.TestPlatform.ObjectModel;
using Microsoft.VisualStudio.TestPlatform.ObjectModel.Logging;
using Varar.Config;
using Varar.Core;
using Varar.Runner;
using RunnerApi = Varar.Runner.Runner;

namespace Varar.TestAdapter;

/// <summary>
/// Shared discovery/execution logic for the VSTest adapter (ADR 0009). Discovery keys off the built
/// test assembly plus <c>varar.config.json</c> globs, so one <see cref="TestCase"/> is produced per
/// Markdown example — pointing at the <c>.md</c> source line, not adapter internals.
/// </summary>
internal static class VararAdapter
{
    public const string ExecutorUri = "executor://varar";

    private static readonly TestProperty OathPathProperty = TestProperty.Register(
        "Varar.OathPath", "OathPath", typeof(string), typeof(VararAdapter));

    private static readonly TestProperty ExampleIndexProperty = TestProperty.Register(
        "Varar.ExampleIndex", "ExampleIndex", typeof(int), typeof(VararAdapter));

    /// <summary>
    /// Set on a drift <see cref="TestCase"/> instead of <see cref="ExampleIndexProperty"/>: the
    /// rendered drift message. Its presence is what marks the case as a drift leaf rather than an
    /// example, so <see cref="Run"/> can fail it without re-deriving anything.
    /// </summary>
    private static readonly TestProperty DriftMessageProperty = TestProperty.Register(
        "Varar.DriftMessage", "DriftMessage", typeof(string), typeof(VararAdapter));

    /// <summary>
    /// Discover one test per Markdown example under the assembly's workspace, plus one failing test
    /// per drift finding.
    /// </summary>
    /// <remarks>
    /// Discovery is also where drift is reconciled against <c>varar.lock.json</c> (ADR 0002) — every
    /// path into the executor funnels through here, and VSTest always discovers before it runs. A
    /// clean pass rewrites the baseline; a paragraph the baseline recorded as an example that now
    /// matches no step becomes a failing drift leaf, so the build goes red until the step is fixed
    /// or the drift is accepted with <c>VARAR_UPDATE=1</c>.
    /// </remarks>
    public static IEnumerable<TestCase> Discover(string source, IMessageLogger? logger) =>
        Discover(source, Workspace.Load, logger);

    /// <summary>
    /// <see cref="Discover(string, IMessageLogger?)"/> with the workspace loader injected, so the
    /// discovery + drift-reconciliation logic can be unit-tested over a temp directory instead of a
    /// built assembly. Same seam rationale as <see cref="ITestReporter"/>.
    /// </summary>
    internal static IEnumerable<TestCase> Discover(
        string source, Func<string, Workspace?> loadWorkspace, IMessageLogger? logger)
    {
        Workspace? workspace;
        try
        {
            workspace = loadWorkspace(source);
        }
        catch (Exception e)
        {
            logger?.SendMessage(TestMessageLevel.Warning, $"varar: could not load {source}: {e.Message}");
            yield break;
        }

        if (workspace is null)
        {
            yield break;
        }

        var baselineStore = new FileBaselineStore(workspace.Root);
        bool update = IsUpdate();
        var oaths = Discovery.FindOaths(workspace.Config, workspace.Root).ToList();

        // Drop baselines for oaths the config no longer discovers. Reconciliation is per-oath and
        // never sees a path that has gone, so the lock would otherwise accumulate dead entries
        // forever (#70). Once per discovery, keyed off the config globs — which here IS the full
        // set, since VSTest filters the discovered test cases, not the discovery itself.
        DriftDetection.PruneBaselines(
            baselineStore,
            [.. oaths.Select(oath => Discovery.RelPosix(oath, workspace.Root))],
            update);

        foreach (var oath in oaths)
        {
            var relName = Discovery.RelPosix(oath, workspace.Root);
            string text;
            Doc doc;
            ExecutionPlan plan;
            try
            {
                text = File.ReadAllText(oath);
                doc = Parse.Run(relName, text);
                plan = Plan.Run(doc, workspace.Registry);
            }
            catch (Exception e)
            {
                logger?.SendMessage(TestMessageLevel.Warning, $"varar: could not plan {relName}: {e.Message}");
                continue;
            }

            for (int i = 0; i < plan.Examples.Length; i++)
            {
                var ex = plan.Examples[i];
                var testCase = new TestCase($"{relName}::{ex.Name}", new Uri(ExecutorUri), source)
                {
                    DisplayName = ex.Name,
                    CodeFilePath = oath,
                    LineNumber = ex.Span.StartLine,
                };
                testCase.SetPropertyValue(OathPathProperty, relName);
                testCase.SetPropertyValue(ExampleIndexProperty, i);
                yield return testCase;
            }

            ImmutableArray<Drift> drifts;
            try
            {
                drifts = DriftDetection.ReconcileDrift(baselineStore, relName, text, doc, plan, update);
            }
            catch (Exception e)
            {
                logger?.SendMessage(TestMessageLevel.Warning, $"varar: could not reconcile {relName}: {e.Message}");
                continue;
            }

            foreach (var drift in drifts)
            {
                var testCase = new TestCase($"{relName}::varar:drift:{drift.Line}", new Uri(ExecutorUri), source)
                {
                    DisplayName = $"drift: {drift.Name}",
                    CodeFilePath = oath,
                    LineNumber = drift.Line,
                };
                testCase.SetPropertyValue(OathPathProperty, relName);
                testCase.SetPropertyValue(
                    DriftMessageProperty,
                    Diagnostics.DriftDetected(drift.Name, drift.Span).Message);
                yield return testCase;
            }
        }
    }

    /// <summary>
    /// Whether drift should be accepted and re-recorded instead of failing the run —
    /// <c>VARAR_UPDATE=1</c>/<c>true</c>, the same switch every other port honours.
    /// </summary>
    private static bool IsUpdate() =>
        Environment.GetEnvironmentVariable("VARAR_UPDATE") is "1" or "true";

    /// <summary>Execute the given test cases, grouped by source, reporting one result each.</summary>
    public static void Run(IEnumerable<TestCase> tests, ITestReporter reporter, IMessageLogger? logger) =>
        Run(tests, Workspace.Load, reporter, logger);

    /// <summary>
    /// <see cref="Run(IEnumerable{TestCase}, ITestReporter, IMessageLogger?)"/> with the workspace
    /// loader injected — the unit-testable counterpart, paired with <see cref="ITestReporter"/>.
    /// </summary>
    internal static void Run(
        IEnumerable<TestCase> tests,
        Func<string, Workspace?> loadWorkspace,
        ITestReporter reporter,
        IMessageLogger? logger)
    {
        foreach (var bySource in tests.GroupBy(t => t.Source))
        {
            Workspace? workspace;
            try
            {
                workspace = loadWorkspace(bySource.Key);
            }
            catch (Exception e)
            {
                logger?.SendMessage(TestMessageLevel.Warning, $"varar: could not load {bySource.Key}: {e.Message}");
                continue;
            }

            if (workspace is null)
            {
                continue;
            }

            var registry = workspace.Registry;
            var planCache = new Dictionary<string, ExecutionPlan>(StringComparer.Ordinal);
            // Run results for the language server (ADR 0014). VSTest reports test by test with no
            // end-of-run hook, so results accumulate here and are written once this source's
            // test cases are done.
            var results = new Results();
            var sourceCache = new Dictionary<string, string>(StringComparer.Ordinal);
            Value CreateContext(string file) =>
                registry.ContextFactories.TryGetValue(file, out var factory) ? factory() : Value.Null;

            foreach (var testCase in bySource)
            {
                var oathPath = testCase.GetPropertyValue(OathPathProperty) as string;

                // A drift leaf carries its message instead of an example index, and always fails —
                // the build stays red until the step is fixed or the drift is accepted (ADR 0002).
                if (testCase.GetPropertyValue(DriftMessageProperty) is string driftMessage)
                {
                    reporter.RecordStart(testCase);
                    var driftResult = new TestResult(testCase)
                    {
                        Outcome = TestOutcome.Failed,
                        ErrorMessage = driftMessage,
                    };
                    reporter.RecordResult(driftResult);
                    reporter.RecordEnd(testCase, driftResult.Outcome);
                    continue;
                }

                int index = testCase.GetPropertyValue(ExampleIndexProperty, -1);
                if (oathPath is null || index < 0)
                {
                    continue;
                }

                reporter.RecordStart(testCase);
                var result = new TestResult(testCase);
                try
                {
                    if (!planCache.TryGetValue(oathPath, out var plan))
                    {
                        plan = RunnerApi.PlanOath(oathPath, File.ReadAllText(Path.Combine(workspace.Root, oathPath)), workspace.Registry);
                        planCache[oathPath] = plan;
                    }

                    var example = plan.Examples[index];
                    var lines = example.Steps.Select(step => step.MatchSpan.StartLine).Distinct().ToImmutableArray();
                    var source = sourceCache.TryGetValue(oathPath, out var cached)
                        ? cached
                        : sourceCache[oathPath] = File.ReadAllText(Path.Combine(workspace.Root, oathPath));

                    var failure = RunnerApi.RunExample(plan, CreateContext, index);
                    if (failure is null)
                    {
                        result.Outcome = TestOutcome.Passed;
                        results.Record(oathPath, source, new ExampleResult(example.Name, ExampleStatus.Passed, lines));
                    }
                    else
                    {
                        result.Outcome = TestOutcome.Failed;
                        result.ErrorMessage = RunnerApi.RenderFailure(failure, oathPath);
                        // Recorded from the exception itself: Failures.ToFailure reads the anchor
                        // the executor attached to it, so an editor underlines the failing step.
                        results.Record(
                            oathPath,
                            source,
                            new ExampleResult(
                                example.Name,
                                ExampleStatus.Failed,
                                lines,
                                Failures.ToFailure(failure, oathPath, lines.Length > 0 ? lines[0] : 0)));
                    }
                }
                catch (Exception e)
                {
                    result.Outcome = TestOutcome.Failed;
                    result.ErrorMessage = e.Message;
                }

                reporter.RecordResult(result);
                reporter.RecordEnd(testCase, result.Outcome);
            }

            results.FlushAll(workspace.Root);
        }
    }

    /// <summary>The built test assembly plus its workspace root (nearest <c>varar.config.json</c>) and registry.</summary>
    internal sealed class Workspace
    {
        internal Workspace(string root, ParsedConfig config, Registry registry)
        {
            Root = root;
            Config = config;
            Registry = registry;
        }

        public string Root { get; }

        public ParsedConfig Config { get; }

        public Registry Registry { get; }

        public static Workspace? Load(string source)
        {
            var root = FindRoot(Path.GetDirectoryName(Path.GetFullPath(source)));
            if (root is null)
            {
                return null;
            }

            var assembly = Assembly.LoadFrom(source);
            return new Workspace(root, ConfigFile.Load(root), RunnerApi.LoadSteps(assembly));
        }

        private static string? FindRoot(string? start)
        {
            var dir = start;
            while (dir is not null)
            {
                if (File.Exists(Path.Combine(dir, "varar.config.json")))
                {
                    return dir;
                }

                dir = Path.GetDirectoryName(dir);
            }

            return null;
        }
    }
}

/// <summary>The subset of the framework handle the adapter needs — lets the run logic be unit-tested.</summary>
internal interface ITestReporter
{
    void RecordStart(TestCase testCase);

    void RecordResult(TestResult result);

    void RecordEnd(TestCase testCase, TestOutcome outcome);
}
