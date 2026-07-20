using System.IO;
using System.Linq;
using Varar.Core;
using Xunit;

namespace Varar.Core.Tests;

/// <summary>
/// The <c>var-doc.json</c> golden gate (T3): for every conformance bundle, parsing its
/// <c>example.md</c> and projecting with <see cref="Conformance.ToVarDocArtifact"/> must reproduce
/// the committed <c>golden/var-doc.json</c> byte-for-byte. Port of the Rust/Java var-doc gate.
/// </summary>
public class VarDocConformanceTests
{
    public static TheoryData<string> Bundles()
    {
        var data = new TheoryData<string>();
        foreach (var dir in Directory.EnumerateDirectories(BundlesDir()).OrderBy(d => d, System.StringComparer.Ordinal))
        {
            data.Add(Path.GetFileName(dir));
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(Bundles))]
    public void VarDocMatchesGolden(string bundle)
    {
        var bundleDir = Path.Combine(BundlesDir(), bundle);
        var source = File.ReadAllText(Path.Combine(bundleDir, "example.md"));

        var doc = Parse.Run("example.md", source);
        var actual = CanonicalJson.Stringify(Conformance.ToVarDocArtifact(doc));

        var expected = File.ReadAllText(Path.Combine(bundleDir, "golden", "var-doc.json"));
        Assert.Equal(expected, actual);
    }

    /// <summary>
    /// Every bundle is well-formed: an <c>example.md</c> plus the four goldens. Asserting the
    /// shape rather than a hardcoded bundle count keeps this from becoming a tripwire that has to
    /// be bumped whenever the corpus grows, while still catching a half-added bundle.
    /// </summary>
    [Fact]
    public void EveryBundleIsWellFormed()
    {
        var bundles = Directory.GetDirectories(BundlesDir());
        Assert.NotEmpty(bundles);
        foreach (var dir in bundles)
        {
            Assert.True(File.Exists(Path.Combine(dir, "example.md")), $"{dir}: missing example.md");
            foreach (var artifact in new[] { "var-doc", "registry", "plan", "trace" })
            {
                Assert.True(
                    File.Exists(Path.Combine(dir, "golden", $"{artifact}.json")),
                    $"{dir}: missing golden/{artifact}.json");
            }
        }
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
