//! Rust sibling of `squares.steps.ts` (bundle `14-stateless-steps`).
//!
//! Pure steps — nothing to arrange or evolve — so the context is the unit type.

use varar::Steps;

pub fn register(s: &mut Steps<()>) {
    s.stimulus("I warm up my mental math", |ctx: ()| Ok(ctx));
    // Two slots ({int}, {int}): two ints in, two ints out, compared
    // positionally — the same contract as the .ts sibling's `[n, n * n]`.
    s.sensor("The square of {int} is {int}.", |_ctx: (), n: i64, _square: i64| Ok((n, n * n)));
}

pub fn state() {}
