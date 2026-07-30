package dev.varar.runner.wildcard;

import dev.varar.State;
import dev.varar.StepDefinitions;

/**
 * Wildcard fixture: the static-factory holder shape (what a Kotlin top-level {@code
 * val steps = steps(...) {...}} file-facade compiles to) — does NOT implement {@link
 * StepDefinitions} itself. {@code StepLoaderWildcardTest} proves a package wildcard
 * accepts both holder shapes the explicit-FQN path accepts.
 */
public final class WildBetaSteps {

    private WildBetaSteps() {}

    record Ctx(String label) implements State {}

    public static StepDefinitions<Ctx> steps() {
        return s -> {
            s.state(() -> new Ctx(""));
            s.stimulus("wild beta sets label to {word}", (Ctx ctx, String label) -> new Ctx(label));
        };
    }
}
