using System.Collections.Immutable;
using System.Text.RegularExpressions;
using CucumberExpressions.Parsing;
using CuGroup = CucumberExpressions.Parsing.Group;

namespace Varar.Core;

/// <summary>A parameter's sentence-relative span (UTF-16 offsets).</summary>
public sealed record ParamSpan(int Start, int End);

/// <summary>A step matched against a sentence, with sentence-relative offsets. Port of <c>matcher.ts</c>.</summary>
public sealed record Hit(
    string Expression,
    StepRegistration StepDef,
    int MatchStart,
    int MatchEnd,
    ImmutableArray<Value> Args,
    ImmutableArray<ParamSpan> ParamSpans,
    ImmutableArray<ParameterFormat?> Formats);

public abstract record ResolvedSteps
{
    public sealed record Ok(ImmutableArray<Hit> Steps) : ResolvedSteps;

    public sealed record Ambiguous(ImmutableArray<AmbiguityCollision> Collisions) : ResolvedSteps;
}

public sealed record AmbiguityCollision(int MatchStart, int MatchEnd, ImmutableArray<Hit> Candidates);

public static class Matcher
{
    public static ImmutableArray<Hit> FindHits(string sentence, Registry registry)
    {
        var hits = ImmutableArray.CreateBuilder<Hit>();
        foreach (var step in registry.Steps)
        {
            var scan = ScanRegex(step.Compiled.Regex);
            var tree = new TreeRegexp(step.Compiled.Regex);
            var parameterTypes = step.Compiled.ParameterTypes;

            foreach (Match m in scan.Matches(sentence))
            {
                CuGroup? group = tree.Match(m.Value);
                var children = group?.Children ?? new List<CuGroup>();

                var args = ImmutableArray.CreateBuilder<Value>();
                var paramSpans = ImmutableArray.CreateBuilder<ParamSpan>();
                var formats = ImmutableArray.CreateBuilder<ParameterFormat?>();
                for (int i = 0; i < children.Count; i++)
                {
                    var child = children[i];
                    var pt = i < parameterTypes.Length ? parameterTypes[i] : null;
                    args.Add(pt is VararParameterType vpt ? vpt.Transform(child.GetValues()) : Value.Of(child.Value));
                    paramSpans.Add(new ParamSpan(m.Index + child.Start, m.Index + child.End));
                    formats.Add(pt is not null && registry.Formats.TryGetValue(pt.Name, out var f) ? f : null);
                }

                hits.Add(new Hit(
                    step.Expression,
                    step,
                    m.Index,
                    m.Index + m.Value.Length,
                    args.ToImmutable(),
                    paramSpans.ToImmutable(),
                    formats.ToImmutable()));
            }
        }

        return hits.ToImmutable();
    }

    public static ResolvedSteps ResolveHits(ImmutableArray<Hit> hits)
    {
        if (hits.Length == 0)
        {
            return new ResolvedSteps.Ok(ImmutableArray<Hit>.Empty);
        }

        // Sort by start, then longest first (stable).
        var sorted = hits
            .Select((h, index) => (h, index))
            .OrderBy(t => t.h.MatchStart)
            .ThenByDescending(t => t.h.MatchEnd - t.h.MatchStart)
            .ThenBy(t => t.index)
            .Select(t => t.h)
            .ToList();

        var collisions = ImmutableArray.CreateBuilder<AmbiguityCollision>();
        for (int i = 0; i < sorted.Count; i++)
        {
            var here = sorted[i];
            var tied = new List<Hit> { here };
            int j = i + 1;
            while (j < sorted.Count)
            {
                var candidate = sorted[j];
                if (candidate.MatchStart == here.MatchStart &&
                    candidate.MatchEnd - candidate.MatchStart == here.MatchEnd - here.MatchStart)
                {
                    tied.Add(candidate);
                    j++;
                }
                else
                {
                    break;
                }
            }

            if (tied.Count > 1)
            {
                collisions.Add(new AmbiguityCollision(here.MatchStart, here.MatchEnd, tied.ToImmutableArray()));
            }

            i = j - 1;
        }

        if (collisions.Count > 0)
        {
            return new ResolvedSteps.Ambiguous(collisions.ToImmutable());
        }

        var steps = ImmutableArray.CreateBuilder<Hit>();
        int cursor = -1;
        foreach (var hit in sorted)
        {
            if (hit.MatchStart < cursor)
            {
                continue;
            }

            steps.Add(hit);
            cursor = hit.MatchEnd;
        }

        return new ResolvedSteps.Ok(steps.ToImmutable());
    }

    // The cucumber-expressions library produces anchored regexes (^...$); strip the anchors for
    // substring scanning. .NET Regex.Matches already scans left-to-right for all matches.
    private static Regex ScanRegex(Regex anchored)
    {
        var source = anchored.ToString();
        if (source.StartsWith('^'))
        {
            source = source.Substring(1);
        }

        if (source.EndsWith('$'))
        {
            source = source.Substring(0, source.Length - 1);
        }

        return new Regex(source, RegexOptions.None);
    }
}
