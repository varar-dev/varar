package dev.varar.kotlin

import dev.varar.StepDefinitions
import dev.varar.Steps
import dev.varar.core.StepKind
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class DefineStateTest {

    data class Ctx(val cukes: Int = 0)

    // The interview-approved canonical example, verbatim shape: bare context/
    // action/sensor calls, state as receiver, typed captures, a zero-parameter
    // sensor lambda. If overload resolution is ambiguous for `{ cukes }`, THIS
    // fails to compile — that is the spec's flagged spike. Do NOT "fix" it by
    // changing this test to `{ -> cukes }`; stop and report instead (the
    // approved API shape would need revisiting with the user).
    private fun canonicalSteps(): StepDefinitions<*> =
        steps(::Ctx) {
            stimulus("I have {int} cukes") { n: Int ->
                copy(cukes = n)
            }
            stimulus("I eat {int} cukes") { n: Int ->
                copy(cukes = cukes - n)
            }
            sensor("I should have {int} cukes left") {
                cukes
            }
        }

    // Invokes a registered handler the way Execute.invokeHandler does: reflect
    // for the public `apply` overload whose parameter count matches, never
    // through the SAM interface. (The adapters expose one overload per call
    // shape — see HandlerAdapter.)
    private fun invoke(handler: Any, vararg args: Any?): Any? {
        val method =
            handler.javaClass.methods.first {
                it.name == "apply" && it.parameterCount == args.size && !it.isBridge
            }
        return method.invoke(handler, *args)
    }

    /**
     * The arity ladder must reach far enough for the shared "two or more slots" rule. Capped at two
     * captures, a spec with three inline parameters plus a trailing table ran in the dynamic ports
     * but would not compile here. The adapters must also accept the wider call shapes, so each
     * handler is invoked the way Execute.invokeHandler does rather than merely registered.
     */
    @Test
    fun `registers and invokes handlers with three four and five captures`() {
        data class Wide(val seen: String = "")

        val bound =
            Steps.bind(
                steps(::Wide) {
                    stimulus("s3 {int} {int} {int}") { a: Int, b: Int, c: Int ->
                        copy(seen = "$a$b$c")
                    }
                    stimulus("s4 {int} {int} {int} {int}") { a: Int, b: Int, c: Int, d: Int ->
                        copy(seen = "$a$b$c$d")
                    }
                    stimulus("s5 {int} {int} {int} {int} {int}") {
                        a: Int,
                        b: Int,
                        c: Int,
                        d: Int,
                        e: Int ->
                        copy(seen = "$a$b$c$d$e")
                    }
                    sensor("n3 {int} {int} {int}") { a: Int, b: Int, c: Int -> "$a$b$c" }
                    sensor("n4 {int} {int} {int} {int}") { a: Int, b: Int, c: Int, d: Int ->
                        "$a$b$c$d"
                    }
                    sensor("n5 {int} {int} {int} {int} {int}") {
                        a: Int,
                        b: Int,
                        c: Int,
                        d: Int,
                        e: Int ->
                        "$a$b$c$d$e"
                    }
                }
            )

        val steps = bound.registry().steps()
        assertEquals(6, steps.size)
        assertEquals(StepKind.STIMULUS, steps[0].kind())
        assertEquals(StepKind.SENSOR, steps[5].kind())

        val box = StateBox(Wide())
        assertEquals(
            "123",
            (invoke(steps[0].handler(), box, 1, 2, 3) as StateBox<*>).value.let {
                (it as Wide).seen
            },
        )
        assertEquals(
            "1234",
            (invoke(steps[1].handler(), box, 1, 2, 3, 4) as StateBox<*>).value.let {
                (it as Wide).seen
            },
        )
        assertEquals(
            "12345",
            (invoke(steps[2].handler(), box, 1, 2, 3, 4, 5) as StateBox<*>).value.let {
                (it as Wide).seen
            },
        )
        assertEquals("123", invoke(steps[3].handler(), box, 1, 2, 3))
        assertEquals("1234", invoke(steps[4].handler(), box, 1, 2, 3, 4))
        assertEquals("12345", invoke(steps[5].handler(), box, 1, 2, 3, 4, 5))
    }

    @Test
    fun `top-level steps registers nothing until replayed`() {
        val definitions = canonicalSteps() // constructing the value is inert
        assertTrue(Steps.bind { /* nothing registered */ }.registry().steps().isEmpty())
        val bound = Steps.bind(definitions) // replay is what registers
        assertEquals(3, bound.registry().steps().size)
    }

    @Test
    fun `registers expressions kinds and author-side source locations`() {
        val bound = Steps.bind(canonicalSteps())
        val steps = bound.registry().steps()

        assertEquals(
            listOf("I have {int} cukes", "I eat {int} cukes", "I should have {int} cukes left"),
            steps.map { it.expression() },
        )
        assertEquals(
            listOf(StepKind.STIMULUS, StepKind.STIMULUS, StepKind.SENSOR),
            steps.map { it.kind() },
        )
        // Glue-frame skipping (Task 1 + @file:RegistrarGlue on DefineState.kt)
        // must make every location point at THIS file, on strictly increasing
        // lines (each context/action/sensor call sits on its own line above).
        assertTrue(steps.all { it.expressionSourceFile() == "DefineStateTest.kt" }) {
            "expected DefineStateTest.kt, got ${steps.map { it.expressionSourceFile() }}"
        }
        assertTrue(steps.map { it.expressionSourceLine() }.zipWithNext().all { (a, b) -> a < b }) {
            "expected increasing lines, got ${steps.map { it.expressionSourceLine() }}"
        }
    }

    @Test
    fun `context handler gets state as receiver and returns the full replacement`() {
        val bound = Steps.bind(canonicalSteps())
        val initial = bound.stateFactory()!!.get()

        val evolved = invoke(bound.registry().steps()[0].handler(), initial, 8) as StateBox<*>
        assertEquals(Ctx(cukes = 8), evolved.value)
    }

    @Test
    fun `zero-parameter sensor on a capturing expression drops the surplus argument`() {
        // The approved canonical sensor: `{ cukes }` on "… {int} …". The
        // executor supplies (state, capture); the arity-0 handler must accept
        // the call and ignore the capture — TS-facade semantics.
        val bound = Steps.bind(canonicalSteps())

        val left = bound.registry().steps()[2].handler()
        assertEquals(5, invoke(left, StateBox(Ctx(cukes = 5)), 5))
    }

    @Test
    fun `handler declaring more parameters than the step supplies fails with an authoring error`() {
        val bound =
            Steps.bind(
                steps(::Ctx) {
                    sensor("over-declared") { a: Int, b: Int -> a + b }
                }
            )

        val handler = bound.registry().steps()[0].handler()
        val e =
            assertThrows(Exception::class.java) {
                invoke(handler, StateBox(Ctx()), 1)
            }
        // Reflection wraps in InvocationTargetException; the cause carries the message.
        val cause = generateSequence(e as Throwable) { it.cause }.last()
        assertTrue(cause is IllegalArgumentException, cause.toString())
        assertTrue(cause.message!!.contains("declares 2 parameter(s)"), cause.message)
    }

    @Test
    fun `factory-less steps registers pure steps against Unit state`() {
        val bound =
            Steps.bind(
                steps {
                    stimulus("I warm up my mental math") {}
                    sensor("the square of {int} is {int}") { n: Int -> listOf(n, n * n) }
                }
            )

        val steps = bound.registry().steps()
        assertEquals(
            listOf("I warm up my mental math", "the square of {int} is {int}"),
            steps.map { it.expression() },
        )
        assertEquals(listOf(StepKind.STIMULUS, StepKind.SENSOR), steps.map { it.kind() })

        val initial = bound.stateFactory()!!.get()
        // The stimulus's implicit Unit return is the unchanged (empty) state.
        val evolved = invoke(steps[0].handler(), initial) as StateBox<*>
        assertEquals(Unit, evolved.value)
        // The sensor ignores the state and computes from its captures alone.
        assertEquals(listOf(7, 49), invoke(steps[1].handler(), initial, 7, 49))
    }

    @Test
    fun `each replay gets a fresh state factory producing fresh boxes`() {
        val bound = Steps.bind(canonicalSteps())
        val factory = bound.stateFactory()!!
        val a = factory.get() as StateBox<*>
        val b = factory.get() as StateBox<*>
        assertTrue(a !== b)
        assertEquals(Ctx(cukes = 0), a.value)
    }
}
