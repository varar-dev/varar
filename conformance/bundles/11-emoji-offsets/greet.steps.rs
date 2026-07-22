//! Rust sibling of `greet.steps.ts` (bundle `11-emoji-offsets`).

use varar::Steps;

pub fn register(s: &mut Steps<()>) {
    // The list item is followed by a table, appended as a trailing slot, so
    // this sensor has two slots: {string} and the table. Both are echoed back
    // so the core compares them — the table's data rows only, since the header
    // row is labels and is never compared.
    s.sensor("I greet {string}", |_ctx: (), name: String, table: Vec<Vec<String>>| {
        Ok((name, table[1..].to_vec()))
    });
}

pub fn state() {}
