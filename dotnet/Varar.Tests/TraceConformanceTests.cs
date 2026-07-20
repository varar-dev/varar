using System.IO;
using Varar.Core;
using Xunit;

namespace Varar.Tests;

/// <summary>
/// The <c>trace.json</c> golden gate (T6): for every bundle, executing the plan (with the fixture's
/// initial state) and projecting must reproduce the committed <c>golden/trace.json</c> byte-for-byte.
/// </summary>
public class TraceConformanceTests
{
    public static TheoryData<string> Bundles() => ConformanceFixtures.Bundles();

    [Theory]
    [MemberData(nameof(Bundles))]
    public void TraceMatchesGolden(string bundle)
    {
        var bundleDir = Path.Combine(BundlesDir(), bundle);
        var source = File.ReadAllText(Path.Combine(bundleDir, "example.md"));
        var registry = ConformanceFixtures.Build(bundle);
        var state = ConformanceFixtures.StateFor(bundle);

        var doc = Parse.Run("example.md", source);
        var plan = Plan.Run(doc, registry);
        var actual = CanonicalJson.Stringify(Conformance.ToTraceArtifact(plan, _ => state()));

        var expected = File.ReadAllText(Path.Combine(bundleDir, "golden", "trace.json"));
        Assert.Equal(expected, actual);
    }

    private static string BundlesDir() => ConformanceFixtures.BundlesDir();
}
