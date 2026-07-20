use super::Ctx;
use varar::Steps;

pub fn register(s: &mut Steps<Ctx>) {
    s.sensor("life, the universe and everything is {int}", |_ctx: Ctx, _answer: i64| Ok(42));
}
