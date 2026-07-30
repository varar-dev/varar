using System.Collections.Immutable;
using Varar.Core;

namespace Varar.Runner;

/// <summary>
/// Persists run results for the language server (ADR 0014) — the shell half of the contract the
/// core builds the payload for. Writes <c>&lt;root&gt;/.varar/&lt;oathPath&gt;.json</c>, which the
/// (language-neutral) LSP reads to turn a failure into an editor diagnostic.
/// </summary>
/// <remarks>
/// Lives in the runner so every adapter in this port feeds the same collector and cannot drift
/// from the TypeScript reporter this is a port of.
/// </remarks>
public sealed class Results
{
    private readonly Dictionary<string, string> sources = new(StringComparer.Ordinal);
    private readonly Dictionary<string, List<ExampleResult>> examples = new(StringComparer.Ordinal);

    /// <summary><c>&lt;root&gt;/.varar/&lt;oathPath&gt;.json</c> — the file the LSP watches.</summary>
    public static string ResultFilePath(string root, string oathPath) =>
        Path.Combine(root, ".varar", oathPath.Replace('/', Path.DirectorySeparatorChar) + ".json");

    /// <summary>
    /// Writes one oath's results: 2-space indent plus a trailing newline, matching
    /// <c>JSON.stringify(results, null, 2)</c> in the TypeScript port.
    /// </summary>
    public static string Write(string root, OathResults results)
    {
        var out_ = ResultFilePath(root, results.OathPath);
        Directory.CreateDirectory(Path.GetDirectoryName(out_)!);
        File.WriteAllText(out_, ResultJson.ToWireJson(results) + "\n");
        return out_;
    }

    /// <summary>Accumulates one example's outcome; the oath is written once its examples are in.</summary>
    public void Record(string oathPath, string source, ExampleResult result)
    {
        sources[oathPath] = source;
        if (!examples.TryGetValue(oathPath, out var recorded))
        {
            recorded = [];
            examples[oathPath] = recorded;
        }

        recorded.Add(result);
    }

    /// <summary>
    /// Writes every oath held, and forgets them. Passing oaths are written too — a stale file
    /// would keep a diagnostic on screen that the run has just cleared.
    /// </summary>
    public void FlushAll(string root)
    {
        foreach (var (oathPath, recorded) in examples.ToList())
        {
            Write(
                root,
                new OathResults(1, oathPath, Hash.HashSource(sources[oathPath]), [.. recorded]));
        }

        examples.Clear();
    }
}
