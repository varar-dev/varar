@file:JvmName("LibrarySteps")

// Kotlin sibling of library.steps.ts / library.steps.py / LibrarySteps.java
// (bundle 21-reference-consumed).
package dev.varar.kotlin.conformance.bundle21

import dev.varar.kotlin.stimulus
import dev.varar.kotlin.steps
import dev.varar.kotlin.sensor

data class Ctx(val shelf: Int = 0)

val steps = steps(::Ctx) {
    stimulus("I shelve {int} books") { n: Int -> copy(shelf = shelf + n) }
    stimulus("I borrow a book") { copy(shelf = shelf - 1) }
    sensor("The shelf holds {int} books") { n: Int -> shelf }
}
