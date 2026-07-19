@file:JvmName("YahtzeeSteps")

package examples

import dev.varar.kotlin.sensor
import dev.varar.kotlin.steps

val yahtzeeSteps = steps {
    sensor("Examples of dice, category and score") { row: Map<String, String> ->
        val dice = row.getValue("dice").split(",").map { it.trim().toInt() }
        mapOf("score" to score(dice, row.getValue("category")))
    }
}
