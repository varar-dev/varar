@file:JvmName("CukesSteps")

// Kotlin sibling of cukes.steps.ts / cukes.steps.py / CukesSteps.java (bundle
// 10-error-fence-without-step): the example's prose matches no step, so the
// error fence has nothing to run — a plan-stage diagnostic; this stage only
// needs the one step registered.
package dev.varar.kotlin.conformance.bundle10

import dev.varar.kotlin.stimulus
import dev.varar.kotlin.steps

class Ctx

val steps = steps(::Ctx) {
    stimulus("I have {int} cukes") { n: Int -> this }
}
