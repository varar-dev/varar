//! Rust sibling of `numerals.steps.ts` (bundle `01-roman-numerals`).
//!
//! Full-replacement state (ADR 0006), in the file's own context type.

use varar::{HandlerError, Steps};

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
    // {word} greedily captures trailing punctuation ("I." not "I"), so this
    // sensor asserts for itself rather than returning the slot for comparison.
    s.sensor("The result is {word}", |ctx: Ctx, expected: String| -> Result<(), HandlerError> {
        let cleaned = expected.trim_end_matches(['.', '!', '?']);
        if cleaned != ctx.result {
            return Err(HandlerError::new(format!("expected {cleaned} but got {}", ctx.result)));
        }
        Ok(())
    });
}

pub fn state() -> Ctx {
    Ctx::default()
}
