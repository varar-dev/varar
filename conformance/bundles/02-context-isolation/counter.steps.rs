//! Rust sibling of `counter.steps.ts` (bundle `02-context-isolation`).

use varar::Steps;

#[derive(Clone, Default)]
pub struct Ctx {
    pub count: i64,
}

pub fn register(s: &mut Steps<Ctx>) {
    s.stimulus("I increment", |ctx: Ctx| {
        Ok(Ctx {
            count: ctx.count + 1,
        })
    });
    // One slot: return the observed count and let the core compare it.
    s.sensor("The count is {int}", |ctx: Ctx, _expected: i64| Ok(ctx.count));
}

pub fn state() -> Ctx {
    Ctx::default()
}
