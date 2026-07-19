@file:JvmName("GreetSteps")

// Kotlin sibling of greet.steps.ts / greet.steps.py / GreetSteps.java (bundle
// 12-combining-marks).
package dev.varar.kotlin.conformance.bundle12

import dev.varar.kotlin.steps
import dev.varar.kotlin.sensor

class Ctx

val steps = steps(::Ctx) {
    sensor("I greet {string}") { name: String -> null }
}
