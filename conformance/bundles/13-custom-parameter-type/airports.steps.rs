//! Rust sibling of `airports.steps.ts` (bundle `13-custom-parameter-type`).

use varar::Steps;

#[derive(Clone, Default)]
pub struct Ctx {
    pub dest: String,
}

pub fn register(s: &mut Steps<Ctx>) {
    // Custom {airport} parameter type, declared in terms of the Rust type it
    // produces: an IATA code lowercased by parse. The sensor asserts the
    // lowercasing, so an identity parse would fail.
    s.param("airport", "[A-Z]{3}", |g: &[&str]| g[0].to_lowercase(), None);

    s.stimulus("I fly to {airport}", |_ctx: Ctx, dest: String| Ok(Ctx { dest }));
    // The trailing "." is matched literally, so {word} captures just the code.
    s.sensor("The destination code is {word}.", |ctx: Ctx, _expected: String| Ok(ctx.dest));
}

pub fn state() -> Ctx {
    Ctx::default()
}
