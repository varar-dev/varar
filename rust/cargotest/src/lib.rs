//! `varar-cargotest` — the `cargo test` adapter (ADR 0007).
//!
//! Turns every Markdown example matched by `varar.config.json` into one
//! `libtest-mimic` test, reported/filtered/listed by `cargo test` like a native
//! `#[test]`. varar-core is single-threaded (`Rc`, not `Send`), so each test body
//! captures only owned `Send` data — the oath path/source plus `fn` pointers to
//! the step registry + context factory — and **re-derives its one example
//! thread-locally** (re-parse, re-plan, run index `i`). No `Rc` value crosses a
//! thread boundary.
//!
//! Usage from a consumer's `tests/oaths.rs` (with `harness = false`):
//! ```ignore
//! fn main() {
//!     varar_cargotest::run(
//!         std::path::Path::new(env!("CARGO_MANIFEST_DIR")),
//!         my_steps::build_registry,   // fn() -> Registry
//!         my_steps::context_value,    // fn(&str) -> Value
//!     );
//! }
//! ```
#![allow(clippy::result_large_err)]

use std::any::Any;
use std::path::Path;
use std::rc::Rc;
use std::sync::{Arc, Mutex};

use libtest_mimic::{Arguments, Failed, Trial};
use varar_core::drift::{self, prune_baselines, reconcile_drift};
use varar_core::failure::to_failure;
use varar_core::parse::parse;
use varar_core::registry::Registry;
use varar_core::result::{ExampleResult, Status};
use varar_runner::{
    FileBaselineStore, Results, example_names, find_oaths, plan_oath, render_failure, run_example,
};

/// Build a registry (`fn`, not a closure — must be `Send + Copy`).
pub type BuildRegistry = fn() -> Registry;
/// Map a step file to its fresh initial state.
pub type ContextFactory = fn(&str) -> Rc<dyn Any>;

/// Re-derive and run one example by index. This is what each example `Trial`
/// closure calls; kept public so it is unit-testable.
pub fn run_one(
    oath_file: &str,
    source: &str,
    rel: &str,
    build_registry: BuildRegistry,
    context: ContextFactory,
    index: usize,
) -> Result<(), String> {
    run_one_failure(oath_file, source, build_registry, context, index)
        .map_err(|failure| render_failure(&failure, source, rel))
}

/// As [`run_one`], but yielding the structural failure rather than its rendered
/// text — the run-result payload needs the failure itself, since that is what
/// carries the anchor the executor attached (ADR 0014).
fn run_one_failure(
    oath_file: &str,
    source: &str,
    build_registry: BuildRegistry,
    context: ContextFactory,
    index: usize,
) -> Result<(), varar_core::error::StepFailure> {
    let registry = build_registry();
    let execution = plan_oath(oath_file, source, &registry);
    let context_factory = move |file: &str| context(file);
    run_example(&execution, &context_factory, index)
}

/// Enumerate every example (and any drift) as `libtest-mimic` trials. Drift is
/// reconciled here, on the main thread: a clean run rewrites `varar.lock.json`;
/// `VARAR_UPDATE=1` accepts drift instead of failing.
pub fn trials(root: &Path, build_registry: BuildRegistry, context: ContextFactory) -> Vec<Trial> {
    trials_recording(root, build_registry, context, &Arc::new(Mutex::new(Results::new())))
}

/// As [`trials`], but recording each example's outcome into `results` so the
/// harness can persist them once the run is over.
fn trials_recording(
    root: &Path,
    build_registry: BuildRegistry,
    context: ContextFactory,
    results: &Arc<Mutex<Results>>,
) -> Vec<Trial> {
    let config = read_config(root);
    let update = matches!(std::env::var("VARAR_UPDATE").as_deref(), Ok("1") | Ok("true"));
    let mut trials = Vec::new();
    let oaths = find_oaths(&config, root);

    // Drop baselines for oaths the config no longer discovers. Reconciliation is
    // per-oath and never sees a path that has gone, so the lock would otherwise
    // accumulate dead entries forever (#70). Once per run, keyed off the config
    // globs — which here IS the full set, since `trials` always discovers
    // everything (`cargo test <filter>` filters the trials, not the discovery).
    let keep: Vec<String> = oaths
        .iter()
        .map(|p| {
            p.strip_prefix(root)
                .unwrap_or(p)
                .to_string_lossy()
                .replace('\\', "/")
        })
        .collect();
    prune_baselines(&mut FileBaselineStore::new(root), &keep, update);

    for oath_path in oaths {
        let source = std::fs::read_to_string(&oath_path).unwrap_or_default();
        let oath_file = oath_path
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let rel = oath_path
            .strip_prefix(root)
            .unwrap_or(&oath_path)
            .to_string_lossy()
            .into_owned();

        let registry = build_registry();
        let execution = plan_oath(&oath_file, &source, &registry);

        for (index, display) in example_names(&execution).into_iter().enumerate() {
            let (sf, src, r) = (oath_file.clone(), source.clone(), rel.clone());
            let example = &execution.examples[index];
            let name = example.name.clone();
            let mut lines: Vec<usize> = example
                .steps
                .iter()
                .map(|s| s.match_span.start_line)
                .collect();
            lines.dedup();
            let recorder = Arc::clone(results);
            trials.push(Trial::test(format!("{rel}::{display}"), move || {
                let outcome = run_one_failure(&sf, &src, build_registry, context, index);
                let recorded = match &outcome {
                    Ok(()) => ExampleResult {
                        name: name.clone(),
                        status: Status::Passed,
                        lines: lines.clone(),
                        failure: None,
                    },
                    Err(failure) => ExampleResult {
                        name: name.clone(),
                        status: Status::Failed,
                        lines: lines.clone(),
                        failure: Some(to_failure(
                            failure,
                            &r,
                            lines.first().copied().unwrap_or(0) as i64,
                        )),
                    },
                };
                if let Ok(mut results) = recorder.lock() {
                    results.record(&r, &src, recorded);
                }
                outcome.map_err(|failure| Failed::from(render_failure(&failure, &src, &r)))
            }));
        }

        // Drift reconciliation (main thread): rewrites the baseline on a clean
        // run; each drifted paragraph becomes a failing trial (ADR 0002).
        let mut store = FileBaselineStore::new(root);
        let doc = parse(&oath_file, &source);
        for drifted in reconcile_drift(&mut store, &rel, &source, &doc, &execution, update) {
            let message = drift::message(&drifted);
            trials.push(Trial::test(format!("{rel}::varar:drift:{}", drifted.line), move || {
                Err(Failed::from(message))
            }));
        }
    }
    trials
}

/// The `harness = false` entry point: parse `cargo test` args, build the trials,
/// run, and exit with the appropriate status. Never returns.
pub fn run(root: &Path, build_registry: BuildRegistry, context: ContextFactory) {
    let args = Arguments::from_args();
    let results = Arc::new(Mutex::new(Results::new()));
    let conclusion =
        libtest_mimic::run(&args, trials_recording(root, build_registry, context, &results));
    // `cargo test` has no end-of-run hook, so this is the moment: every trial has
    // finished, and nothing has exited yet (ADR 0014).
    if let Ok(mut results) = results.lock() {
        results.flush_all(root);
    }
    conclusion.exit();
}

fn read_config(root: &Path) -> varar_config::Config {
    varar_config::read_config(root).unwrap_or_else(|e| panic!("{e}"))
}
