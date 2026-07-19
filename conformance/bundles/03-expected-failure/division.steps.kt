@file:JvmName("DivisionSteps")

// Kotlin sibling of division.steps.ts / division.steps.py / DivisionSteps.java
// (bundle 03-expected-failure).
package dev.varar.kotlin.conformance.bundle03

import dev.varar.kotlin.stimulus
import dev.varar.kotlin.steps

class Ctx

val steps = steps(::Ctx) {
    stimulus("I divide {int} by {int}") { a: Int, b: Int ->
        if (b == 0) throw ArithmeticException("division by zero")
        this
    }
}
