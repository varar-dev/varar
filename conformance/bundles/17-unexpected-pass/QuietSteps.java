package dev.varar.conformance.bundle17;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/**
 * Java sibling of {@code quiet.steps.ts} (bundle {@code 17-unexpected-pass}).
 *
 * <p>The example carries an {@code error} fence, so it asserts a failure. This stimulus throws
 * nothing, so the fence inverts into an UnexpectedPassError — the kind no bundle exercised before
 * this one.
 */
public final class QuietSteps implements StepDefinitions<QuietSteps.Ctx> {

    record Ctx() implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(Ctx::new);

        s.stimulus("I do nothing at all", (Ctx ctx) -> ctx);
    }
}
