package dev.varar;

/**
 * Implemented by a step-definition class to register its steps. The runner discovers the
 * class (by convention or configuration), instantiates it, and calls {@link #register}
 * with a fresh {@link Steps} — mirroring the JUnit 5 {@code Extension} / Cucumber-JVM
 * glue-class idiom rather than static-init side effects, and matching the injected-builder
 * shape every statically typed port uses ({@code Register(Steps)} in C#,
 * {@code register(&mut Steps<C>)} in Rust, {@code Register(*varar.Steps[C])} in Go).
 *
 * @param <C> this step file's context-state type
 */
public interface StepDefinitions<C extends State> {

    /** Register this file's state factory, parameter types, and steps. */
    void register(Steps<C> steps);
}
