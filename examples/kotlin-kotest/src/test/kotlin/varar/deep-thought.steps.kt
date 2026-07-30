@file:JvmName("DeepThoughtSteps")

package varar

import dev.varar.kotlin.sensor
import dev.varar.kotlin.steps

val deepThoughtSteps = steps {
    sensor("life, the universe and everything is {int}") { _: Int -> 42 }
}
