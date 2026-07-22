package dev.varar.conformance.bundle12;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/**
 * Java sibling of {@code greet.steps.ts} / {@code greet.steps.py} (bundle {@code
 * 12-combining-marks}) — proves UTF-16 span offsets survive combining-mark
 * characters in the example prose.
 *
 * <p>The single {@code {string}} slot is echoed back so the core actually compares it
 * against the document; a sensor with slots must return one value per slot.
 */
public final class GreetSteps implements StepDefinitions<GreetSteps.Ctx> {

    record Ctx() implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(Ctx::new);

        s.sensor("I greet {string}", (Ctx ctx, String name) -> name);
    }
}
