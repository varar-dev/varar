namespace Varar.Core;

/// <summary>
/// One header-bound column check: the executor compares a step's returned column against this
/// cell. Full cell-diff machinery lands with trace (T6); only the type is needed for planning.
/// </summary>
public sealed record RowCheck(string Column, string Value, Span Span);
