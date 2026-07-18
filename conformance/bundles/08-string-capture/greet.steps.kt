@file:JvmName("GreetSteps")

// Kotlin sibling of greet.steps.ts / greet.steps.py / GreetSteps.java (bundle
// 08-string-capture).
package dev.varar.kotlin.conformance.bundle08

import dev.varar.kotlin.stimulus
import dev.varar.kotlin.steps

class Ctx

val steps = steps(::Ctx) {
    stimulus("I greet {string}") { name: String -> this }
}
