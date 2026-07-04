plugins {
    kotlin("jvm") version "2.4.0"
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation("com.oselvar:var-kotlin:0.3.0")
    testImplementation("com.oselvar:var-junit:0.3.0")
    testImplementation(platform("org.junit:junit-bom:6.1.1"))
    testImplementation("org.junit.platform:junit-platform-suite")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
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
