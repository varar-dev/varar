//! Rust sibling of `boom.steps.ts` (bundle `09-expected-message-mismatch`).

use varar::{HandlerError, Steps};

pub fn register(s: &mut Steps<()>) {
    // Fails with a message that does NOT contain the expected substring, so
    // the expected-failure is not satisfied → the example fails.
    s.stimulus("I always boom", |_ctx: ()| {
        Err::<(), _>(HandlerError::new("actual different error"))
    });
}

pub fn state() {}
