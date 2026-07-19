using System.Collections.Immutable;
using System.Globalization;
using System.Text;

namespace Varar.Core;

/// <summary>One header-bound column check: the executor compares a step's returned column against it.</summary>
public sealed record RowCheck(string Column, string Value, Span Span);

/// <summary>The verdict for one compared cell. Only Column/Span/Expected/Actual/Ok are serialized.</summary>
public sealed record CellDiff(
    string Column,
    Span Span,
    string Expected,
    string Actual,
    bool Ok,
    Value? ExpectedValue = null,
    Value? ActualValue = null,
    bool Formatted = false);

/// <summary>Thrown when a header-bound row's / whole-table's returned columns don't all match.</summary>
public sealed class CellMismatchError(ImmutableArray<CellDiff> cells)
    : Exception(string.Join("; ", cells.Select(c => $"{c.Column}: expected {c.Expected} but was {c.Actual}")))
{
    public ImmutableArray<CellDiff> Cells { get; } = cells;
}

/// <summary>The step returned the wrong type or shape (an author mistake, not a value diff).</summary>
public sealed class ReturnShapeError(string message) : Exception(message);

public static class CellDiffs
{
    /// <summary>Display rules for a cell's actual value. Port of <c>renderCellValue</c>.</summary>
    public static string RenderCellValue(Value value) => value switch
    {
        VString s => s.Str,
        VNull => "null",
        VBool b => b.Bool ? "true" : "false",
        VInt i => i.Int.ToString(CultureInfo.InvariantCulture),
        VFloat f => JsNumber(f.Float),
        _ => CompactJson(value), // port-native fallback, deliberately outside conformance
    };

    /// <summary>Compare a row step's returned object against the row's cells. Port of <c>compareRow</c>.</summary>
    public static ImmutableArray<CellDiff> CompareRow(Value? returned, ImmutableArray<RowCheck> checks)
    {
        if (returned is not VMap map)
        {
            return [];
        }

        var diffs = ImmutableArray.CreateBuilder<CellDiff>();
        foreach (var check in checks)
        {
            if (!map.Entries.TryGetValue(check.Column, out var value))
            {
                continue;
            }

            var actual = RenderCellValue(value);
            diffs.Add(new CellDiff(check.Column, check.Span, check.Value, actual, actual == check.Value));
        }

        return diffs.ToImmutable();
    }

    /// <summary>Compare a whole-table step's return against the input table. Port of <c>compareTable</c>.</summary>
    public static ImmutableArray<CellDiff> CompareTable(Value? returned, Table input)
    {
        if (returned is null)
        {
            return [];
        }

        if (returned is not VList list)
        {
            throw new ReturnShapeError($"expected a table (array of rows), got {returned.TypeName}");
        }

        var columns = input.Header.Cells;
        var dataRows = input.Rows;
        if (list.Items.Length != dataRows.Length)
        {
            throw new ReturnShapeError($"expected {dataRows.Length} row(s), got {list.Items.Length}");
        }

        bool allArrays = list.Items.All(r => r is VList);
        bool allRecords = list.Items.All(r => r is VMap);
        if (!allArrays && !allRecords)
        {
            throw new ReturnShapeError("table rows must be all arrays or all objects");
        }

        var diffs = ImmutableArray.CreateBuilder<CellDiff>();
        for (int i = 0; i < dataRows.Length; i++)
        {
            var row = dataRows[i];
            var ret = list.Items[i];
            if (allArrays && ((VList)ret).Items.Length != columns.Length)
            {
                throw new ReturnShapeError($"row {i}: expected {columns.Length} column(s), got {((VList)ret).Items.Length}");
            }

            for (int j = 0; j < columns.Length; j++)
            {
                var column = columns[j];
                Value actualValue;
                if (allArrays)
                {
                    actualValue = ((VList)ret).Items[j];
                }
                else
                {
                    var rec = (VMap)ret;
                    if (!rec.Entries.TryGetValue(column, out var v))
                    {
                        throw new ReturnShapeError($"row {i}: missing column \"{column}\"");
                    }

                    actualValue = v;
                }

                var expected = j < row.Cells.Length ? row.Cells[j] : string.Empty;
                var actual = RenderCellValue(actualValue);
                var span = j < row.CellSpans.Length ? row.CellSpans[j] : row.Span;
                diffs.Add(new CellDiff(column, span, expected, actual, actual == expected));
            }
        }

        return diffs.ToImmutable();
    }

    // JS String(number): an integral double prints without a fraction.
    internal static string JsNumber(double d) =>
        double.IsFinite(d) && d == Math.Truncate(d)
            ? ((long)d).ToString(CultureInfo.InvariantCulture)
            : d.ToString("R", CultureInfo.InvariantCulture);

    // Best-effort compact JSON for a composite actual (never exercised by conformance).
    private static string CompactJson(Value value)
    {
        var sb = new StringBuilder();
        WriteCompact(sb, value);
        return sb.ToString();
    }

    private static void WriteCompact(StringBuilder sb, Value value)
    {
        switch (value)
        {
            case VNull:
                sb.Append("null");
                break;
            case VBool b:
                sb.Append(b.Bool ? "true" : "false");
                break;
            case VInt i:
                sb.Append(i.Int.ToString(CultureInfo.InvariantCulture));
                break;
            case VFloat f:
                sb.Append(JsNumber(f.Float));
                break;
            case VString s:
                sb.Append('"').Append(s.Str.Replace("\\", "\\\\").Replace("\"", "\\\"")).Append('"');
                break;
            case VList l:
                sb.Append('[');
                for (int i = 0; i < l.Items.Length; i++)
                {
                    if (i > 0)
                    {
                        sb.Append(',');
                    }

                    WriteCompact(sb, l.Items[i]);
                }

                sb.Append(']');
                break;
            case VMap m:
                sb.Append('{');
                bool first = true;
                foreach (var (key, v) in m.Entries)
                {
                    if (!first)
                    {
                        sb.Append(',');
                    }

                    first = false;
                    sb.Append('"').Append(key).Append("\":");
                    WriteCompact(sb, v);
                }

                sb.Append('}');
                break;
        }
    }
}
