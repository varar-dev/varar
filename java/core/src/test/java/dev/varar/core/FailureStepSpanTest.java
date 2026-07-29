package dev.varar.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

/**
 * Translated from {@code var-core/tests/failure-step-span.test.ts}. A throwing sensor sharing its
 * line with a stimulus that passed: the chain (executor → {@link Failure#toFailure}) must land on
 * the sensor's own text, since a renderer underlining the line would blame the stimulus too.
 */
class FailureStepSpanTest {

    private static final String SOURCE = "# L\n\nHe asks on June 10, and the library agrees.\n";
    private static final String STEP_TEXT = "the library agrees";

    @FunctionalInterface
    interface Fn0 {
        Object call(Object state);
    }

    private static Result.ExampleFailure failureOfThrowingSensor() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "asks on June 10", "s.java", 1, (Fn0) state -> null, StepKind.STIMULUS);
        r = Registry.addStep(
                r,
                STEP_TEXT,
                "s.java",
                2,
                (Fn0) state -> {
                    throw new AssertionError("expected the library to refuse");
                },
                StepKind.SENSOR);
        Plan.ExecutionPlan p = Plan.plan(Parse.parse("l.md", SOURCE), r);
        Throwable caught = assertThrows(
                AssertionError.class,
                () -> Execute.collectExamples(p, new Execute.ExecutePorts(d -> {}))
                        .get(0)
                        .run()
                        .run());
        return Failure.toFailure(caught, "l.md", 3);
    }

    @Test
    void aThrownStepRecordsTheAnchorOfTheStepThatThrew() {
        Result.ExampleFailure f = failureOfThrowingSensor();
        assertNotNull(f.anchor());
        assertEquals(STEP_TEXT, SOURCE.substring(f.anchor().from(), f.anchor().to()));
    }

    @Test
    void anExceptionThatNeverPassedThroughAStepHasNoAnchor() {
        assertNull(Failure.toFailure(new RuntimeException("outside any step"), "l.md", 7)
                .anchor());
    }
}
