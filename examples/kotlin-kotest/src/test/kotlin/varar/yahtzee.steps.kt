@file:JvmName("YahtzeeSteps")

package varar

import dev.varar.kotlin.sensor
import dev.varar.kotlin.steps
import examples.score

val yahtzeeSteps = steps {
    sensor("Examples of dice, category and score") { row: Map<String, String> ->
        val dice = row.getValue("dice").split(",").map { it.trim().toInt() }
        mapOf("score" to score(dice, row.getValue("category")))
    }
}
