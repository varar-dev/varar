package dev.varar;

import static org.junit.jupiter.api.Assertions.assertEquals;

import dev.varar.core.Registry;
import org.junit.jupiter.api.Test;

class StepsGlueTest {

    @Test
    void framesOfStepsGlueAnnotatedClassesAreSkipped() {
        Steps<GlueForwarder.Ctx> steps = new Steps<>();

        GlueForwarder.forwardAction(steps, "I do a forwarded thing");

        Registry.StepRegistration step = steps.registry().steps().get(0);
        // The registration must be attributed to THIS test (the glue's caller),
        // not to GlueForwarder.java.
        assertEquals("StepsGlueTest.java", step.expressionSourceFile());
    }
}
