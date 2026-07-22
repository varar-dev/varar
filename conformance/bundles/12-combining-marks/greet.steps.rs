//! Rust sibling of `greet.steps.ts` (bundle `12-combining-marks`).

use varar::Steps;

pub fn register(s: &mut Steps<()>) {
    // One slot: echoing the capture back makes the core compare it against the
    // document, which is what exercises the combining-mark span offsets.
    s.sensor("I greet {string}", |_ctx: (), name: String| Ok(name));
}

pub fn state() {}
