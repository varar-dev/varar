//! Rust sibling of `library.steps.ts` (bundle `21-reference-consumed`).

use varar::Steps;

#[derive(Clone, Default)]
pub struct Ctx {
    pub shelf: i64,
}

pub fn register(s: &mut Steps<Ctx>) {
    s.stimulus("I shelve {int} books", |ctx: Ctx, n: i64| {
        Ok(Ctx {
            shelf: ctx.shelf + n,
        })
    });
    s.stimulus("I borrow a book", |ctx: Ctx| {
        Ok(Ctx {
            shelf: ctx.shelf - 1,
        })
    });
    s.sensor("The shelf holds {int} books", |ctx: Ctx, _expected: i64| Ok(ctx.shelf));
}

pub fn state() -> Ctx {
    Ctx::default()
}
