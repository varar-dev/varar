@file:JvmName("ReplaceSteps")

// Kotlin sibling of replace.steps.ts / ReplaceSteps.java
// (bundle 16-stimulus-state-replacement).
package dev.varar.kotlin.conformance.bundle16

import dev.varar.kotlin.sensor
import dev.varar.kotlin.steps
import dev.varar.kotlin.stimulus

data class Ctx(val a: Int = 0, val b: Int = 0)

// `Ctx(b = 3)` leaves `a` at its default 0 rather than copying the previous
// value — the data-class equivalent of returning only `b`.
val steps = steps(::Ctx) {
    stimulus("I set a to 1 and b to 2") { Ctx(a = 1, b = 2) }
    stimulus("I set only b to 3") { Ctx(b = 3) }
    sensor("Then a is {int} and b is {int}") { _: Int, _: Int -> listOf(a, b) }
}
