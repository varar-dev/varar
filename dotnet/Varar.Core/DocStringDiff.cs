namespace Varar.Core;

/// <summary>A doc-string content difference: the fence body's span plus expected/actual strings.</summary>
public sealed record DocStringDiff(Span Span, string Expected, string Actual);

/// <summary>Thrown when a doc-string step's returned string differs. Port of <c>doc-string-diff.ts</c>.</summary>
public sealed class DocStringMismatchError : Exception
{
    public DocStringMismatchError(DocStringDiff diff)
        : base($"doc string: expected \"{diff.Expected}\" but was \"{diff.Actual}\"")
    {
        Diff = diff;
    }

    public DocStringDiff Diff { get; }
}

public static class DocStringDiffs
{
    /// <summary>Compare a returned string against the fence body (exact, incl. trailing newline).</summary>
    public static DocStringDiff? CompareDocString(Value? returned, string content, Span span)
    {
        if (returned is null)
        {
            return null;
        }

        if (returned is not VString s)
        {
            throw new ReturnShapeError($"expected a doc string (string), got {returned.TypeName}");
        }

        if (s.Str == content)
        {
            return null;
        }

        return new DocStringDiff(span, content, s.Str);
    }
}
