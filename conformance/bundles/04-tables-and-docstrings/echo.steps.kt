@file:JvmName("EchoSteps")

// Kotlin sibling of echo.steps.ts / echo.steps.py / EchoSteps.java (bundle
// 04-tables-and-docstrings): the doc string arrives as the trailing handler
// argument after the expression's own captures (here: none) and is echoed back
// for the core's doc-string comparison.
package dev.varar.kotlin.conformance.bundle04

import dev.varar.kotlin.steps
import dev.varar.kotlin.sensor

class Ctx

val steps = steps(::Ctx) {
    sensor("I echo the following:") { doc: String -> doc }
}
