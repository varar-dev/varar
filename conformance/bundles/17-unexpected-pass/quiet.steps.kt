@file:JvmName("QuietSteps")

// Kotlin sibling of quiet.steps.ts / QuietSteps.java (bundle 17-unexpected-pass).
//
// The example carries an `error` fence, so it asserts a failure. This stimulus
// throws nothing, so the fence inverts into an UnexpectedPassError — the kind no
// bundle exercised before this one.
package dev.varar.kotlin.conformance.bundle17

import dev.varar.kotlin.steps
import dev.varar.kotlin.stimulus

data class Ctx(val quiet: Boolean = true)

val steps = steps(::Ctx) { stimulus("I do nothing at all") { this } }
