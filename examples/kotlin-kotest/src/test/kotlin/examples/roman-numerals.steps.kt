@file:JvmName("RomanNumeralsSteps")

package examples

import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor

val romanNumeralsSteps = defineState {
    sensor("a decimal and a roman number") { row: Map<String, String> ->
        mapOf(
            "decimal" to row.getValue("decimal"),
            "roman" to toRoman(row.getValue("decimal").toInt()),
        )
    }
}
