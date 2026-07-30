//! Converts a caught step failure into the structured [`ExampleFailure`] payload
//! — port of `failure.ts` / `Failure.java`. The Java stack-trace-scraping
//! machinery becomes a structural [`FailureLocation`] lookup by exact path match.

use crate::error::{StepError, StepFailure};
use crate::result::{CellFailure, ExampleFailure};

/// A caught step failure → the `ExampleResult.failure` payload. `fallback_line`
/// is used when `failure` carries no location matching `oath_path`.
pub fn to_failure(failure: &StepFailure, oath_path: &str, fallback_line: i64) -> ExampleFailure {
    let message = failure.error.message();

    let cells = match &failure.error {
        StepError::CellMismatch(cells) => {
            let failing: Vec<CellFailure> = cells
                .iter()
                .filter(|c| !c.ok)
                .map(|c| CellFailure::new(c.span.start_offset, c.span.end_offset, c.actual.clone()))
                .collect();
            (!failing.is_empty()).then_some(failing)
        }
        _ => None,
    };

    // Structural path match replaces Java's regex-escaped stack-trace scrape.
    let here = failure.location.as_ref().filter(|l| l.path == oath_path);
    let line = here.map_or(fallback_line, |l| l.line as i64);
    // The executor recorded the anchor alongside the location, so this is the
    // failing step's span (or the first mismatched cell's) — what a renderer
    // underlines instead of the whole line. `None` when the failure carries no
    // location for this oath, i.e. it never passed through one of its steps.
    let anchor = here.map(|l| l.anchor);

    let stack = render_stack(failure);
    ExampleFailure {
        line,
        message,
        stack,
        cells,
        anchor,
    }
}

/// Display-only rendering of the failure's location (the Java `stack` field is
/// rendered from structural data, not scraped from it).
fn render_stack(failure: &StepFailure) -> String {
    match &failure.location {
        Some(l) => {
            format!("{}\n    at {} ({}:{})", failure.error.message(), l.label, l.path, l.line)
        }
        None => failure.error.message(),
    }
}
