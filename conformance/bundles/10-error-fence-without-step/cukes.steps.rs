//! Rust sibling of `cukes.steps.ts` (bundle `10-error-fence-without-step`).

use varar::Steps;

pub fn register(s: &mut Steps<()>) {
    // The prose matches no step, so the `error` fence has nothing to run.
    // This step exists only so the registry matches the other ports'.
    s.stimulus("I have {int} cukes", |ctx: (), _n: i64| Ok(ctx));
}

pub fn state() {}
