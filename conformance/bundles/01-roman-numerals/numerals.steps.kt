@file:JvmName("NumeralsSteps")

// Kotlin sibling of numerals.steps.ts / numerals.steps.py / NumeralsSteps.java
// (bundle 01-roman-numerals). Unlike the Java fixture, the file keeps the
// shared cross-language stem naming (numerals.steps.kt -> "numerals.steps" by
// plain extension-stripping) — Kotlin has no file-name/class-name coupling, so
// no PascalCase workaround is needed; @file:JvmName pins the facade class the
// harness loads instead.
package dev.varar.kotlin.conformance.bundle01

import dev.varar.kotlin.stimulus
import dev.varar.kotlin.steps
import dev.varar.kotlin.sensor

data class Ctx(val result: String? = null)

private val ROMAN = mapOf(1 to "I", 4 to "IV", 9 to "IX", 40 to "XL")

val steps = steps(::Ctx) {
    stimulus("I convert {int} to roman numerals") { n: Int ->
        copy(result = ROMAN[n])
    }
    // The trailing "." is matched literally, so {word} captures just the
    // numeral and this sensor returns the observed value for the core.
    sensor("The result is {word}.") { expected: String -> result }
}
