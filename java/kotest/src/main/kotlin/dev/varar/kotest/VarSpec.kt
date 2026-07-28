package dev.varar.kotest

import dev.varar.config.VarConfig
import dev.varar.core.Drift
import dev.varar.runner.BaselineStores
import dev.varar.runner.Discovery
import dev.varar.runner.Render
import dev.varar.runner.Run
import dev.varar.runner.StepLoader
import io.kotest.core.spec.style.FunSpec
import java.nio.file.Files
import java.nio.file.Path

/**
 * The Kotest adapter: subclass, point `root` at the directory holding varar.config.json (whose
 * docs.include / docs.exclude / steps drive oath discovery and step loading — identical contract to
 * var-junit's ConfigBridge/var.config.root), and every planned example becomes one Kotest test
 * inside a per-oath-file container. All discovery/loading/ planning/failure-rendering is delegated
 * to var-runner — this class contains zero pipeline logic.
 *
 * v1 defers (matching var-pytest): no per-example fixture lifecycle, no plan-diagnostic surfacing
 * (var-junit DOES surface diagnostics via ReportEntry — restoring that parity here is a known
 * follow-up).
 *
 * @param root the directory holding varar.config.json; also what its docs.include/docs.exclude
 *   globs resolve against (defaults to the module working directory, a missing varar.config.json
 *   there yielding the empty config).
 */
abstract class VarSpec(root: Path = Path.of(".")) : FunSpec() {

    init {
        val config = VarConfig.load(root)
        val loaded = StepLoader.loadSteps(config.steps(), javaClass.classLoader)
        val baselineStore = BaselineStores.file(root)
        val update =
            System.getProperty("varar.update") == "true" ||
                System.getenv("VARAR_UPDATE") == "1" ||
                System.getenv("VARAR_UPDATE") == "true"
        val oaths = Discovery.findOaths(config.docsInclude(), config.docsExclude(), root)
        fun relOf(oathPath: Path) =
            root
                .toAbsolutePath()
                .normalize()
                .relativize(oathPath.toAbsolutePath().normalize())
                .toString()
                .replace('\\', '/')

        // Drop baselines for oaths the config no longer discovers. Reconciliation is per-oath and
        // never sees a path that has gone, so the lock would otherwise accumulate dead entries
        // forever (issue #70). Once per spec, keyed off the config globs — which here IS the full
        // set, since findOaths ignores whatever test filter Kotest was given.
        Drift.pruneBaselines(baselineStore, oaths.map(::relOf), update)

        for (oathPath in oaths) {
            val rel = relOf(oathPath)
            val source = Files.readString(oathPath)
            val plan = Run.planOath(rel, source, loaded.registry())
            val runs = Run.examplesWithRuns(plan, loaded.createContext(), Run.RecordingReporter())
            // Reconcile drift: a clean run records/updates varar.lock.json; a paragraph that was
            // an example and no longer matches becomes a failing test (accept with -Dvar.update).
            val drifts =
                Drift.reconcileDrift(baselineStore, rel, source, plan.varDoc(), plan, update)
            context(rel) {
                for (exampleRun in runs) {
                    test(exampleRun.example().name()) {
                        try {
                            exampleRun.run().run()
                        } catch (failure: Throwable) {
                            // Reuse the runner's span-anchored rendering — never
                            // re-derive failure text in an adapter.
                            throw AssertionError(
                                Render.renderFailure(failure, source, rel),
                                failure,
                            )
                        }
                    }
                }
                for (drift in drifts) {
                    test("drift: ${drift.name()}") { throw AssertionError(Drift.message(drift)) }
                }
            }
        }
    }
}
