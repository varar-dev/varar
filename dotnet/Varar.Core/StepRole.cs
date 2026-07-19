namespace Varar.Core;

/// <summary>
/// The role a step definition plays (port of <c>step-role.ts</c>):
/// <list type="bullet">
/// <item><c>Stimulus</c> — drives the software: arranges the quiescent state and acts on it.</item>
/// <item><c>Sensor</c> — the read-only assertion (the only role that returns a value for comparison).</item>
/// </list>
/// </summary>
public enum StepKind
{
    Stimulus,
    Sensor,
}

public static class StepRole
{
    /// <summary>The wire token (<c>"stimulus"</c>/<c>"sensor"</c>) used in the shared artifacts.</summary>
    public static string ToWire(this StepKind kind) => kind switch
    {
        StepKind.Stimulus => "stimulus",
        StepKind.Sensor => "sensor",
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, null),
    };

    /// <summary>
    /// Guesses a step's role from its neighbours, using the canonical document order
    /// stimulus → sensor. Purely structural (no Given/When/Then heuristics): a step with
    /// nothing after it is most likely the observation; anything followed by other steps
    /// is most likely driving the software.
    /// </summary>
    public static StepKind InferStepRole(IReadOnlyList<StepKind> before, IReadOnlyList<StepKind> after) =>
        after.Count == 0 ? StepKind.Sensor : StepKind.Stimulus;
}
