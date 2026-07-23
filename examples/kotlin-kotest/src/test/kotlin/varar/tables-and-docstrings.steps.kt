@file:JvmName("TablesAndDocStringsSteps")

package varar

import dev.varar.kotlin.sensor
import dev.varar.kotlin.steps

val tablesAndDocStringsSteps = steps {
    sensor("Uppercase each one:") { rows: List<List<String>> ->
        rows.drop(1).map { row -> mapOf("before" to row[0], "after" to row[0].uppercase()) }
    }
    sensor("Greet {word}:") { name: String, _: String ->
        listOf(name, "Hello, $name!\n")
    }
}
