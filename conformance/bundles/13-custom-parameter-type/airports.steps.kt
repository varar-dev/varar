@file:JvmName("AirportsSteps")

// Kotlin sibling of airports.steps.ts / airports.steps.py / AirportsSteps.java
// (bundle 13-custom-parameter-type) — exercises StepsScope.param: a
// custom {airport} type (IATA code, lowercased by the parse function). The
// lowercasing is asserted by the sensor (the .md says "lhr"), so an identity
// parse fails this bundle. param MUST precede the steps —
// expressions compile eagerly.
package dev.varar.kotlin.conformance.bundle13

import dev.varar.kotlin.stimulus
import dev.varar.kotlin.steps
import dev.varar.kotlin.sensor

data class Ctx(val dest: String? = null)

val steps = steps(::Ctx) {
    param("airport", Regex("[A-Z]{3}")) { captures -> captures[0].lowercase() }
    stimulus("I fly to {airport}") { dest: String ->
        copy(dest = dest)
    }
    // The trailing "." is matched literally, so {word} captures just the code.
    sensor("The destination code is {word}.") { _: String -> dest }
}
