using Microsoft.VisualStudio.TestPlatform.ObjectModel;
using Microsoft.VisualStudio.TestPlatform.ObjectModel.Adapter;
using Microsoft.VisualStudio.TestPlatform.ObjectModel.Logging;

namespace Varar.TestAdapter;

/// <summary>
/// The VSTest discoverer: registered for the built test assembly (<c>.dll</c>); resolves the
/// executor at <see cref="VararAdapter.ExecutorUri"/>. Emits one test per Markdown example.
/// </summary>
[FileExtension(".dll")]
[DefaultExecutorUri(VararAdapter.ExecutorUri)]
public sealed class VararTestDiscoverer : ITestDiscoverer
{
    public void DiscoverTests(
        IEnumerable<string> sources,
        IDiscoveryContext discoveryContext,
        IMessageLogger logger,
        ITestCaseDiscoverySink discoverySink)
    {
        foreach (var source in sources)
        {
            foreach (var testCase in VararAdapter.Discover(source, logger))
            {
                discoverySink.SendTestCase(testCase);
            }
        }
    }
}
