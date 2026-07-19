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
}
