//! Rust sibling of `echo.steps.ts` (bundle `06-doc-string-mismatch`).

use varar::Steps;

pub fn register(s: &mut Steps<()>) {
    // Returns the WRONG string for the doc-string slot; the core compares it
    // and fails with DocStringMismatch.
    s.sensor("I echo the following:", |_ctx: (), _doc: String| Ok("goodbye".to_string()));
}

pub fn state() {}
