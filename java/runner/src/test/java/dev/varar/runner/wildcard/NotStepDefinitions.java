package dev.varar.runner.wildcard;

/**
 * Wildcard fixture: mixed package content — a class in the wildcarded package that is
 * neither a {@link dev.varar.StepDefinitions} implementation nor a static-factory
 * holder. The wildcard must skip it silently (loading it via an explicit FQN would
 * throw). Mirrors the production-support classes (data types, helpers) that live next
 * to real step-definition classes.
 */
public final class NotStepDefinitions {

    public String describe() {
        return "just a helper";
    }
}
