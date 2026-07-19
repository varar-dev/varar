package dev.varar.conformance.bundle03;

import dev.varar.Registrar;
import dev.varar.State;
import dev.varar.StateBinder;
import dev.varar.StepDefinitions;

/** Java sibling of {@code division.steps.ts} / {@code division.steps.py} (bundle {@code 03-expected-failure}). */
public final class DivisionSteps implements StepDefinitions {

    record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.steps(Ctx::new);

        s.stimulus(
                "I divide {int} by {int}",
                (Ctx ctx, Integer a, Integer b) -> {
                    if (b == 0) throw new ArithmeticException("division by zero");
                    return ctx;
                });
    }
}
