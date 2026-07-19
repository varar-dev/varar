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

    private static readonly TestProperty SpecPathProperty = TestProperty.Register(
        "Varar.SpecPath", "SpecPath", typeof(string), typeof(VararAdapter));

    private static readonly TestProperty ExampleIndexProperty = TestProperty.Register(
        "Varar.ExampleIndex", "ExampleIndex", typeof(int), typeof(VararAdapter));

    /// <summary>Discover one test per Markdown example under the assembly's workspace.</summary>
    public static IEnumerable<TestCase> Discover(string source, IMessageLogger? logger)
    {
        Workspace? workspace;
        try
        {
            workspace = Workspace.Load(source);
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

        foreach (var spec in Discovery.FindSpecs(workspace.Config, workspace.Root))
        {
            var relName = Discovery.RelPosix(spec, workspace.Root);
            ExecutionPlan plan;
            try
            {
                plan = RunnerApi.PlanSpec(relName, File.ReadAllText(spec), workspace.Registry);
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
                    CodeFilePath = spec,
                    LineNumber = ex.Span.StartLine,
                };
                testCase.SetPropertyValue(SpecPathProperty, relName);
                testCase.SetPropertyValue(ExampleIndexProperty, i);
                yield return testCase;
            }
        }
    }

    /// <summary>Execute the given test cases, grouped by source, reporting one result each.</summary>
    public static void Run(IEnumerable<TestCase> tests, ITestReporter reporter, IMessageLogger? logger)
    {
        foreach (var bySource in tests.GroupBy(t => t.Source))
        {
            Workspace? workspace;
            try
            {
                workspace = Workspace.Load(bySource.Key);
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
            Value CreateContext(string file) =>
                registry.ContextFactories.TryGetValue(file, out var factory) ? factory() : Value.Null;

            foreach (var testCase in bySource)
            {
                var specPath = testCase.GetPropertyValue(SpecPathProperty) as string;
                int index = testCase.GetPropertyValue(ExampleIndexProperty, -1);
                if (specPath is null || index < 0)
                {
                    continue;
                }

                reporter.RecordStart(testCase);
                var result = new TestResult(testCase);
                try
                {
                    if (!planCache.TryGetValue(specPath, out var plan))
                    {
                        plan = RunnerApi.PlanSpec(specPath, File.ReadAllText(Path.Combine(workspace.Root, specPath)), workspace.Registry);
                        planCache[specPath] = plan;
                    }

                    var failure = RunnerApi.RunExample(plan, CreateContext, index);
                    if (failure is null)
                    {
                        result.Outcome = TestOutcome.Passed;
                    }
                    else
                    {
                        result.Outcome = TestOutcome.Failed;
                        result.ErrorMessage = RunnerApi.RenderFailure(failure, specPath);
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
        }
    }

    /// <summary>The built test assembly plus its workspace root (nearest <c>varar.config.json</c>) and registry.</summary>
    private sealed class Workspace
    {
        private Workspace(string root, ParsedVarConfig config, Registry registry)
        {
            Root = root;
            Config = config;
            Registry = registry;
        }

        public string Root { get; }

        public ParsedVarConfig Config { get; }

        public Registry Registry { get; }

        public static Workspace? Load(string source)
        {
            var root = FindRoot(Path.GetDirectoryName(Path.GetFullPath(source)));
            if (root is null)
            {
                return null;
            }

            var assembly = Assembly.LoadFrom(source);
            return new Workspace(root, VarConfig.Load(root), RunnerApi.LoadSteps(assembly));
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
