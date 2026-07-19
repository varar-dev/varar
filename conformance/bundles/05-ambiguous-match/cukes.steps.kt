@file:JvmName("CukesSteps")

// Kotlin sibling of cukes.steps.ts / cukes.steps.py / CukesSteps.java (bundle
// 05-ambiguous-match): both expressions match "I have 5 cukes" -> ambiguous-
// match diagnostic at the plan stage; this stage only needs both registered.
package dev.varar.kotlin.conformance.bundle05

import dev.varar.kotlin.stimulus
import dev.varar.kotlin.steps

class Ctx

val steps = steps(::Ctx) {
    stimulus("I have {int} cukes") { n: Int -> this }
    stimulus("I have 5 cukes") { this }
}
