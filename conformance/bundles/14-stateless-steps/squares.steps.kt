@file:JvmName("SquaresSteps")

// Kotlin sibling of squares.steps.ts / squares.steps.py / SquaresSteps.java
// (bundle 14-stateless-steps): no state factory — these steps are pure, so
// steps is called without one and handlers run against Unit.
package dev.varar.kotlin.conformance.bundle14

import dev.varar.kotlin.steps
import dev.varar.kotlin.sensor

val steps = steps {
    stimulus("I warm up my mental math") {}
    sensor("The square of {int} is {int}.") { n: Int -> listOf(n, n * n) }
}
