use super::{Ctx, Loan};
use crate::library_example::{
    Date, FEE_PER_DAY, format_date, format_money, late_fee, may_borrow, parse_date, parse_money,
};
use varar::{HandlerError, Steps};

pub fn register(s: &mut Steps<Ctx>) {
    // Custom parameter types, declared in terms of the Rust types they produce:
    // a Date, pennies as an i64, and a plain title String.
    s.param(
        "date",
        r"[A-Z][a-z]+ \d{1,2}, \d{4}",
        |g: &[&str]| parse_date(g[0]),
        Some(Box::new(|d: &Date| format_date(*d))),
    );
    s.param(
        "money",
        r"£\d+(?:\.\d+)?|\d+p",
        |g: &[&str]| parse_money(g[0]),
        Some(Box::new(|pennies: &i64| format_money(*pennies))),
    );
    s.param(
        "title",
        r"\*[^*]+\*",
        |g: &[&str]| {
            g[0].strip_prefix('*')
                .and_then(|t| t.strip_suffix('*'))
                .unwrap_or(g[0])
                .to_string()
        },
        Some(Box::new(|t: &String| format!("*{t}*"))),
    );

    s.stimulus("borrowed {title}, due back on {date}", |ctx: Ctx, title: String, due: Date| {
        let mut loans = ctx.loans.clone();
        loans.push(Loan { title, due });
        Ok(Ctx { loans, ..ctx })
    });

    s.stimulus("returns it on {date}", |ctx: Ctx, returned: Date| {
        let fee = ctx.loans.iter().map(|l| late_fee(l.due, returned)).sum();
        Ok(Ctx { fee, ..ctx })
    });

    s.sensor("owes a {money} late fee", |ctx: Ctx, _expected: i64| Ok(ctx.fee));

    s.sensor("{money} for each day overdue", |_ctx: Ctx, _expected: i64| Ok(FEE_PER_DAY));

    s.stimulus("asks to borrow {title} on {date}", |ctx: Ctx, _title: String, on: Date| {
        let dues: Vec<Date> = ctx.loans.iter().map(|l| l.due).collect();
        Ok(Ctx {
            granted: may_borrow(&dues, on),
            ..ctx
        })
    });

    s.sensor("the library refuses", |ctx: Ctx| {
        if ctx.granted {
            return Err(HandlerError::new("expected the library to refuse"));
        }
        Ok(())
    });

    s.sensor("the library agrees", |ctx: Ctx| {
        if !ctx.granted {
            return Err(HandlerError::new("expected the library to agree"));
        }
        Ok(())
    });
}
