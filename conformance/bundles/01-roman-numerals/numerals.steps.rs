//! Rust sibling of `numerals.steps.ts` (bundle `01-roman-numerals`).
//!
//! Full-replacement state (ADR 0006), in the file's own context type.

use varar::Steps;

#[derive(Clone, Default)]
pub struct Ctx {
    pub result: String,
}

fn roman(n: i64) -> Option<&'static str> {
    match n {
        1 => Some("I"),
        4 => Some("IV"),
        9 => Some("IX"),
        40 => Some("XL"),
        _ => None,
    }
}

pub fn register(s: &mut Steps<Ctx>) {
    s.stimulus("I convert {int} to roman numerals", |_ctx: Ctx, n: i64| {
        Ok(Ctx {
            result: roman(n).unwrap_or_default().to_string(),
        })
    });
    // The trailing "." is matched literally, so {word} captures just the
    // numeral and this sensor returns the observed value for the core.
    s.sensor("The result is {word}.", |ctx: Ctx, _expected: String| Ok(ctx.result));
}

pub fn state() -> Ctx {
    Ctx::default()
}
