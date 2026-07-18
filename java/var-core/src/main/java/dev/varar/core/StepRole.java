package com.oselvar.var.core;

import java.util.List;

/**
 * Port of {@code var-core/src/step-role.ts}: guess a step's role from its neighbours in
 * document order.
 */
public final class StepRole {

    private StepRole() {}

    /**
     * The kinds of the steps immediately {@code before} and {@code after} the step being
     * inferred, in document order.
     */
    public record Neighbours(List<StepKind> before, List<StepKind> after) {
        public Neighbours {
            before = List.copyOf(before);
            after = List.copyOf(after);
        }
    }

    /**
     * Guesses a step's role from its neighbours, using the canonical document order
     * stimulus &rarr; sensor. Purely structural — never inspects sentence words (no
     * Given/When/Then heuristics). The generated snippet always offers the other role
     * as a commented alternative, so a wrong guess is cheap to correct.
     *
     * <p>A step with nothing after it is most likely the observation; anything followed
     * by other steps is most likely driving the software.
     */
    public static StepKind inferStepRole(Neighbours neighbours) {
        return neighbours.after().isEmpty() ? StepKind.SENSOR : StepKind.STIMULUS;
    }
}
