using System.Collections.Immutable;

namespace Varar.Core;

public static class TableCells
{
    /// <summary>
    /// Splits a <c>| a | b |</c> row into trimmed cells and each trimmed cell's source span.
    /// Port of <c>table-cells.ts</c>. <paramref name="lineStart"/> is the row's start offset.
    /// </summary>
    public static (ImmutableArray<string> Cells, ImmutableArray<Span> CellSpans) ParseRowCells(
        string text,
        int lineStart,
        string source)
    {
        int first = text.IndexOf('|');
        int last = text.LastIndexOf('|');
        if (first < 0 || last <= first)
        {
            return (ImmutableArray<string>.Empty, ImmutableArray<Span>.Empty);
        }

        string inner = text.Substring(first + 1, last - (first + 1));
        int innerStart = first + 1;
        var cells = ImmutableArray.CreateBuilder<string>();
        var cellSpans = ImmutableArray.CreateBuilder<Span>();
        int cursor = 0;
        foreach (var seg in inner.Split('|'))
        {
            string trimmed = seg.Trim();
            int leading = seg.Length - seg.TrimStart().Length;
            int absStart = lineStart + innerStart + cursor + leading;
            cells.Add(trimmed);
            cellSpans.Add(Span.FromOffsets(source, absStart, absStart + trimmed.Length));
            cursor += seg.Length + 1; // +1 for the '|' delimiter
        }

        return (cells.ToImmutable(), cellSpans.ToImmutable());
    }
}
