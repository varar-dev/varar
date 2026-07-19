//! Rust sibling of `echo.steps.ts` (bundle `04-tables-and-docstrings`).

use varar::Steps;

pub fn register(s: &mut Steps<()>) {
    // The doc string is this sensor's only slot: echo it back and the core
    // compares it against the input.
    s.sensor("I echo the following:", |_ctx: (), doc: String| Ok(doc));
}

pub fn state() {}
