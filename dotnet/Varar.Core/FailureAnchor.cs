namespace Varar.Core;

public static class FailureAnchor
{
    /// <summary>
    /// Where a failure points in the .md: a mismatch anchors at its first failing span (cell / doc
    /// string), anything else at the fallback (the step's match start). Port of <c>failure-anchor.ts</c>.
    /// </summary>
    public static Span Anchor(Exception? error, Span fallback) => error switch
    {
        CellMismatchError cm => cm.Cells.FirstOrDefault(c => !c.Ok)?.Span ?? fallback,
        _ => fallback,
    };

    /// <summary>
    /// The anchor travels with the thrown exception, from the executor (which knows the step) to
    /// <see cref="Failures.ToFailure"/> (which only sees the exception). TypeScript hangs it on the
    /// Error under a global symbol; here <see cref="Exception.Data"/> is the built-in equivalent, so
    /// no side table is needed.
    /// </summary>
    private const string AnchorKey = "varar.failureAnchor";

    /// <summary>Records on the exception itself where the failure points.</summary>
    public static void Attach(Exception? error, Span anchor)
    {
        // Data is read-only on a few framework exceptions; a failure that cannot carry its anchor
        // just falls back to the failing line, as it always did.
        if (error is null || error.Data.IsReadOnly)
        {
            return;
        }

        error.Data[AnchorKey] = anchor;
    }

    /// <summary>The anchor the executor attached, or <c>null</c> if there is none.</summary>
    public static Span? Attached(Exception? error) => error?.Data[AnchorKey] as Span;
}
