using System.IO;
using Varar.Core;
using Xunit;

namespace Varar.Tests;

/// <summary>
/// The <c>plan.json</c> golden gate (T5): for every bundle, parsing its <c>example.md</c>, building
/// the registry from its fixture, planning, and projecting must reproduce the committed
/// <c>golden/plan.json</c> byte-for-byte.
/// </summary>
public class PlanConformanceTests
{
    public static TheoryData<string> Bundles() => ConformanceFixtures.Bundles();

    [Theory]
    [MemberData(nameof(Bundles))]
    public void PlanMatchesGolden(string bundle)
    {
        var bundleDir = Path.Combine(BundlesDir(), bundle);
        var source = File.ReadAllText(Path.Combine(bundleDir, "example.md"));
        var registry = ConformanceFixtures.Build(bundle);

        var doc = Parse.Run("example.md", source);
        var plan = Plan.Run(doc, registry);
        var actual = CanonicalJson.Stringify(Conformance.ToPlanArtifact(plan));

        var expected = File.ReadAllText(Path.Combine(bundleDir, "golden", "plan.json"));
        Assert.Equal(expected, actual);
    }

    private static string BundlesDir() => ConformanceFixtures.BundlesDir();
}
