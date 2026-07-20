//! Rust sibling of `replace.steps.ts` (bundle `16-stimulus-state-replacement`).
//!
//! The second stimulus builds a `Ctx` carrying only `b`; `a` falls back to 0.
//! The struct shape makes full replacement the only expressible contract here —
//! which is why this bundle's golden pins the dynamic ports to the same answer.

use varar::Steps;

#[derive(Clone, Default)]
pub struct Ctx {
    pub a: i64,
    pub b: i64,
}

pub fn register(s: &mut Steps<Ctx>) {
    s.stimulus("I set a to 1 and b to 2", |_ctx: Ctx| Ok(Ctx { a: 1, b: 2 }));
    s.stimulus("I set only b to 3", |_ctx: Ctx| {
        Ok(Ctx {
            b: 3,
            ..Default::default()
        })
    });
    s.sensor("Then a is {int} and b is {int}", |ctx: Ctx, _a: i64, _b: i64| Ok((ctx.a, ctx.b)));
}

pub fn state() -> Ctx {
    Ctx::default()
}
