//! Rust sibling of `report.steps.ts` (bundle `07-row-check-mismatch`).

use std::collections::BTreeMap;
use varar::Steps;

pub fn register(s: &mut Steps<()>) {
    // Header-bound row: the row arrives keyed by column and the computed
    // columns go back the same way. score 99 ≠ 10 → CellMismatch.
    s.sensor("I report the score and grade", |_ctx: (), _row: BTreeMap<String, String>| {
        Ok(BTreeMap::from([
            ("score".to_string(), "99".to_string()),
            ("grade".to_string(), "A".to_string()),
        ]))
    });
}

pub fn state() {}
