package dev.varar.conformance.bundle19;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/** Java sibling of {@code mention.steps.ts} (bundle {@code 19-emphasis-parameter}). */
public final class MentionSteps implements StepDefinitions<MentionSteps.Ctx> {

    record Ctx() implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(Ctx::new);

        s.stimulus("I mention {emph}", (Ctx ctx, String who) -> ctx);
    }
}
