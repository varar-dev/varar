//! Rust sibling of `airports.steps.ts` (bundle `13-custom-parameter-type`).

use varar::{HandlerError, Steps};

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
    s.sensor(
        "The destination code is {word}",
        |ctx: Ctx, expected: String| -> Result<(), HandlerError> {
            let cleaned = expected.trim_end_matches(['.', '!', '?']);
            if cleaned != ctx.dest {
                return Err(HandlerError::new(format!("expected {cleaned} but got {}", ctx.dest)));
            }
            Ok(())
        },
    );
}

pub fn state() -> Ctx {
    Ctx::default()
}
