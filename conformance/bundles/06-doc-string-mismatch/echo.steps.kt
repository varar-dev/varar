@file:JvmName("EchoSteps")

// Kotlin sibling of echo.steps.ts / echo.steps.py / EchoSteps.java (bundle
// 06-doc-string-mismatch): deliberately returns the WRONG string so the core's
// doc-string comparison fails at the trace stage.
package dev.varar.kotlin.conformance.bundle06

import dev.varar.kotlin.steps
import dev.varar.kotlin.sensor

class Ctx

val steps = steps(::Ctx) {
    sensor("I echo the following:") { doc: String -> "goodbye" }
}
