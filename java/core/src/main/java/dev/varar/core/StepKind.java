package dev.varar.core;

/**
 * The role a step definition plays, mirroring {@code concepts/sensors-and-actuators.md}
 * (and {@code var-core/src/step-role.ts}'s {@code StepKind} union type):
 *
 * <ul>
 *   <li>{@link #STIMULUS} — drives the software: arranges the quiescent state AND acts
 *       on it
 *   <li>{@link #SENSOR} — the read-only assertion (the only role that returns for
 *       comparison)
 * </ul>
 *
 * <p>The concepts arrange/act (given/when) remain useful narration in a document, but
 * they share one mechanism: a stimulus evolves state, a sensor observes it.
 *
 * <p>Hoisted here from {@code dev.varar} (Task 11's provisional home) per the
 * design doc's module map: step-role/registry logic belongs in {@code var-core} (the
 * engine), alongside {@link StepRole} and {@link Registry}.
 */
public enum StepKind {
    STIMULUS,
    SENSOR
}
