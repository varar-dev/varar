package dev.varar.kotlin

import dev.varar.Steps
import dev.varar.core.Parse
import dev.varar.core.Plan
import io.cucumber.cucumberexpressions.UndefinedParameterTypeException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class ParameterTypeTest {

    data class Ctx(val color: String = "")

    @Test
    fun `custom parameter type transforms captures before the handler sees them`() {
        val bound =
            Steps.bind(
                steps(::Ctx) {
                    param("color", Regex("red|green|blue")) { captures -> captures[0].uppercase() }
                    stimulus("I pick {color}") { c: String -> copy(color = c) }
                }
            )

        val plan =
            Plan.plan(
                Parse.parse("colors.md", "# Colors\n\n## Picking\n\nI pick red.\n"),
                bound.registry(),
            )
        assertEquals(listOf<Any>("RED"), plan.examples()[0].steps()[0].args())
    }

    @Test
    fun `a step using a not-yet-declared parameter type fails at replay with the cucumber error`() {
        val definitions =
            steps(::Ctx) {
                stimulus("I pick {color}") { c: String -> copy(color = c) }
                param("color", Regex("red|green|blue")) { captures -> captures[0] }
            }
        assertThrows(UndefinedParameterTypeException::class.java) {
            Steps.bind(definitions)
        }
    }

    @Test
    fun `the built-in emph parameter type strips emphasis delimiters`() {
        val bound = Steps.bind(steps(::Ctx) { stimulus("I mention {emph}") { _: String -> this } })

        val italic =
            Plan.plan(
                Parse.parse("m.md", "# M\n\n## One\n\nI mention *Emma*.\n"),
                bound.registry(),
            )
        assertEquals(listOf<Any>("Emma"), italic.examples()[0].steps()[0].args())

        val bold =
            Plan.plan(
                Parse.parse("m.md", "# M\n\n## Two\n\nI mention **Emma**.\n"),
                bound.registry(),
            )
        assertEquals(listOf<Any>("Emma"), bold.examples()[0].steps()[0].args())
    }
}
