package dev.varar.runner.fixtures;

import dev.varar.Registrar;
import dev.varar.State;
import dev.varar.StepDefinitions;

/**
 * A {@link StepDefinitions} fixture that calls {@code steps} but registers zero
 * {@code context}/{@code action}/{@code sensor} steps — the edge case {@code
 * StepLoaderTest} uses to prove {@link dev.varar.runner.StepLoader} skips (rather
 * than crashes on) a class with a {@code stateFactory} but no {@code
 * expressionSourceFile} to key it by. No real {@code .md} spec would exercise a file
 * like this at runtime (there being no step to invoke {@code createContext.apply} for
 * its file in the first place), but {@code StepLoader} must not choke on it.
 */
public final class ContextOnlySteps implements StepDefinitions {

    public record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        registrar.steps(Ctx::new);
    }
}
