namespace Varar.Core;

/// <summary>A doc-string content difference: the fence body's span plus expected/actual strings.</summary>
public sealed record DocStringDiff(Span Span, string Expected, string Actual);

/// <summary>Thrown when a doc-string step's returned string differs. Port of <c>doc-string-diff.ts</c>.</summary>
public sealed class DocStringMismatchError(DocStringDiff diff)
    : Exception(FormatMessage(diff))
{
    public DocStringDiff Diff { get; } = diff;

    private static string FormatMessage(DocStringDiff diff) =>
        $"doc string: expected {Quote(diff.Expected)} but was {Quote(diff.Actual)}";

    /// <summary>
    /// Renders <paramref name="s"/> the way <c>JSON.stringify</c> does in the TypeScript port.
    /// Every port quotes this message identically because the text is matched by substring in an
    /// <c>error</c> fence — a port that quotes differently fails a spec its siblings pass.
    /// Interpolating raw would embed a literal newline instead of <c>\n</c>.
    /// </summary>
    private static string Quote(string s)
    {
        var b = new System.Text.StringBuilder(s.Length + 2);
        b.Append('"');
        foreach (var c in s)
        {
            switch (c)
            {
                case '\\': b.Append("\\\\"); break;
                case '"': b.Append("\\\""); break;
                case '\n': b.Append("\\n"); break;
                case '\r': b.Append("\\r"); break;
                case '\t': b.Append("\\t"); break;
                case '\b': b.Append("\\b"); break;
                case '\f': b.Append("\\f"); break;
                default:
                    if (c < 0x20)
                    {
                        b.Append($"\\u{(int)c:x4}");
                    }
                    else
                    {
                        b.Append(c);
                    }

                    break;
            }
        }

        return b.Append('"').ToString();
    }
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
