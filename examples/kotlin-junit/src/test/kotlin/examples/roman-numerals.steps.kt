@file:JvmName("RomanNumeralsSteps")

package examples

import dev.varar.kotlin.sensor
import dev.varar.kotlin.steps

val romanNumeralsSteps = steps {
    sensor("a decimal and a roman number") { row: Map<String, String> ->
        mapOf(
            "decimal" to row.getValue("decimal"),
            "roman" to toRoman(row.getValue("decimal").toInt()),
        )
    }
}
