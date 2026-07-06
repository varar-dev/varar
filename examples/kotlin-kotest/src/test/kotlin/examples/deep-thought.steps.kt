@file:JvmName("DeepThoughtSteps")

package examples

import com.oselvar.varkt.defineState
import com.oselvar.varkt.sensor

val deepThoughtSteps = defineState {
    sensor("life, the universe and everything is {int}") { _: Int -> 42 }
}
