//! Port of `failure-step-span.test.ts`. A failing sensor sharing its line with a
//! stimulus that passed: the chain (executor → [`to_failure`]) must land on the
//! sensor's own text, since a renderer underlining the line would blame the
//! stimulus too.

use varar_core::error::StepError;
use varar_core::execute::{ExecutePorts, collect_examples};
use varar_core::failure::to_failure;
use varar_core::handler::Handler;
use varar_core::offsets::utf16_slice;
use varar_core::parse::parse;
use varar_core::plan::plan;
use varar_core::registry::{add_step, create_registry};
use varar_core::step_kind::StepKind;

const SOURCE: &str = "# L\n\nHe asks on June 10, and the library agrees.\n";
const STEP_TEXT: &str = "the library agrees";

#[test]
fn a_failing_step_records_the_anchor_of_the_step_that_failed() {
    let mut r = create_registry();
    r = add_step(
        &r,
        "asks on June 10",
        "s.rs",
        1,
        Handler::sync0(|_s| Ok(None)),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    r = add_step(
        &r,
        STEP_TEXT,
        "s.rs",
        2,
        Handler::sync0(|_s| panic!("expected the library to refuse")),
        Some(StepKind::Sensor),
    )
    .unwrap();

    let p = plan(&parse("l.md", SOURCE), &r);
    let ports = ExecutePorts::silent();
    let failure = collect_examples(&p, &ports)[0].run().unwrap_err();
    assert!(matches!(failure.error, StepError::Handler(_)));

    let f = to_failure(&failure, "l.md", 3);
    let anchor = f.anchor.expect("a failing step records an anchor");
    assert_eq!(STEP_TEXT, utf16_slice(SOURCE, anchor.from, anchor.to));
}

#[test]
fn a_failure_with_no_location_for_this_oath_has_no_anchor() {
    let sf = varar_core::error::StepFailure::bare(StepError::ReturnShape("nope".to_string()));
    assert_eq!(None, to_failure(&sf, "l.md", 7).anchor);
}
