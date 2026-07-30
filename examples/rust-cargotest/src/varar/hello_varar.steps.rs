use super::Ctx;
use ::varar::Steps;

pub fn register(s: &mut Steps<Ctx>) {
    s.stimulus("I greet {string}", |ctx: Ctx, name: String| {
        Ok(Ctx {
            greeting: format!("Hello, {name}!"),
            ..ctx
        })
    });

    s.sensor("the greeting should be {string}", |ctx: Ctx, _expected: String| Ok(ctx.greeting));

    s.stimulus("expression `{int}+{int}`", |ctx: Ctx, a: i64, b: i64| {
        Ok(Ctx {
            result: a + b,
            ..ctx
        })
    });

    s.sensor("evaluate to `{int}`", |ctx: Ctx, _expected: i64| Ok(ctx.result));
}
