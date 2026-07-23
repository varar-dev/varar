@file:JvmName("HelloVarSteps")

package varar

import dev.varar.kotlin.sensor
import dev.varar.kotlin.steps
import dev.varar.kotlin.stimulus

data class HelloCtx(val greeting: String = "", val result: Int = 0)

val helloVarSteps =
    steps(::HelloCtx) {
        stimulus("I greet {string}") { name: String -> copy(greeting = "Hello, $name!") }
        sensor("the greeting should be {string}") { _: String -> greeting }
        stimulus("expression `{int}+{int}`") { a: Int, b: Int -> copy(result = a + b) }
        sensor("evaluate to `{int}`") { _: Int -> result }
    }
