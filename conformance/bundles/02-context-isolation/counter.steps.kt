@file:JvmName("CounterSteps")

// Kotlin sibling of counter.steps.ts / counter.steps.py / CounterSteps.java
// (bundle 02-context-isolation).
package dev.varar.kotlin.conformance.bundle02

import dev.varar.kotlin.stimulus
import dev.varar.kotlin.steps
import dev.varar.kotlin.sensor

data class Ctx(val count: Int = 0)

val steps = steps(::Ctx) {
    stimulus("I increment") { copy(count = count + 1) }
    sensor("The count is {int}") { n: Int -> count }
}
