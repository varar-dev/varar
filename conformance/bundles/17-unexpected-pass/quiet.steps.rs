//! Rust sibling of `quiet.steps.ts` (bundle `17-unexpected-pass`).
//!
//! The example carries an `error` fence, so it asserts a failure. This stimulus
//! panics nothing, so the fence inverts into an UnexpectedPassError — the kind
//! no bundle exercised before this one.

use varar::Steps;

pub fn register(s: &mut Steps<()>) {
    s.stimulus("I do nothing at all", |ctx: ()| Ok(ctx));
}

pub fn state() {}
