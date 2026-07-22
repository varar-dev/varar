@file:JvmName("GreetSteps")

// Kotlin sibling of greet.steps.ts / greet.steps.py / GreetSteps.java (bundle
// 11-emoji-offsets): the example's non-header-bound trailing table arrives as
// the trailing argument after the {string} capture, so this sensor has two
// slots and returns one value per slot — the table's data rows only, since the
// header row is labels and is never compared.
package dev.varar.kotlin.conformance.bundle11

import dev.varar.kotlin.steps
import dev.varar.kotlin.sensor

class Ctx

val steps = steps(::Ctx) {
    sensor("I greet {string}") { name: String, table: List<List<String>> ->
        listOf(name, table.drop(1))
    }
}
