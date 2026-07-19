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
    public static TheoryData<string> Bundles()
    {
        var data = new TheoryData<string>();
        foreach (var bundle in ConformanceFixtures.Register.Keys)
        {
            data.Add(bundle);
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(Bundles))]
    public void PlanMatchesGolden(string bundle)
    {
        var bundleDir = Path.Combine(BundlesDir(), bundle);
        var source = File.ReadAllText(Path.Combine(bundleDir, "example.md"));
        var registry = ConformanceFixtures.Register[bundle](Registry.Create());

        var doc = Parse.Run("example.md", source);
        var plan = Plan.Run(doc, registry);
        var actual = CanonicalJson.Stringify(Conformance.ToPlanArtifact(plan));

        var expected = File.ReadAllText(Path.Combine(bundleDir, "golden", "plan.json"));
        Assert.Equal(expected, actual);
    }

    private static string BundlesDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "conformance", "bundles")))
        {
            dir = dir.Parent;
        }

        return dir is not null
            ? Path.Combine(dir.FullName, "conformance", "bundles")
            : throw new DirectoryNotFoundException("could not locate conformance/bundles");
    }
}
