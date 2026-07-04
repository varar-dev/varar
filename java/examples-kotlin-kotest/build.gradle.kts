plugins {
    kotlin("jvm") version "2.4.0"
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation("com.oselvar:var-kotlin:0.3.0")
    // Brings the Kotest JUnit Platform runner transitively (VarSpec extends FunSpec).
    testImplementation("com.oselvar:var-kotest:0.3.0")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:6.1.1")
}

kotlin {
    jvmToolchain(21)
}

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
    }
}
