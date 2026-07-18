@file:JvmName("SmokeSteps")

package dev.varar.kotest.fixtures

import dev.varar.kotlin.sensor
import dev.varar.kotlin.steps
import dev.varar.kotlin.stimulus

data class SmokeCtx(val cukes: Int = 0)

val steps =
    steps(::SmokeCtx) {
        stimulus("I have {int} cukes") { n: Int -> copy(cukes = n) }
        stimulus("I eat {int} cukes") { n: Int -> copy(cukes = cukes - n) }
        sensor("I should have {int} cukes left") { cukes }
    }
