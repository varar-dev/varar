//! Rust sibling of `greet.steps.ts` (bundle `11-emoji-offsets`).

use varar::{HandlerError, Steps};

pub fn register(s: &mut Steps<()>) {
    // The list item is followed by a table, appended as a trailing slot, so
    // this sensor's slots are {string} + the table; it asserts nothing.
    s.sensor(
        "I greet {string}",
        |_ctx: (), _name: String, _table: Vec<Vec<String>>| -> Result<(), HandlerError> { Ok(()) },
    );
}

pub fn state() {}
