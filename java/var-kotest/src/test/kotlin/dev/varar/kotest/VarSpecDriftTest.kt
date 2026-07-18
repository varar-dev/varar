package dev.varar.kotest

import java.nio.file.Path
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.platform.engine.discovery.DiscoverySelectors.selectClass
import org.junit.platform.testkit.engine.EngineTestKit
import org.junit.platform.testkit.engine.EventConditions.event
import org.junit.platform.testkit.engine.EventConditions.finishedWithFailure
import org.junit.platform.testkit.engine.EventConditions.test
import org.junit.platform.testkit.engine.TestExecutionResultConditions.message

/**
 * A spec whose paragraph the committed baseline recorded as an example but which now matches no
 * step. Driven ONLY by [VarSpecDriftTest] (name doesn't match Surefire's *Test includes, so it
 * never fails the module's own build). The committed `kotest-drift/var.lock.json` is preserved on
 * an unacknowledged drift (never rewritten), so this fixture is stable across runs.
 */
class DriftVarSpec : VarSpec(root = Path.of("src/test/resources/kotest-drift"))

class VarSpecDriftTest {

    @Test
    fun `a drifted paragraph surfaces as a failing Kotest test`() {
        val results =
            EngineTestKit.engine("kotest")
                .selectors(selectClass(DriftVarSpec::class.java))
                .execute()

        assertEquals(1, results.testEvents().failed().count(), "expected exactly one drift failure")
        results
            .testEvents()
            .assertThatEvents()
            .haveExactly(
                1,
                event(test(), finishedWithFailure(message { it.contains("The vault is sealed") })),
            )
    }
}
