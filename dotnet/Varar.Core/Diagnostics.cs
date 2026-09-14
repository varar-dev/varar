using System.Collections.Immutable;

namespace Varar.Core;

public enum Severity
{
    Error,
    Warning,
}

public enum DiagnosticCode
{
    AmbiguousMatch,
    ErrorFenceWithoutStep,
    Drift,

    /// <summary>
    /// Reference blocks (ADR 0016): a link that resolves to no oath, to a section with no steps,
    /// to a chain that reaches itself, or to an anchor that two headings share.
    /// </summary>
    ReferenceNotFound,
    ReferenceEmpty,
    ReferenceCycle,
    AmbiguousAnchor,
}

/// <summary>A diagnostic on the shared rail. Port of <c>diagnostics.ts</c>.</summary>
public sealed record Diagnostic(Severity Severity, DiagnosticCode Code, string Message, Span Span);

public sealed record Candidate(string Expression, string SourceFile, int SourceLine);

public static class Diagnostics
{
    public static string ToWire(this Severity severity) => severity switch
    {
        Severity.Error => "error",
        Severity.Warning => "warning",
        _ => throw new ArgumentOutOfRangeException(nameof(severity), severity, null),
    };

    public static string ToWire(this DiagnosticCode code) => code switch
    {
        DiagnosticCode.AmbiguousMatch => "ambiguous-match",
        DiagnosticCode.ErrorFenceWithoutStep => "error-fence-without-step",
        DiagnosticCode.Drift => "drift",
        DiagnosticCode.ReferenceNotFound => "reference-not-found",
        DiagnosticCode.ReferenceEmpty => "reference-empty",
        DiagnosticCode.ReferenceCycle => "reference-cycle",
        DiagnosticCode.AmbiguousAnchor => "ambiguous-anchor",
        _ => throw new ArgumentOutOfRangeException(nameof(code), code, null),
    };

    public static Diagnostic AmbiguousMatch(string text, Span span, ImmutableArray<Candidate> candidates)
    {
        var lines = string.Join("\n", candidates.Select(c => $"  '{c.Expression}'    at {c.SourceFile}:{c.SourceLine}"));
        return new Diagnostic(
            Severity.Error,
            DiagnosticCode.AmbiguousMatch,
            $"Ambiguous step: \"{text}\"\nMatched by:\n{lines}",
            span);
    }

    public static Diagnostic DriftDetected(string name, Span span) => new(
        Severity.Error,
        DiagnosticCode.Drift,
        $"This paragraph was an example and no longer matches any step (drift): \"{name}\".\n" +
        "Fix the step so it matches again, or accept it as prose (run in update mode).",
        span);

    public static Diagnostic ErrorFenceWithoutStep(Span span) => new(
        Severity.Error,
        DiagnosticCode.ErrorFenceWithoutStep,
        "This `error` fence marks the example as expected-to-fail, but the example has no step to run.",
        span);

    /// <summary>
    /// A reference block (ADR 0016) points at an oath the workspace does not hold. Never prose: a
    /// link-only block that resolves to nothing has no other reading, so it fails the run rather
    /// than degrading silently.
    /// </summary>
    public static Diagnostic ReferenceNotFound(string text, string path, Span span) => new(
        Severity.Error,
        DiagnosticCode.ReferenceNotFound,
        $"Reference to \"{text}\" points at \"{path}\", which is not an oath in this workspace.\n" +
        "Check the path, and that the file is matched by the `docs` globs in varar.config.json.",
        span);

    /// <summary>
    /// The referenced document exists but the section contributes no steps — a mistyped anchor, or
    /// a section that is pure prose.
    /// </summary>
    public static Diagnostic ReferenceEmpty(string text, string path, string slug, Span span) => new(
        Severity.Error,
        DiagnosticCode.ReferenceEmpty,
        $"Reference to \"{text}\" resolves to \"{(slug.Length == 0 ? path : $"{path}#{slug}")}\", " +
        "which contributes no steps.\nCheck the heading the anchor names, and that its section " +
        "contains a matching paragraph.",
        span);

    /// <summary>
    /// References nest to any depth, so a chain that reaches a section already on it is reported
    /// rather than recursed into.
    /// </summary>
    public static Diagnostic ReferenceCycle(IEnumerable<string> chain, Span span) => new(
        Severity.Error,
        DiagnosticCode.ReferenceCycle,
        $"Reference cycle: {string.Join(" \u2192 ", chain)}.",
        span);

    /// <summary>
    /// The anchor names more than one heading in the target document (two headings that slug
    /// identically). An error rather than a guess: GitHub would disambiguate the second with a
    /// numeric suffix, but a reference that could mean either section means neither.
    /// </summary>
    public static Diagnostic AmbiguousAnchor(
        string text,
        string path,
        string slug,
        IEnumerable<int> headingLines,
        Span span)
    {
        var lines = headingLines.ToList();
        return new Diagnostic(
            Severity.Error,
            DiagnosticCode.AmbiguousAnchor,
            $"Reference to \"{text}\" is ambiguous: \"{path}\" has {lines.Count} headings with the " +
            $"anchor \"#{slug}\" (lines {string.Join(", ", lines)}).\n" +
            "Rename the headings so each has an anchor of its own.",
            span);
    }
}
