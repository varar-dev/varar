using System.Collections.Immutable;
using System.IO;
using Varar.Core;
using Xunit;

namespace Varar.Core.Tests;

/// <summary>
/// The cross-port wire format of <c>.varar/&lt;oathPath&gt;.json</c> (ADR 0014). Every port builds
/// this same value and must serialize it byte-for-byte identically — see
/// <c>conformance/run-results/README.md</c> for what that pins, and why the bundle goldens don't
/// cover it.
/// </summary>
public class RunResultsWireTests
{
    private static string ExpectedPath()
    {
        var dir = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "conformance")))
        {
            dir = dir.Parent;
        }

        Assert.NotNull(dir);
        return Path.Combine(dir!.FullName, "conformance", "run-results", "expected.json");
    }

    private static OathResults Results() => new(
        1,
        "varar/library.md",
        "fnv1a:1622dfca",
        [
            new ExampleResult(
                "Maya borrowed *Emma*, due back on June 1, 2026",
                ExampleStatus.Passed,
                [3, 4]),
            new ExampleResult(
                "Ben borrowed *Dune* for £2.50 & kept it",
                ExampleStatus.Failed,
                [13, 14],
                new ExampleFailure(
                    14,
                    "expected £2.50 but was £3.00\nand the library <refused>",
                    "<stack>",
                    ImmutableArray.Create(new CellFailure(71, 77, "£3.00")),
                    new AnchorRange(60, 90))),
            new ExampleResult(
                "Noor borrowed *Kindred*",
                ExampleStatus.Failed,
                [8, 9],
                new ExampleFailure(9, "expected the library to refuse", "<stack>")),
        ]);

    [Fact]
    public void TheWireFormatMatchesTheCrossPortFixture()
    {
        var written = ResultJson.ToWireJson(Results()) + "\n";
        Assert.Equal(File.ReadAllText(ExpectedPath()), written);
    }
}
