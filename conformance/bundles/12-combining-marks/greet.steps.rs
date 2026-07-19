//! Rust sibling of `greet.steps.ts` (bundle `12-combining-marks`).

use varar::{HandlerError, Steps};

pub fn register(s: &mut Steps<()>) {
    s.sensor("I greet {string}", |_ctx: (), _name: String| -> Result<(), HandlerError> { Ok(()) });
}

pub fn state() {}
