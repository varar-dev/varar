package dev.varar.runner.wildcard.sub;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/**
 * Wildcard fixture: a perfectly valid step-definition class in a SUBPACKAGE of the
 * wildcarded package. Star-import semantics: {@code dev.varar.runner.wildcard.*} must
 * NOT load it.
 */
public final class SubPackageSteps implements StepDefinitions<SubPackageSteps.Ctx> {

    public record Ctx() implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(Ctx::new);
        s.stimulus("sub package step", (Ctx ctx) -> ctx);
    }
}
