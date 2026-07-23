package varar

import dev.varar.kotest.VarSpec

// VarSpec is a Kotest FunSpec: it loads varar.config.json from the given root
// (default: the test working directory), plans every matching Markdown oath,
// and registers one Kotest test per example. Being a plain class, it needs no
// discovery workarounds — Gradle finds it like any other Kotest spec.
class ExamplesSpec : VarSpec()
