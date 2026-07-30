using System.Collections.Immutable;

namespace Varar.Core;

/// <summary>
/// Converts a caught step exception into the structured <see cref="ExampleFailure"/> payload —
/// port of <c>failure.ts</c> / <c>Failure.java</c> / <c>failure.rs</c>. Shared by every producer so
/// failures are byte-identical across ports.
/// </summary>
/// <remarks>
/// Where TypeScript scrapes an injected <c>&lt;path&gt;:line:col</c> stack frame for the failing
/// line, this port reads it off the anchor the executor attached (as Ruby and Rust do): a .NET
/// stack trace has no synthetic frame to scrape, and the anchor already carries the line such a
/// frame would have named.
/// </remarks>
public static class Failures
{
    /// <summary>A caught step exception → the <c>ExampleResult.failure</c> payload.</summary>
    /// <param name="error">The caught step exception.</param>
    /// <param name="oathPath">The oath's path — unused here, kept for cross-port signature parity.</param>
    /// <param name="fallbackLine">Used when the exception carries no anchor, i.e. it never passed
    /// through a step.</param>
    public static ExampleFailure ToFailure(Exception error, string oathPath, int fallbackLine)
    {
        _ = oathPath;
        var anchor = FailureAnchor.Attached(error);

        ImmutableArray<CellFailure>? cells = null;
        if (error is CellMismatchError mismatch)
        {
            var failing = mismatch.Cells
                .Where(c => !c.Ok)
                .Select(c => new CellFailure(c.Span.StartOffset, c.Span.EndOffset, c.Actual))
                .ToImmutableArray();
            if (failing.Length > 0)
            {
                cells = failing;
            }
        }

        return new ExampleFailure(
            Line: anchor?.StartLine ?? fallbackLine,
            Message: error.Message,
            Stack: error.StackTrace ?? error.Message,
            Cells: cells,
            Anchor: anchor is null ? null : new AnchorRange(anchor.StartOffset, anchor.EndOffset));
    }
}
