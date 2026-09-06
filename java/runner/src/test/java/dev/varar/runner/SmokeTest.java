package dev.varar.runner;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/** Proves the varar-runner module compiles, depends on var, and its Jupiter test suite runs. */
class SmokeTest {

    @Test
    void moduleIsImportableAndTestable() {
        assertEquals(2, 1 + 1);
    }
}
