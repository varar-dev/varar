//! Rust sibling of `division.steps.ts` (bundle `03-expected-failure`).

use varar::{HandlerError, Steps};

pub fn register(s: &mut Steps<()>) {
    s.stimulus("I divide {int} by {int}", |ctx: (), _a: i64, b: i64| {
        if b == 0 {
            return Err(HandlerError::new("division by zero"));
        }
        Ok(ctx)
    });
}

pub fn state() {}
