//! Rust sibling of `money.steps.ts` (bundle `15-custom-parameter-format`).
//!
//! Money is a bare `f64` (pounds); `format` renders it back in the document's
//! notation, so the pinned mismatch reads `£2.60` / `£2.55`.

use varar::Steps;

pub fn register(s: &mut Steps<()>) {
    s.param(
        "money",
        r"£\d+\.\d{2}",
        |g: &[&str]| {
            g[0].strip_prefix('£')
                .unwrap_or(g[0])
                .parse::<f64>()
                .unwrap_or(0.0)
        },
        Some(Box::new(|v: &f64| format!("£{v:.2}"))),
    );

    // Returns the WRONG money on purpose; the golden pins the formatted actual
    // "£2.60", proving mismatches render through `format`.
    s.sensor("The late fee is {money}", |_ctx: (), _expected: f64| Ok(2.6));
}

pub fn state() {}
