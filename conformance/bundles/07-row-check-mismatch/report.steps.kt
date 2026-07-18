@file:JvmName("ReportSteps")

// Kotlin sibling of report.steps.ts / report.steps.py / ReportSteps.java
// (bundle 07-row-check-mismatch): header-bound row step — receives the current
// row (Map keyed by header cell) as the trailing argument and returns hardcoded
// (wrong) columns, producing a cell mismatch at the trace stage.
package dev.varar.kotlin.conformance.bundle07

import dev.varar.kotlin.steps
import dev.varar.kotlin.sensor

class Ctx

val steps = steps(::Ctx) {
    sensor("I report the score and grade") { row: Map<String, String> ->
        mapOf("score" to "99", "grade" to "A")
    }
}
