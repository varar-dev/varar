plugins {
    kotlin("jvm") version "2.4.10"
}

// On trunk this is the SNAPSHOT that `mvn install` (run from java/) puts into
// mavenLocal, so the sample always tests the code in this repo. In your own
// project: pin the latest release and drop the mavenLocal() repository.
val vararVersion = "0.8.0"

repositories {
    mavenLocal()
    mavenCentral()
}

dependencies {
    testImplementation("dev.varar:kotlin:$vararVersion")
    testImplementation("dev.varar:junit:$vararVersion")
    testImplementation(platform("org.junit:junit-bom:6.1.3"))
    testImplementation("org.junit.platform:junit-platform-suite")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

kotlin {
    jvmToolchain(21)
}

tasks.test {
    useJUnitPlatform()
    // The oaths, the config and the drift baseline are inputs of a Varar run, but none of them
    // is on the test classpath — so Gradle cannot see them unless we say so. Without this the
    // task is UP-TO-DATE after you edit an oath, and the suite never re-runs.
    inputs.files(fileTree("varar") { include("**/*.md") })
        .withPropertyName("vararOaths")
        .withPathSensitivity(PathSensitivity.RELATIVE)
    inputs.file("varar.config.json")
        .withPropertyName("vararConfig")
        .withPathSensitivity(PathSensitivity.RELATIVE)
    inputs.file("varar.lock.json")
        .withPropertyName("vararBaseline")
        .withPathSensitivity(PathSensitivity.RELATIVE)
    inputs.property("vararUpdate", providers.environmentVariable("VARAR_UPDATE").orElse(""))
    // The run rewrites varar.lock.json as it reconciles, so the task is not a pure function of
    // its inputs and its result must never be restored from the build cache: a cached PASS
    // recorded while the baseline was being re-recorded would hide real drift on a later run.
    // (The baseline is deliberately NOT declared as an output — `cleanTest` would delete it.)
    outputs.cacheIf { false }
    testLogging {
        events("passed", "skipped", "failed")
    }
}
