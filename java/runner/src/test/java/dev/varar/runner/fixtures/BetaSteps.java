package dev.varar.runner.fixtures;

import dev.varar.Registrar;
import dev.varar.State;
import dev.varar.StepDefinitions;

/**
 * See {@link AlphaSteps}' javadoc — this fixture's role is to be a genuinely separate
 * step-definition file (own top-level class, own {@code .java} file) with its own
 * {@link State} type and its own {@code steps} call, so {@code StepLoaderTest}
 * can prove {@link dev.varar.runner.StepLoader} doesn't cross-wire this file's
 * state factory with {@link AlphaSteps}'.
 */
public final class BetaSteps implements StepDefinitions {

    public record Ctx(String label) implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        var s = registrar.steps(() -> new Ctx(""));
        s.stimulus("beta sets label to {word}", (Ctx ctx, String label) -> new Ctx(label));
        s.sensor("beta label is {word}", (Ctx ctx, String expected) -> ctx.label());
    }
}
