package dev.varar.conformance.bundle08;

import dev.varar.Registrar;
import dev.varar.State;
import dev.varar.StateBinder;
import dev.varar.StepDefinitions;

/** Java sibling of {@code greet.steps.ts} / {@code greet.steps.py} (bundle {@code 08-string-capture}). */
public final class GreetSteps implements StepDefinitions {

    record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.steps(Ctx::new);

        s.stimulus("I greet {string}", (Ctx ctx, String name) -> ctx);
    }
}
