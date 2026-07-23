@file:JvmName("MentionSteps")

// Kotlin sibling of mention.steps.ts / MentionSteps.java (bundle
// 19-emphasis-parameter).
package dev.varar.kotlin.conformance.bundle19

import dev.varar.kotlin.stimulus
import dev.varar.kotlin.steps

class Ctx

val steps = steps(::Ctx) {
    stimulus("I mention {emph}") { who: String -> this }
}
