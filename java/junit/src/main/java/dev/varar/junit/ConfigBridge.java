package dev.varar.junit;

import dev.varar.config.Config;
import java.nio.file.Path;
import org.junit.platform.engine.ConfigurationParameters;

/**
 * Resolves the engine's {@link Config} from varar.config.json. The single
 * configuration parameter {@code varar.config.root} names the directory
 * holding varar.config.json (tests point it at a temp workspace); it defaults
 * to the JVM working directory — the project root under Maven/Gradle. The
 * old {@code var.vars.include}/{@code var.vars.exclude}/{@code var.steps}
 * parameter keys are gone with the properties-based config format.
 */
public final class ConfigBridge {

    /**
     * The JUnit Platform configuration-parameter key naming the directory that holds
     * {@code varar.config.json}. Public so other ports' engines and tests (e.g. var-kotlin,
     * var-kotest) reference this constant instead of duplicating the literal string.
     */
    public static final String CONFIG_ROOT_KEY = "varar.config.root";

    private ConfigBridge() {}

    public static Config fromConfigurationParameters(ConfigurationParameters params) {
        return Config.load(rootFrom(params));
    }

    /**
     * The directory {@code varar.config.json} was loaded from — the same root file-based oath
     * discovery must resolve {@code docs} globs against ({@link OathFileSelectorResolver}), so
     * pointing {@code varar.config.root} elsewhere relocates config and matching together.
     */
    static Path rootFrom(ConfigurationParameters params) {
        return params.get(CONFIG_ROOT_KEY).map(Path::of).orElse(Path.of(""));
    }
}
