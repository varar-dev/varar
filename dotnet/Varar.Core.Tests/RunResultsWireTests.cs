using System.Collections.Immutable;
using System.IO;
using Varar.Core;
using Xunit;

namespace Varar.Core.Tests;

/// <summary>
/// The cross-port wire format of <c>.varar/&lt;oathPath&gt;.json</c> (ADR 0014). Every port builds
/// this same value; the parsed result must match — see
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
        // By CONTENT: the file has to SAY the same thing in every port — field names, the
        // shapes, and an optional member absent rather than null.
        var written = ResultJson.ToWireJson(Results());
        Assert.Equal(JsonValue.Parse(File.ReadAllText(ExpectedPath())), JsonValue.Parse(written));
    }
}
