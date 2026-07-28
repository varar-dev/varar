//! Unit tests for the adapter's per-example runner (the libtest binding itself
//! is exercised end-to-end by the sample project in examples/rust-cargotest).

use std::any::Any;
use std::rc::Rc;
use varar_cargotest::run_one;
use varar_core::handler::Handler;
use varar_core::registry::{Registry, add_step, create_registry};
use varar_core::step_kind::StepKind;
use varar_core::value::Value;

fn build_registry() -> Registry {
    add_step(
        &create_registry(),
        "the answer is {int}",
        "s.rs",
        1,
        Handler::sync1(|_state, _expected| Ok(Some(Value::Int(42)))),
        Some(StepKind::Sensor),
    )
    .unwrap()
}

fn context(_file: &str) -> Rc<dyn Any> {
    Rc::new(Value::Null) as Rc<dyn Any>
}

#[test]
fn a_matching_example_passes() {
    let source = "# Q\n\nthe answer is 42.";
    assert!(run_one("q.md", source, "q.md", build_registry, context, 0).is_ok());
}

#[test]
fn a_mismatching_example_fails_with_a_rendered_message() {
    let source = "# Q\n\nthe answer is 41.";
    let err = run_one("q.md", source, "q.md", build_registry, context, 0).unwrap_err();
    assert!(err.contains("Cell mismatch"), "unexpected render: {err}");
    assert!(err.contains("41") && err.contains("42"));
}

// The drift gate (ADR 0002). Having reconcile_drift available is not the same as
// calling it — an adapter can be fully conformance-green and reconcile nothing
// (issue #69). `trials` is where cargotest does it, so assert on what it returns.
// The end-to-end counterpart is the adapter smoke contract, which runs the real
// `cargo test` against a drifted baseline; see conformance/adapter/README.md.
mod drift_gate {
    use super::{build_registry, context};
    use std::path::{Path, PathBuf};
    use varar_cargotest::trials;

    // A prose paragraph the plan never turns into an example, followed by one it
    // does. Recording the prose in the baseline is what a renamed or deleted step
    // definition leaves behind — the same probe conformance/adapter/smoke.sh uses.
    const PROSE: &str = "You're really not going to like it";

    struct TempProject(PathBuf);

    impl TempProject {
        fn new(name: &str) -> Self {
            let root = std::env::temp_dir().join(format!("varar-cargotest-{name}"));
            let _ = std::fs::remove_dir_all(&root);
            std::fs::create_dir_all(&root).unwrap();
            std::fs::write(
                root.join("varar.config.json"),
                r#"{"docs":{"include":["*.md"],"exclude":[]},"steps":[]}"#,
            )
            .unwrap();
            std::fs::write(root.join("q.md"), format!("{PROSE}.\n\nthe answer is 42.\n")).unwrap();
            Self(root)
        }

        fn path(&self) -> &Path {
            &self.0
        }

        fn drift_the_baseline(&self) {
            std::fs::write(
                self.0.join("varar.lock.json"),
                format!(
                    r#"{{"version":2,"oaths":{{"q.md":{{"sourceHash":"fnv1a:00000000","examples":[{{"name":"{PROSE}","line":1}}]}}}}}}"#
                ),
            )
            .unwrap();
        }

        fn read_lock(&self) -> String {
            std::fs::read_to_string(self.0.join("varar.lock.json")).unwrap()
        }
    }

    impl Drop for TempProject {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn drift_trials(trials: &[libtest_mimic::Trial]) -> Vec<&str> {
        trials
            .iter()
            .map(|t| t.name())
            .filter(|n| n.contains("var:drift"))
            .collect()
    }

    // One test, three phases, on purpose. `VARAR_UPDATE` is process-global and
    // cargo runs test functions on parallel threads, so as separate #[test]s the
    // update phase leaks its env var into the others and they stop seeing drift —
    // a green run that proves nothing. Sequencing them here is what keeps the
    // no-drift assertions honest.
    #[test]
    fn reconciles_detects_and_accepts_drift() {
        // A clean run records the baseline and reports no drift.
        let project = TempProject::new("clean");
        let clean = trials(project.path(), build_registry, context);
        assert_eq!(drift_trials(&clean), Vec::<&str>::new());
        assert!(project.read_lock().contains("q.md"));

        // A drifted baseline yields a failing trial, and is preserved rather than
        // silently re-recorded while the drift stands.
        let project = TempProject::new("drifted");
        project.drift_the_baseline();
        let before = project.read_lock();
        let drifted = trials(project.path(), build_registry, context);
        assert!(
            !drift_trials(&drifted).is_empty(),
            "no drift trial in: {:?}",
            drifted.iter().map(|t| t.name()).collect::<Vec<_>>()
        );
        assert_eq!(before, project.read_lock());

        // VARAR_UPDATE=1 accepts the drift and re-records.
        let project = TempProject::new("accepted");
        project.drift_the_baseline();
        // SAFETY: no other thread reads the environment here — this test owns the
        // whole drift sequence, which is why the three phases share one function.
        unsafe { std::env::set_var("VARAR_UPDATE", "1") };
        let accepted = trials(project.path(), build_registry, context);
        unsafe { std::env::remove_var("VARAR_UPDATE") };
        assert_eq!(drift_trials(&accepted), Vec::<&str>::new());
        assert!(!project.read_lock().contains(PROSE));
    }
}
