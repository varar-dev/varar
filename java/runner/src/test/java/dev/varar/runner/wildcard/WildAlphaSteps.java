package dev.varar.runner.wildcard;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/**
 * Wildcard fixture: a plain {@link StepDefinitions} implementation directly in the
 * {@code dev.varar.runner.wildcard} package, so {@code StepLoaderWildcardTest} can
 * prove a {@code dev.varar.runner.wildcard.*} entry finds it on a directory
 * classpath (target/test-classes). Its nested {@code Ctx} compiles to a {@code
 * WildAlphaSteps$Ctx.class} file in the same directory — the {@code $}-filtered
 * shape the wildcard must NOT treat as a top-level candidate.
 */
public final class WildAlphaSteps implements StepDefinitions<WildAlphaSteps.Ctx> {

    public record Ctx(int count) implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(() -> new Ctx(0));
        s.stimulus("wild alpha sets count to {int}", (Ctx ctx, Integer n) -> new Ctx(n));
        s.sensor("wild alpha count is {int}", (Ctx ctx, Integer expected) -> ctx.count());
    }
}
