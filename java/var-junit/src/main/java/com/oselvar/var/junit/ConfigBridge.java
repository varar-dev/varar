package com.oselvar.var.junit;

import com.oselvar.var.config.VarConfig;
import java.nio.file.Path;
import org.junit.platform.engine.ConfigurationParameters;

/**
 * Resolves the engine's {@link VarConfig} from var.config.json. The single
 * configuration parameter {@code var.config.root} names the directory
 * holding var.config.json (tests point it at a temp workspace); it defaults
 * to the JVM working directory — the project root under Maven/Gradle. The
 * old {@code var.vars.include}/{@code var.vars.exclude}/{@code var.steps}
 * parameter keys are gone with the properties-based config format.
 */
public final class ConfigBridge {

    static final String CONFIG_ROOT_KEY = "var.config.root";

    private ConfigBridge() {}

    public static VarConfig fromConfigurationParameters(ConfigurationParameters params) {
        Path root = params.get(CONFIG_ROOT_KEY).map(Path::of).orElse(Path.of(""));
        return VarConfig.load(root);
    }
}
