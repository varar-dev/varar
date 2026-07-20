using System.IO;
using Varar.Core;
using Xunit;

namespace Varar.Tests;

/// <summary>
/// The <c>registry.json</c> golden gate (T4): for every bundle, building the registry from its C#
/// <c>Register</c> fixture and projecting with <see cref="Conformance.ToRegistryArtifact"/> must
/// reproduce the committed <c>golden/registry.json</c> byte-for-byte.
/// </summary>
public class RegistryConformanceTests
{
    public static TheoryData<string> Bundles() => ConformanceFixtures.Bundles();

    [Theory]
    [MemberData(nameof(Bundles))]
    public void RegistryMatchesGolden(string bundle)
    {
        var registry = ConformanceFixtures.Build(bundle);
        var actual = CanonicalJson.Stringify(Conformance.ToRegistryArtifact(registry));

        var expected = File.ReadAllText(Path.Combine(BundlesDir(), bundle, "golden", "registry.json"));
        Assert.Equal(expected, actual);
    }

    /// <summary>
    /// The fixture tables must cover the corpus exactly — no bundle without a fixture, and no
    /// fixture for a bundle that no longer exists. Compares against the directory rather than a
    /// hardcoded count, which would pass for the wrong 15 bundles.
    /// </summary>
    [Fact]
    public void EveryBundleHasAFixture()
    {
        var bundles = Directory.GetDirectories(BundlesDir())
            .Select(Path.GetFileName)
            .OrderBy(n => n, StringComparer.Ordinal)
            .ToArray();

        Assert.Equal(bundles, ConformanceFixtures.Register.Keys.OrderBy(n => n, StringComparer.Ordinal));
        Assert.Equal(bundles, ConformanceFixtures.State.Keys.OrderBy(n => n, StringComparer.Ordinal));
    }

    private static string BundlesDir() => ConformanceFixtures.BundlesDir();
}
