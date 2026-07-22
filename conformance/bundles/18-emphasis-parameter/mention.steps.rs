//! Rust sibling of `mention.steps.ts` (bundle `18-emphasis-parameter`).
//!
//! `{emph}` is a built-in parameter type: Markdown emphasis, with only the inner
//! text passed to the handler. Matching is what conformance pins here.

use varar::Steps;

pub fn register(s: &mut Steps<()>) {
    s.stimulus("I mention {emph}", |ctx: (), _who: String| Ok(ctx));
}

pub fn state() {}
