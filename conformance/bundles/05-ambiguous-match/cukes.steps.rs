//! Rust sibling of `cukes.steps.ts` (bundle `05-ambiguous-match`).

use varar::Steps;

pub fn register(s: &mut Steps<()>) {
    // Both expressions match "I have 5 cukes" → ambiguous-match diagnostic.
    s.stimulus("I have {int} cukes", |ctx: (), _n: i64| Ok(ctx));
    s.stimulus("I have 5 cukes", |ctx: ()| Ok(ctx));
}

pub fn state() {}
