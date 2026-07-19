//! Rust sibling of `greet.steps.ts` (bundle `08-string-capture`).

use varar::Steps;

pub fn register(s: &mut Steps<()>) {
    s.stimulus("I greet {string}", |ctx: (), _name: String| Ok(ctx));
}

pub fn state() {}
