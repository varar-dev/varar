using System.IO;
using System.Linq;
using Varar.Config;
using Varar.Core;
using Xunit;

namespace Varar.Core.Tests;

/// <summary>
/// The config corpus gate (P1): each <c>conformance/config/cases/*</c> either loads and projects to
/// its <c>golden.json</c> byte-for-byte, or (with an <c>expect-error.txt</c> marker) fails to load.
/// </summary>
public class ConfigConformanceTests
{
    public static TheoryData<string> Cases()
    {
        var data = new TheoryData<string>();
        foreach (var dir in Directory.EnumerateDirectories(CasesDir()).OrderBy(d => d, System.StringComparer.Ordinal))
        {
            data.Add(Path.GetFileName(dir));
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(Cases))]
    public void ConfigCaseMatchesGoldenOrErrors(string caseName)
    {
        var caseDir = Path.Combine(CasesDir(), caseName);
        var configPath = Path.Combine(caseDir, "varar.config.json");

        if (File.Exists(Path.Combine(caseDir, "expect-error.txt")))
        {
            // Must fail to load (the marker text itself is human-only, not asserted).
            Assert.Throws<VarConfigException>(() => VarConfig.Parse(File.ReadAllText(configPath), configPath));
            return;
        }

        var parsed = File.Exists(configPath)
            ? VarConfig.Parse(File.ReadAllText(configPath), configPath)
            : VarConfig.Empty;
        var actual = CanonicalJson.Stringify(VarConfig.ToArtifact(parsed));

        var expected = File.ReadAllText(Path.Combine(caseDir, "golden.json"));
        Assert.Equal(expected, actual);
    }

    [Fact]
    public void AllEightCasesAreExercised() =>
        Assert.Equal(8, Directory.EnumerateDirectories(CasesDir()).Count());

    private static string CasesDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "conformance", "config", "cases")))
        {
            dir = dir.Parent;
        }

        return dir is not null
            ? Path.Combine(dir.FullName, "conformance", "config", "cases")
            : throw new DirectoryNotFoundException("could not locate conformance/config/cases");
    }
}
