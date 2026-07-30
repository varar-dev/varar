using System.Collections.Immutable;

namespace Varar.Core;

/// <summary>
/// One mismatched CELL as a source-offset range plus the runtime value. <c>From</c>/<c>To</c> are
/// absolute UTF-16 source offsets; <c>To</c> is exclusive.
/// </summary>
public sealed record CellFailure(int From, int To, string Actual);

/// <summary>
/// Where a failure points in the source: an offset range, <c>To</c> exclusive. The failing step's
/// match span, or the first mismatched cell's span (the <see cref="FailureAnchor"/> rule) — what
/// lets a renderer underline the step that failed rather than the whole line it sits on.
/// </summary>
public sealed record AnchorRange(int From, int To);

/// <summary>An example's run outcome.</summary>
public enum ExampleStatus
{
    Passed,
    Failed,
}

/// <summary>
/// The failure payload of a failed <see cref="ExampleResult"/>. <c>Cells</c> and <c>Anchor</c> are
/// <c>null</c> when they do not apply, and serialize as absent (not null) so a reader that predates
/// them still parses the file. <c>Stack</c> is deliberately runtime-shaped — no consumer parses it.
/// </summary>
public sealed record ExampleFailure(
    int Line,
    string Message,
    string Stack,
    ImmutableArray<CellFailure>? Cells = null,
    AnchorRange? Anchor = null);

/// <summary>
/// The run result for one BDD example. <c>Lines</c> are the 1-based source lines of its steps (the
/// editor's line-wash anchors).
/// </summary>
public sealed record ExampleResult(
    string Name,
    ExampleStatus Status,
    ImmutableArray<int> Lines,
    ExampleFailure? Failure = null);

/// <summary>
/// The persisted run result for one oath file: <c>.varar/&lt;oathPath&gt;.json</c> IS a serialized
/// <see cref="OathResults"/> (ADR 0014). <c>OathPath</c> uses POSIX separators and is relative to
/// the workspace root; <c>SourceHash</c> is <see cref="Hash.HashSource"/> over the oath as it was
/// run, so a reader can tell whether the offsets still apply to the buffer in front of it.
/// </summary>
public sealed record OathResults(
    int Version,
    string OathPath,
    string SourceHash,
    ImmutableArray<ExampleResult> Examples);
