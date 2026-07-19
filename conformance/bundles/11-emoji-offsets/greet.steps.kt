@file:JvmName("GreetSteps")

// Kotlin sibling of greet.steps.ts / greet.steps.py / GreetSteps.java (bundle
// 11-emoji-offsets): the example's non-header-bound trailing table arrives as
// the trailing argument after the {string} capture; the null return skips
// every comparison (mirrors TS's `() => undefined`).
package dev.varar.kotlin.conformance.bundle11

import dev.varar.kotlin.steps
import dev.varar.kotlin.sensor

class Ctx

val steps = steps(::Ctx) {
    sensor("I greet {string}") { name: String, table: List<List<String>> -> null }
}
