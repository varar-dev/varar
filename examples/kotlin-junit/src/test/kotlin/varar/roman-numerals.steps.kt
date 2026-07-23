@file:JvmName("RomanNumeralsSteps")

package varar

import dev.varar.kotlin.sensor
import dev.varar.kotlin.steps
import examples.toRoman

val romanNumeralsSteps = steps {
    sensor("a decimal and a roman number") { row: Map<String, String> ->
        mapOf(
            "decimal" to row.getValue("decimal"),
            "roman" to toRoman(row.getValue("decimal").toInt()),
        )
    }
}
