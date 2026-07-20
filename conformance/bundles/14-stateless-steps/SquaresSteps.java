package dev.varar.conformance.bundle14;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;
import java.util.List;

/**
 * Java sibling of {@code squares.steps.ts} / {@code squares.steps.py} /
 * {@code squares.steps.kt} (bundle {@code 14-stateless-steps}): no state factory —
 * these steps are pure, so the factory-less {@code steps()} binds handlers to
 * {@link State.Empty}.
 */
public final class SquaresSteps implements StepDefinitions<State.Empty> {

    @Override
    public void register(Steps<State.Empty> s) {

        s.stimulus("I warm up my mental math", (State.Empty state) -> state);

        s.sensor(
                "The square of {int} is {int}.",
                (State.Empty state, Integer n, Integer expected) -> List.of(n, n * n));
    }
}
