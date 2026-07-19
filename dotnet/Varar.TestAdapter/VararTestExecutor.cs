using System.Collections.Generic;
using System.Linq;
using Microsoft.VisualStudio.TestPlatform.ObjectModel;
using Microsoft.VisualStudio.TestPlatform.ObjectModel.Adapter;

namespace Varar.TestAdapter;

/// <summary>
/// The VSTest executor at <see cref="VararAdapter.ExecutorUri"/>. Runs either the given test cases
/// or, when handed sources, everything it discovers in them.
/// </summary>
[ExtensionUri(VararAdapter.ExecutorUri)]
public sealed class VararTestExecutor : ITestExecutor
{
    public void RunTests(IEnumerable<TestCase>? tests, IRunContext? runContext, IFrameworkHandle? frameworkHandle)
    {
        if (tests is null || frameworkHandle is null)
        {
            return;
        }

        VararAdapter.Run(tests, new FrameworkReporter(frameworkHandle), frameworkHandle);
    }

    public void RunTests(IEnumerable<string>? sources, IRunContext? runContext, IFrameworkHandle? frameworkHandle)
    {
        if (sources is null || frameworkHandle is null)
        {
            return;
        }

        var discovered = sources.SelectMany(source => VararAdapter.Discover(source, frameworkHandle)).ToList();
        VararAdapter.Run(discovered, new FrameworkReporter(frameworkHandle), frameworkHandle);
    }

    public void Cancel()
    {
    }

    private sealed class FrameworkReporter : ITestReporter
    {
        private readonly IFrameworkHandle _handle;

        public FrameworkReporter(IFrameworkHandle handle) => _handle = handle;

        public void RecordStart(TestCase testCase) => _handle.RecordStart(testCase);

        public void RecordResult(TestResult result) => _handle.RecordResult(result);

        public void RecordEnd(TestCase testCase, TestOutcome outcome) => _handle.RecordEnd(testCase, outcome);
    }
}
