namespace Varar.Core;

/// <summary>
/// A source range, in <b>UTF-16 code units</b> (offsets) plus 1-based line/column.
/// Port of <c>span.ts</c>. C# <see cref="string"/> is UTF-16 code-unit indexed, so
/// <c>source[i]</c> counts the same units as the reference's <c>charCodeAt(i)</c> —
/// no conversion layer is needed (see <c>CucumberOffsetTests</c>).
/// </summary>
public sealed record Span(
    int StartOffset,
    int EndOffset,
    int StartLine,
    int StartCol,
    int EndLine,
    int EndCol)
{
    public static Span FromOffsets(string source, int startOffset, int endOffset)
    {
        var (startLine, startCol) = LineCol(source, startOffset);
        var (endLine, endCol) = LineCol(source, endOffset);
        return new Span(startOffset, endOffset, startLine, startCol, endLine, endCol);
    }

    private static (int Line, int Col) LineCol(string source, int offset)
    {
        int line = 1;
        int col = 1;
        for (int i = 0; i < offset; i++)
        {
            if (source[i] == '\n')
            {
                line++;
                col = 1;
            }
            else
            {
                col++;
            }
        }

        return (line, col);
    }
}
