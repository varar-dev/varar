package dev.varar.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/** Proves the varar-core module compiles and its Jupiter test suite runs. */
class SmokeTest {

    @Test
    void moduleIsImportableAndTestable() {
        assertEquals(2, 1 + 1);
    }
}
